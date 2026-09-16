import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePrUrl } from '../src/pr-url.mjs';
import { providerFor } from '../src/providers.mjs';

test('providerFor names each forge and its token variables', () => {
  const github = providerFor(parsePrUrl('https://github.com/acme/orders/pull/1'));
  assert.equal(github.name, 'GitHub');
  assert.equal(github.reference, 'acme/orders#1');
  assert.match(github.tokenHint, /GITHUB_TOKEN/);

  const bitbucket = providerFor(parsePrUrl('https://bitbucket.org/acme/orders/pull-requests/2'));
  assert.equal(bitbucket.name, 'Bitbucket');
  assert.equal(bitbucket.reference, 'acme/orders#2');
  assert.match(bitbucket.tokenHint, /BITBUCKET_APP_PASSWORD/);

  const gitlab = providerFor(parsePrUrl('https://gitlab.com/group/sub/orders/-/merge_requests/3'));
  assert.equal(gitlab.name, 'GitLab');
  assert.equal(gitlab.reference, 'group/sub/orders!3', 'GitLab references use ! and keep nested groups');
  assert.match(gitlab.tokenHint, /GITLAB_TOKEN/);
});

test('only GitHub can upload web evidence today', () => {
  assert.equal(providerFor(parsePrUrl('https://github.com/a/b/pull/1')).supportsEvidenceUpload, true);
  assert.equal(providerFor(parsePrUrl('https://bitbucket.org/a/b/pull-requests/1')).supportsEvidenceUpload, false);
  assert.equal(providerFor(parsePrUrl('https://gitlab.com/a/b/-/merge_requests/1')).supportsEvidenceUpload, false);
});

test('providerFor passes the parsed parts through to the client', async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ iid: 3, title: 't', description: '', source_branch: 'h', target_branch: 'b', sha: 'x', diff_refs: {}, web_url: 'u' }) };
  };
  const gitlab = providerFor(parsePrUrl('https://gitlab.example.com/group/sub/orders/-/merge_requests/3'));
  await gitlab.resolvePr('tok', fake);
  assert.match(calls[0], /gitlab\.example\.com/, 'self-hosted host reaches the client');
  assert.match(calls[0], /group%2Fsub%2Forders/, 'nested project path is encoded as one segment');
});

test('providerFor rejects a provider it does not implement', () => {
  assert.throws(() => providerFor({ provider: 'azure' }), /unsupported provider: azure/);
});

test('providers say whether the forge renders Mermaid, so the CLI can fall back to ASCII', () => {
  assert.equal(providerFor(parsePrUrl('https://github.com/a/b/pull/1')).rendersMermaid, true);
  assert.equal(providerFor(parsePrUrl('https://gitlab.com/a/b/-/merge_requests/1')).rendersMermaid, true);
  assert.equal(providerFor(parsePrUrl('https://bitbucket.org/a/b/pull-requests/1')).rendersMermaid, false, 'Bitbucket Cloud renders CommonMark only');
});
