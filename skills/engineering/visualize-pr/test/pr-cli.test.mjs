import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { browserLaunchOptions } from '../src/visual.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'scripts', 'visualize-pr.mjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function browserIsAvailable() {
  try {
    const browser = await chromium.launch(browserLaunchOptions());
    await browser.close();
    return true;
  } catch (error) {
    if (/Executable doesn't exist/.test(error.message)) return false;
    throw error;
  }
}

const available = await browserIsAvailable();

function startMockApi(baseSha, headSha) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const match = /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/.exec(request.url ?? '');
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET' && match) {
        const [, owner, repo, number] = match;
        response.end(JSON.stringify({
          number: Number(number),
          title: 'Change the heading',
          state: 'open',
          base: { ref: 'main', sha: baseSha },
          head: { ref: 'feature', sha: headSha },
          html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
        }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ message: 'Not Found' }));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

const serverSource = `import http from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.argv[2] || process.env.PORT || 4173);
const server = http.createServer(async (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(await readFile(new URL('./index.html', import.meta.url)));
});
server.listen(port, '127.0.0.1');
`;

const configSource = JSON.stringify({
  startCommand: 'node server.mjs {port}',
  basePort: 45771,
  scenarios: [{ id: 'home', path: '/', semantic: { textSelectors: ['h1'] } }],
}, null, 2);

test('--pr resolves SHAs from GitHub, captures, and writes a draft comment', { skip: !available && 'no Playwright Chromium installed' }, async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'vpr-pr-e2e-'));
  const seed = path.join(work, 'seed');
  const bare = path.join(work, 'remote.git');
  const clone = path.join(work, 'clone');
  let mock;
  try {
    await mkdir(seed);
    git(['init', '-q'], seed);
    git(['config', 'user.name', 'Test'], seed);
    git(['config', 'user.email', 'test@example.invalid'], seed);
    git(['branch', '-M', 'main'], seed);
    await writeFile(path.join(seed, 'index.html'), '<h1>before</h1>\n');
    await writeFile(path.join(seed, 'server.mjs'), serverSource);
    await writeFile(path.join(seed, 'visual-review.json'), `${configSource}\n`);
    git(['add', '.'], seed);
    git(['commit', '-qm', 'before'], seed);
    const baseSha = git(['rev-parse', 'HEAD'], seed);
    git(['checkout', '-q', '-b', 'feature'], seed);
    await writeFile(path.join(seed, 'index.html'), '<h1>after</h1>\n');
    git(['commit', '-qam', 'after'], seed);
    const headSha = git(['rev-parse', 'HEAD'], seed);
    git(['checkout', '-q', 'main'], seed);

    git(['init', '-q', '--bare', bare], work);
    git(['symbolic-ref', 'HEAD', 'refs/heads/main'], bare);
    git(['remote', 'add', 'origin', bare], seed);
    git(['push', '-q', 'origin', 'main', 'feature'], seed);
    git(['clone', '-q', bare, clone], work);

    mock = await startMockApi(baseSha, headSha);

    const child = spawn(process.execPath, [
      cli, '--pr', 'https://github.com/acme/orders/pull/7', '--config', 'visual-review.json', '--output', 'review-output',
    ], {
      cwd: clone,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VISUAL_REVIEW_GITHUB_API: mock.origin },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    const [code, signal] = await Promise.race([
      once(child, 'exit'),
      delay(60_000).then(() => {
        child.kill('SIGKILL');
        throw new Error(`CLI timed out\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
      }),
    ]);

    assert.equal(signal, null, `CLI exited by signal\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    assert.equal(code, 0, `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    const comment = await readFile(path.join(clone, 'review-output', 'pr-comment.md'), 'utf8');
    assert.match(comment, /## Visual review/);
    assert.match(comment, /Change the heading/);
    assert.match(comment, /\| home \| desktop \| review-required \|/);
    const summary = JSON.parse(await readFile(path.join(clone, 'review-output', 'summary.json'), 'utf8'));
    assert.equal(summary.cells.length, 1);
    assert.equal(summary.cells[0].verdict, 'review-required');
  } finally {
    if (mock) await new Promise((resolve) => mock.server.close(resolve));
    await rm(work, { recursive: true, force: true });
  }
});

function startPublishMockApi(baseSha, headSha, state) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => { raw += chunk; });
      request.on('end', () => {
        const { method } = request;
        const url = request.url ?? '';
        response.setHeader('content-type', 'application/json');
        if (method === 'GET' && /\/pulls\/7$/.test(url)) {
          state.resolves += 1;
          response.end(JSON.stringify({
            number: 7, title: 'Change the heading', state: 'open',
            base: { ref: 'main', sha: baseSha }, head: { ref: 'feature', sha: headSha },
            html_url: 'https://github.com/acme/orders/pull/7',
          }));
          return;
        }
        if (method === 'GET' && /\/git\/ref\/heads\/visual-review-assets$/.test(url)) {
          response.statusCode = 404;
          response.end(JSON.stringify({ message: 'Not Found' }));
          return;
        }
        if (method === 'GET' && /\/repos\/[^/]+\/[^/]+$/.test(url)) {
          response.end(JSON.stringify({ default_branch: 'main' }));
          return;
        }
        if (method === 'GET' && /\/git\/ref\/heads\/main$/.test(url)) {
          response.end(JSON.stringify({ ref: 'refs/heads/main', object: { sha: baseSha } }));
          return;
        }
        if (method === 'POST' && url.endsWith('/git/refs')) {
          response.statusCode = 201;
          response.end(JSON.stringify({ ref: 'refs/heads/visual-review-assets' }));
          return;
        }
        if (method === 'PUT' && /\/contents\//.test(url)) {
          state.uploads += 1;
          const file = url.split('/contents/')[1];
          response.statusCode = 201;
          response.end(JSON.stringify({ content: { download_url: `https://raw.githubusercontent.com/acme/orders/visual-review-assets/${file}` } }));
          return;
        }
        if (method === 'POST' && /\/issues\/7\/comments$/.test(url)) {
          state.comment = JSON.parse(raw).body;
          response.statusCode = 201;
          response.end(JSON.stringify({ id: 1, html_url: 'https://github.com/acme/orders/pull/7#issuecomment-1' }));
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ message: `no mock for ${method} ${url}` }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function runCliCollect(args, cwd, env) {
  const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const [code] = await Promise.race([
    once(child, 'exit'),
    delay(60_000).then(() => { child.kill('SIGKILL'); throw new Error(`CLI timed out\n${stdout}\n${stderr}`); }),
  ]);
  return { code, stdout, stderr };
}

test('a tokenless GitHub web draft gets its screenshots uploaded and embedded at --publish time', { skip: !available && 'no Playwright Chromium installed' }, async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'vpr-pr-publish-'));
  const seed = path.join(work, 'seed');
  const bare = path.join(work, 'remote.git');
  const clone = path.join(work, 'clone');
  let mock;
  const state = { resolves: 0, uploads: 0, comment: null };
  try {
    await mkdir(seed);
    git(['init', '-q'], seed);
    git(['config', 'user.name', 'Test'], seed);
    git(['config', 'user.email', 'test@example.invalid'], seed);
    git(['branch', '-M', 'main'], seed);
    await writeFile(path.join(seed, 'index.html'), '<h1>before</h1>\n');
    await writeFile(path.join(seed, 'server.mjs'), serverSource);
    await writeFile(path.join(seed, 'visual-review.json'), `${JSON.stringify({
      startCommand: 'node server.mjs {port}',
      basePort: 45791,
      scenarios: [{ id: 'home', path: '/', semantic: { textSelectors: ['h1'] } }],
    }, null, 2)}\n`);
    git(['add', '.'], seed);
    git(['commit', '-qm', 'before'], seed);
    const baseSha = git(['rev-parse', 'HEAD'], seed);
    git(['checkout', '-q', '-b', 'feature'], seed);
    await writeFile(path.join(seed, 'index.html'), '<h1>after</h1>\n');
    git(['commit', '-qam', 'after'], seed);
    const headSha = git(['rev-parse', 'HEAD'], seed);
    git(['checkout', '-q', 'main'], seed);
    git(['init', '-q', '--bare', bare], work);
    git(['symbolic-ref', 'HEAD', 'refs/heads/main'], bare);
    git(['remote', 'add', 'origin', bare], seed);
    git(['push', '-q', 'origin', 'main', 'feature'], seed);
    git(['clone', '-q', bare, clone], work);

    mock = await startPublishMockApi(baseSha, headSha, state);

    // Draft: no token, no publish flag. Nothing may be uploaded.
    const draft = await runCliCollect(
      ['--pr', 'https://github.com/acme/orders/pull/7', '--config', 'visual-review.json', '--output', 'review-output'],
      clone,
      { VISUAL_REVIEW_GITHUB_API: mock.origin, GITHUB_TOKEN: '', GH_TOKEN: '' },
    );
    assert.equal(draft.code, 0, `${draft.stdout}\n${draft.stderr}`);
    assert.equal(state.uploads, 0, 'a draft uploads nothing');
    const draftText = await readFile(path.join(clone, 'review-output', 'pr-comment.md'), 'utf8');
    assert.doesNotMatch(draftText, /## Evidence/);
    const prJson = JSON.parse(await readFile(path.join(clone, 'review-output', 'pr.json'), 'utf8'));
    assert.equal(prJson.adapter, 'web');

    // Publish: images go up now, and the comment the reviewer read gains an Evidence section.
    const publish = await runCliCollect(
      ['--publish', 'review-output', '--post-comment'],
      clone,
      { VISUAL_REVIEW_GITHUB_API: mock.origin, GITHUB_TOKEN: 'test-token' },
    );
    assert.equal(publish.code, 0, `${publish.stdout}\n${publish.stderr}`);
    assert.equal(state.uploads, 1, 'one side-by-side image per captured cell');
    assert.equal(state.resolves, 1, 'publish does not resolve the PR again');
    assert.match(publish.stdout, /Uploaded 1 screenshot/);
    assert.match(state.comment, /## Evidence/);
    assert.match(state.comment, /!\[[^\]]*\]\(https:\/\/raw\.githubusercontent\.com\/acme\/orders\/visual-review-assets\/pr-7-\d+\/[^)]+side-by-side\.png\)/);

    // Everything the reviewer read is still there; only the footer line about local images changes.
    const reviewed = draftText.trim().split('\n');
    const footer = reviewed.pop();
    assert.match(footer, /not embedded here/);
    for (const line of reviewed) {
      assert.ok(state.comment.includes(line), `draft line missing from published comment: ${line}`);
    }
    assert.match(state.comment, /embedded above/);
  } finally {
    if (mock) await new Promise((resolve) => mock.server.close(resolve));
    await rm(work, { recursive: true, force: true });
  }
});
