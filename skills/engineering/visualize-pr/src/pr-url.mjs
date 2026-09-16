// Parse pull request and merge request URLs for every supported provider.
//
// The host is not the discriminator, because all three forges are commonly
// self-hosted on arbitrary domains. The path shape is, and it is unambiguous:
//   /{owner}/{repo}/pull/{n}            GitHub
//   /{workspace}/{repo}/pull-requests/{n}   Bitbucket Cloud
//   /{group}/.../{repo}/-/merge_requests/{n}  GitLab (groups nest, so owner
//                                             can be several segments)

const SUPPORTED = 'GitHub, Bitbucket Cloud, GitLab';

// Bitbucket Server (Data Center) also uses /pull-requests/, but behind
// /projects/{KEY}/repos/{slug}/ and with a completely different REST API, so
// it is detected only to give a useful refusal.
const BITBUCKET_SERVER = /^\/projects\/[^/]+\/repos\/[^/]+\/pull-requests\/\d+/;

const PATTERNS = [
  { provider: 'github', pattern: /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/, path: (o, r, n) => `/${o}/${r}/pull/${n}` },
  { provider: 'bitbucket', pattern: /^\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/, path: (o, r, n) => `/${o}/${r}/pull-requests/${n}` },
  { provider: 'gitlab', pattern: /^\/(.+)\/([^/]+)\/-\/merge_requests\/(\d+)/, path: (o, r, n) => `/${o}/${r}/-/merge_requests/${n}` },
];

export function parsePrUrl(url) {
  const input = String(url).trim();
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`not a valid URL: ${input}`);
  }

  if (BITBUCKET_SERVER.test(parsed.pathname)) {
    throw new Error(
      `Bitbucket Server (Data Center) is not supported: ${input}. Its REST API differs from ` +
      'Bitbucket Cloud, which is the one this skill implements.',
    );
  }

  const host = parsed.hostname.replace(/^www\./, '');
  for (const { provider, pattern, path } of PATTERNS) {
    const match = pattern.exec(parsed.pathname);
    if (!match) continue;
    const [, owner, repo, number] = match;
    return {
      provider,
      host,
      owner,
      repo,
      number: Number(number),
      htmlUrl: `https://${host}${path(owner, repo, number)}`,
    };
  }

  throw new Error(
    `not a recognized pull request or merge request URL: ${input}. Supported: ${SUPPORTED}.`,
  );
}
