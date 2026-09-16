import test from 'node:test';
import assert from 'node:assert/strict';

import { buildModuleGraph, renderMermaidFlowchart } from '../src/mermaid.mjs';

function repo(map) {
  return (path) => (Object.prototype.hasOwnProperty.call(map, path) ? map[path] : null);
}

test('buildModuleGraph resolves JS relative imports with and without extension', async () => {
  const tree = {
    'src/app.js': "import a from './lib/a.js';\nimport b from './lib/b';\n",
    'src/lib/a.js': 'export default 1;\n',
    'src/lib/b.js': 'export default 2;\n',
  };
  const graph = await buildModuleGraph({
    files: [
      { path: 'src/app.js', status: 'modified' },
      { path: 'src/lib/a.js', status: 'modified' },
    ],
    readFile: repo(tree),
  });
  const edges = graph.edges.map((e) => `${e.from}->${e.to}`).sort();
  assert.deepEqual(edges, ['src/app.js->src/lib/a.js', 'src/app.js->src/lib/b.js']);
  const paths = graph.nodes.map((n) => n.path).sort();
  assert.deepEqual(paths, ['src/app.js', 'src/lib/a.js', 'src/lib/b.js']);
  const b = graph.nodes.find((n) => n.path === 'src/lib/b.js');
  assert.equal(b.changed, false);
  const a = graph.nodes.find((n) => n.path === 'src/lib/a.js');
  assert.equal(a.changed, true);
});

test('buildModuleGraph resolves a JS directory import to its index file', async () => {
  const tree = {
    'src/app.js': "import { x } from './widgets';\n",
    'src/widgets/index.js': 'export const x = 1;\n',
  };
  const graph = await buildModuleGraph({
    files: [{ path: 'src/app.js', status: 'modified' }],
    readFile: repo(tree),
  });
  assert.deepEqual(graph.edges, [{ from: 'src/app.js', to: 'src/widgets/index.js' }]);
});

test('buildModuleGraph resolves Python dotted imports and drops package imports', async () => {
  const tree = {
    'app/main.py': 'import os\nimport requests\nfrom app.services.billing import charge\nimport app.models\n',
    'app/services/billing.py': 'def charge():\n    pass\n',
    'app/models/__init__.py': '',
  };
  const graph = await buildModuleGraph({
    files: [{ path: 'app/main.py', status: 'modified' }],
    readFile: repo(tree),
  });
  const edges = graph.edges.map((e) => e.to).sort();
  assert.deepEqual(edges, ['app/models/__init__.py', 'app/services/billing.py']);
});

test('buildModuleGraph drops bare package specifiers in JS', async () => {
  const tree = { 'src/app.js': "import react from 'react';\nconst fs = require('node:fs');\n" };
  const graph = await buildModuleGraph({
    files: [{ path: 'src/app.js', status: 'modified' }],
    readFile: repo(tree),
  });
  assert.deepEqual(graph.edges, []);
  assert.equal(graph.nodes.length, 1);
});

test('buildModuleGraph skips non-source files', async () => {
  const graph = await buildModuleGraph({
    files: [
      { path: 'README.md', status: 'modified' },
      { path: 'config/db.yaml', status: 'modified' },
      { path: 'src/app.js', status: 'modified' },
    ],
    readFile: repo({ 'src/app.js': '' }),
  });
  assert.deepEqual(graph.nodes.map((n) => n.path), ['src/app.js']);
});

test('buildModuleGraph keeps a deleted file as a node and renders it with a suffix', async () => {
  const graph = await buildModuleGraph({
    files: [
      { path: 'src/gone.js', status: 'deleted' },
      { path: 'src/stay.js', status: 'modified' },
    ],
    readFile: repo({ 'src/stay.js': '' }),
  });
  const gone = graph.nodes.find((n) => n.path === 'src/gone.js');
  assert.equal(gone.status, 'deleted');
  assert.equal(gone.changed, true);
  const block = renderMermaidFlowchart(graph, {});
  assert.match(block, /gone\.js \(deleted\)/);
  assert.match(block, /classDef deleted fill:#fee2e2,stroke:#dc2626,color:#7f1d1d/);
});

test('buildModuleGraph accepts git letter statuses', async () => {
  const graph = await buildModuleGraph({
    files: [
      { path: 'src/a.js', status: 'A' },
      { path: 'src/b.js', status: 'D' },
      { path: 'src/c.js', status: 'R' },
      { path: 'src/d.js', status: 'M' },
    ],
    readFile: () => null,
  });
  assert.deepEqual(
    graph.nodes.map((n) => n.status).sort(),
    ['added', 'deleted', 'modified', 'renamed'],
  );
});

test('buildModuleGraph caps the graph at 40 nodes, biggest changes first', async () => {
  const files = [];
  for (let i = 0; i < 45; i += 1) {
    files.push({ path: `src/m${String(i).padStart(2, '0')}.js`, status: 'modified', added: i, deleted: 0 });
  }
  const graph = await buildModuleGraph({ files, readFile: () => null });
  assert.equal(graph.nodes.length, 40);
  assert.equal(graph.nodes.some((n) => n.path === 'src/m44.js'), true);
  assert.equal(graph.nodes.some((n) => n.path === 'src/m00.js'), false);
});

test('buildModuleGraph and renderMermaidFlowchart are deterministic', async () => {
  const tree = {
    'src/app.js': "import './lib/a.js';\nimport './lib/b.js';\n",
    'src/lib/a.js': "import './b.js';\n",
    'src/lib/b.js': '',
  };
  const files = [
    { path: 'src/app.js', status: 'modified' },
    { path: 'src/lib/a.js', status: 'modified' },
    { path: 'src/lib/b.js', status: 'added' },
  ];
  const first = await buildModuleGraph({ files, readFile: repo(tree) });
  const second = await buildModuleGraph({ files, readFile: repo(tree) });
  assert.deepEqual(first, second);
  assert.equal(renderMermaidFlowchart(first, {}), renderMermaidFlowchart(second, {}));
});

test('renderMermaidFlowchart groups two or more directories into subgraphs', async () => {
  const tree = { 'src/app.js': "import '../lib/util.js';\n", 'lib/util.js': '' };
  const graph = await buildModuleGraph({
    files: [
      { path: 'src/app.js', status: 'modified' },
      { path: 'lib/util.js', status: 'modified' },
    ],
    readFile: repo(tree),
  });
  const block = renderMermaidFlowchart(graph, {});
  assert.match(block, /subgraph dir_lib \["lib"\]/);
  assert.match(block, /subgraph dir_src \["src"\]/);
  assert.match(block, /^\s*end$/m);
});

test('renderMermaidFlowchart omits subgraphs for a single directory', async () => {
  const graph = await buildModuleGraph({
    files: [
      { path: 'src/a.js', status: 'modified' },
      { path: 'src/b.js', status: 'modified' },
    ],
    readFile: () => null,
  });
  const block = renderMermaidFlowchart(graph, {});
  assert.doesNotMatch(block, /subgraph/);
});

test('renderMermaidFlowchart escapes quotes in labels', async () => {
  const graph = await buildModuleGraph({
    files: [
      { path: 'src/we"ird.js', status: 'modified' },
      { path: 'src/plain.js', status: 'modified' },
    ],
    readFile: () => null,
  });
  const block = renderMermaidFlowchart(graph, {});
  assert.match(block, /we#quot;ird\.js/);
  assert.doesNotMatch(block, /we"ird/);
});

test('renderMermaidFlowchart renders a placeholder for an empty graph', () => {
  const block = renderMermaidFlowchart({ nodes: [], edges: [] }, {});
  assert.match(block, /empty\["No source files changed"\]/);
  assert.equal(block.startsWith('```mermaid\nflowchart LR'), true);
  assert.equal(block.endsWith('```'), true);
});

test('renderMermaidFlowchart returns a complete fenced mermaid block', async () => {
  const tree = {
    'src/api/orders.js': "import { charge } from '../lib/billing.js';\n",
    'src/lib/billing.js': '',
  };
  const graph = await buildModuleGraph({
    files: [
      { path: 'src/api/orders.js', status: 'modified', added: 40, deleted: 12 },
      { path: 'src/lib/billing.js', status: 'added', added: 15, deleted: 0 },
    ],
    readFile: repo(tree),
  });
  const block = renderMermaidFlowchart(graph, { base: 'a'.repeat(40), head: 'b'.repeat(40), title: 'Change map' });
  assert.equal(block.startsWith('```mermaid\nflowchart LR'), true);
  assert.equal(block.endsWith('```'), true);
  assert.match(block, /-->/);
  assert.match(block, /classDef added fill:#dcfce7,stroke:#16a34a,color:#14532d/);
  assert.match(block, /classDef unchanged fill:#f3f4f6,stroke:#9ca3af,color:#374151/);
  assert.match(block, /^class .+ modified$/m);
});

test('buildModuleGraph folds more than five unchanged imports of one file into a single node', async () => {
  const targets = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => `src/${name}.js`);
  const source = targets.map((target) => `import '${target.replace('src/', './')}';`).join('\n');
  const repo = { 'src/main.js': source };
  for (const target of targets) repo[target] = 'export {};';
  const graph = await buildModuleGraph({
    files: [{ path: 'src/main.js', status: 'M' }],
    readFile: (path) => repo[path] ?? null,
  });
  assert.equal(graph.nodes.length, 2);
  const fold = graph.nodes.find((node) => !node.changed);
  assert.equal(fold.label, '+7 unchanged imports');
  assert.deepEqual(graph.edges, [{ from: 'src/main.js', to: 'src/main.js#unchanged-imports' }]);
  const rendered = renderMermaidFlowchart(graph);
  assert.match(rendered, /\+7 unchanged imports/);
  assert.equal((rendered.match(/-->/g) || []).length, 1);
});

test('buildModuleGraph keeps five or fewer unchanged imports expanded', async () => {
  const targets = ['a', 'b', 'c', 'd', 'e'].map((name) => `src/${name}.js`);
  const repo = { 'src/main.js': targets.map((t) => `import '${t.replace('src/', './')}';`).join('\n') };
  for (const target of targets) repo[target] = 'export {};';
  const graph = await buildModuleGraph({ files: [{ path: 'src/main.js', status: 'M' }], readFile: (p) => repo[p] ?? null });
  assert.equal(graph.nodes.length, 6);
  assert.equal(graph.edges.length, 5);
});
