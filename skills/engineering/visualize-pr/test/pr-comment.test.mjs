import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrComment } from '../src/pr-comment.mjs';

const pr = {
  title: 'Fix checkout decline',
  baseRef: 'main',
  headRef: 'feature/decline',
};

const report = {
  base: { ref: 'main', sha: 'abc1234567890'.padEnd(40, '0') },
  head: { ref: 'feature/decline', sha: 'def5678901234'.padEnd(40, '0') },
  cells: [
    { scenarioId: 'home', scenarioName: 'Home', viewport: 'desktop', verdict: 'unchanged', reasons: [] },
    { scenarioId: 'checkout', scenarioName: 'Checkout', viewport: 'desktop', verdict: 'review-required', reasons: ['semantic change in text.h1'] },
    { scenarioId: 'checkout', scenarioName: 'Checkout', viewport: 'mobile', verdict: 'capture-failed', reasons: ['head capture failed'] },
  ],
  skippedScenarios: [{ name: 'Account' }],
};

test('buildPrComment renders a header, verdict table, attention list and skipped note', () => {
  const markdown = buildPrComment(report, pr);

  assert.match(markdown, /^## Visual review/);
  assert.match(markdown, /Fix checkout decline.*main.*abc1234.*->.*feature\/decline.*def5678/s);
  assert.match(markdown, /\| Scenario \| Viewport \| Verdict \|/);
  assert.match(markdown, /\| Home \| desktop \| unchanged \|/);
  assert.match(markdown, /\| Checkout \| desktop \| review-required \|/);
  assert.match(markdown, /\| Checkout \| mobile \| capture failed \|/);
  assert.match(markdown, /\*\*Needs attention\*\*/);
  assert.match(markdown, /Checkout @ desktop.*review-required: semantic change in text\.h1/s);
  assert.match(markdown, /Skipped: Account\./);
});

test('buildPrComment omits the attention and skipped sections when empty', () => {
  const markdown = buildPrComment(
    { ...report, cells: [{ scenarioId: 'home', scenarioName: 'Home', viewport: 'desktop', verdict: 'unchanged', reasons: [] }], skippedScenarios: [] },
    pr,
  );
  assert.doesNotMatch(markdown, /Needs attention/);
  assert.doesNotMatch(markdown, /Skipped:/);
});

test('buildPrComment embeds side-by-side images when supplied', () => {
  const images = {
    'home--desktop': 'https://raw.githubusercontent.com/acme/orders/visual-review-assets/run/home--desktop-side-by-side.png',
  };
  const markdown = buildPrComment(report, pr, images);
  assert.match(markdown, /## Evidence/);
  assert.match(markdown, /### Home @ desktop/);
  assert.match(
    markdown,
    /!\[Home desktop\]\(https:\/\/raw\.githubusercontent\.com\/acme\/orders\/visual-review-assets\/run\/home--desktop-side-by-side\.png\)/,
  );
  assert.match(markdown, /images are embedded above/);
  assert.doesNotMatch(markdown, /### Checkout @ mobile/);
});

test('buildPrComment places --notes right after the title, before the verdict table', () => {
  const report = { base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) }, cells: [{ scenarioId: 'h', scenarioName: 'Home', viewport: 'desktop', verdict: 'unchanged', reasons: [], artifacts: {} }], skippedScenarios: [] };
  const md = buildPrComment(report, { title: 'T', baseRef: 'm', headRef: 'f', number: 1 }, null, null, '- what changed');
  assert.ok(md.indexOf('**T**') < md.indexOf('- what changed') && md.indexOf('- what changed') < md.indexOf('| Scenario |'));
});
