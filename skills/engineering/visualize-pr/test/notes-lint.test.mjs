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

test('lintNotes warns on an indented block after a list: CommonMark renders it as plain text', () => {
  const findings = lintNotes('- one\n- two\n\n    for v in values:\n        expand(v)\n');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 4);
  assert.match(findings[0].message, /indented/i);
  assert.match(findings[0].message, /fence/i);
});

test('lintNotes counts only fenced blocks as pseudocode', () => {
  assert.deepEqual(lintNotes('- one\n\n~~~\nfor v in values: expand(v)\n~~~\n'), []);
  assert.deepEqual(lintNotes('- one\n\n```text\nfor v in values: expand(v)\n```\n'), []);
});

test('lintNotes warns when there is no pseudocode block', () => {
  const findings = lintNotes('- accept arrays\n- reject objects\n');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /no pseudocode block/i);
});

test('lintNotes accepts an explicit no-pseudocode bullet in place of a block', () => {
  assert.deepEqual(lintNotes('- renamed two files\n- No pseudocode: no logic changed.\n'), []);
});

test('lintNotes warns on a prose line, with its line number', () => {
  const prose = `- accept arrays

Exact matching undercounted the district totals, silently, for months.

\`\`\`
x
\`\`\`
`;
  const findings = lintNotes(prose);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
  assert.equal(findings[0].message, 'prose at line 3. Make it a bullet or drop it.');
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

test('lintNotes warns on a bullet over 30 words, counting its wrapped lines', () => {
  const long = `- one two three four five six seven eight nine ten eleven twelve thirteen
  fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone
  twentytwo twentythree twentyfour twentyfive twentysix twentyseven
  twentyeight twentynine thirty thirtyone
- short bullet

\`\`\`
x
\`\`\`
`;
  const findings = lintNotes(long);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].message, 'bullet at line 1 is 31 words. Cut to one idea, under 30.');
});

test('lintNotes warns when there are more than 5 bullets', () => {
  const many = `- one
- two
- three
- four
- five
- six

\`\`\`
x
\`\`\`
`;
  const findings = lintNotes(many);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].message, '6 bullets. Keep the 5 that matter.');
});

test('lintNotes warns on a headline over 15 words', () => {
  const head = `one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen
- a bullet

\`\`\`
x
\`\`\`
`;
  const findings = lintNotes(head);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
  assert.equal(findings[0].message, 'headline at line 1 is 16 words. Cut to one line, under 15.');
});

test('lintNotes warns on a fenced block over 8 lines, ignoring blank lines inside it', () => {
  const body = ['one', 'two', 'three', 'four', '', 'five', 'six', 'seven', 'eight', 'nine'].join('\n');
  const findings = lintNotes(`- a bullet\n\n\`\`\`\n${body}\n\`\`\`\n`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
  assert.equal(findings[0].message, 'pseudocode is 9 lines. Keep the one rule a reviewer could get wrong, under 8.');
});

test('lintNotes warns on a second Heads up line and on one over 30 words', () => {
  const twice = `- a bullet
Heads up: the migration runs first.
Heads up: and the cache is cold.

\`\`\`
x
\`\`\`
`;
  const findings = lintNotes(twice);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
  assert.match(findings[0].message, /second Heads up/);

  const wordy = `- a bullet
Heads up: one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine

\`\`\`
x
\`\`\`
`;
  const wordyFindings = lintNotes(wordy);
  assert.equal(wordyFindings.length, 1);
  assert.equal(wordyFindings[0].message, 'Heads up: at line 2 is 31 words. Cut to one idea, under 30.');
});

test('lintNotes accepts a headline, four bullets, a Heads up line and a six line fence', () => {
  const notes = `Expand grouped listing types before the count query runs
- accept arrays and comma lists
- reject plain objects with a 400
- count after expansion, not before
- keep the old single-value path untouched
Heads up: the cache key changed, so the first request after deploy is cold.

\`\`\`
for v in values:
    expanded += group(v) or [v]
if not expanded:
    raise BadRequest
count = query(expanded)
return count
\`\`\`
`;
  assert.deepEqual(lintNotes(notes), []);
});
