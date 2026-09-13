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
  assert.throws(() => parseArgs([]), /--base or --pr is required/);
});

test('parseArgs accepts --pr as the revision source', () => {
  const options = parseArgs(['--pr', 'https://github.com/acme/orders/pull/123']);
  assert.equal(options.pr, 'https://github.com/acme/orders/pull/123');
  assert.equal(options.base, undefined);
  assert.equal(options.postComment, false);
});

test('parseArgs rejects --pr combined with --base or --head', () => {
  assert.throws(
    () => parseArgs(['--pr', 'https://github.com/a/b/pull/1', '--base', 'main']),
    /--pr cannot be combined with --base/,
  );
  assert.throws(
    () => parseArgs(['--pr', 'https://github.com/a/b/pull/1', '--head', 'HEAD']),
    /--pr cannot be combined with --head/,
  );
});

test('parseArgs requires --pr for --post-comment', () => {
  assert.throws(() => parseArgs(['--base', 'main', '--post-comment']), /--post-comment requires --pr/);
  assert.equal(parseArgs(['--pr', 'https://github.com/a/b/pull/1', '--post-comment']).postComment, true);
});

test('parseArgs rejects combining --all with --scenario', () => {
  assert.throws(() => parseArgs(['--base', 'main', '--all', '--scenario', 'home']), /--all cannot be combined with --scenario/);
});

test('parseArgs allows --help without --base', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.match(usage(), /--scenario/);
});
