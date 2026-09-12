import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSummary, renderReport, VERDICT_ORDER } from '../src/report.mjs';

const cell = (overrides) => ({
  scenarioId: 'home',
  scenarioName: 'Home',
  path: '/',
  viewport: 'desktop',
  viewportSize: { width: 1440, height: 900 },
  verdict: 'unchanged',
  reasons: [],
  artifacts: { before: 'home-desktop-before.png', after: 'home-desktop-after.png', sideBySide: 'home-desktop-side-by-side.png', diff: 'home-desktop-diff.png' },
  pixel: { changedPixels: 0, totalPixels: 1000, changeRatio: 0 },
  runtime: { base: { pageErrors: [], consoleErrors: [], failedRequests: [], assertionFailures: [], status: 200 }, head: { pageErrors: [], consoleErrors: [], failedRequests: [], assertionFailures: [], status: 200 }, delta: { regressed: false, pageErrors: [], consoleErrors: [], failedRequests: [], assertionFailures: [] } },
  semantic: { changed: [], changedCount: 0 },
  ...overrides,
});

const report = (overrides = {}) => ({
  generatedAt: '2026-09-12T00:00:00.000Z',
  durationMs: 1234,
  base: { ref: 'main', sha: 'a'.repeat(40) },
  head: { ref: 'HEAD', sha: 'b'.repeat(40) },
  changedFiles: ['src/app.css'],
  diffStat: ' src/app.css | 2 +-',
  selection: { scenarioIds: ['home'], reason: 'impact-rules', matchedRules: [{ glob: '**/*.css', file: 'src/app.css', scenarios: ['home'] }], unmatchedFiles: [] },
  skippedScenarios: [{ id: 'checkout', name: 'Checkout', reason: 'not selected by impact rules' }],
  cells: [cell()],
  provenance: { publicConfigDigest: 'c'.repeat(64), browser: { version: '145.0' }, artifactHashes: { 'report.md': 'd'.repeat(64) }, commands: { start: 'npm start' } },
  ...overrides,
});

test('VERDICT_ORDER puts problems before quiet results', () => {
  assert.deepEqual(VERDICT_ORDER, ['capture-failed', 'review-required', 'changed-within-threshold', 'unchanged']);
});

test('renderReport shows full SHAs and the config digest', () => {
  const markdown = renderReport(report());
  assert.match(markdown, new RegExp('a'.repeat(40)));
  assert.match(markdown, new RegExp('b'.repeat(40)));
  assert.match(markdown, new RegExp('c'.repeat(64)));
});

test('renderReport orders cells by severity, not by config order', () => {
  const markdown = renderReport(report({
    cells: [
      cell({ scenarioId: 'quiet', scenarioName: 'Quiet', verdict: 'unchanged' }),
      cell({ scenarioId: 'loud', scenarioName: 'Loud', verdict: 'review-required', reasons: ['3.00% of pixels changed'] }),
      cell({ scenarioId: 'broken', scenarioName: 'Broken', verdict: 'capture-failed', reasons: ['head capture failed: timeout'], pixel: null }),
    ],
  }));
  const order = ['Broken', 'Loud', 'Quiet'].map((name) => markdown.indexOf(`### ${name}`));
  assert.ok(order[0] < order[1] && order[1] < order[2], `unexpected order: ${order}`);
});

test('renderReport embeds before, after and diff evidence for a captured cell', () => {
  const markdown = renderReport(report({ cells: [cell({ verdict: 'review-required', reasons: ['x'] })] }));
  assert.match(markdown, /!\[Home · desktop · side-by-side\]\(home-desktop-side-by-side\.png\)/);
  assert.match(markdown, /!\[Home · desktop · before\]\(home-desktop-before\.png\)/);
  assert.match(markdown, /!\[Home · desktop · after\]\(home-desktop-after\.png\)/);
  assert.match(markdown, /!\[Home · desktop · pixel diff\]\(home-desktop-diff\.png\)/);
});

test('renderReport labels a failed capture as uncaptured and omits missing images', () => {
  const markdown = renderReport(report({
    cells: [cell({ verdict: 'capture-failed', reasons: ['head capture failed: timeout'], pixel: null, artifacts: { before: 'home-desktop-before.png' } })],
  }));
  assert.match(markdown, /NOT CAPTURED/);
  assert.match(markdown, /head capture failed: timeout/);
  assert.equal(markdown.includes('home-desktop-diff.png'), false);
});

test('renderReport reports head-only runtime evidence separately from base', () => {
  const markdown = renderReport(report({
    cells: [cell({
      verdict: 'review-required',
      reasons: ['1 new console error on head'],
      runtime: {
        base: { pageErrors: [], consoleErrors: [], failedRequests: [], assertionFailures: [], status: 200 },
        head: { pageErrors: [], consoleErrors: ['TypeError: nope'], failedRequests: [], assertionFailures: [], status: 200 },
        delta: { regressed: true, pageErrors: [], consoleErrors: ['TypeError: nope'], failedRequests: [], assertionFailures: [] },
      },
    })],
  }));
  assert.match(markdown, /Runtime regression/);
  assert.match(markdown, /TypeError: nope/);
});

test('renderReport states which scenarios were not captured and why', () => {
  const markdown = renderReport(report());
  assert.match(markdown, /Checkout/);
  assert.match(markdown, /not selected by impact rules/);
  assert.match(markdown, /impact-rules/);
});

test('renderReport keeps the human decision boundary explicit', () => {
  const markdown = renderReport(report());
  assert.match(markdown, /does not approve/i);
});

test('renderReport escapes untrusted markdown and HTML fields', () => {
  const markdown = renderReport(report({
    base: { ref: '`x` <img src=https://evil.test/x>', sha: 'a'.repeat(40) },
    changedFiles: ['a`\n## injected'],
    diffStat: '```\n![remote](https://evil.test/x)\n<img src=https://evil.test/x>',
    selection: { scenarioIds: ['home'], reason: '<script>x</script>', matchedRules: [], unmatchedFiles: [] },
    skippedScenarios: [],
    cells: [cell({
      scenarioName: 'Name <img src=x> [link](https://evil.test)',
      reasons: ['reason\n# injected <script>'],
      runtime: {
        base: { pageErrors: [], consoleErrors: [], failedRequests: [], assertionFailures: [], status: 200 },
        head: { pageErrors: [], consoleErrors: ['`</details><img src=https://evil.test/x>'], failedRequests: [], assertionFailures: [], status: 200 },
        delta: { regressed: true, pageErrors: [], consoleErrors: ['`</details><img src=https://evil.test/x>'], failedRequests: [], assertionFailures: [] },
      },
    })],
  }));
  assert.equal(markdown.includes('<img src=https://evil.test'), false);
  assert.equal(markdown.includes('<script>'), false);
  assert.equal(markdown.includes('\n## injected'), false);
  // The diffStat block is indented code, so markdown image syntax is shown literally
  // (never rendered as a remote image) while raw HTML is escaped above.
  assert.equal(markdown.includes('![remote](https://evil.test/x)'), true);
});

test('renderReport is deterministic for identical input', () => {
  assert.equal(renderReport(report()), renderReport(report()));
});

test('buildSummary emits a compact machine-readable result', () => {
  const summary = buildSummary(report({
    cells: [cell(), cell({ scenarioId: 'checkout', verdict: 'review-required', reasons: ['x'] })],
  }));
  assert.equal(summary.schemaVersion, 1);
  assert.deepEqual(summary.counts, { 'capture-failed': 0, 'review-required': 1, 'changed-within-threshold': 0, unchanged: 1 });
  assert.equal(summary.base.sha, 'a'.repeat(40));
  assert.equal(summary.cells[0].verdict, 'review-required');
  assert.equal(summary.reviewRequired, true);
  assert.equal('artifactHashes' in summary.provenance, true);
});
