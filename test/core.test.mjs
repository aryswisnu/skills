import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  safeArtifactName,
  renderReport,
} from '../src/core.mjs';

test('safeArtifactName produces stable filesystem names', () => {
  assert.equal(safeArtifactName('Checkout / Empty Cart'), 'checkout-empty-cart');
  assert.equal(safeArtifactName('  Ünicode  '), 'unicode');
});

test('normalizeConfig rejects a config without routes', () => {
  assert.throws(
    () => normalizeConfig({ startCommand: 'npm start' }),
    /routes must contain at least one route/,
  );
});

test('normalizeConfig supplies deterministic defaults', () => {
  const config = normalizeConfig({
    startCommand: 'npm start -- --port {port}',
    routes: [{ name: 'Home', path: '/' }],
  });

  assert.equal(config.basePort, 4173);
  assert.deepEqual(config.viewport, { width: 1440, height: 900 });
  assert.equal(config.routes[0].fullPage, false);
  assert.equal(config.routes[0].waitForMs, 250);
});

test('normalizeConfig rejects route names that overwrite artifacts', () => {
  assert.throws(
    () => normalizeConfig({
      startCommand: 'npm start',
      routes: [
        { name: 'Checkout', path: '/checkout' },
        { name: 'checkout!', path: '/checkout?empty=1' },
      ],
    }),
    /route names must produce unique artifact names/,
  );
});

test('renderReport identifies both revisions and embeds artifacts', () => {
  const markdown = renderReport({
    baseRef: 'main',
    baseSha: 'abc1234',
    headRef: 'HEAD',
    headSha: 'def5678',
    changedFiles: ['src/app.js'],
    diffStat: ' src/app.js | 4 +++-',
    results: [{
      name: 'Home',
      path: '/',
      before: 'home-before.png',
      after: 'home-after.png',
      sideBySide: 'home-side-by-side.png',
      diff: 'home-diff.png',
      changedPixels: 42,
      totalPixels: 1000,
      changePercent: 4.2,
    }],
  });

  assert.match(markdown, /main \(`abc1234`\) vs HEAD \(`def5678`\)/);
  assert.match(markdown, /!\[Home side-by-side\]\(home-side-by-side\.png\)/);
  assert.match(markdown, /4\.20%/);
  assert.match(markdown, /`src\/app\.js`/);
  assert.match(markdown, /src\/app\.js \| 4 \+\+\+-/);
  assert.match(markdown, /\[Full code diff\]\(changes\.patch\)/);
});
