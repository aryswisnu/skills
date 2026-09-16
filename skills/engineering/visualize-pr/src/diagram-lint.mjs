// Cheap checks for the Mermaid mistakes that actually reach a PR. None is a
// parse error, which is what makes them dangerous: Mermaid accepts the file and
// renders the mistake into the diagram where a reviewer reads it. The size
// limits are the second half: a sequence diagram wide enough to need sideways
// scrolling is not read, it is skipped.

const MESSAGE_LABEL = /^[^:]*:(.*)$/;
const SEQUENCE_HEADER = /^\s*sequenceDiagram\b/m;
const DECLARATION = /^(?:participant|actor)\s+([^\s:]+)/;
const NOTE = /^Note\s+(?:over|left of|right of)\s+[^:]*:(.*)$/i;
// Mermaid's message arrows: solid or dotted, with an open, filled, async, or
// cross head.
const MESSAGE = /^([^\s:,->]+)\s*--?(?:>>|>|\)|x)\s*([^\s:,->]+)\s*:(.*)$/;

const MAX_PARTICIPANTS = 4;
const MAX_MESSAGES = 6;
const MAX_LABEL = 40;
const MAX_NOTE = 30;

export function lintDiagram(text) {
  const findings = [];
  const source = String(text ?? '');
  const lines = source.split('\n');
  const isSequence = SEQUENCE_HEADER.test(source);

  const participants = new Set();
  let messages = 0;

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const number = index + 1;
    if (!line) return;

    // Mermaid treats %% as a comment only at the start of a line. Anywhere
    // else it stays in the label and renders as visible text.
    const marker = line.indexOf('%%');
    if (marker > 0) {
      findings.push({
        line: number,
        message: 'Mermaid only treats %% as a comment at the start of a line. Here it renders inside the label as literal text. Put the comment on its own line, or use "Note over A,B: ...".',
      });
    }

    // Angle brackets inside a label can be read as markup by some Mermaid
    // versions and render blank or broken.
    const label = line.startsWith('%%') ? null : (MESSAGE_LABEL.exec(line)?.[1] ?? null);
    if (label && /[<>]/.test(label)) {
      findings.push({
        line: number,
        message: 'Angle brackets in a label can render as markup. Use parentheses or plain words instead.',
      });
    }

    if (!isSequence || line.startsWith('%%')) return;

    const declaration = DECLARATION.exec(line);
    if (declaration) {
      participants.add(declaration[1]);
      if (participants.size === MAX_PARTICIPANTS + 1) {
        findings.push({ line: number, message: `${participants.size} participants. Four fit on a phone; merge or drop the rest.` });
      }
      return;
    }

    const note = NOTE.exec(line);
    if (note) {
      const body = note[1].trim();
      if (body.length > MAX_NOTE) {
        findings.push({ line: number, message: `note is ${body.length} characters; under ${MAX_NOTE}.` });
      }
      return;
    }

    const message = MESSAGE.exec(line);
    if (!message) return;
    const before = participants.size;
    participants.add(message[1]);
    participants.add(message[2]);
    if (before <= MAX_PARTICIPANTS && participants.size > MAX_PARTICIPANTS) {
      findings.push({ line: number, message: `${participants.size} participants. Four fit on a phone; merge or drop the rest.` });
    }
    messages += 1;
    if (messages === MAX_MESSAGES + 1) {
      findings.push({ line: number, message: `${messages} messages. Six is the limit; show the riskiest flow only.` });
    }
    const body = message[3].trim();
    if (body.length > MAX_LABEL) {
      findings.push({ line: number, message: `label is ${body.length} characters; under ${MAX_LABEL}.` });
    }
  });

  // Both counts are reported once, at the line that crossed the limit, with the
  // final total so the author knows how much to cut.
  retotal(findings, /^\d+ participants\./, `${participants.size} participants. Four fit on a phone; merge or drop the rest.`);
  retotal(findings, /^\d+ messages\./, `${messages} messages. Six is the limit; show the riskiest flow only.`);
  return findings;
}

function retotal(findings, pattern, message) {
  const finding = findings.find((entry) => pattern.test(entry.message));
  if (finding) finding.message = message;
}

export function formatDiagramWarnings(findings, filePath) {
  if (findings.length === 0) return null;
  return [
    `Warning: ${filePath} has ${findings.length} Mermaid issue${findings.length === 1 ? '' : 's'} that render into the diagram:`,
    ...findings.map((finding) => `  line ${finding.line}: ${finding.message}`),
  ].join('\n');
}
