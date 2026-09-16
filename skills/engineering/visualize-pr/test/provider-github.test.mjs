import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureAssetsBranch, getPrBody, githubTokenFrom, postPrComment, resolvePr, updatePrBody, uploadFile } from '../src/provider-github.mjs';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('resolvePr requests the pull endpoint and maps base/head SHAs', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      number: 123,
      title: 'Fix checkout',
      state: 'open',
      base: { ref: 'main', sha: 'base-sha-40' },
      head: { ref: 'feature', sha: 'head-sha-40' },
      html_url: 'https://github.com/acme/orders/pull/123',
    });
  };
  const pr = await resolvePr('tok', 'acme', 'orders', 123, fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/acme/orders/pulls/123');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(pr, {
    number: 123,
    title: 'Fix checkout',
    state: 'open',
    baseRef: 'main',
    headRef: 'feature',
    baseSha: 'base-sha-40',
    headSha: 'head-sha-40',
    htmlUrl: 'https://github.com/acme/orders/pull/123',
  });
});

test('resolvePr surfaces the API message on a 404', async () => {
  const fetchImpl = async () => jsonResponse({ message: 'Not Found' }, 404);
  await assert.rejects(
    () => resolvePr('tok', 'acme', 'orders', 999, fetchImpl),
    /GitHub PR lookup failed.*HTTP 404: Not Found/,
  );
});

test('postPrComment posts to the issue-comments endpoint and returns the URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ id: 55, html_url: 'https://github.com/acme/orders/pull/123#issuecomment-55' }, 201);
  };
  const posted = await postPrComment('tok', 'acme', 'orders', 123, 'hello', fetchImpl);

  assert.equal(calls[0].url, 'https://api.github.com/repos/acme/orders/issues/123/comments');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(JSON.parse(calls[0].init.body).body, 'hello');
  assert.deepEqual(posted, { id: 55, htmlUrl: 'https://github.com/acme/orders/pull/123#issuecomment-55' });
});

test('postPrComment surfaces the API message on a failure', async () => {
  const fetchImpl = async () => jsonResponse({ message: 'Bad credentials' }, 401);
  await assert.rejects(
    () => postPrComment('tok', 'acme', 'orders', 123, 'hello', fetchImpl),
    /GitHub comment post failed.*HTTP 401: Bad credentials/,
  );
});

test('githubTokenFrom prefers GITHUB_TOKEN then GH_TOKEN', () => {
  assert.equal(githubTokenFrom({ GITHUB_TOKEN: 'a' }), 'a');
  assert.equal(githubTokenFrom({ GH_TOKEN: 'b' }), 'b');
  assert.equal(githubTokenFrom({ GITHUB_TOKEN: 'a', GH_TOKEN: 'b' }), 'a');
  assert.equal(githubTokenFrom({}), null);
});

test('ensureAssetsBranch creates the branch when it is missing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/git/ref/heads/visual-review-assets')) return jsonResponse({ message: 'Not Found' }, 404);
    if (url.endsWith('/repos/acme/orders')) return jsonResponse({ default_branch: 'main' });
    if (url.endsWith('/git/ref/heads/main')) return jsonResponse({ ref: 'refs/heads/main', object: { sha: 'main-sha' } });
    if (url.endsWith('/git/refs') && init.method === 'POST') return jsonResponse({ ref: 'refs/heads/visual-review-assets' }, 201);
    throw new Error(`unexpected request: ${init.method ?? 'GET'} ${url}`);
  };
  await ensureAssetsBranch('tok', 'acme', 'orders', 'visual-review-assets', fetchImpl);
  const create = calls.find((c) => c.url.endsWith('/git/refs') && c.init.method === 'POST');
  assert.ok(create, 'expected a branch-create POST');
  assert.deepEqual(JSON.parse(create.init.body), { ref: 'refs/heads/visual-review-assets', sha: 'main-sha' });
});

test('ensureAssetsBranch is a no-op when the branch exists', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/git/ref/heads/visual-review-assets')) return jsonResponse({ ref: 'refs/heads/visual-review-assets' });
    throw new Error(`unexpected request: ${url}`);
  };
  await ensureAssetsBranch('tok', 'acme', 'orders', 'visual-review-assets', fetchImpl);
  assert.equal(calls.length, 1);
});

test('uploadFile PUTs base64 content and returns the download URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ content: { download_url: 'https://raw.githubusercontent.com/acme/orders/visual-review-assets/run/x.png' } }, 201);
  };
  const url = await uploadFile('tok', 'acme', 'orders', 'visual-review-assets', 'run/x.png', Buffer.from([1, 2, 3]), fetchImpl);
  assert.equal(calls[0].url, 'https://api.github.com/repos/acme/orders/contents/run/x.png');
  assert.equal(calls[0].init.method, 'PUT');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.branch, 'visual-review-assets');
  assert.equal(body.content, Buffer.from([1, 2, 3]).toString('base64'));
  assert.equal(url, 'https://raw.githubusercontent.com/acme/orders/visual-review-assets/run/x.png');
});

test('uploadFile surfaces the API message on failure', async () => {
  const fetchImpl = async () => jsonResponse({ message: 'Branch not found' }, 404);
  await assert.rejects(
    () => uploadFile('tok', 'acme', 'orders', 'visual-review-assets', 'run/x.png', Buffer.from([1]), fetchImpl),
    /GitHub asset upload failed.*HTTP 404: Branch not found/,
  );
});

test('getPrBody reads the pull request body', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ number: 7, body: 'existing body' });
  };
  const body = await getPrBody('tok', 'acme', 'orders', 7, fetchImpl);

  assert.equal(body, 'existing body');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/acme/orders/pulls/7');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
});

test('getPrBody returns an empty string when the body is null', async () => {
  const body = await getPrBody('tok', 'acme', 'orders', 7, async () => jsonResponse({ number: 7, body: null }));
  assert.equal(body, '');
});

test('getPrBody reports a failed lookup', async () => {
  await assert.rejects(
    () => getPrBody('tok', 'acme', 'orders', 7, async () => jsonResponse({ message: 'Not Found' }, 404)),
    /GitHub PR body lookup failed \(acme\/orders#7\): HTTP 404: Not Found/,
  );
});

test('updatePrBody PATCHes the pull request with the new body', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ number: 7, html_url: 'https://github.com/acme/orders/pull/7' });
  };
  const result = await updatePrBody('tok', 'acme', 'orders', 7, 'new body', fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/acme/orders/pulls/7');
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].init.body), { body: 'new body' });
  assert.deepEqual(result, { htmlUrl: 'https://github.com/acme/orders/pull/7' });
});

test('updatePrBody reports a failed update', async () => {
  await assert.rejects(
    () => updatePrBody('tok', 'acme', 'orders', 7, 'x', async () => jsonResponse({ message: 'Forbidden' }, 403)),
    /GitHub PR description update failed \(acme\/orders#7\): HTTP 403: Forbidden/,
  );
});
