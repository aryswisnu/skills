// Parse GitHub pull request URLs into their component parts.
//
// Only github.com is implemented. Other providers (Bitbucket, GitLab, Azure
// DevOps) are intentionally rejected so a user gets a clear error instead of a
// silently wrong resolution.

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

export function parsePrUrl(url) {
  const input = String(url).trim();
  let parsed;
  try {
    parsed = new URL(input);
  } catch (error) {
    throw new Error(`not a valid URL: ${input}`);
  }
  if (!GITHUB_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `unsupported provider: ${parsed.hostname}. Only github.com pull requests are implemented; ` +
      'other providers are planned.',
    );
  }
  const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(parsed.pathname);
  if (!match) {
    throw new Error(`not a GitHub pull request URL: ${input}`);
  }
  const [, owner, repo, number] = match;
  return {
    owner,
    repo,
    number: Number(number),
    htmlUrl: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}
