import test from 'node:test';
import assert from 'node:assert/strict';

import { formatNotesWarnings, lintNotes } from '../src/notes-lint.mjs';

const good = `- accept arrays and comma lists
- reject plain objects with a 400

\`\`\`
for v in values:
    expanded += group(v) or [v]
\`\`\`
`;

test('lintNotes accepts bullets plus a fenced pseudocode block', () => {
  assert.deepEqual(lintNotes(good), []);
});

test('lintNotes accepts an indented code block as pseudocode', () => {
  assert.deepEqual(lintNotes('- one\n- two\n\n    for v in values:\n        expand(v)\n'), []);
});

test('lintNotes warns when there is no pseudocode block', () => {
  const findings = lintNotes('- accept arrays\n- reject objects\n');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /no pseudocode block/i);
});

test('lintNotes accepts an explicit no-pseudocode bullet in place of a block', () => {
  assert.deepEqual(lintNotes('- renamed two files\n- No pseudocode: no logic changed.\n'), []);
});

test('lintNotes warns on a prose paragraph, with its line number', () => {
  const prose = `- accept arrays

The collection stores 19 strings for 5 listing types and exact matching therefore
undercounted badly, and silently, in district 1024 with status active, asking for
two values returned 206 of 363 real listings, which is the thing this fixes.

\`\`\`
x
\`\`\`
`;
  const findings = lintNotes(prose);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
  assert.match(findings[0].message, /prose paragraph/i);
});

test('lintNotes does not mistake wrapped bullets or code for prose', () => {
  const wrapped = `- a bullet that wraps onto a
  second line and a
  third line
- another

\`\`\`
line one
line two
line three
\`\`\`
`;
  assert.deepEqual(lintNotes(wrapped), []);
});

test('formatNotesWarnings names the file and each line, or returns null', () => {
  assert.equal(formatNotesWarnings([], 'notes.md'), null);
  const text = formatNotesWarnings(lintNotes('- only bullets\n'), 'notes.md');
  assert.match(text, /notes\.md/);
  assert.match(text, /pseudocode/);
});
