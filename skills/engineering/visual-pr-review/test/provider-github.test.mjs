import test from 'node:test';
import assert from 'node:assert/strict';

import { githubTokenFrom, postPrComment, resolvePr } from '../src/provider-github.mjs';

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
