/**
 * Verdicts describe evidence. None of them approves a pull request; `unchanged` only means the
 * configured captures did not move, and `review-required` only means a human should look.
 */
export const VERDICTS = ['unchanged', 'changed-within-threshold', 'review-required', 'capture-failed'];

const RUNTIME_FIELDS = [
  ['pageErrors', 'page error'],
  ['consoleErrors', 'console error'],
  ['failedRequests', 'failed request'],
  ['assertionFailures', 'assertion failure'],
];

/** Head-only runtime entries. Noise present on both revisions is not a regression. */
export function runtimeDelta(base, head) {
  const delta = { regressed: false };
  for (const [field] of RUNTIME_FIELDS) {
    const remaining = new Map();
    for (const entry of base?.[field] ?? []) remaining.set(entry, (remaining.get(entry) ?? 0) + 1);
    const only = [];
    for (const entry of head?.[field] ?? []) {
      const count = remaining.get(entry) ?? 0;
      if (count > 0) remaining.set(entry, count - 1);
      else only.push(entry);
    }
    delta[field] = only;
    if (only.length > 0) delta.regressed = true;
  }
  delta.statusChanged = base?.status !== undefined && head?.status !== undefined && base.status !== head.status;
  const baseOk = Number.isInteger(base?.status) && base.status >= 200 && base.status < 400;
  const headFailed = Number.isInteger(head?.status) && head.status >= 400;
  if (baseOk && headFailed) delta.regressed = true;
  return delta;
}

function flatten(value, prefix, into) {
  if (value === null || value === undefined) return into;
  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value).sort()) flatten(value[key], prefix ? `${prefix}.${key}` : key, into);
    return into;
  }
  into.set(prefix, Array.isArray(value) ? value.join('\n') : String(value));
  return into;
}

/** Field paths whose semantic evidence differs between revisions. */
export function semanticDelta(base, head) {
  const left = flatten(base ?? {}, '', new Map());
  const right = flatten(head ?? {}, '', new Map());
  const keys = new Set([...left.keys(), ...right.keys()]);
  const changed = [...keys].filter((key) => left.get(key) !== right.get(key)).sort();
  return { changed, changedCount: changed.length };
}

export function classifyCell({ pixel, base, head, sizeMismatch = null, thresholds }) {
  const reasons = [];
  if (base?.captureError) reasons.push(`base capture failed: ${base.captureError}`);
  if (head?.captureError) reasons.push(`head capture failed: ${head.captureError}`);
  if (reasons.length > 0) return { verdict: 'capture-failed', reasons, runtime: runtimeDelta(base, head), semantic: { changed: [], changedCount: 0 } };

  const runtime = runtimeDelta(base, head);
  const semantic = semanticDelta(base?.semantic, head?.semantic);

  if (sizeMismatch) {
    reasons.push(`capture dimensions differ (${sizeMismatch}); pixel diff not computed`);
  }
  for (const [field, label] of RUNTIME_FIELDS) {
    if (runtime[field].length > 0) {
      reasons.push(`${runtime[field].length} new ${label}${runtime[field].length === 1 ? '' : 's'} on head`);
    }
  }
  if (runtime.statusChanged) reasons.push(`document status changed ${base.status} -> ${head.status}`);
  if (Number.isInteger(head?.status) && head.status >= 400) {
    reasons.push(`head document returned HTTP ${head.status}`);
  }
  if (semantic.changedCount > 0) reasons.push(`semantic change in ${semantic.changed.join(', ')}`);

  if (reasons.length > 0) return { verdict: 'review-required', reasons, runtime, semantic };

  const ratio = pixel?.changeRatio ?? 0;
  if (ratio > thresholds.reviewRatio) {
    reasons.push(`${(ratio * 100).toFixed(2)}% of pixels changed, above the ${(thresholds.reviewRatio * 100).toFixed(2)}% review threshold`);
    return { verdict: 'review-required', reasons, runtime, semantic };
  }
  if (ratio > thresholds.changedRatio) {
    return { verdict: 'changed-within-threshold', reasons, runtime, semantic };
  }
  return { verdict: 'unchanged', reasons, runtime, semantic };
}

/** Nonzero only when evidence is missing. A `review-required` verdict is a finding, not a failure. */
export function exitCodeFor(cells) {
  if (cells.length === 0) return 1;
  return cells.some((cell) => cell.verdict === 'capture-failed') ? 1 : 0;
}
