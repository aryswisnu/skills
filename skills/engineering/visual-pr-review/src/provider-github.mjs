// Minimal GitHub REST client for resolving a pull request and posting a comment.
//
// `fetch` is injectable so unit tests can assert request shape without network
// access. The token is passed explicitly; callers read it from the environment.

const API = 'https://api.github.com';

function apiBase() {
  return process.env.VISUAL_REVIEW_GITHUB_API || API;
}

const HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'visual-pr-review',
};

function githubTokenFrom(env) {
  return env.GITHUB_TOKEN || env.GH_TOKEN || null;
}

async function readError(response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body && body.message ? `: ${body.message}` : '';
  } catch {
    // Non-JSON error body; keep the status only.
  }
  return `HTTP ${response.status}${detail}`;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function resolvePr(token, owner, repo, number, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${apiBase()}/repos/${owner}/${repo}/pulls/${number}`, {
    headers: { ...HEADERS, ...authHeaders(token) },
  });
  if (!response.ok) {
    throw new Error(`GitHub PR lookup failed (${owner}/${repo}#${number}): ${await readError(response)}`);
  }
  const pr = await response.json();
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    htmlUrl: pr.html_url,
  };
}

export async function postPrComment(token, owner, repo, number, body, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${apiBase()}/repos/${owner}/${repo}/issues/${number}/comments`, {
    method: 'POST',
    headers: { ...HEADERS, ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(`GitHub comment post failed (${owner}/${repo}#${number}): ${await readError(response)}`);
  }
  const comment = await response.json();
  return { id: comment.id, htmlUrl: comment.html_url };
}

export { githubTokenFrom };
