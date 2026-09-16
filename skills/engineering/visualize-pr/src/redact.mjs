const REDACTED = '<redacted>';

// Variable names that are safe to keep in plain text in a shareable artifact.
const SAFE_ENV_NAMES = /^(PORT|HOST|NODE_ENV|CI|TZ|LANG|LC_ALL|BROWSER|PATH|HOME|DEBUG|VISUAL_REVIEW_PORT)$/;

const SHELL_VALUE = `(?:"(?:\\\\.|[^"\\\\])*"|'(?:[^']*)'|[^\\s]+)`;
const CREDENTIAL_FLAG = new RegExp(`(--?(?:[a-z0-9-]*(?:token|password|passwd|secret|api[-_]?key|apikey|auth|credential|bearer)[a-z0-9-]*))(=|\\s+)(${SHELL_VALUE})`, 'gi');
const INLINE_ENV = new RegExp(`(^|\\s)([A-Za-z_][A-Za-z0-9_]*)=(${SHELL_VALUE})`, 'g');
const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

/** Replace secret-bearing fragments of a command so it can be recorded in an artifact. */
export function redactCommand(command) {
  return String(command)
    .replace(CREDENTIAL_FLAG, (_match, flag, separator) => `${flag}${separator === '=' ? '=' : ' '}${REDACTED}`)
    .replace(INLINE_ENV, (match, lead, name) =>
      (SAFE_ENV_NAMES.test(name) ? match : `${lead}${name}=${REDACTED}`))
    .replace(URL_USERINFO, (_match, scheme) => `${scheme}${REDACTED}@`);
}

/** Describe a secret value by length only. */
export function redactValue(value) {
  return `<redacted:${String(value).length}>`;
}

/** Recursively redact known secret values from runtime and semantic evidence. */
export function redactKnownValues(value, secrets) {
  const needles = [...new Set(secrets.map(String).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  const redactString = (input) => {
    let output = input;
    for (const needle of needles) output = output.split(needle).join(REDACTED);
    return output;
  };

  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((entry) => redactKnownValues(entry, needles));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactKnownValues(entry, needles)]),
    );
  }
  return value;
}
