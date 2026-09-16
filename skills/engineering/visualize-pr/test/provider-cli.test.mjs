// End-to-end proof that a non-GitHub provider reaches a real PR: the actual
// CLI, a real two-commit git repo with a bare remote, and a mock forge API.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'scripts', 'visualize-pr.mjs');
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function buildRepo(work) {
  const seed = path.join(work, 'seed');
  const bare = path.join(work, 'remote.git');
  const clone = path.join(work, 'clone');
  await mkdir(path.join(seed, 'src'), { recursive: true });
  git(['init', '-q'], seed);
  git(['config', 'user.name', 'Test'], seed);
  git(['config', 'user.email', 'test@example.invalid'], seed);
  git(['branch', '-M', 'main'], seed);
  await writeFile(path.join(seed, 'src/orders.js'), 'export const a = 1;\n');
  git(['add', '.'], seed);
  git(['commit', '-qm', 'base'], seed);
  const baseSha = git(['rev-parse', 'HEAD'], seed);
  git(['checkout', '-q', '-b', 'feature'], seed);
  await writeFile(path.join(seed, 'src/orders.js'), "import './billing.js';\nexport const a = 2;\n");
  await writeFile(path.join(seed, 'src/billing.js'), 'export const d = 4;\n');
  git(['add', '.'], seed);
  git(['commit', '-qm', 'head'], seed);
  const headSha = git(['rev-parse', 'HEAD'], seed);
  git(['checkout', '-q', 'main'], seed);
  git(['init', '-q', '--bare', bare], work);
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'], bare);
  git(['remote', 'add', 'origin', bare], seed);
  git(['push', '-q', 'origin', 'main', 'feature'], seed);
  git(['clone', '-q', bare, clone], work);
  return { clone, baseSha, headSha };
}

function startMock(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => { raw += chunk; });
      request.on('end', () => {
        response.setHeader('Content-Type', 'application/json');
        handler(request, response, raw);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function runCli(args, cwd, env) {
  const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  const [code] = await Promise.race([
    once(child, 'exit'),
    delay(60_000).then(() => { child.kill('SIGKILL'); throw new Error(`timed out\n${stdout}\n${stderr}`); }),
  ]);
  return { code, stdout, stderr };
}

test('--backend --update-description against Bitbucket Cloud', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'vpr-bb-cli-'));
  let mock;
  try {
    const { clone, baseSha, headSha } = await buildRepo(work);
    const state = { description: 'Original body.', puts: 0, lastPut: null, comment: null };
    mock = await startMock((request, response, raw) => {
      const { method, url } = request;
      if (method === 'GET' && /\/repositories\/acme\/orders\/pullrequests\/42$/.test(url)) {
        response.end(JSON.stringify({
          id: 42, title: 'Agent stats', state: 'OPEN', description: state.description,
          source: { branch: { name: 'feature' }, commit: { hash: headSha.slice(0, 12) } },
          destination: { branch: { name: 'main' }, commit: { hash: baseSha.slice(0, 12) } },
          links: { html: { href: 'https://bitbucket.org/acme/orders/pull-requests/42' } },
        }));
        return;
      }
      if (method === 'PUT' && /\/pullrequests\/42$/.test(url)) {
        state.puts += 1;
        state.lastPut = JSON.parse(raw);
        state.description = state.lastPut.description;
        response.end(JSON.stringify({ links: { html: { href: 'https://bitbucket.org/acme/orders/pull-requests/42' } } }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { message: `no mock for ${method} ${url}` } }));
    });

    const result = await runCli(
      ['--pr', 'https://bitbucket.org/acme/orders/pull-requests/42', '--backend', '--update-description', '--output', 'out'],
      clone,
      { VISUAL_REVIEW_BITBUCKET_API: mock.origin, BITBUCKET_TOKEN: 'test-token' },
    );

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /PR description updated/);
    assert.equal(state.puts, 1);
    assert.equal(state.lastPut.title, 'Agent stats', 'Bitbucket rejects a PUT without the title');
    assert.match(state.description, /<!-- visualize-pr:start -->/);
    assert.match(state.description, /```mermaid\nflowchart LR/);
    assert.ok(state.description.startsWith('Original body.'), 'the existing body is preserved');

    const again = await runCli(
      ['--pr', 'https://bitbucket.org/acme/orders/pull-requests/42', '--backend', '--update-description', '--output', 'out2'],
      clone,
      { VISUAL_REVIEW_BITBUCKET_API: mock.origin, BITBUCKET_TOKEN: 'test-token' },
    );
    assert.equal(again.code, 0, again.stderr);
    assert.equal(state.puts, 2);
    assert.equal((state.description.match(/visualize-pr:start/g) || []).length, 1, 'a re-run replaces the block');
  } finally {
    mock?.server.close();
    await rm(work, { recursive: true, force: true });
  }
});

test('--backend --post-comment against GitLab, including a nested group path', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'vpr-gl-cli-'));
  let mock;
  try {
    const { clone, baseSha, headSha } = await buildRepo(work);
    const seen = { paths: [], note: null, token: null };
    mock = await startMock((request, response, raw) => {
      const { method, url } = request;
      seen.paths.push(url);
      seen.token = seen.token ?? request.headers['private-token'];
      if (method === 'GET' && /merge_requests\/7$/.test(url)) {
        response.end(JSON.stringify({
          iid: 7, title: 'Agent stats', state: 'opened', description: '',
          source_branch: 'feature', target_branch: 'main', sha: headSha,
          diff_refs: { base_sha: baseSha }, web_url: 'https://gitlab.com/group/sub/orders/-/merge_requests/7',
        }));
        return;
      }
      if (method === 'POST' && /merge_requests\/7\/notes$/.test(url)) {
        seen.note = JSON.parse(raw).body;
        response.end(JSON.stringify({ id: 5150 }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ message: `no mock for ${method} ${url}` }));
    });

    const result = await runCli(
      ['--pr', 'https://gitlab.com/group/sub/orders/-/merge_requests/7', '--backend', '--post-comment', '--output', 'out'],
      clone,
      { VISUAL_REVIEW_GITLAB_API: mock.origin, GITLAB_TOKEN: 'test-token' },
    );

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Posted comment/);
    assert.equal(seen.token, 'test-token', 'PRIVATE-TOKEN header reaches GitLab');
    assert.ok(seen.paths.every((p) => !p.includes('group/sub/orders')), 'the nested path is never sent raw');
    assert.ok(seen.paths.some((p) => p.includes('group%2Fsub%2Forders')), 'the nested path is encoded');
    assert.match(seen.note, /## Change summary/);
    assert.match(seen.note, /```mermaid\nflowchart LR/);
  } finally {
    mock?.server.close();
    await rm(work, { recursive: true, force: true });
  }
});
