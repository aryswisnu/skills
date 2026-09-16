import test from 'node:test';
import assert from 'node:assert/strict';

import { DESCRIPTION_END, DESCRIPTION_START, mergeDescription } from '../src/pr-description.mjs';

test('mergeDescription appends a marked block when no markers exist', () => {
  const merged = mergeDescription('Original body.', '## Evidence\nsomething');
  assert.match(merged, /^Original body\.\n\n/);
  assert.ok(merged.includes(DESCRIPTION_START));
  assert.ok(merged.includes(DESCRIPTION_END));
  assert.ok(merged.includes('## Evidence'));
});

test('mergeDescription replaces an existing marked block in place', () => {
  const first = mergeDescription('Original body.', 'first section');
  const second = mergeDescription(first, 'second section');
  assert.ok(second.includes('second section'));
  assert.ok(!second.includes('first section'));
  assert.equal(second.split(DESCRIPTION_START).length - 1, 1);
  assert.equal(second.split(DESCRIPTION_END).length - 1, 1);
  assert.match(second, /^Original body\.\n\n/);
});

test('mergeDescription is idempotent for the same section', () => {
  const once = mergeDescription('Original body.', 'same section');
  const twice = mergeDescription(once, 'same section');
  assert.equal(twice, once);
});

test('mergeDescription handles a null or empty existing body', () => {
  const fromNull = mergeDescription(null, 'section');
  assert.ok(fromNull.startsWith(DESCRIPTION_START));
  assert.equal(mergeDescription('', 'section'), fromNull);
  assert.equal(mergeDescription(fromNull, 'section'), fromNull);
});

test('mergeDescription keeps text that follows the marked block', () => {
  const body = `Intro.\n\n${DESCRIPTION_START}\nold\n${DESCRIPTION_END}\n\nTrailing note.`;
  const merged = mergeDescription(body, 'new');
  assert.ok(merged.includes('Intro.'));
  assert.ok(merged.includes('Trailing note.'));
  assert.ok(merged.includes('new'));
  assert.ok(!merged.includes('old'));
});

test('markers are CommonMark link reference definitions, invisible on every forge', () => {
  assert.equal(DESCRIPTION_START, '[//]: # (visualize-pr:start)');
  assert.equal(DESCRIPTION_END, '[//]: # (visualize-pr:end)');
  const out = mergeDescription('Body.', '## Visual review\nx');
  assert.doesNotMatch(out, /<!--/, 'Bitbucket Cloud shows HTML comments as text');
});

test('mergeDescription upgrades a block delimited by the legacy HTML-comment markers', () => {
  const legacy = 'Body.\n\n<!-- visualize-pr:start -->\nold\n<!-- visualize-pr:end -->';
  const out = mergeDescription(legacy, 'new');
  assert.equal(out, `Body.\n\n${DESCRIPTION_START}\nnew\n${DESCRIPTION_END}`);
  assert.doesNotMatch(out, /old|<!--/);
});
