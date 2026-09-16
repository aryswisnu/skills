import test from 'node:test';
import assert from 'node:assert/strict';

import { DESCRIPTION_END, DESCRIPTION_START, mergeDescription } from '../src/pr-description.mjs';

test('mergeDescription puts the marked block first when no markers exist', () => {
  const merged = mergeDescription('Original body.', '## Evidence\nsomething');
  assert.ok(merged.startsWith(DESCRIPTION_START));
  assert.match(merged, /## Original description\n\nOriginal body\.$/);
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
  assert.ok(second.startsWith(DESCRIPTION_START), 'block stays first');
  assert.match(second, /## Original description\n\nOriginal body\.$/, 'original stays demoted, folded once');
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
  assert.equal(out, `${DESCRIPTION_START}\nnew\n${DESCRIPTION_END}\n\n## Original description\n\nBody.`);
  assert.doesNotMatch(out, /old|<!--/);
});


test('mergeDescription puts the block at the top and folds the original body under details where HTML renders', () => {
  const out = mergeDescription('Original text.\n\nMore text.', '## Visual review\nx', { collapse: true });
  assert.equal(out, [
    `${DESCRIPTION_START}\n## Visual review\nx\n${DESCRIPTION_END}`,
    '',
    '<details>',
    '<summary>Original description</summary>',
    '',
    'Original text.\n\nMore text.',
    '',
    '</details>',
  ].join('\n'));
});

test('mergeDescription demotes the original body under a heading where HTML does not render', () => {
  const out = mergeDescription('Original text.', '## Visual review\nx', { collapse: false });
  assert.equal(out, `${DESCRIPTION_START}\n## Visual review\nx\n${DESCRIPTION_END}\n\n## Original description\n\nOriginal text.`);
});

test('mergeDescription replaces an existing block in place and does not re-wrap the original', () => {
  const first = mergeDescription('Original.', 'old', { collapse: true });
  const second = mergeDescription(first, 'new', { collapse: true });
  assert.equal(second, first.replace('old', 'new'));
  assert.equal((second.match(/<details>/g) || []).length, 1);
});

test('mergeDescription with an empty body is just the block', () => {
  assert.equal(mergeDescription('', 'x', { collapse: true }), `${DESCRIPTION_START}\nx\n${DESCRIPTION_END}`);
  assert.equal(mergeDescription(null, 'x'), `${DESCRIPTION_START}\nx\n${DESCRIPTION_END}`);
});

test('mergeDescription lifts a block that sits below the original text to the top and folds the rest', () => {
  const legacyBottom = `Long original prose.\n\n${DESCRIPTION_START}\nold\n${DESCRIPTION_END}`;
  const out = mergeDescription(legacyBottom, 'new', { collapse: true });
  assert.ok(out.startsWith(`${DESCRIPTION_START}\nnew\n${DESCRIPTION_END}`), 'block first');
  assert.match(out, /<details>\n<summary>Original description<\/summary>\n\nLong original prose\.\n\n<\/details>$/);
  assert.doesNotMatch(out, /old/);
  assert.equal((out.match(/visualize-pr:start/g) || []).length, 1);
  const again = mergeDescription(out, 'newer', { collapse: true });
  assert.equal(again, out.replace('new', 'newer'), 'second run replaces in place, no second fold');
  assert.equal((again.match(/<details>/g) || []).length, 1);
});

test('mergeDescription lifts a legacy HTML-marker block from the bottom too, on Bitbucket form', () => {
  const legacy = 'Original.\n\n<!-- visualize-pr:start -->\nold\n<!-- visualize-pr:end -->';
  const out = mergeDescription(legacy, 'new', { collapse: false });
  assert.equal(out, `${DESCRIPTION_START}\nnew\n${DESCRIPTION_END}\n\n## Original description\n\nOriginal.`);
});
