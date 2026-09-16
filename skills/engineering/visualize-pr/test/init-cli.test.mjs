import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeConfig } from '../src/config.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'scripts', 'visualize-pr.mjs');

test('--init writes a starter config once and refuses to overwrite it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-init-'));
  try {
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'demo', devDependencies: { vite: '5.0.0' } }, null, 2),
    );
    await writeFile(path.join(root, 'package-lock.json'), '{}\n');

    const first = spawnSync(process.execPath, [cli, '--init'], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Detected: vite/);
    assert.match(first.stdout, /visual-review\.json/);

    const configPath = path.join(root, 'visual-review.json');
    const text = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(text);
    assert.equal(parsed.startCommand, 'npx vite --host 127.0.0.1 --port {port} --strictPort');
    assert.equal(parsed.installCommand, 'npm ci');
    assert.ok(normalizeConfig(parsed));

    const second = spawnSync(process.execPath, [cli, '--init'], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(second.status, 2);
    assert.match(second.stderr, /visual-review\.json already exists/);
    assert.equal(await readFile(configPath, 'utf8'), text);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('--init honors --config and reports an unknown project', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-init-unknown-'));
  try {
    const result = spawnSync(process.execPath, [cli, '--init', '--config', 'review/custom.json'], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Detected: unknown/);
    const parsed = JSON.parse(await readFile(path.join(root, 'review/custom.json'), 'utf8'));
    assert.match(parsed.startCommand, /TODO: start your app/);
    assert.ok(normalizeConfig(parsed));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
