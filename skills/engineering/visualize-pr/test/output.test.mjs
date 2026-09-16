import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createOwnedOutputDirectory, safeWriteArtifact } from '../src/output.mjs';

test('createOwnedOutputDirectory creates a new empty directory and rejects stale targets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-output-'));
  const fresh = path.join(root, 'fresh');
  await createOwnedOutputDirectory(fresh);
  assert.equal(await readFile(path.join(fresh, '.visual-pr-review-owned'), 'utf8'), 'visual-pr-review output\n');
  await assert.rejects(() => createOwnedOutputDirectory(fresh), /already exists/);
  const stale = path.join(root, 'stale');
  await mkdir(stale);
  await writeFile(path.join(stale, 'old.png'), 'old');
  await assert.rejects(() => createOwnedOutputDirectory(stale), /already exists/);
  const link = path.join(root, 'link');
  await symlink(stale, link);
  await assert.rejects(() => createOwnedOutputDirectory(link), /already exists/);
});

test('safeWriteArtifact uses exclusive no-follow creation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-output-'));
  const output = path.join(root, 'out');
  await createOwnedOutputDirectory(output);
  await safeWriteArtifact(output, 'result.txt', 'new');
  assert.equal(await readFile(path.join(output, 'result.txt'), 'utf8'), 'new');
  await assert.rejects(() => safeWriteArtifact(output, 'result.txt', 'overwrite'), /already exists/);
  await writeFile(path.join(root, 'outside.txt'), 'outside');
  await symlink(path.join(root, 'outside.txt'), path.join(output, 'link.txt'));
  await assert.rejects(() => safeWriteArtifact(output, 'link.txt', 'attack'), /symbolic link|already exists/);
  assert.equal(await readFile(path.join(root, 'outside.txt'), 'utf8'), 'outside');
});
