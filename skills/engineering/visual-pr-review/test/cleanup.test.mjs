import test from 'node:test';
import assert from 'node:assert/strict';

import { stopProcessTree, worktreePaths } from '../src/cleanup.mjs';

test('stopProcessTree verifies termination and surfaces a surviving process group', async () => {
  const signals = [];
  await assert.rejects(
    () => stopProcessTree(
      { pid: 42, exitCode: null, once() {} },
      {
        kill: (_target, signal) => { signals.push(signal); },
        delay: async () => {},
        isAlive: () => true,
        exitTimeoutMs: 0,
      },
    ),
    /survived SIGKILL/,
  );
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('stopProcessTree accepts an already absent process group', async () => {
  await stopProcessTree(
    { pid: 42, exitCode: null, once() {} },
    {
      kill: () => { const error = new Error('gone'); error.code = 'ESRCH'; throw error; },
      delay: async () => {},
      isAlive: () => false,
      exitTimeoutMs: 0,
    },
  );
});

test('worktreePaths parses porcelain output without path prefix ambiguity', () => {
  assert.deepEqual(
    worktreePaths('worktree /repo\nHEAD abc\n\nworktree /tmp/a b\nHEAD def\n'),
    ['/repo', '/tmp/a b'],
  );
});
