import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'scripts', 'visual-pr-review.mjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('--backend emits a change summary and architecture diagram without a browser or config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-backend-'));
  try {
    await mkdir(path.join(root, 'src/api'), { recursive: true });
    git(['init', '-q'], root);
    git(['config', 'user.name', 'Test'], root);
    git(['config', 'user.email', 'test@example.invalid'], root);
    git(['branch', '-M', 'main'], root);
    await writeFile(path.join(root, 'src/api/orders.ts'), 'export const a = 1;\n');
    await writeFile(path.join(root, 'src/api/payments.ts'), 'export const b = 2;\n');
    git(['add', '.'], root);
    git(['commit', '-qm', 'base'], root);
    await writeFile(path.join(root, 'src/api/orders.ts'), 'export const a = 1;\nexport const c = 3;\n');
    await writeFile(path.join(root, 'src/api/billing.ts'), 'export const d = 4;\n');
    git(['rm', '-q', 'src/api/payments.ts'], root);
    git(['add', '.'], root);
    git(['commit', '-qm', 'head'], root);

    const result = spawnSync(process.execPath, [
      cli, '--base', 'HEAD~1', '--head', 'HEAD', '--backend', '--output', 'review-output',
    ], { cwd: root, encoding: 'utf8', timeout: 30_000 });

    assert.equal(result.status, 0, result.stderr);

    const report = await readFile(path.join(root, 'review-output', 'report.md'), 'utf8');
    assert.match(report, /## Change summary/);
    assert.match(report, /3 files changed/);
    assert.match(report, /Added: 1 - Modified: 1 - Deleted: 1/);
    assert.match(report, /\| `src` \| 3 \|/);

    const svg = await readFile(path.join(root, 'review-output', 'architecture.svg'), 'utf8');
    assert.match(svg, /^<svg /);
    assert.match(svg, /Change map/);
    assert.match(svg, /src/);

    const summary = JSON.parse(await readFile(path.join(root, 'review-output', 'summary.json'), 'utf8'));
    assert.equal(summary.adapter, 'backend');
    assert.equal(summary.totalFiles, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
