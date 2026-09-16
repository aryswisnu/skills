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
