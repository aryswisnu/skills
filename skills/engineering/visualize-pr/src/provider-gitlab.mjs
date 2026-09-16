// Minimal GitLab REST v4 client for resolving a merge request and posting a note.
//
// `fetch` is injectable so unit tests can assert request shape without network
// access. The token is passed explicitly; callers read it from the environment.
//
// GitLab is commonly self-hosted, so every call takes a host (for example
// 'gitlab.com'). Project paths nest through groups, so they are encoded as a
// single path segment: 'group/subgroup/repo' becomes 'group%2Fsubgroup%2Frepo'.

function apiBase(host) {
  return process.env.VISUAL_REVIEW_GITLAB_API || `https://${host}/api/v4`;
}

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'visual-pr-review',
};

function gitlabTokenFrom(env) {
  return env.GITLAB_TOKEN || env.CI_JOB_TOKEN || null;
}

function projectSegment(projectPath) {
  return encodeURIComponent(projectPath);
}

async function readError(response) {
  let detail = '';
  try {
    const body = await response.json();
    const message = body ? body.message ?? body.error : null;
    detail = message ? `: ${message}` : '';
  } catch {
    // Non-JSON error body; keep the status only.
  }
  return `HTTP ${response.status}${detail}`;
}

function authHeaders(token) {
  return token ? { 'PRIVATE-TOKEN': token } : {};
}

function mergeRequestUrl(host, projectPath, number) {
  return `${apiBase(host)}/projects/${projectSegment(projectPath)}/merge_requests/${number}`;
}

function baseShaOf(mr) {
  const refs = mr.diff_refs || {};
  return refs.base_sha ?? refs.start_sha ?? null;
}

export async function resolvePr(token, host, projectPath, number, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(mergeRequestUrl(host, projectPath, number), {
    headers: { ...HEADERS, ...authHeaders(token) },
  });
  if (!response.ok) {
    throw new Error(
      `GitLab merge request lookup failed (${projectPath}!${number}): ${await readError(response)}`,
    );
  }
  const mr = await response.json();
  return {
    number: mr.iid,
    title: mr.title,
    state: mr.state,
    baseRef: mr.target_branch,
    headRef: mr.source_branch,
    baseSha: baseShaOf(mr),
    headSha: mr.sha,
    htmlUrl: mr.web_url,
  };
}

export async function postPrComment(token, host, projectPath, number, body, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${mergeRequestUrl(host, projectPath, number)}/notes`, {
    method: 'POST',
    headers: { ...HEADERS, ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(
      `GitLab note post failed (${projectPath}!${number}): ${await readError(response)}`,
    );
  }
  const note = await response.json();
  // GitLab does not return a web URL for a note, so the caller prints the MR URL.
  return { id: note.id, htmlUrl: null };
}

export async function getPrBody(token, host, projectPath, number, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(mergeRequestUrl(host, projectPath, number), {
    headers: { ...HEADERS, ...authHeaders(token) },
  });
  if (!response.ok) {
    throw new Error(
      `GitLab merge request body lookup failed (${projectPath}!${number}): ${await readError(response)}`,
    );
  }
  const mr = await response.json();
  return typeof mr.description === 'string' ? mr.description : '';
}

export async function updatePrBody(token, host, projectPath, number, body, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(mergeRequestUrl(host, projectPath, number), {
    method: 'PUT',
    headers: { ...HEADERS, ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: body }),
  });
  if (!response.ok) {
    throw new Error(
      `GitLab merge request description update failed (${projectPath}!${number}): ${await readError(response)}`,
    );
  }
  const mr = await response.json();
  return { htmlUrl: mr.web_url };
}

export { gitlabTokenFrom };
