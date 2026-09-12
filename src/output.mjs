import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';

import { resolveArtifactPath } from './provenance.mjs';

const OWNER_MARKER = '.visual-pr-review-owned';

export async function createOwnedOutputDirectory(outputDir) {
  const resolved = path.resolve(outputDir);
  try {
    await mkdir(resolved, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`output directory already exists: ${resolved}; choose a new path to avoid stale or attacker-controlled artifacts`);
    }
    throw error;
  }
  await safeWriteArtifact(resolved, OWNER_MARKER, 'visual-pr-review output\n');
  return resolved;
}

export async function safeWriteArtifact(outputDir, name, data) {
  const root = path.resolve(outputDir);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`output directory is not a tool-owned real directory: ${root}`);
  }
  const target = resolveArtifactPath(root, name);
  if (path.dirname(target) !== root) throw new Error(`artifact "${name}" must not contain path components`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(target, flags, 0o600);
    await handle.writeFile(data);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`artifact already exists: ${name}`);
    if (error.code === 'ELOOP') throw new Error(`artifact is a symbolic link: ${name}`);
    throw error;
  } finally {
    await handle?.close();
  }
  return target;
}
