import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAsciiChangeMap, renderAsciiSequence } from '../src/ascii.mjs';

const EXAMPLE_GRAPH = {
  nodes: [
    { id: 'n1', path: 'src/api/orders.js', label: 'api/orders.js', status: 'modified', changed: true },
    { id: 'n2', path: 'src/lib/billing.js', label: 'lib/billing.js', status: 'added', changed: true },
    { id: 'n3', path: 'src/lib/legacy.js', label: 'lib/legacy.js', status: 'deleted', changed: true },
    { id: 'n4', path: 'src/lib/log.js', label: 'lib/log.js', status: 'unchanged', changed: false },
  ],
  edges: [
    { from: 'src/api/orders.js', to: 'src/lib/billing.js' },
    { from: 'src/api/orders.js', to: 'src/lib/log.js' },
    { from: 'src/lib/billing.js', to: 'src/lib/log.js' },
  ],
};

const EXAMPLE_MAP = [
  'Change map  1a2b3c4 -> 9f8e7d6  (3 changed files)',
  '',
  '  api/',
  '    [M] orders.js   -> billing.js, log.js',
  '  lib/',
  '    [A] billing.js  -> log.js',
  '    [D] legacy.js',
  '    [ ] log.js      (imported by 2)',
  '',
  '  [A] added  [M] modified  [D] deleted  [R] renamed  [ ] unchanged',
  '',
].join('\n');

test('renderAsciiChangeMap matches the documented example exactly', () => {
  const text = renderAsciiChangeMap(EXAMPLE_GRAPH, { base: '1a2b3c4abcdef', head: '9f8e7d6abcdef' });
  assert.equal(text, EXAMPLE_MAP);
});

test('renderAsciiChangeMap omits the sha range when base and head are null', () => {
  const text = renderAsciiChangeMap(EXAMPLE_GRAPH);
  assert.equal(text.split('\n')[0], 'Change map  (3 changed files)');
});

test('renderAsciiChangeMap handles an empty graph', () => {
  assert.equal(renderAsciiChangeMap({ nodes: [], edges: [] }), 'Change map\n\n  (no source files changed)\n');
  assert.equal(renderAsciiChangeMap(null), 'Change map\n\n  (no source files changed)\n');
});

test('renderAsciiChangeMap is deterministic', () => {
  const a = renderAsciiChangeMap(EXAMPLE_GRAPH, { base: 'aaaaaaa', head: 'bbbbbbb' });
  const b = renderAsciiChangeMap(EXAMPLE_GRAPH, { base: 'aaaaaaa', head: 'bbbbbbb' });
  assert.equal(a, b);
});

test('renderAsciiChangeMap shows a fold node only as a target', () => {
  const graph = {
    nodes: [
      { id: 'n1', path: 'src/app.js', label: 'app.js', status: 'modified', changed: true },
      {
        id: 'n2',
        path: 'src/app.js#unchanged-imports',
        label: '+17 unchanged imports',
        status: 'unchanged',
        changed: false,
      },
    ],
    edges: [{ from: 'src/app.js', to: 'src/app.js#unchanged-imports' }],
  };
  const text = renderAsciiChangeMap(graph);
  assert.match(text, /\[M\] app\.js\s+-> \+17 unchanged imports/);
  assert.equal(text.includes('[ ] +17 unchanged imports'), false);
  assert.equal(text.includes('(imported by'), false);
  assert.equal(text.split('\n')[0], 'Change map  (1 changed files)');
});

test('renderAsciiChangeMap disambiguates targets that share a basename', () => {
  const graph = {
    nodes: [
      { id: 'n1', path: 'src/app.js', label: 'app.js', status: 'modified', changed: true },
      { id: 'n2', path: 'src/api/util.js', label: 'api/util.js', status: 'unchanged', changed: false },
      { id: 'n3', path: 'src/lib/util.js', label: 'lib/util.js', status: 'unchanged', changed: false },
    ],
    edges: [
      { from: 'src/app.js', to: 'src/api/util.js' },
      { from: 'src/app.js', to: 'src/lib/util.js' },
    ],
  };
  const text = renderAsciiChangeMap(graph);
  assert.match(text, /-> api\/util\.js, lib\/util\.js/);
});

const EXAMPLE_SEQUENCE = [
  'sequenceDiagram',
  '  participant Dev',
  '  participant CLI as visualize-pr',
  '  participant GH as GitHub',
  '  Dev->>CLI: --pr <url>',
  '  CLI->>GH: GET /pulls/N',
  '  Note over CLI,GH: changed',
  '  GH-->>CLI: 200',
].join('\n');

test('renderAsciiSequence renders the documented example', () => {
  const text = renderAsciiSequence(EXAMPLE_SEQUENCE);
  assert.ok(text);
  const lines = text.split('\n');

  const header = lines[0];
  assert.ok(header.indexOf('Dev') >= 0);
  assert.ok(header.indexOf('Dev') < header.indexOf('visualize-pr'));
  assert.ok(header.indexOf('visualize-pr') < header.indexOf('GitHub'));

  assert.ok(lines.some((line) => line.includes('--pr <url>')));
  const rightArrow = lines.find((line) => line.includes('--->') || /-{3,}>/.test(line));
  assert.ok(rightArrow, 'expected a right-pointing arrow row');

  const dashedReply = lines.find((line) => line.includes('- -') && line.includes('<'));
  assert.ok(dashedReply, 'expected a dashed left-pointing reply row');

  assert.ok(lines.some((line) => line.includes('[ changed ]')));
  assert.equal(text.endsWith('\n'), false);
});

test('renderAsciiSequence returns null for non-sequence and empty input', () => {
  assert.equal(renderAsciiSequence('flowchart LR\n  a --> b'), null);
  assert.equal(renderAsciiSequence(''), null);
  assert.equal(renderAsciiSequence('   \n\n'), null);
  assert.equal(renderAsciiSequence(null), null);
  assert.equal(renderAsciiSequence('sequenceDiagram\n  participant A'), null);
});

test('renderAsciiSequence strips a surrounding mermaid fence', () => {
  const fenced = ['```mermaid', EXAMPLE_SEQUENCE, '```'].join('\n');
  assert.equal(renderAsciiSequence(fenced), renderAsciiSequence(EXAMPLE_SEQUENCE));
});

test('renderAsciiSequence renders a self message as a loop', () => {
  const text = renderAsciiSequence('sequenceDiagram\n  participant A\n  A->>A: retry');
  assert.ok(text);
  const lines = text.split('\n');
  assert.ok(lines.some((line) => line.includes('|--.')));
  assert.ok(lines.some((line) => line.includes('|  | retry')));
  assert.ok(lines.some((line) => line.includes("|<-'")));
});

test('renderAsciiSequence adds undeclared participants in order of first mention', () => {
  const text = renderAsciiSequence('sequenceDiagram\n  participant B\n  A->>B: hi');
  assert.ok(text);
  const header = text.split('\n')[0];
  assert.ok(header.indexOf('B') < header.indexOf('A'));
});

test('renderAsciiSequence renders loop and end rows', () => {
  const text = renderAsciiSequence([
    'sequenceDiagram',
    '  participant A',
    '  participant B',
    '  loop every poll',
    '  A->>B: ping',
    '  end',
  ].join('\n'));
  assert.ok(text);
  assert.ok(text.split('\n').some((line) => line.startsWith('-- loop: every poll ')));
  assert.ok(text.split('\n').some((line) => line.startsWith('-- end --')));
});

test('renderAsciiSequence drops a trailing inline comment on a message line', () => {
  const text = renderAsciiSequence('sequenceDiagram\n  participant A\n  participant B\n  A->>B: ping %% changed');
  assert.ok(text);
  assert.equal(text.includes('changed'), false);
  assert.ok(text.includes('ping'));
});

test('renderAsciiSequence renders notes anchored at a participant column', () => {
  const text = renderAsciiSequence([
    'sequenceDiagram',
    '  participant A',
    '  participant B',
    '  Note right of B: done',
    '  A->>B: go',
  ].join('\n'));
  assert.ok(text);
  assert.ok(text.split('\n').some((line) => line.includes('[ done ]')));
});

test('renderAsciiSequence is deterministic', () => {
  assert.equal(renderAsciiSequence(EXAMPLE_SEQUENCE), renderAsciiSequence(EXAMPLE_SEQUENCE));
});
