import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { cellArtifactNames, hashArtifacts, resolveArtifactPath } from '../src/provenance.mjs';

test('cellArtifactNames is deterministic and slug-safe', () => {
  const names = cellArtifactNames('Check Out!', 'Mobile Small');
  assert.deepEqual(names, {
    prefix: '9-check-out--12-mobile-small',
    before: '9-check-out--12-mobile-small-before.png',
    after: '9-check-out--12-mobile-small-after.png',
    sideBySide: '9-check-out--12-mobile-small-side-by-side.png',
    diff: '9-check-out--12-mobile-small-diff.png',
  });
  assert.deepEqual(cellArtifactNames('Check Out!', 'Mobile Small'), names);
});

test('resolveArtifactPath refuses to escape the output directory', () => {
  assert.notEqual(cellArtifactNames('a', 'b-c').prefix, cellArtifactNames('a-b', 'c').prefix);
  assert.equal(resolveArtifactPath('/out', 'home-before.png'), path.join('/out', 'home-before.png'));
  assert.throws(() => resolveArtifactPath('/out', '../escape.png'), /escapes the output directory/);
  assert.throws(() => resolveArtifactPath('/out', '/etc/passwd'), /escapes the output directory/);
  assert.throws(() => resolveArtifactPath('/out', 'a/../../b.png'), /escapes the output directory/);
});

test('hashArtifacts records a sha256 per existing file and skips missing ones', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vpr-prov-'));
  await writeFile(path.join(dir, 'a.txt'), 'abc');
  const hashes = await hashArtifacts(dir, ['a.txt', 'missing.txt']);
  assert.equal(hashes['a.txt'], 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal('missing.txt' in hashes, false);
});

test('hashArtifacts refuses symbolic-link artifacts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vpr-prov-'));
  await writeFile(path.join(dir, 'outside.txt'), 'secret');
  await symlink(path.join(dir, 'outside.txt'), path.join(dir, 'link.txt'));
  await assert.rejects(() => hashArtifacts(dir, ['link.txt']), /symbolic link/);
});
