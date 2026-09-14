import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArchitectureDiagram,
  buildBackendComment,
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

test('summarizeChange groups by module directory and computes counts', () => {
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

test('summarizeChange strips a common directory prefix so a monorepo groups by its modules', () => {
  const nameStatus = [
    'M\tskills/engineering/visual-pr-review/src/backend.mjs',
    'M\tskills/engineering/visual-pr-review/scripts/visual-pr-review.mjs',
    'M\tskills/engineering/visual-pr-review/test/backend.test.mjs',
  ].join('\n');
  const numstat = [
    '10\t2\tskills/engineering/visual-pr-review/src/backend.mjs',
    '4\t1\tskills/engineering/visual-pr-review/scripts/visual-pr-review.mjs',
    '6\t0\tskills/engineering/visual-pr-review/test/backend.test.mjs',
  ].join('\n');
  const summary = summarizeChange(parseNameStatus(nameStatus), parseNumstat(numstat));
  assert.deepEqual(
    summary.groups.map((g) => g.name).sort(),
    ['scripts', 'src', 'test'],
  );
  const src = summary.groups.find((g) => g.name === 'src');
  assert.deepEqual({ files: src.files, added: src.added, deleted: src.deleted }, { files: 1, added: 10, deleted: 2 });
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

test('buildBackendComment references the local SVG when no image URL is supplied', () => {
  const summary = summarizeChange(parseNameStatus(nameStatus), parseNumstat(numstat));
  const pr = { title: 'Refactor billing', baseRef: 'main', headRef: 'feature/billing' };
  const md = buildBackendComment(summary, 'a'.repeat(40), 'b'.repeat(40), pr);
  assert.match(md, /^## Visual review/);
  assert.match(md, /## Change summary/);
  assert.match(md, /architecture\.svg/);
  assert.doesNotMatch(md, /## Evidence/);
});

test('buildBackendComment embeds the rasterized change map when an image URL is supplied', () => {
  const summary = summarizeChange(parseNameStatus(nameStatus), parseNumstat(numstat));
  const pr = { title: 'Refactor billing', baseRef: 'main', headRef: 'feature/billing' };
  const url = 'https://raw.githubusercontent.com/acme/orders/visual-review-assets/pr-9-123/architecture.png';
  const md = buildBackendComment(summary, 'a'.repeat(40), 'b'.repeat(40), pr, url);
  assert.match(md, /## Evidence/);
  assert.match(md, /!\[Architecture change map\]\(https:\/\/raw\.githubusercontent\.com\/acme\/orders\/visual-review-assets\/pr-9-123\/architecture\.png\)/);
  assert.doesNotMatch(md, /open in a browser/);
  assert.match(md, /editable `architecture\.svg` remains/);
});
