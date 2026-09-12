import test from 'node:test';
import assert from 'node:assert/strict';

import { commitRefArgs, parseNulPaths } from '../src/git.mjs';

test('commitRefArgs resolves the peeled commit and protects option parsing', () => {
  assert.deepEqual(commitRefArgs('-malicious'), ['rev-parse', '--verify', '--end-of-options', '-malicious^{commit}']);
});

test('parseNulPaths preserves newline-containing UTF-8 paths', () => {
  assert.deepEqual(parseNulPaths(Buffer.from('normal.txt\0line\nbreak.txt\0')), ['normal.txt', 'line\nbreak.txt']);
});

test('parseNulPaths rejects filenames that are not valid UTF-8', () => {
  assert.throws(() => parseNulPaths(Buffer.from([0xff, 0x00])), /not valid UTF-8/);
});
