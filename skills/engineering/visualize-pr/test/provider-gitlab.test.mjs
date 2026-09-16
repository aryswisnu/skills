import test from 'node:test';
import assert from 'node:assert/strict';

import { getPrBody, gitlabTokenFrom, postPrComment, resolvePr, updatePrBody } from '../src/provider-gitlab.mjs';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const MR = {
  iid: 12,
  id: 99001,
  title: 'Fix checkout',
  state: 'opened',
  description: 'existing description',
  source_branch: 'feature',
  target_branch: 'main',
  sha: 'head-sha-40',
  diff_refs: { base_sha: 'base-sha-40', start_sha: 'start-sha-40', head_sha: 'head-sha-40' },
  web_url: 'https://gitlab.com/group/subgroup/repo/-/merge_requests/12',
};

test('resolvePr encodes a nested group path as a single segment', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(MR);
  };
  await resolvePr('tok', 'gitlab.com', 'group/subgroup/repo', 12, fetchImpl);

  assert.equal(
    calls[0].url,
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Frepo/merge_requests/12',
  );
  assert.ok(calls[0].url.includes('group%2Fsubgroup%2Frepo'));
  const segment = calls[0].url.split('/projects/')[1].split('/merge_requests/')[0];
  assert.ok(!segment.includes('/'), 'project segment must not contain a raw slash');
});

test('resolvePr maps iid and diff_refs.base_sha onto the shared PR shape', async () => {
  const pr = await resolvePr('tok', 'gitlab.com', 'group/subgroup/repo', 12, async () => jsonResponse(MR));

  assert.deepEqual(pr, {
    number: 12,
    title: 'Fix checkout',
    state: 'opened',
    baseRef: 'main',
    headRef: 'feature',
    baseSha: 'base-sha-40',
    headSha: 'head-sha-40',
    htmlUrl: 'https://gitlab.com/group/subgroup/repo/-/merge_requests/12',
  });
});

test('resolvePr falls back to diff_refs.start_sha then null', async () => {
  const withStart = { ...MR, diff_refs: { start_sha: 'start-sha-40' } };
  const started = await resolvePr('tok', 'gitlab.com', 'acme/orders', 12, async () => jsonResponse(withStart));
  assert.equal(started.baseSha, 'start-sha-40');

  const withNothing = { ...MR, diff_refs: {} };
  const empty = await resolvePr('tok', 'gitlab.com', 'acme/orders', 12, async () => jsonResponse(withNothing));
  assert.equal(empty.baseSha, null);

  const missingRefs = { ...MR, diff_refs: undefined };
  const absent = await resolvePr('tok', 'gitlab.com', 'acme/orders', 12, async () => jsonResponse(missingRefs));
  assert.equal(absent.baseSha, null);
});

test('resolvePr sends PRIVATE-TOKEN when a token is given and omits it otherwise', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(MR);
  };
  await resolvePr('tok', 'gitlab.com', 'acme/orders', 12, fetchImpl);
  assert.equal(calls[0].init.headers['PRIVATE-TOKEN'], 'tok');

  await resolvePr(null, 'gitlab.com', 'acme/orders', 12, fetchImpl);
  assert.ok(!('PRIVATE-TOKEN' in calls[1].init.headers), 'public projects send no auth header');
});

test('resolvePr uses a self-hosted host in the derived base URL', async () => {
  const calls = [];
  await resolvePr('tok', 'gitlab.example.com', 'acme/orders', 4, async (url) => {
    calls.push(url);
    return jsonResponse(MR);
  });
  assert.equal(calls[0], 'https://gitlab.example.com/api/v4/projects/acme%2Forders/merge_requests/4');
});

test('VISUAL_REVIEW_GITLAB_API overrides the host-derived base', async () => {
  const previous = process.env.VISUAL_REVIEW_GITLAB_API;
  process.env.VISUAL_REVIEW_GITLAB_API = 'https://proxy.internal/api/v4';
  try {
    const calls = [];
    await resolvePr('tok', 'gitlab.com', 'acme/orders', 12, async (url) => {
      calls.push(url);
      return jsonResponse(MR);
    });
    assert.equal(calls[0], 'https://proxy.internal/api/v4/projects/acme%2Forders/merge_requests/12');
  } finally {
    if (previous === undefined) delete process.env.VISUAL_REVIEW_GITLAB_API;
    else process.env.VISUAL_REVIEW_GITLAB_API = previous;
  }
});

test('resolvePr surfaces the API message on a 404 using the ! reference', async () => {
  await assert.rejects(
    () => resolvePr('tok', 'gitlab.com', 'group/sub/repo', 12, async () => jsonResponse({ message: '404 Not found' }, 404)),
    /GitLab merge request lookup failed \(group\/sub\/repo!12\): HTTP 404: 404 Not found/,
  );
});

test('resolvePr reads the error key when GitLab omits message', async () => {
  await assert.rejects(
    () => resolvePr('tok', 'gitlab.com', 'acme/orders', 12, async () => jsonResponse({ error: 'insufficient_scope' }, 403)),
    /GitLab merge request lookup failed \(acme\/orders!12\): HTTP 403: insufficient_scope/,
  );
});

test('postPrComment posts to the notes endpoint with a body payload', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ id: 55 }, 201);
  };
  const posted = await postPrComment('tok', 'gitlab.com', 'group/subgroup/repo', 12, 'hello', fetchImpl);

  assert.equal(
    calls[0].url,
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Frepo/merge_requests/12/notes',
  );
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { body: 'hello' });
  assert.deepEqual(posted, { id: 55, htmlUrl: null });
});

test('postPrComment reports a failed post', async () => {
  await assert.rejects(
    () => postPrComment('tok', 'gitlab.com', 'acme/orders', 12, 'hello', async () => jsonResponse({ message: '401 Unauthorized' }, 401)),
    /GitLab note post failed \(acme\/orders!12\): HTTP 401: 401 Unauthorized/,
  );
});

test('getPrBody reads the merge request description', async () => {
  const calls = [];
  const body = await getPrBody('tok', 'gitlab.com', 'acme/orders', 12, async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(MR);
  });
  assert.equal(body, 'existing description');
  assert.equal(calls[0].url, 'https://gitlab.com/api/v4/projects/acme%2Forders/merge_requests/12');
  assert.equal(calls[0].init.headers['PRIVATE-TOKEN'], 'tok');
});

test('getPrBody returns an empty string when the description is null', async () => {
  const body = await getPrBody('tok', 'gitlab.com', 'acme/orders', 12, async () => jsonResponse({ ...MR, description: null }));
  assert.equal(body, '');
});

test('getPrBody reports a failed lookup', async () => {
  await assert.rejects(
    () => getPrBody('tok', 'gitlab.com', 'acme/orders', 12, async () => jsonResponse({ message: '404 Not found' }, 404)),
    /GitLab merge request body lookup failed \(acme\/orders!12\): HTTP 404: 404 Not found/,
  );
});

test('updatePrBody PUTs only the description', async () => {
  const calls = [];
  const result = await updatePrBody('tok', 'gitlab.com', 'group/subgroup/repo', 12, 'new body', async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(MR);
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Frepo/merge_requests/12',
  );
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), { description: 'new body' });
  assert.deepEqual(result, { htmlUrl: 'https://gitlab.com/group/subgroup/repo/-/merge_requests/12' });
});

test('updatePrBody reports a failed update', async () => {
  await assert.rejects(
    () => updatePrBody('tok', 'gitlab.com', 'acme/orders', 12, 'x', async () => jsonResponse({ message: '403 Forbidden' }, 403)),
    /GitLab merge request description update failed \(acme\/orders!12\): HTTP 403: 403 Forbidden/,
  );
});

test('gitlabTokenFrom prefers GITLAB_TOKEN then CI_JOB_TOKEN', () => {
  assert.equal(gitlabTokenFrom({ GITLAB_TOKEN: 'a' }), 'a');
  assert.equal(gitlabTokenFrom({ CI_JOB_TOKEN: 'b' }), 'b');
  assert.equal(gitlabTokenFrom({ GITLAB_TOKEN: 'a', CI_JOB_TOKEN: 'b' }), 'a');
  assert.equal(gitlabTokenFrom({}), null);
});
