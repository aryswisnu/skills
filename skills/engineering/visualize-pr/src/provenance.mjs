import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import { safeArtifactName } from './core.mjs';

/** Deterministic artifact filenames for one scenario x viewport cell. */
export function cellArtifactNames(scenarioId, viewportName) {
  const scenario = safeArtifactName(scenarioId);
  const viewport = safeArtifactName(viewportName);
  const prefix = `${scenario.length}-${scenario}--${viewport.length}-${viewport}`;
  return {
    prefix,
    before: `${prefix}-before.png`,
    after: `${prefix}-after.png`,
    sideBySide: `${prefix}-side-by-side.png`,
    diff: `${prefix}-diff.png`,
  };
}

/** Resolve an artifact name inside the output directory, rejecting any path escape. */
export function resolveArtifactPath(outputDir, name) {
  const root = path.resolve(outputDir);
  const resolved = path.resolve(root, name);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`artifact "${name}" escapes the output directory`);
  }
  return resolved;
}

export async function hashArtifacts(outputDir, names) {
  const hashes = {};
  for (const name of [...names].sort()) {
    try {
      const artifactPath = resolveArtifactPath(outputDir, name);
      const stat = await lstat(artifactPath);
      if (stat.isSymbolicLink()) throw new Error(`artifact is a symbolic link: ${name}`);
      if (!stat.isFile()) throw new Error(`artifact is not a regular file: ${name}`);
      const buffer = await readFile(artifactPath);
      hashes[name] = createHash('sha256').update(buffer).digest('hex');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return hashes;
}
