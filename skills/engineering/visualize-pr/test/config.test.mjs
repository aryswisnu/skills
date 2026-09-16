import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, publicConfigDigest } from '../src/config.mjs';

const minimal = {
  startCommand: 'node server.mjs {port}',
  scenarios: [{ id: 'home', path: '/' }],
};

test('normalizeConfig expands the capture matrix defaults', () => {
  const config = normalizeConfig(minimal);
  assert.deepEqual(config.viewports, [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }]);
  assert.equal(config.scenarios[0].name, 'home');
  assert.deepEqual(config.scenarios[0].viewports, ['desktop']);
  assert.deepEqual(config.scenarios[0].steps, []);
  assert.equal(config.capture.reducedMotion, true);
  assert.equal(config.capture.disableAnimations, true);
  assert.equal(config.thresholds.changedRatio, 0.0005);
  assert.equal(config.thresholds.reviewRatio, 0.02);
});

test('normalizeConfig migrates the legacy routes/viewport shape', () => {
  const config = normalizeConfig({
    startCommand: 'npm start',
    viewport: { width: 800, height: 600 },
    routes: [{ name: 'Home', path: '/', waitForSelector: 'main', waitForMs: 400 }],
  });
  assert.deepEqual(config.viewports, [{ name: 'desktop', width: 800, height: 600, deviceScaleFactor: 1 }]);
  assert.equal(config.scenarios.length, 1);
  assert.equal(config.scenarios[0].id, 'home');
  assert.equal(config.scenarios[0].settleMs, 400);
  assert.deepEqual(config.scenarios[0].steps, [{ action: 'waitForSelector', selector: 'main', timeoutMs: 10000 }]);
});

test('normalizeConfig rejects unknown top-level and scenario keys', () => {
  assert.throws(() => normalizeConfig({ ...minimal, nonsense: 1 }), /unknown config key: nonsense/);
  assert.throws(
    () => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', nope: 1 }] }),
    /scenarios\[0\]: unknown key: nope/,
  );
});

test('normalizeConfig rejects duplicate scenario ids and colliding artifact names', () => {
  assert.throws(
    () => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'Check Out', path: '/a' }, { id: 'check-out', path: '/b' }] }),
    /duplicate scenario id/,
  );
});

test('normalizeConfig rejects unsafe paths and external navigation', () => {
  assert.throws(() => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: 'https://evil.test/' }] }), /must start with "\/"/);
  assert.throws(() => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '//evil.test/' }] }), /protocol-relative/);
  assert.throws(
    () => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', steps: [{ action: 'goto', path: 'http://evil.test' }] }] }),
    /must start with "\/"/,
  );
});

test('normalizeConfig rejects unknown action types and malformed steps', () => {
  assert.throws(
    () => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', steps: [{ action: 'evaluate', script: 'x' }] }] }),
    /unknown action: evaluate/,
  );
  assert.throws(
    () => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', steps: [{ action: 'click' }] }] }),
    /requires "selector"/,
  );
  assert.throws(
    () => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', steps: [{ action: 'fill', selector: '#a' }] }] }),
    /requires "value"/,
  );
});

test('normalizeConfig rejects unknown action-specific keys including secret typos', () => {
  assert.throws(
    () => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', steps: [{ action: 'fill', selector: '#pw', value: 'x', secert: true }] }] }),
    /steps\[0\]: unknown key: secert/,
  );
  assert.throws(
    () => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', steps: [{ action: 'click', selector: '#x', value: 'ignored' }] }] }),
    /steps\[0\]: unknown key: value/,
  );
});

test('normalizeConfig strictly validates nested objects and scalar types', () => {
  assert.throws(() => normalizeConfig({ ...minimal, viewports: [{ name: 'x', width: 10, height: 10, typo: true }] }), /viewports\[0\]: unknown key: typo/);
  assert.throws(() => normalizeConfig({ ...minimal, impact: { rules: [{ glob: 'src/**', scenarios: ['home'], typo: true }] } }), /impact.rules\[0\]: unknown key: typo/);
  assert.throws(() => normalizeConfig({ ...minimal, capture: { reducedMotion: 'yes' } }), /capture.reducedMotion must be a boolean/);
  assert.throws(() => normalizeConfig({ ...minimal, capture: { disableAnimations: 1 } }), /capture.disableAnimations must be a boolean/);
  assert.throws(() => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', name: 42, path: '/' }] }), /name must be a non-empty string/);
  assert.throws(() => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', description: 42 }] }), /description must be a string or null/);
  assert.throws(() => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', fullPage: 'yes' }] }), /fullPage must be a boolean/);
  assert.throws(() => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', semantic: { title: 'yes' } }] }), /semantic.title must be a boolean/);
  assert.throws(() => normalizeConfig({ startCommand: 'x', scenarios: [{ id: 'a', path: '/', steps: [{ action: 'fill', selector: '#x', value: 'x', secret: 'yes' }] }] }), /secret must be a boolean/);
  assert.throws(() => normalizeConfig({ ...minimal, impact: { smokeScenarios: 'home' } }), /smokeScenarios must be an array/);
});

test('normalizeConfig rejects duplicate viewport names inside a scenario', () => {
  assert.throws(
    () => normalizeConfig({ ...minimal, scenarios: [{ id: 'home', path: '/', viewports: ['desktop', 'desktop'] }] }),
    /duplicate viewport: desktop/,
  );
});

test('normalizeConfig accepts the full safe action set', () => {
  const config = normalizeConfig({
    startCommand: 'x',
    scenarios: [{
      id: 'flow',
      path: '/',
      steps: [
        { action: 'click', selector: '#open' },
        { action: 'fill', selector: '#q', value: 'hello' },
        { action: 'fill', selector: '#pw', value: 'hunter2', secret: true },
        { action: 'press', selector: '#q', key: 'Enter' },
        { action: 'select', selector: '#s', value: 'b' },
        { action: 'waitForSelector', selector: '#done' },
        { action: 'goto', path: '/next' },
        { action: 'assertVisible', selector: '#ok' },
        { action: 'assertText', selector: 'h1', equals: 'Hi' },
      ],
    }],
  });
  assert.equal(config.scenarios[0].steps.length, 9);
  assert.equal(config.scenarios[0].steps[2].secret, true);
});

test('normalizeConfig validates viewports and thresholds', () => {
  assert.throws(() => normalizeConfig({ ...minimal, viewports: [{ name: 'x', width: 0, height: 10 }] }), /width must be an integer/);
  assert.throws(() => normalizeConfig({ ...minimal, viewports: [{ name: 'a', width: 10, height: 10 }, { name: 'A', width: 20, height: 20 }] }), /duplicate viewport name/);
  assert.throws(() => normalizeConfig({ ...minimal, thresholds: { changedRatio: 2 } }), /changedRatio must be between 0 and 1/);
  assert.throws(() => normalizeConfig({ ...minimal, thresholds: { changedRatio: 0.5, reviewRatio: 0.1 } }), /changedRatio must not exceed reviewRatio/);
  assert.throws(() => normalizeConfig({ ...minimal, scenarios: [{ id: 'a', path: '/', viewports: ['phone'] }] }), /unknown viewport: phone/);
});

test('normalizeConfig validates impact rules against declared scenarios', () => {
  assert.throws(
    () => normalizeConfig({ ...minimal, impact: { rules: [{ glob: 'src/**', scenarios: ['ghost'] }] } }),
    /impact.rules\[0\]: unknown scenario: ghost/,
  );
  assert.throws(
    () => normalizeConfig({ ...minimal, impact: { smokeScenarios: ['ghost'] } }),
    /impact.smokeScenarios: unknown scenario: ghost/,
  );
  const config = normalizeConfig({ ...minimal, impact: { rules: [{ glob: 'src/**', scenarios: ['home'] }] } });
  assert.deepEqual(config.impact.rules[0].globs, ['src/**']);
  assert.deepEqual(config.impact.smokeScenarios, ['home']);
});

test('normalizeConfig records env keys but never env values', () => {
  const config = normalizeConfig({ ...minimal, env: { API_TOKEN: 'secret-value' } });
  assert.equal(config.env.API_TOKEN, 'secret-value');
  assert.deepEqual(config.envKeys, ['API_TOKEN']);
  assert.equal(JSON.stringify(config.public).includes('secret-value'), false);
});

test('publicConfigDigest is stable under key ordering and changes with public content', () => {
  const a = publicConfigDigest(normalizeConfig(minimal));
  const b = publicConfigDigest(normalizeConfig({ scenarios: [{ path: '/', id: 'home' }], startCommand: 'node server.mjs {port}' }));
  const c = publicConfigDigest(normalizeConfig({ ...minimal, basePort: 5000 }));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('publicConfig redacts a step value marked secret but keeps the step shape', () => {
  const config = normalizeConfig({
    startCommand: 'x',
    scenarios: [{ id: 'login', path: '/login', steps: [
      { action: 'fill', selector: '#pw', value: 'hunter2', secret: true },
      { action: 'fill', selector: '#user', value: 'demo' },
    ] }],
  });
  const serialized = JSON.stringify(config.public);
  assert.equal(serialized.includes('hunter2'), false);
  assert.match(serialized, /<redacted:7>/);
  assert.equal(config.public.scenarios[0].steps[1].value, 'demo');
  assert.equal(config.scenarios[0].steps[0].value, 'hunter2', 'the live config still drives the browser');
});
