import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, usage } from '../src/cli-args.mjs';

test('parseArgs applies documented defaults', () => {
  const options = parseArgs(['--base', 'main']);
  assert.equal(options.base, 'main');
  assert.equal(options.head, 'HEAD');
  assert.equal(options.config, 'visual-review.json');
  assert.equal(options.output, 'visual-review-output');
  assert.equal(options.keepWorktrees, false);
  assert.deepEqual(options.scenarios, []);
  assert.equal(options.all, false);
});

test('parseArgs collects repeated --scenario filters', () => {
  const options = parseArgs(['--base', 'main', '--scenario', 'home', '--scenario', 'checkout']);
  assert.deepEqual(options.scenarios, ['home', 'checkout']);
});

test('parseArgs rejects unknown flags and missing values', () => {
  assert.throws(() => parseArgs(['--base', 'main', '--nope']), /unknown argument: --nope/);
  assert.throws(() => parseArgs(['--base']), /--base requires a value/);
  assert.throws(() => parseArgs(['--base', '--head']), /--base requires a value/);
  assert.throws(() => parseArgs([]), /--base is required/);
});

test('parseArgs rejects combining --all with --scenario', () => {
  assert.throws(() => parseArgs(['--base', 'main', '--all', '--scenario', 'home']), /--all cannot be combined with --scenario/);
});

test('parseArgs allows --help without --base', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.match(usage(), /--scenario/);
});
