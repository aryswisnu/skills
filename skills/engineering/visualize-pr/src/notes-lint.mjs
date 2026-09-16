// Checks on the agent-written --notes file. The shape a reviewer can read in
// ten seconds is: an optional one-line headline, three to five bullets, an
// optional single "Heads up:" line, and at most one short fenced pseudocode
// block. What goes wrong in practice is prose paragraphs creeping back in, a
// bullet that grows into a paragraph, and a pseudocode block that reprints the
// diff. Warnings only: the notes are the author's.

const FENCE = /^\s*(```|~~~)/;
const BULLET = /^\s*([-*+]|\d+[.)])\s+/;
const HEADING = /^\s*#/;
const INDENTED_CODE = /^ {4,}\S|^\t/;
const CONTINUATION = /^\s{2,}\S/;
const HEADS_UP = /^\s*Heads up:/;
const OPT_OUT = /no pseudocode/i;

const MAX_BULLETS = 5;
const MAX_BULLET_WORDS = 30;
const MAX_HEADLINE_WORDS = 15;
const MAX_HEADS_UP_WORDS = 30;
const MAX_CODE_LINES = 8;

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function lintNotes(text) {
  const findings = [];
  const lines = String(text ?? '').split('\n');

  let inFence = false;
  let hasCode = false;
  let hasOptOut = false;
  let sawIndented = false;
  let sawFirstTextLine = false;
  let bulletCount = 0;
  let headsUpCount = 0;
  let fenceStart = 0;
  let fenceLines = 0;
  // The open bullet, so its wrapped continuation lines count toward its words.
  let bullet = null;
  const closeBullet = () => {
    if (bullet && bullet.words > MAX_BULLET_WORDS) {
      findings.push({
        line: bullet.line,
        message: `bullet at line ${bullet.line} is ${bullet.words} words. Cut to one idea, under ${MAX_BULLET_WORDS}.`,
      });
    }
    bullet = null;
  };

  lines.forEach((raw, index) => {
    const number = index + 1;
    if (FENCE.test(raw)) {
      inFence = !inFence;
      if (inFence) {
        hasCode = true;
        fenceStart = number;
        fenceLines = 0;
      } else if (fenceLines > MAX_CODE_LINES) {
        findings.push({
          line: fenceStart,
          message: `pseudocode is ${fenceLines} lines. Keep the one rule a reviewer could get wrong, under ${MAX_CODE_LINES}.`,
        });
      }
      closeBullet();
      return;
    }
    if (inFence) {
      if (raw.trim() !== '') fenceLines += 1;
      return;
    }
    if (INDENTED_CODE.test(raw)) {
      // Not counted as pseudocode. In CommonMark an indented block that follows
      // a bullet list is a paragraph of the last bullet, not code, and the
      // notes are always bullets; Bitbucket, GitHub, and GitLab all render it
      // as wrapped plain text. Only a fenced block is unambiguous.
      const previous = lines[index - 1] ?? '';
      const startsBlock = previous.trim() === '' && !INDENTED_CODE.test(lines[index - 2] ?? '');
      if (startsBlock) {
        sawIndented = true;
        findings.push({
          line: number,
          message: 'indented block. After a bullet list, CommonMark renders an indented block as plain text inside the last bullet. Use a fence (three backticks) so it renders as code on every forge.',
        });
        closeBullet();
        return;
      }
      if (bullet) {
        bullet.words += countWords(raw);
        return;
      }
      closeBullet();
      return;
    }
    if (OPT_OUT.test(raw)) hasOptOut = true;
    if (raw.trim() === '' || HEADING.test(raw)) {
      closeBullet();
      return;
    }
    if (BULLET.test(raw)) {
      closeBullet();
      sawFirstTextLine = true;
      bulletCount += 1;
      if (bulletCount === MAX_BULLETS + 1) {
        findings.push({ line: number, message: `${MAX_BULLETS + 1} bullets. Keep the ${MAX_BULLETS} that matter.` });
      }
      bullet = { line: number, words: countWords(raw.replace(BULLET, '')) };
      return;
    }
    // A wrapped bullet continues on an indented line; that is not prose.
    if (bullet && CONTINUATION.test(raw)) {
      bullet.words += countWords(raw);
      return;
    }
    closeBullet();
    if (HEADS_UP.test(raw)) {
      sawFirstTextLine = true;
      headsUpCount += 1;
      if (headsUpCount > 1) {
        findings.push({ line: number, message: 'a second Heads up: line. Keep one.' });
        return;
      }
      const words = countWords(raw);
      if (words > MAX_HEADS_UP_WORDS) {
        findings.push({
          line: number,
          message: `Heads up: at line ${number} is ${words} words. Cut to one idea, under ${MAX_HEADS_UP_WORDS}.`,
        });
      }
      return;
    }
    if (!sawFirstTextLine) {
      // The headline: the first text line, when it is not a bullet.
      sawFirstTextLine = true;
      const words = countWords(raw);
      if (words > MAX_HEADLINE_WORDS) {
        findings.push({
          line: number,
          message: `headline at line ${number} is ${words} words. Cut to one line, under ${MAX_HEADLINE_WORDS}.`,
        });
      }
      return;
    }
    findings.push({ line: number, message: `prose at line ${number}. Make it a bullet or drop it.` });
  });
  closeBullet();

  // The bullet count is reported once, at the bullet that crossed the line.
  if (bulletCount > MAX_BULLETS + 1) {
    const finding = findings.find((entry) => /^\d+ bullets\./.test(entry.message));
    finding.message = `${bulletCount} bullets. Keep the ${MAX_BULLETS} that matter.`;
  }

  // An indented block already got its own warning naming the same fix.
  if (!hasCode && !hasOptOut && !sawIndented) {
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
