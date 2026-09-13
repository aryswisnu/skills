import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArchitectureDiagram,
  buildChangeSummary,
  parseNameStatus,
  parseNumstat,
  summarizeChange,
} from '../src/backend.mjs';

const nameStatus = [
  'M\tsrc/api/orders.ts',
  'A\tsrc/api/payments.ts',
  'D\tsrc/api/legacy.ts',
  'M\tconfig/db.yaml',
].join('\n');

const numstat = [
  '40\t12\tsrc/api/orders.ts',
  '15\t0\tsrc/api/payments.ts',
  '0\t30\tsrc/api/legacy.ts',
  '2\t2\tconfig/db.yaml',
].join('\n');

test('parseNumstat maps added/deleted/path and treats - as 0', () => {
  assert.deepEqual(parseNumstat('10\t5\tsrc/a.ts\n-\t-\tassets/b.png\n'), [
    { added: 10, deleted: 5, path: 'src/a.ts' },
    { added: 0, deleted: 0, path: 'assets/b.png' },
  ]);
});

test('parseNameStatus reads status and path, including rename triplets', () => {
  assert.deepEqual(parseNameStatus('M\tsrc/a.ts\nR100\tsrc/old.ts\tsrc/new.ts\n'), [
    { status: 'M', path: 'src/a.ts' },
    { status: 'R', path: 'src/new.ts' },
  ]);
});

test('summarizeChange groups by top segment and computes counts', () => {
  const summary = summarizeChange(parseNameStatus(nameStatus), parseNumstat(numstat));
  assert.equal(summary.totalFiles, 4);
  assert.equal(summary.totalAdded, 57);
  assert.equal(summary.totalDeleted, 44);
  assert.equal(summary.addedCount, 1);
  assert.equal(summary.deletedCount, 1);
  assert.equal(summary.modifiedCount, 2);

  const src = summary.groups.find((g) => g.name === 'src');
  assert.deepEqual({ files: src.files, added: src.added, deleted: src.deleted }, { files: 3, added: 55, deleted: 42 });
  // most churn first
  assert.equal(summary.groups[0].name, 'src');
});

test('buildChangeSummary renders a markdown summary', () => {
  const summary = summarizeChange(parseNameStatus(nameStatus), parseNumstat(numstat));
  const md = buildChangeSummary(summary, 'a'.repeat(40), 'b'.repeat(40));
  assert.match(md, /## Change summary/);
  assert.match(md, /4 files changed/);
  assert.match(md, /\+57 -44/);
  assert.match(md, /\| Module \| Files \|/);
  assert.match(md, /\| `src` \| 3 \| \+55 \| -42 \|/);
  assert.match(md, /Most changed files/);
  assert.match(md, /src\/api\/orders\.ts/);
  assert.match(md, /modified, \+40 -12/);
});

test('buildArchitectureDiagram emits SVG with focal accent and magnitude bars', () => {
  const summary = summarizeChange(parseNameStatus(nameStatus), parseNumstat(numstat));
  const svg = buildArchitectureDiagram(summary, 'a'.repeat(40), 'b'.repeat(40));
  assert.match(svg, /^<svg /);
  assert.match(svg, /Change map/);
  assert.match(svg, /#eb6c36/);
  assert.match(svg, /src/);
  assert.match(svg, /config/);
  assert.match(svg, /<\/svg>$/);
});

test('buildArchitectureDiagram handles an empty change set', () => {
  const svg = buildArchitectureDiagram(summarizeChange([], []), 'a'.repeat(40), 'b'.repeat(40));
  assert.match(svg, /Change map/);
  assert.match(svg, /<\/svg>$/);
});
