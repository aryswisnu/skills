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

test('parseArgs accepts --backend without requiring a config', () => {
  const options = parseArgs(['--base', 'main', '--backend']);
  assert.equal(options.backend, true);
  assert.equal(options.config, 'visual-review.json');
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

test('parseArgs requires --pr for --update-description', () => {
  assert.throws(() => parseArgs(['--base', 'main', '--update-description']), /--update-description requires --pr/);
  const options = parseArgs(['--pr', 'https://github.com/a/b/pull/1', '--update-description']);
  assert.equal(options.updateDescription, true);
  assert.equal(options.postComment, false);
  assert.match(usage(), /--update-description/);
});

test('parseArgs allows --post-comment and --update-description together', () => {
  const options = parseArgs(['--pr', 'https://github.com/a/b/pull/1', '--post-comment', '--update-description']);
  assert.equal(options.postComment, true);
  assert.equal(options.updateDescription, true);
});

test('parseArgs defaults updateDescription to false', () => {
  assert.equal(parseArgs(['--base', 'main']).updateDescription, false);
});

test('parseArgs accepts --diagram <path>', () => {
  const options = parseArgs(['--base', 'main', '--diagram', 'seq.mmd']);
  assert.equal(options.diagram, 'seq.mmd');
  assert.throws(() => parseArgs(['--base', 'main', '--diagram']), /--diagram requires a value/);
});

test('parseArgs accepts --init without --base or --pr', () => {
  const options = parseArgs(['--init']);
  assert.equal(options.init, true);
  assert.equal(options.config, 'visual-review.json');
  assert.equal(options.base, undefined);
  assert.equal(parseArgs(['--init', '--config', 'other.json']).config, 'other.json');
});

test('parseArgs defaults init to false', () => {
  assert.equal(parseArgs(['--base', 'main']).init, false);
});

test('parseArgs rejects --init combined with revision or reporting flags', () => {
  const conflicts = [
    ['--pr', 'https://github.com/a/b/pull/1'],
    ['--base', 'main'],
    ['--backend'],
    ['--post-comment'],
    ['--update-description'],
    ['--diagram', 'seq.mmd'],
  ];
  for (const conflict of conflicts) {
    assert.throws(
      () => parseArgs(['--init', ...conflict]),
      /--init cannot be combined with/,
      conflict[0],
    );
  }
});

test('usage documents --init', () => {
  assert.match(usage(), /--init\s+Write a starter visual-review\.json for this repo, then exit/);
});
