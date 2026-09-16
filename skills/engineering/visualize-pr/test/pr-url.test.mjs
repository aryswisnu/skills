import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePrUrl } from '../src/pr-url.mjs';

test('parsePrUrl extracts owner, repo and number from a canonical PR URL', () => {
  assert.deepEqual(
    parsePrUrl('https://github.com/acme/orders/pull/123'),
    { provider: 'github', host: 'github.com', owner: 'acme', repo: 'orders', number: 123, htmlUrl: 'https://github.com/acme/orders/pull/123' },
  );
});

test('parsePrUrl accepts www, http, trailing slash, query and fragment', () => {
  assert.deepEqual(
    parsePrUrl('http://www.github.com/acme/orders/pull/42?diff=split#files'),
    { provider: 'github', host: 'github.com', owner: 'acme', repo: 'orders', number: 42, htmlUrl: 'https://github.com/acme/orders/pull/42' },
  );
});

test('parsePrUrl accepts a trailing path after the number', () => {
  assert.equal(parsePrUrl('https://github.com/acme/orders/pull/7/files').number, 7);
});

test('parsePrUrl reads a Bitbucket Cloud pull request URL', () => {
  assert.deepEqual(
    parsePrUrl('https://bitbucket.org/acme/orders/pull-requests/42'),
    { provider: 'bitbucket', host: 'bitbucket.org', owner: 'acme', repo: 'orders', number: 42, htmlUrl: 'https://bitbucket.org/acme/orders/pull-requests/42' },
  );
  assert.equal(parsePrUrl('https://bitbucket.org/acme/orders/pull-requests/42/some-slug/diff').number, 42);
});

test('parsePrUrl reads a GitLab merge request URL, including nested groups', () => {
  assert.deepEqual(
    parsePrUrl('https://gitlab.com/acme/orders/-/merge_requests/42'),
    { provider: 'gitlab', host: 'gitlab.com', owner: 'acme', repo: 'orders', number: 42, htmlUrl: 'https://gitlab.com/acme/orders/-/merge_requests/42' },
  );
  const nested = parsePrUrl('https://gitlab.example.com/group/subgroup/orders/-/merge_requests/7');
  assert.equal(nested.provider, 'gitlab');
  assert.equal(nested.host, 'gitlab.example.com');
  assert.equal(nested.owner, 'group/subgroup');
  assert.equal(nested.repo, 'orders');
  assert.equal(nested.number, 7);
});

test('parsePrUrl recognizes self-hosted hosts by path shape', () => {
  assert.equal(parsePrUrl('https://git.acme.dev/team/app/-/merge_requests/3').provider, 'gitlab');
  assert.equal(parsePrUrl('https://code.acme.dev/team/app/pull-requests/3').provider, 'bitbucket');
  assert.equal(parsePrUrl('https://github.acme.dev/team/app/pull/3').provider, 'github');
});

test('parsePrUrl rejects Bitbucket Server, whose API differs from Cloud', () => {
  assert.throws(
    () => parsePrUrl('https://bb.acme.dev/projects/KEY/repos/app/pull-requests/9'),
    /Bitbucket Server/,
  );
});

test('parsePrUrl names the providers it supports when the path matches none', () => {
  assert.throws(
    () => parsePrUrl('https://dev.azure.com/org/project/_git/repo/pullrequest/12'),
    /GitHub, Bitbucket Cloud, GitLab/,
  );
});

test('parsePrUrl rejects a URL with no pull request path', () => {
  assert.throws(() => parsePrUrl('https://github.com/acme/orders'), /GitHub, Bitbucket Cloud, GitLab/);
  assert.throws(() => parsePrUrl('https://github.com/acme/orders/issues/1'), /GitHub, Bitbucket Cloud, GitLab/);
});

test('parsePrUrl rejects malformed input', () => {
  assert.throws(() => parsePrUrl('not a url'), /not a valid URL/);
  assert.throws(() => parsePrUrl(''), /not a valid URL/);
});
