// Minimal Bitbucket Cloud REST client for resolving a pull request, posting a
// comment, and rewriting the description.
//
// `fetch` is injectable so unit tests can assert request shape without network
// access. The auth descriptor is passed explicitly; callers build it from the
// environment with `bitbucketTokenFrom`.

const API = 'https://api.bitbucket.org/2.0';

function apiBase() {
  return process.env.VISUAL_REVIEW_BITBUCKET_API || API;
}

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'visual-pr-review',
};

// A repository or workspace access token is used as a bearer token. The older
// username plus app password pair is sent as HTTP basic auth instead.
function bitbucketTokenFrom(env) {
  if (env.BITBUCKET_TOKEN) return { kind: 'bearer', token: env.BITBUCKET_TOKEN };
  if (env.BITBUCKET_USERNAME && env.BITBUCKET_APP_PASSWORD) {
    return {
      kind: 'basic',
      token: Buffer.from(`${env.BITBUCKET_USERNAME}:${env.BITBUCKET_APP_PASSWORD}`).toString('base64'),
    };
  }
  return null;
}

async function readError(response) {
  let detail = '';
  try {
    const body = await response.json();
    // Bitbucket errors look like {"type":"error","error":{"message":"..."}}.
    const message = (body && body.error && body.error.message) || (body && body.message);
    detail = message ? `: ${message}` : '';
  } catch {
    // Non-JSON error body; keep the status only.
  }
  return `HTTP ${response.status}${detail}`;
}

function authHeaders(auth) {
  if (!auth) return {};
  if (auth.kind === 'bearer') return { Authorization: `Bearer ${auth.token}` };
  if (auth.kind === 'basic') return { Authorization: `Basic ${auth.token}` };
  return {};
}

function prUrl(workspace, repo, number) {
  return `${apiBase()}/repositories/${workspace}/${repo}/pullrequests/${number}`;
}

export async function resolvePr(auth, workspace, repo, number, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(prUrl(workspace, repo, number), {
    headers: { ...HEADERS, ...authHeaders(auth) },
  });
  if (!response.ok) {
    throw new Error(`Bitbucket PR lookup failed (${workspace}/${repo}#${number}): ${await readError(response)}`);
  }
  const pr = await response.json();
  return {
    number: pr.id,
    title: pr.title,
    state: pr.state,
    baseRef: pr.destination.branch.name,
    headRef: pr.source.branch.name,
    // Bitbucket usually returns 12-character abbreviated hashes here. Pass them
    // through as-is; the caller abbreviates to 7 for display anyway.
    baseSha: pr.destination.commit.hash,
    headSha: pr.source.commit.hash,
    htmlUrl: pr.links.html.href,
  };
}

export async function postPrComment(auth, workspace, repo, number, body, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${prUrl(workspace, repo, number)}/comments`, {
    method: 'POST',
    headers: { ...HEADERS, ...authHeaders(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { raw: body } }),
  });
  if (!response.ok) {
    throw new Error(`Bitbucket comment post failed (${workspace}/${repo}#${number}): ${await readError(response)}`);
  }
  const comment = await response.json();
  return { id: comment.id, htmlUrl: comment.links.html.href };
}

export async function getPrBody(auth, workspace, repo, number, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(prUrl(workspace, repo, number), {
    headers: { ...HEADERS, ...authHeaders(auth) },
  });
  if (!response.ok) {
    throw new Error(`Bitbucket PR body lookup failed (${workspace}/${repo}#${number}): ${await readError(response)}`);
  }
  const pr = await response.json();
  // Bitbucket calls the PR body "description".
  return typeof pr.description === 'string' ? pr.description : '';
}

export async function updatePrBody(auth, workspace, repo, number, body, fetchImpl = globalThis.fetch) {
  // Bitbucket requires `title` on the PUT or it errors, so fetch the PR first to
  // read the current title and send it back unchanged alongside the new body.
  const getResponse = await fetchImpl(prUrl(workspace, repo, number), {
    headers: { ...HEADERS, ...authHeaders(auth) },
  });
  if (!getResponse.ok) {
    throw new Error(`Bitbucket PR lookup failed (${workspace}/${repo}#${number}): ${await readError(getResponse)}`);
  }
  const current = await getResponse.json();
  const response = await fetchImpl(prUrl(workspace, repo, number), {
    method: 'PUT',
    headers: { ...HEADERS, ...authHeaders(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: current.title, description: body }),
  });
  if (!response.ok) {
    throw new Error(`Bitbucket PR description update failed (${workspace}/${repo}#${number}): ${await readError(response)}`);
  }
  const pr = await response.json();
  return { htmlUrl: pr.links.html.href };
}

export { bitbucketTokenFrom };
