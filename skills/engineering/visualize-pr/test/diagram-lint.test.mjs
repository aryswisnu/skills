import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDiagramWarnings, lintDiagram } from '../src/diagram-lint.mjs';

test('lintDiagram flags a %% comment that is not at the start of a line', () => {
  const findings = lintDiagram('sequenceDiagram\n  Caller->>App: renders %% changed: new call\n');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
  assert.match(findings[0].message, /start of a line/);
});

test('lintDiagram accepts a %% comment on its own line', () => {
  assert.deepEqual(lintDiagram('sequenceDiagram\n  %% changed: new call\n  Caller->>App: renders\n'), []);
});

test('lintDiagram accepts an init directive, which legitimately starts with %%', () => {
  assert.deepEqual(lintDiagram('%%{init: {"theme":"dark"}}%%\nsequenceDiagram\n  A->>B: hi\n'), []);
});

test('lintDiagram flags angle brackets inside a label but not in arrows', () => {
  const findings = lintDiagram('sequenceDiagram\n  Caller->>App: get <name> field\n');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /Angle brackets/);
  assert.deepEqual(lintDiagram('sequenceDiagram\n  Caller->>App: get the name field\n'), []);
  assert.deepEqual(lintDiagram('flowchart LR\n  a --> b\n  b -->|yes| c\n'), []);
});

test('lintDiagram leaves a clean diagram alone and ignores blank lines', () => {
  assert.deepEqual(lintDiagram('sequenceDiagram\n\n  A->>B: hi\n  Note over A,B: changed\n'), []);
  assert.deepEqual(lintDiagram(''), []);
  assert.deepEqual(lintDiagram(null), []);
});

test('formatDiagramWarnings names the file and every line, or returns null', () => {
  assert.equal(formatDiagramWarnings([], 'seq.mmd'), null);
  const text = formatDiagramWarnings(lintDiagram('sequenceDiagram\n  A->>B: x %% y\n'), 'seq.mmd');
  assert.match(text, /seq\.mmd has 1 Mermaid issue/);
  assert.match(text, /line 2:/);
});

test('lintDiagram flags more than 4 participants, declared or implied by a message', () => {
  const declared = [
    'sequenceDiagram',
    '  participant A',
    '  participant B',
    '  participant C',
    '  participant D',
    '  participant E',
    '  A->>B: go',
  ].join('\n');
  const findings = lintDiagram(declared);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].message, '5 participants. Four fit on a phone; merge or drop the rest.');

  const implied = lintDiagram('sequenceDiagram\n  A->>B: go\n  C->>D: go\n  D->>E: go\n');
  assert.equal(implied.length, 1);
  assert.equal(implied[0].message, '5 participants. Four fit on a phone; merge or drop the rest.');
});

test('lintDiagram flags more than 6 messages', () => {
  const text = [
    'sequenceDiagram',
    '  A->>B: one',
    '  B-->>A: two',
    '  A->B: three',
    '  A-->B: four',
    '  A-)B: five',
    '  A--)B: six',
    '  A-xB: seven',
  ].join('\n');
  const findings = lintDiagram(text);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 8);
  assert.equal(findings[0].message, '7 messages. Six is the limit; show the riskiest flow only.');
});

test('lintDiagram flags a long message label and a long note', () => {
  const label = lintDiagram('sequenceDiagram\n  A->>B: this label runs on and on past forty characters easily\n');
  assert.equal(label.length, 1);
  assert.equal(label[0].line, 2);
  assert.equal(label[0].message, 'label is 54 characters; under 40.');

  const note = lintDiagram('sequenceDiagram\n  A->>B: go\n  Note over A,B: this note runs past thirty characters\n');
  assert.equal(note.length, 1);
  assert.equal(note[0].line, 3);
  assert.equal(note[0].message, 'note is 37 characters; under 30.');
});

test('lintDiagram leaves a four participant, six message diagram alone', () => {
  const text = [
    'sequenceDiagram',
    '  participant Caller',
    '  participant App',
    '  participant Store',
    '  participant Log',
    '  Caller->>App: submit order',
    '  App->>Store: read stock',
    '  Store-->>App: stock levels',
    '  App->>Log: record decision',
    '  App-->>Caller: accepted',
    '  Caller->>App: poll status',
    '  Note over App,Store: changed here',
  ].join('\n');
  assert.deepEqual(lintDiagram(text), []);
});

test('lintDiagram leaves a flowchart alone, since the limits are sequence limits', () => {
  const text = ['flowchart LR', '  a --> b', '  b --> c', '  c --> d', '  d --> e', '  e --> f'].join('\n');
  assert.deepEqual(lintDiagram(text), []);
});
