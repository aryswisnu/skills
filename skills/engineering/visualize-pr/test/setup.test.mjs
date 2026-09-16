import test from 'node:test';
import assert from 'node:assert/strict';

import { setupPlan, setupSummary, unsupportedNodeVersion } from '../src/setup.mjs';

test('setupPlan installs npm dependencies and a browser on a fresh copy', () => {
  const steps = setupPlan({ hasNodeModules: false, browser: true });
  assert.deepEqual(steps.map((step) => step.command), ['npm', 'npx']);
  assert.deepEqual(steps[0].args, ['install', '--no-audit', '--no-fund']);
  assert.deepEqual(steps[1].args, ['playwright', 'install', 'chromium']);
});

test('setupPlan skips npm when node_modules is already present', () => {
  const steps = setupPlan({ hasNodeModules: true, browser: true });
  assert.deepEqual(steps.map((step) => step.command), ['npx']);
});

test('setupPlan skips the browser for a backend-only setup', () => {
  const steps = setupPlan({ hasNodeModules: false, browser: false });
  assert.deepEqual(steps.map((step) => step.command), ['npm']);
});

test('setupPlan orders npm before npx so playwright exists when it runs', () => {
  const steps = setupPlan({ hasNodeModules: false, browser: true });
  assert.ok(steps.findIndex((s) => s.command === 'npm') < steps.findIndex((s) => s.command === 'npx'));
});

test('setupSummary explains a no-op run', () => {
  assert.equal(setupSummary(setupPlan({ hasNodeModules: true, browser: false }), { hasNodeModules: true, browser: false }),
    'npm dependencies already installed. Chromium skipped (--backend).');
  assert.equal(setupSummary(setupPlan({ hasNodeModules: false, browser: true })), null);
});

test('unsupportedNodeVersion names the minimum and how to switch', () => {
  assert.match(unsupportedNodeVersion('v18.20.4'), /needs Node 20 or newer, but this is Node v18\.20\.4/);
  assert.match(unsupportedNodeVersion('v18.20.4'), /nvm use 20/);
  assert.equal(unsupportedNodeVersion('v20.16.0'), null);
  assert.equal(unsupportedNodeVersion('v22.23.2'), null);
  assert.equal(unsupportedNodeVersion('nonsense'), null);
});
