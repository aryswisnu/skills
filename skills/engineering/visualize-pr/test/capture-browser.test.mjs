import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';

import { attachRuntimeCollectors, installLocalNavigationGuard, replaySteps } from '../src/capture.mjs';
import { browserLaunchOptions } from '../src/visual.mjs';

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const close = (server) => new Promise((resolve) => server.close(resolve));

async function browserIsAvailable() {
  try {
    const browser = await chromium.launch(browserLaunchOptions());
    await browser.close();
    return true;
  } catch (error) {
    if (/Executable doesn't exist/.test(error.message)) return false;
    throw error;
  }
}

const available = await browserIsAvailable();

test('real browser blocks external redirects, links, forms and JavaScript navigation', { skip: !available && 'no Playwright Chromium installed' }, async () => {
  let externalHits = 0;
  const external = await listen((_request, response) => { externalHits += 1; response.end('external'); });
  const preview = await listen((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { location: `${external.origin}/redirected` });
      response.end();
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html>
      <a id="link" href="${external.origin}/link">link</a>
      <form action="${external.origin}/form"><button id="submit">submit</button></form>
      <button id="script" onclick="location.href='${external.origin}/script'">script</button>`);
  });
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const redirectPage = await browser.newPage();
    await installLocalNavigationGuard(redirectPage, preview.origin);
    try {
      await redirectPage.goto(`${preview.origin}/redirect`, { timeout: 5000 });
    } catch {
      // Some Chromium builds reject the aborted redirect navigation; either way the
      // external origin must never be contacted and the page must not land there.
    }
    assert.equal(redirectPage.url().startsWith(external.origin), false);
    await redirectPage.close();

    for (const selector of ['#link', '#submit', '#script']) {
      const page = await browser.newPage();
      await installLocalNavigationGuard(page, preview.origin);
      await page.goto(`${preview.origin}/`);
      const runtime = attachRuntimeCollectors(page, preview.origin);
      await assert.rejects(
        () => replaySteps(page, [{ action: 'click', selector, timeoutMs: 3000 }], preview.origin, runtime),
        /left the preview origin/,
      );
      await page.close();
    }
    assert.equal(externalHits, 0);
  } finally {
    await browser.close();
    await Promise.all([close(preview.server), close(external.server)]);
  }
});

test('real browser records the final status after action navigation', { skip: !available && 'no Playwright Chromium installed' }, async () => {
  const preview = await listen((request, response) => {
    if (request.url === '/missing') {
      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<h1>missing</h1>');
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end('<a id="missing" href="/missing">missing</a>');
  });
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage();
    await installLocalNavigationGuard(page, preview.origin);
    const runtime = attachRuntimeCollectors(page, preview.origin);
    await page.goto(`${preview.origin}/`);
    await replaySteps(page, [{ action: 'click', selector: '#missing', timeoutMs: 3000 }], preview.origin, runtime);
    assert.equal(runtime.status, 404);
  } finally {
    await browser.close();
    await close(preview.server);
  }
});
