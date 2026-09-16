import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'scripts', 'visualize-pr.mjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createTwoCommitRepository(root) {
  git(['init', '-q'], root);
  git(['config', 'user.name', 'Test'], root);
  git(['config', 'user.email', 'test@example.invalid'], root);
  await writeFile(path.join(root, 'index.html'), '<h1>before</h1>\n');
  git(['add', 'index.html'], root);
  git(['commit', '-qm', 'before'], root);
  await writeFile(path.join(root, 'index.html'), '<h1>after</h1>\n');
  git(['add', 'index.html'], root);
  git(['commit', '-qm', 'after'], root);
}

test('temporary directory failure writes structured evidence after output creation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-bad-temp-'));
  try {
    await createTwoCommitRepository(root);
    await writeFile(path.join(root, 'visual-review.json'), `${JSON.stringify({
      startCommand: 'node -e "setInterval(() => {}, 1000)"',
      scenarios: [{ id: 'home', path: '/' }],
    }, null, 2)}\n`);
    const blockedTemp = path.join(root, 'not-a-directory');
    await writeFile(blockedTemp, 'blocked\n');

    const result = spawnSync(process.execPath, [
      cli,
      '--base', 'HEAD~1',
      '--config', 'visual-review.json',
      '--output', 'review-output',
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, TMPDIR: blockedTemp },
    });

    assert.equal(result.status, 2, result.stderr);
    const failure = JSON.parse(await readFile(path.join(root, 'review-output', 'failure.json'), 'utf8'));
    assert.equal(failure.status, 'infrastructure-failed');
    assert.equal(failure.phase, 'temporary-directory');
    assert.equal(failure.cleanup.completed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readiness failure writes its phase and cleans previews and worktrees', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-readiness-'));
  try {
    await createTwoCommitRepository(root);
    await writeFile(path.join(root, 'visual-review.json'), `${JSON.stringify({
      startCommand: 'node -e "process.exit(9)"',
      startupTimeoutMs: 1000,
      basePort: 45171,
      scenarios: [{ id: 'home', path: '/' }],
    }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      cli, '--base', 'HEAD~1', '--config', 'visual-review.json', '--output', 'review-output',
    ], { cwd: root, encoding: 'utf8', timeout: 30_000 });

    assert.equal(result.status, 2, result.stderr);
    const failure = JSON.parse(await readFile(path.join(root, 'review-output', 'failure.json'), 'utf8'));
    assert.equal(failure.phase, 'readiness');
    assert.equal(failure.cleanup.completed, true);
    assert.deepEqual(failure.cleanup.failures, []);
    assert.equal(git(['worktree', 'list', '--porcelain'], root).includes('visual-pr-review-'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('browser launch failure writes its phase and cleans previews and worktrees', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-browser-'));
  try {
    await createTwoCommitRepository(root);
    await writeFile(path.join(root, 'visual-review.json'), `${JSON.stringify({
      startCommand: `node -e "require('node:http').createServer((req,res)=>res.end('ok')).listen({port},'127.0.0.1')"`,
      startupTimeoutMs: 5000,
      basePort: 45271,
      scenarios: [{ id: 'home', path: '/' }],
    }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      cli, '--base', 'HEAD~1', '--config', 'visual-review.json', '--output', 'review-output',
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, VISUAL_REVIEW_BROWSER_PATH: path.join(root, 'missing-browser') },
    });

    assert.equal(result.status, 2, result.stderr);
    const failure = JSON.parse(await readFile(path.join(root, 'review-output', 'failure.json'), 'utf8'));
    assert.equal(failure.phase, 'browser-launch');
    assert.equal(failure.cleanup.completed, true);
    assert.deepEqual(failure.cleanup.failures, []);
    assert.equal(git(['worktree', 'list', '--porcelain'], root).includes('visual-pr-review-'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SIGTERM writes interruption evidence, exits 143, and cleans worktrees', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-signal-'));
  try {
    await createTwoCommitRepository(root);
    await writeFile(path.join(root, 'visual-review.json'), `${JSON.stringify({
      startCommand: 'node -e "setInterval(() => {}, 1000)"',
      startupTimeoutMs: 30000,
      basePort: 45371,
      scenarios: [{ id: 'home', path: '/' }],
    }, null, 2)}\n`);

    const child = spawn(process.execPath, [
      cli, '--base', 'HEAD~1', '--config', 'visual-review.json', '--output', 'review-output',
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const deadline = Date.now() + 15_000;
    while (!git(['worktree', 'list', '--porcelain'], root).includes('visual-pr-review-')) {
      if (Date.now() > deadline) throw new Error(`worktree setup timeout\n${stderr}`);
      await delay(50);
    }
    child.kill('SIGTERM');
    const [code, signal] = await once(child, 'exit');

    assert.equal(signal, null);
    assert.equal(code, 143, stderr);
    const failure = JSON.parse(await readFile(path.join(root, 'review-output', 'failure.json'), 'utf8'));
    assert.equal(failure.status, 'interrupted');
    assert.equal(failure.phase, 'signal-sigterm');
    assert.equal(failure.cleanup.completed, true);
    assert.deepEqual(failure.cleanup.failures, []);
    assert.equal(git(['worktree', 'list', '--porcelain'], root).includes('visual-pr-review-'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid git revision exits 2 without an unhandled stack trace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-bad-ref-'));
  try {
    await createTwoCommitRepository(root);
    await writeFile(path.join(root, 'visual-review.json'), `${JSON.stringify({
      startCommand: 'node -e "setInterval(() => {}, 1000)"',
      scenarios: [{ id: 'home', path: '/' }],
    }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      cli,
      '--base', 'missing-revision',
      '--config', 'visual-review.json',
      '--output', 'review-output',
    ], { cwd: root, encoding: 'utf8', timeout: 30_000 });

    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Error:/);
    assert.doesNotMatch(result.stderr, /node:internal|at main \(/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fatal install failure writes structured evidence and cleans temporary worktrees', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-failure-'));
  const secret = 'fixture-secret-123';
  try {
    await createTwoCommitRepository(root);
    await writeFile(path.join(root, 'visual-review.json'), `${JSON.stringify({
      installCommand: `node -e "process.exit(7)" -- --token ${secret}`,
      startCommand: 'node -e "setInterval(() => {}, 1000)"',
      env: { TEST_SECRET: secret },
      scenarios: [{ id: 'home', path: '/' }],
    }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      cli,
      '--base', 'HEAD~1',
      '--head', 'HEAD',
      '--config', 'visual-review.json',
      '--output', 'review-output',
    ], { cwd: root, encoding: 'utf8', timeout: 30_000 });

    assert.equal(result.status, 2, result.stderr);
    const failureText = await readFile(path.join(root, 'review-output', 'failure.json'), 'utf8');
    const failure = JSON.parse(failureText);
    assert.equal(failure.schemaVersion, 1);
    assert.equal(failure.status, 'infrastructure-failed');
    assert.equal(failure.phase, 'install-base');
    assert.match(failure.error, /Command failed/);
    assert.equal(failure.cleanup.completed, true);
    assert.deepEqual(failure.cleanup.failures, []);
    assert.doesNotMatch(failureText, new RegExp(secret));
    assert.equal(git(['worktree', 'list', '--porcelain'], root).includes('visual-pr-review-'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('partial worktree registration is still cleaned up', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-partial-worktree-'));
  const shimDir = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-git-shim-'));
  try {
    await createTwoCommitRepository(root);
    await writeFile(path.join(root, 'visual-review.json'), `${JSON.stringify({
      startCommand: 'node -e "setInterval(() => {}, 1000)"',
      startupTimeoutMs: 1000,
      basePort: 45471,
      scenarios: [{ id: 'home', path: '/' }],
    }, null, 2)}\n`);

    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    const shim = path.join(shimDir, 'git');
    await writeFile(shim, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const realGit = ${JSON.stringify(realGit)};
const isHeadAdd = args[0] === 'worktree' && args[1] === 'add' && args.some((a) => a.endsWith('/head'));
const r = spawnSync(realGit, args, { stdio: ['ignore', 'pipe', 'pipe'] });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
const status = r.status ?? 1;
if (isHeadAdd && status === 0) process.exit(128);
process.exit(status);
`);
    execFileSync('chmod', ['+x', shim]);

    // The head worktree is fully registered by the shim, then the add reports exit 128.
    // Cleanup must discover the head registration from git porcelain and remove it too.
    const result = spawnSync(process.execPath, [
      cli, '--base', 'HEAD~1', '--config', 'visual-review.json', '--output', 'review-output',
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, PATH: `${shimDir}${path.delimiter}${process.env.PATH}` },
    });

    assert.equal(result.status, 2, result.stderr);
    assert.equal(git(['worktree', 'list', '--porcelain'], root).includes('visual-pr-review-'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(shimDir, { recursive: true, force: true });
  }
});

test('SIGTERM during the install phase exits 143 and cleans worktrees', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vpr-cli-signal-install-'));
  try {
    await createTwoCommitRepository(root);
    await writeFile(path.join(root, 'visual-review.json'), `${JSON.stringify({
      installCommand: 'node -e "setInterval(() => {}, 1000)"',
      startCommand: 'node -e "setInterval(() => {}, 1000)"',
      startupTimeoutMs: 30000,
      basePort: 45571,
      scenarios: [{ id: 'home', path: '/' }],
    }, null, 2)}\n`);

    const child = spawn(process.execPath, [
      cli, '--base', 'HEAD~1', '--config', 'visual-review.json', '--output', 'review-output',
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    // Worktrees are registered before install begins, so once they appear the CLI is
    // inside the install phase (the install command never exits on its own).
    const deadline = Date.now() + 15_000;
    while (!git(['worktree', 'list', '--porcelain'], root).includes('visual-pr-review-')) {
      if (Date.now() > deadline) throw new Error(`worktree setup timeout\n${stderr}`);
      await delay(50);
    }
    child.kill('SIGTERM');
    const [code, signal] = await Promise.race([
      once(child, 'exit'),
      delay(10_000).then(() => { throw new Error(`CLI did not exit after SIGTERM during install\n${stderr}`); }),
    ]);

    assert.equal(signal, null);
    assert.equal(code, 143, stderr);
    const failure = JSON.parse(await readFile(path.join(root, 'review-output', 'failure.json'), 'utf8'));
    assert.equal(failure.status, 'interrupted');
    assert.equal(failure.phase, 'signal-sigterm');
    assert.equal(failure.cleanup.completed, true);
    assert.deepEqual(failure.cleanup.failures, []);
    assert.equal(git(['worktree', 'list', '--porcelain'], root).includes('visual-pr-review-'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
