import test from 'node:test';
import assert from 'node:assert/strict';

import { globToRegExp, selectScenarios } from '../src/impact.mjs';

test('globToRegExp implements the documented subset', () => {
  const match = (glob, value) => globToRegExp(glob).test(value);
  assert.equal(match('src/**', 'src/a/b.js'), true);
  assert.equal(match('src/**', 'src/a.js'), true);
  assert.equal(match('src/**', 'srcx/a.js'), false);
  assert.equal(match('src/*.js', 'src/a.js'), true);
  assert.equal(match('src/*.js', 'src/a/b.js'), false);
  assert.equal(match('**/*.css', 'a/b/c.css'), true);
  assert.equal(match('**/*.css', 'c.css'), true);
  assert.equal(match('src/?.js', 'src/a.js'), true);
  assert.equal(match('src/a.js', 'src/a.js.bak'), false);
  assert.equal(match('a+b/*', 'a+b/c'), true);
});

test('selectScenarios maps changed files to matching scenarios', () => {
  const impact = {
    rules: [
      { globs: ['src/checkout/**'], scenarios: ['checkout'] },
      { globs: ['**/*.css'], scenarios: ['home', 'checkout'] },
    ],
    smokeScenarios: ['home'],
  };
  const selection = selectScenarios(['src/checkout/cart.ts', 'theme/app.css'], impact, ['home', 'checkout']);
  assert.deepEqual(selection.scenarioIds, ['home', 'checkout']);
  assert.equal(selection.reason, 'impact-rules');
  assert.deepEqual(selection.matchedRules, [
    { glob: 'src/checkout/**', file: 'src/checkout/cart.ts', scenarios: ['checkout'] },
    { glob: '**/*.css', file: 'theme/app.css', scenarios: ['home', 'checkout'] },
  ]);
  assert.deepEqual(selection.unmatchedFiles, []);
});

test('selectScenarios falls back to smoke scenarios and says why', () => {
  const impact = { rules: [{ globs: ['src/checkout/**'], scenarios: ['checkout'] }], smokeScenarios: ['home'] };
  const selection = selectScenarios(['README.md'], impact, ['home', 'checkout']);
  assert.deepEqual(selection.scenarioIds, ['home']);
  assert.equal(selection.reason, 'no-rule-matched-smoke-fallback');
  assert.deepEqual(selection.unmatchedFiles, ['README.md']);
});

test('selectScenarios captures everything when no rules are configured', () => {
  const selection = selectScenarios(['a.ts'], { rules: [], smokeScenarios: ['home'] }, ['home', 'checkout']);
  assert.deepEqual(selection.scenarioIds, ['home', 'checkout']);
  assert.equal(selection.reason, 'no-impact-rules-configured-capture-all');
});

test('selectScenarios keeps declaration order and never returns an empty set', () => {
  const impact = { rules: [{ globs: ['x'], scenarios: ['checkout'] }], smokeScenarios: [] };
  const selection = selectScenarios(['README.md'], impact, ['home', 'checkout']);
  assert.deepEqual(selection.scenarioIds, ['home', 'checkout']);
  assert.equal(selection.reason, 'no-rule-matched-no-smoke-configured-capture-all');
});
