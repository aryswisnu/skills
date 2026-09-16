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

export function mergeDescription(existingBody, section) {
  const block = markedBlock(section);
  const body = typeof existingBody === 'string' ? existingBody : '';
  const found = findBlock(body);
  if (found) return body.slice(0, found.start) + block + body.slice(found.end);
  const trimmed = body.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}
