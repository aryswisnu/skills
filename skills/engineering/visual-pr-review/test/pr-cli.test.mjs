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
const cli = path.join(packageRoot, 'scripts', 'visual-pr-review.mjs');

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
