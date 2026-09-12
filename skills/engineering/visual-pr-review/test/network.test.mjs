import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { waitForReady } from '../src/network.mjs';

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

test('waitForReady rejects a readiness redirect outside the preview origin', async () => {
  const external = await listen((_request, response) => response.end('external'));
  const preview = await listen((_request, response) => {
    response.writeHead(302, { location: `${external.origin}/leak` });
    response.end();
  });
  try {
    await assert.rejects(
      () => waitForReady(`${preview.origin}/ready`, 200, { exitCode: null }),
      /redirect left the preview origin/,
    );
  } finally {
    await Promise.all([
      new Promise((resolve) => preview.server.close(resolve)),
      new Promise((resolve) => external.server.close(resolve)),
    ]);
  }
});
