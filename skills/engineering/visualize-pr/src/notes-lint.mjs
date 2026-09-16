// Checks on the agent-written --notes file. The PR text should open with a few
// bullets and a short pseudocode block; the two ways that goes wrong in practice
// are a missing block (the agent judged there was "no core rule") and prose
// paragraphs creeping back in. Warnings only: the notes are the author's.

const FENCE = /^\s*(```|~~~)/;
const BULLET = /^\s*([-*+]|\d+[.)])\s+/;
const HEADING = /^\s*#/;
const INDENTED_CODE = /^ {4,}\S|^\t/;
const OPT_OUT = /no pseudocode/i;

export function lintNotes(text) {
  const findings = [];
  const lines = String(text ?? '').split('\n');

  let inFence = false;
  let hasCode = false;
  let hasOptOut = false;
  let run = [];
  const flush = () => {
    if (run.length >= 3) {
      findings.push({
        line: run[0],
        message: `prose paragraph of ${run.length} lines. Notes should be bullets and a pseudocode block; fold this into bullets or drop it.`,
      });
    }
    run = [];
  };

  lines.forEach((raw, index) => {
    const number = index + 1;
    if (FENCE.test(raw)) {
      inFence = !inFence;
      if (inFence) hasCode = true;
      flush();
      return;
    }
    if (inFence) return;
    if (INDENTED_CODE.test(raw)) {
      // An indented line directly under a wrapped bullet is the bullet's
      // continuation, not code; only a blank line before it makes it a block.
      const previous = lines[index - 1] ?? '';
      if (previous.trim() === '' || INDENTED_CODE.test(previous)) hasCode = true;
      flush();
      return;
    }
    if (OPT_OUT.test(raw)) hasOptOut = true;
    if (raw.trim() === '' || HEADING.test(raw) || BULLET.test(raw)) {
      flush();
      return;
    }
    // A wrapped bullet continues on an indented line; that is not prose.
    if (/^\s{2,}\S/.test(raw) && run.length === 0) return;
    run.push(number);
  });
  flush();

  if (!hasCode && !hasOptOut) {
    findings.push({
      line: 1,
      message: 'no pseudocode block. Add a fenced or indented block showing the core rule, or a bullet "No pseudocode: no logic changed." when the diff changes no behavior.',
    });
  }
  return findings;
}

export function formatNotesWarnings(findings, filePath) {
  if (findings.length === 0) return null;
  return [
    `Warning: ${filePath} has ${findings.length} notes issue${findings.length === 1 ? '' : 's'}:`,
    ...findings.map((finding) => `  line ${finding.line}: ${finding.message}`),
  ].join('\n');
}
