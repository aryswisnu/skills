// Insert or replace the visualize-pr section inside a GitHub pull request body.
//
// The section is delimited by HTML comment markers so a repeated run updates the
// same block instead of appending a new copy. Everything outside the markers is
// left untouched.

export const DESCRIPTION_START = '<!-- visualize-pr:start -->';
export const DESCRIPTION_END = '<!-- visualize-pr:end -->';

function markedBlock(section) {
  return `${DESCRIPTION_START}\n${String(section).trim()}\n${DESCRIPTION_END}`;
}

export function mergeDescription(existingBody, section) {
  const block = markedBlock(section);
  const body = typeof existingBody === 'string' ? existingBody : '';
  const start = body.indexOf(DESCRIPTION_START);
  const end = body.indexOf(DESCRIPTION_END);
  if (start !== -1 && end !== -1 && end > start) {
    return body.slice(0, start) + block + body.slice(end + DESCRIPTION_END.length);
  }
  const trimmed = body.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}
