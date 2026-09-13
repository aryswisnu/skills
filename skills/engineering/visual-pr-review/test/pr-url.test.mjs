import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePrUrl } from '../src/pr-url.mjs';

test('parsePrUrl extracts owner, repo and number from a canonical PR URL', () => {
  assert.deepEqual(
    parsePrUrl('https://github.com/acme/orders/pull/123'),
    { owner: 'acme', repo: 'orders', number: 123, htmlUrl: 'https://github.com/acme/orders/pull/123' },
  );
});

test('parsePrUrl accepts www, http, trailing slash, query and fragment', () => {
  assert.deepEqual(
    parsePrUrl('http://www.github.com/acme/orders/pull/42?diff=split#files'),
    { owner: 'acme', repo: 'orders', number: 42, htmlUrl: 'https://github.com/acme/orders/pull/42' },
  );
});

test('parsePrUrl accepts a trailing path after the number', () => {
  assert.equal(parsePrUrl('https://github.com/acme/orders/pull/7/files').number, 7);
});

test('parsePrUrl rejects a non-GitHub provider with a clear message', () => {
  assert.throws(
    () => parsePrUrl('https://bitbucket.org/acme/orders/pull-requests/42'),
    /unsupported provider: bitbucket.org/,
  );
  assert.throws(
    () => parsePrUrl('https://gitlab.com/acme/orders/-/merge_requests/42'),
    /unsupported provider/,
  );
});

test('parsePrUrl rejects a non-pull GitHub URL', () => {
  assert.throws(
    () => parsePrUrl('https://github.com/acme/orders'),
    /not a GitHub pull request URL/,
  );
  assert.throws(
    () => parsePrUrl('https://github.com/acme/orders/issues/1'),
    /not a GitHub pull request URL/,
  );
});

test('parsePrUrl rejects malformed input', () => {
  assert.throws(() => parsePrUrl('not a url'), /not a valid URL/);
  assert.throws(() => parsePrUrl(''), /not a valid URL/);
});
