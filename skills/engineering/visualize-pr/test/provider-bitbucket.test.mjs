import test from 'node:test';
import assert from 'node:assert/strict';

import { bitbucketTokenFrom, getPrBody, postPrComment, resolvePr, updatePrBody } from '../src/provider-bitbucket.mjs';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const AUTH = { kind: 'bearer', token: 'tok' };

function prPayload(overrides = {}) {
  return {
    id: 12,
    title: 'Fix checkout',
    state: 'OPEN',
    description: 'existing body',
    source: { branch: { name: 'feature' }, commit: { hash: 'abcdef123456' } },
    destination: { branch: { name: 'main' }, commit: { hash: '123456abcdef' } },
    links: { html: { href: 'https://bitbucket.org/acme/orders/pull-requests/12' } },
    ...overrides,
  };
}

test('resolvePr requests the pullrequests endpoint and maps source/destination', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(prPayload());
  };
  const pr = await resolvePr(AUTH, 'acme', 'orders', 12, fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.bitbucket.org/2.0/repositories/acme/orders/pullrequests/12');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(pr, {
    number: 12,
    title: 'Fix checkout',
    state: 'OPEN',
    baseRef: 'main',
    headRef: 'feature',
    baseSha: '123456abcdef',
    headSha: 'abcdef123456',
    htmlUrl: 'https://bitbucket.org/acme/orders/pull-requests/12',
  });
});

test('resolvePr passes abbreviated 12-character hashes through unchanged', async () => {
  const pr = await resolvePr(AUTH, 'acme', 'orders', 12, async () => jsonResponse(prPayload()));
  assert.equal(pr.headSha.length, 12);
  assert.equal(pr.baseSha.length, 12);
});

test('resolvePr surfaces the API message on a 404', async () => {
  const fetchImpl = async () => jsonResponse({ type: 'error', error: { message: 'Not Found' } }, 404);
  await assert.rejects(
    () => resolvePr(AUTH, 'acme', 'orders', 12, fetchImpl),
    /Bitbucket PR lookup failed \(acme\/orders#12\): HTTP 404: Not Found/,
  );
});

test('postPrComment posts a content.raw body and returns the URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(
      { id: 55, links: { html: { href: 'https://bitbucket.org/acme/orders/pull-requests/12#comment-55' } } },
      201,
    );
  };
  const posted = await postPrComment(AUTH, 'acme', 'orders', 12, 'hello', fetchImpl);

  assert.equal(calls[0].url, 'https://api.bitbucket.org/2.0/repositories/acme/orders/pullrequests/12/comments');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { content: { raw: 'hello' } });
  assert.deepEqual(posted, { id: 55, htmlUrl: 'https://bitbucket.org/acme/orders/pull-requests/12#comment-55' });
});

test('postPrComment surfaces the API message on a failure', async () => {
  const fetchImpl = async () => jsonResponse({ type: 'error', error: { message: 'Bad credentials' } }, 401);
  await assert.rejects(
    () => postPrComment(AUTH, 'acme', 'orders', 12, 'hello', fetchImpl),
    /Bitbucket comment post failed \(acme\/orders#12\): HTTP 401: Bad credentials/,
  );
});

test('getPrBody reads the pull request description', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(prPayload());
  };
  const body = await getPrBody(AUTH, 'acme', 'orders', 12, fetchImpl);

  assert.equal(body, 'existing body');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.bitbucket.org/2.0/repositories/acme/orders/pullrequests/12');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
});

test('getPrBody returns an empty string when the description is missing', async () => {
  const body = await getPrBody(AUTH, 'acme', 'orders', 12, async () => jsonResponse(prPayload({ description: undefined })));
  assert.equal(body, '');
});

test('getPrBody reports a failed lookup', async () => {
  await assert.rejects(
    () => getPrBody(AUTH, 'acme', 'orders', 12, async () => jsonResponse({ error: { message: 'Not Found' } }, 404)),
    /Bitbucket PR body lookup failed \(acme\/orders#12\): HTTP 404: Not Found/,
  );
});

test('updatePrBody GETs the PR then PUTs the existing title with the new description', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(prPayload());
  };
  const result = await updatePrBody(AUTH, 'acme', 'orders', 12, 'new body', fetchImpl);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, undefined);
  assert.equal(calls[1].url, 'https://api.bitbucket.org/2.0/repositories/acme/orders/pullrequests/12');
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(calls[1].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[1].init.body), { title: 'Fix checkout', description: 'new body' });
  assert.deepEqual(result, { htmlUrl: 'https://bitbucket.org/acme/orders/pull-requests/12' });
});

test('updatePrBody reports a failed update', async () => {
  const fetchImpl = async (url, init) => {
    if (init && init.method === 'PUT') return jsonResponse({ error: { message: 'Forbidden' } }, 403);
    return jsonResponse(prPayload());
  };
  await assert.rejects(
    () => updatePrBody(AUTH, 'acme', 'orders', 12, 'x', fetchImpl),
    /Bitbucket PR description update failed \(acme\/orders#12\): HTTP 403: Forbidden/,
  );
});

test('updatePrBody reports a failed title lookup', async () => {
  await assert.rejects(
    () => updatePrBody(AUTH, 'acme', 'orders', 12, 'x', async () => jsonResponse({ error: { message: 'Not Found' } }, 404)),
    /Bitbucket PR lookup failed \(acme\/orders#12\): HTTP 404: Not Found/,
  );
});

test('a non-JSON error body falls back to the status alone', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error('not json');
    },
  });
  await assert.rejects(
    () => resolvePr(AUTH, 'acme', 'orders', 12, fetchImpl),
    /Bitbucket PR lookup failed \(acme\/orders#12\): HTTP 500$/,
  );
});

test('bitbucketTokenFrom prefers BITBUCKET_TOKEN as a bearer token', () => {
  assert.deepEqual(bitbucketTokenFrom({ BITBUCKET_TOKEN: 'a' }), { kind: 'bearer', token: 'a' });
  assert.deepEqual(
    bitbucketTokenFrom({ BITBUCKET_TOKEN: 'a', BITBUCKET_USERNAME: 'u', BITBUCKET_APP_PASSWORD: 'p' }),
    { kind: 'bearer', token: 'a' },
  );
});

test('bitbucketTokenFrom base64-encodes username and app password', () => {
  const auth = bitbucketTokenFrom({ BITBUCKET_USERNAME: 'u', BITBUCKET_APP_PASSWORD: 'p' });
  assert.equal(auth.kind, 'basic');
  assert.equal(auth.token, Buffer.from('u:p').toString('base64'));
  assert.equal(Buffer.from(auth.token, 'base64').toString('utf8'), 'u:p');
});

test('bitbucketTokenFrom returns null without a complete credential', () => {
  assert.equal(bitbucketTokenFrom({}), null);
  assert.equal(bitbucketTokenFrom({ BITBUCKET_USERNAME: 'u' }), null);
  assert.equal(bitbucketTokenFrom({ BITBUCKET_APP_PASSWORD: 'p' }), null);
});

test('basic auth sends an Authorization: Basic header', async () => {
  const calls = [];
  const auth = bitbucketTokenFrom({ BITBUCKET_USERNAME: 'u', BITBUCKET_APP_PASSWORD: 'p' });
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(prPayload());
  };
  await resolvePr(auth, 'acme', 'orders', 12, fetchImpl);
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from('u:p').toString('base64')}`);
});

test('a null auth sends no Authorization header', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(prPayload());
  };
  await resolvePr(null, 'acme', 'orders', 12, fetchImpl);
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('VISUAL_REVIEW_BITBUCKET_API overrides the API base', async () => {
  const previous = process.env.VISUAL_REVIEW_BITBUCKET_API;
  process.env.VISUAL_REVIEW_BITBUCKET_API = 'https://bitbucket.internal/2.0';
  try {
    const calls = [];
    await resolvePr(AUTH, 'acme', 'orders', 12, async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(prPayload());
    });
    assert.equal(calls[0].url, 'https://bitbucket.internal/2.0/repositories/acme/orders/pullrequests/12');
  } finally {
    if (previous === undefined) delete process.env.VISUAL_REVIEW_BITBUCKET_API;
    else process.env.VISUAL_REVIEW_BITBUCKET_API = previous;
  }
});
