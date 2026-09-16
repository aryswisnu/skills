import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DESCRIPTION_END, DESCRIPTION_START } from '../src/pr-description.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'scripts', 'visualize-pr.mjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startMockBackendApi(baseSha, headSha, posted) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const url = request.url ?? '';
      const method = request.method ?? 'GET';
      response.setHeader('content-type', 'application/json');

      const prMatch = /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/.exec(url);
      if (method === 'GET' && prMatch) {
        const [, owner, repo, number] = prMatch;
        response.end(JSON.stringify({
          number: Number(number),
          title: 'Refactor billing',
          state: 'open',
          body: posted.description,
          base: { ref: 'main', sha: baseSha },
          head: { ref: 'feature', sha: headSha },
          html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
        }));
        return;
      }
      if (method === 'PATCH' && prMatch) {
        const [, owner, repo, number] = prMatch;
        let payload = '';
        request.on('data', (chunk) => { payload += chunk; });
        request.on('end', () => {
          posted.description = JSON.parse(payload).body;
          posted.patchCount += 1;
          response.end(JSON.stringify({
            number: Number(number),
            html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
          }));
        });
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
        posted.uploads = (posted.uploads ?? 0) + 1;
        const file = url.split('/contents/')[1];
        response.statusCode = 201;
        response.end(JSON.stringify({ content: { download_url: `https://raw.githubusercontent.com/acme/orders/visual-review-assets/${file}` } }));
        return;
      }
      if (method === 'POST' && /\/issues\/\d+\/comments$/.test(url)) {
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => {
          posted.body = JSON.parse(body).body;
          response.statusCode = 201;
          response.end(JSON.stringify({ id: 99, html_url: 'https://github.com/acme/orders/pull/9#issuecomment-99' }));
        });
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ message: 'Not Found' }));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('--backend --post-comment posts a comment with a Mermaid change map and uploads nothing (no browser)', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'vpr-backend-post-'));
  const seed = path.join(work, 'seed');
  const bare = path.join(work, 'remote.git');
  const clone = path.join(work, 'clone');
  let mock;
  const posted = { body: '', description: 'Original PR body.', patchCount: 0, uploads: 0 };
  try {
    await mkdir(path.join(seed, 'src/api'), { recursive: true });
    git(['init', '-q'], seed);
    git(['config', 'user.name', 'Test'], seed);
    git(['config', 'user.email', 'test@example.invalid'], seed);
    git(['branch', '-M', 'main'], seed);
    await writeFile(path.join(seed, 'src/api/orders.ts'), 'export const a = 1;\n');
    git(['add', '.'], seed);
    git(['commit', '-qm', 'base'], seed);
    const baseSha = git(['rev-parse', 'HEAD'], seed);
    git(['checkout', '-q', '-b', 'feature'], seed);
    await writeFile(path.join(seed, 'src/api/orders.ts'), 'export const a = 1;\nexport const c = 3;\n');
    await writeFile(path.join(seed, 'src/api/billing.ts'), 'export const d = 4;\n');
    git(['add', '.'], seed);
    git(['commit', '-qm', 'head'], seed);
    const headSha = git(['rev-parse', 'HEAD'], seed);
    git(['checkout', '-q', 'main'], seed);

    git(['init', '-q', '--bare', bare], work);
    git(['symbolic-ref', 'HEAD', 'refs/heads/main'], bare);
    git(['remote', 'add', 'origin', bare], seed);
    git(['push', '-q', 'origin', 'main', 'feature'], seed);
    git(['clone', '-q', bare, clone], work);

    mock = await startMockBackendApi(baseSha, headSha, posted);

    const child = spawn(process.execPath, [
      cli, '--pr', 'https://github.com/acme/orders/pull/9', '--backend', '--output', 'review-output', '--post-comment',
    ], {
      cwd: clone,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VISUAL_REVIEW_GITHUB_API: mock.origin, GITHUB_TOKEN: 'test-token' },
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

    const mmd = await readFile(path.join(clone, 'review-output', 'change-map.mmd'), 'utf8');
    assert.match(mmd, /^```mermaid\nflowchart LR/);

    const comment = await readFile(path.join(clone, 'review-output', 'pr-comment.md'), 'utf8');
    assert.match(comment, /### Change map/);
    assert.match(comment, /```mermaid\nflowchart LR/);
    assert.doesNotMatch(comment, /raw\.githubusercontent\.com/);
    assert.match(comment, /files? changed \(\+\d+ -\d+\)/);
    assert.match(comment, /2 files changed/);

    assert.match(posted.body, /```mermaid\nflowchart LR/);
    assert.equal(posted.uploads, 0);
  } finally {
    if (mock) await new Promise((resolve) => mock.server.close(resolve));
    await rm(work, { recursive: true, force: true });
  }
});

test('--backend --update-description writes a marked section into the PR body and stays idempotent', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'vpr-backend-desc-'));
  const seed = path.join(work, 'seed');
  const bare = path.join(work, 'remote.git');
  const clone = path.join(work, 'clone');
  let mock;
  const posted = { body: '', description: 'Original PR body.', patchCount: 0, uploads: 0 };
  try {
    await mkdir(path.join(seed, 'src/api'), { recursive: true });
    git(['init', '-q'], seed);
    git(['config', 'user.name', 'Test'], seed);
    git(['config', 'user.email', 'test@example.invalid'], seed);
    git(['branch', '-M', 'main'], seed);
    await writeFile(path.join(seed, 'src/api/orders.ts'), 'export const a = 1;\n');
    git(['add', '.'], seed);
    git(['commit', '-qm', 'base'], seed);
    const baseSha = git(['rev-parse', 'HEAD'], seed);
    git(['checkout', '-q', '-b', 'feature'], seed);
    await writeFile(path.join(seed, 'src/api/orders.ts'), 'export const a = 1;\nexport const c = 3;\n');
    await writeFile(path.join(seed, 'src/api/billing.ts'), 'export const d = 4;\n');
    git(['add', '.'], seed);
    git(['commit', '-qm', 'head'], seed);
    const headSha = git(['rev-parse', 'HEAD'], seed);
    git(['checkout', '-q', 'main'], seed);

    git(['init', '-q', '--bare', bare], work);
    git(['symbolic-ref', 'HEAD', 'refs/heads/main'], bare);
    git(['remote', 'add', 'origin', bare], seed);
    git(['push', '-q', 'origin', 'main', 'feature'], seed);
    git(['clone', '-q', bare, clone], work);

    mock = await startMockBackendApi(baseSha, headSha, posted);

    const run = async (outputName) => {
      const child = spawn(process.execPath, [
        cli, '--pr', 'https://github.com/acme/orders/pull/9', '--backend', '--output', outputName, '--update-description',
      ], {
        cwd: clone,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VISUAL_REVIEW_GITHUB_API: mock.origin, GITHUB_TOKEN: 'test-token' },
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
      return stdout;
    };

    const firstStdout = await run('review-output');
    assert.match(firstStdout, /PR description updated: https:\/\/github\.com\/acme\/orders\/pull\/9/);
    assert.equal(posted.patchCount, 1);
    assert.equal(posted.body, '', 'no issue comment should be posted without --post-comment');

    const afterFirst = posted.description;
    assert.ok(afterFirst.includes(DESCRIPTION_START));
    assert.ok(afterFirst.includes(DESCRIPTION_END));
    assert.ok(afterFirst.startsWith(DESCRIPTION_START), 'the block leads the description');
    assert.match(afterFirst, /<details>\n<summary>Original description<\/summary>\n\nOriginal PR body\.\n\n<\/details>$/, 'the original is folded on GitHub');
    assert.match(afterFirst, /files? changed \(\+\d+ -\d+\)/);
    assert.match(afterFirst, /2 files changed/);
    assert.match(afterFirst, /```mermaid\nflowchart LR/);

    // pr-comment.md is still written locally.
    const comment = await readFile(path.join(clone, 'review-output', 'pr-comment.md'), 'utf8');
    assert.match(comment, /files? changed \(\+\d+ -\d+\)/);

    await run('review-output-2');
    assert.equal(posted.patchCount, 2);
    assert.equal(
      posted.description.replaceAll(/pr-9-\d+/g, 'pr-9-RUN'),
      afterFirst.replaceAll(/pr-9-\d+/g, 'pr-9-RUN'),
      'a second run must not change the description apart from the upload run id',
    );
    assert.equal(posted.description.split(DESCRIPTION_START).length - 1, 1);
  } finally {
    if (mock) await new Promise((resolve) => mock.server.close(resolve));
    await rm(work, { recursive: true, force: true });
  }
});
