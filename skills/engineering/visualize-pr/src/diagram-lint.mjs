// Cheap checks for the two Mermaid mistakes that actually reach a PR. Neither
// is a parse error, which is what makes them dangerous: Mermaid accepts the
// file and renders the mistake into the diagram where a reviewer reads it.

const MESSAGE_LABEL = /^[^:]*:(.*)$/;

export function lintDiagram(text) {
  const findings = [];
  const lines = String(text ?? '').split('\n');
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
  });
  return findings;
}

export function formatDiagramWarnings(findings, filePath) {
  if (findings.length === 0) return null;
  return [
    `Warning: ${filePath} has ${findings.length} Mermaid issue${findings.length === 1 ? '' : 's'} that render into the diagram:`,
    ...findings.map((finding) => `  line ${finding.line}: ${finding.message}`),
  ].join('\n');
}
