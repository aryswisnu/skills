export function commitRefArgs(ref) {
  return ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`];
}

export function parseNulPaths(buffer) {
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new Error('Git returned a path that is not valid UTF-8; this release cannot safely map it to JSON impact rules');
  }
  const entries = decoded.split('\0');
  if (entries.at(-1) === '') entries.pop();
  return entries;
}
