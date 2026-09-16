// Insert or replace the visualize-pr section inside a pull request body.
//
// The section is delimited by markers so a repeated run updates the same block
// instead of appending a new copy. The markers are CommonMark link reference
// definitions, which render as nothing on GitHub, GitLab, and Bitbucket Cloud.
// HTML comments were used before; Bitbucket Cloud shows those as literal text,
// so a legacy block is recognized and rewritten with the new markers.

export const DESCRIPTION_START = '[//]: # (visualize-pr:start)';
export const DESCRIPTION_END = '[//]: # (visualize-pr:end)';
const LEGACY_START = '<!-- visualize-pr:start -->';
const LEGACY_END = '<!-- visualize-pr:end -->';

function markedBlock(section) {
  return `${DESCRIPTION_START}\n${String(section).trim()}\n${DESCRIPTION_END}`;
}

function findBlock(body) {
  for (const [startMarker, endMarker] of [[DESCRIPTION_START, DESCRIPTION_END], [LEGACY_START, LEGACY_END]]) {
    const start = body.indexOf(startMarker);
    const end = body.indexOf(endMarker);
    if (start !== -1 && end !== -1 && end > start) return { start, end: end + endMarker.length };
  }
  return null;
}

// First insert goes at the top: the block is the summary a reader wants
// first, and the author's own text follows untouched. A re-run replaces the
// block wherever it sits. `replace` makes the block the whole description,
// for the case where the existing text is a longer version of the notes.
// First insert puts the block on top, because it is the summary a reader
// wants first, and folds the author's own text under it: a <details> block
// where the forge renders HTML (GitHub, GitLab), a plain "Original
// description" heading where it does not (Bitbucket Cloud strips HTML). A
// re-run replaces only the block, wherever it sits, so the fold is applied
// once and the original text is never touched again.
export function mergeDescription(existingBody, section, { collapse = false } = {}) {
  const block = markedBlock(section);
  const body = typeof existingBody === 'string' ? existingBody : '';
  const found = findBlock(body);
  if (found) {
    const leading = body.slice(0, found.start).trim();
    // Already on top: swap the block, leave the fold and everything else alone.
    if (!leading) return body.slice(0, found.start) + block + body.slice(found.end);
    // Below the original (an older layout): lift it out and fall through to
    // the first-insert path, so the block leads and the rest gets folded once.
    const remainder = `${leading}\n\n${body.slice(found.end).trim()}`.trim();
    return mergeDescription(remainder, section, { collapse });
  }
  const trimmed = body.trim();
  if (!trimmed) return block;
  const original = collapse
    ? ['<details>', '<summary>Original description</summary>', '', trimmed, '', '</details>'].join('\n')
    : `## Original description\n\n${trimmed}`;
  return `${block}\n\n${original}`;
}
