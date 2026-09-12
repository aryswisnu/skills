import test from 'node:test';
import assert from 'node:assert/strict';

import { assertPreviewOrigin, attachRuntimeCollectors, collectSemantic, replaySteps, screenshotMaskLocators, stabilizationCss, summarizeError } from '../src/capture.mjs';

function fakePage(overrides = {}) {
  const calls = [];
  const handlers = new Map();
  let currentUrl = overrides.url ?? 'http://127.0.0.1:4173/';
  return {
    calls,
    handlers,
    on(event, handler) { handlers.set(event, handler); },
    async goto(url) { calls.push(['goto', url]); currentUrl = url; return { status: () => 200 }; },
    url() { return currentUrl; },
    mainFrame() { return overrides.mainFrame ?? 'main'; },
    async title() { return 'Title'; },
    locator(selector) {
      calls.push(['locator', selector]);
      return {
        async click() { calls.push(['click', selector]); },
        async fill(value) { calls.push(['fill', selector, value]); },
        async press(key) { calls.push(['press', selector, key]); },
        async selectOption(value) { calls.push(['select', selector, value]); },
        async waitFor(options) { calls.push(['waitFor', selector, options.state]); if (overrides.waitFails === selector) throw new Error('timeout'); },
        async isVisible() { return overrides.invisible !== selector; },
        async textContent() { return overrides.text?.[selector] ?? 'text'; },
        async ariaSnapshot() { return `- heading "${selector}"`; },
      };
    },
    ...overrides.page,
  };
}

test('stabilizationCss disables animations and hides configured selectors', () => {
  const css = stabilizationCss({ disableAnimations: true, hideSelectors: ['.clock'], maskSelectors: [] });
  assert.match(css, /animation-duration: 0s !important/);
  assert.match(css, /transition-duration: 0s !important/);
  assert.match(css, /caret-color: transparent/);
  assert.match(css, /\.clock\s*\{\s*visibility: hidden/);
  assert.equal(stabilizationCss({ disableAnimations: false, hideSelectors: [], maskSelectors: [] }), null);
});

test('stabilizationCss paints masked selectors over instead of hiding them', () => {
  const css = stabilizationCss({ disableAnimations: false, hideSelectors: [], maskSelectors: ['.avatar'] });
  assert.match(css, /\.avatar\s*\{[^}]*background: #ff00ff/);
});

test('screenshotMaskLocators masks configured selectors and secret-filled fields', () => {
  const seen = [];
  const page = { locator(selector) { seen.push(selector); return { selector }; } };
  const masks = screenshotMaskLocators(
    page,
    { maskSelectors: ['.avatar', '#password'] },
    { steps: [
      { action: 'fill', selector: '#password', value: 'hunter2', secret: true },
      { action: 'fill', selector: '#search', value: 'public' },
    ] },
  );

  assert.deepEqual(seen, ['.avatar', '#password']);
  assert.deepEqual(masks, [{ selector: '.avatar' }, { selector: '#password' }]);
});

test('attachRuntimeCollectors separates page errors, console errors and failed requests', () => {
  const page = fakePage();
  const runtime = attachRuntimeCollectors(page);
  page.handlers.get('pageerror')(new Error('boom'));
  page.handlers.get('console')({ type: () => 'error', text: () => 'bad thing' });
  page.handlers.get('console')({ type: () => 'log', text: () => 'noise' });
  page.handlers.get('requestfailed')({ method: () => 'GET', url: () => 'http://127.0.0.1:1/x', failure: () => ({ errorText: 'net::ERR' }) });
  page.handlers.get('response')({ status: () => 500, request: () => ({ method: () => 'GET' }), url: () => 'http://127.0.0.1:1/api' });
  page.handlers.get('response')({ status: () => 200, request: () => ({ method: () => 'GET' }), url: () => 'http://127.0.0.1:1/ok' });

  assert.deepEqual(runtime.pageErrors, ['Error: boom']);
  assert.deepEqual(runtime.consoleErrors, ['bad thing']);
  assert.deepEqual(runtime.failedRequests, ['GET /x net::ERR', 'GET /api 500']);
});

test('attachRuntimeCollectors strips the preview origin so base and head are comparable', () => {
  const page = fakePage();
  const runtime = attachRuntimeCollectors(page, 'http://127.0.0.1:4173');
  page.handlers.get('pageerror')(new Error('failed to load http://127.0.0.1:4173/app.js'));
  assert.deepEqual(runtime.pageErrors, ['Error: failed to load /app.js']);
});

test('attachRuntimeCollectors tracks the latest main-document response status', () => {
  const page = fakePage();
  const runtime = attachRuntimeCollectors(page, 'http://127.0.0.1:4173');
  const response = (status, frame = 'main') => ({
    status: () => status,
    request: () => ({ method: () => 'GET', isNavigationRequest: () => true, frame: () => frame }),
    url: () => `http://127.0.0.1:4173/${status}`,
  });
  page.handlers.get('response')(response(200));
  page.handlers.get('response')(response(404));
  page.handlers.get('response')(response(500, 'subframe'));
  assert.equal(runtime.status, 404);
});

test('assertPreviewOrigin rejects a final URL outside the assigned origin', () => {
  assert.throws(
    () => assertPreviewOrigin({ url: () => 'https://evil.test/x' }, 'http://127.0.0.1:4173'),
    /left the preview origin/,
  );
});

test('replaySteps performs every safe action against the preview origin', async () => {
  const page = fakePage();
  const runtime = attachRuntimeCollectors(page);
  await replaySteps(page, [
    { action: 'click', selector: '#open', timeoutMs: 1 },
    { action: 'fill', selector: '#q', value: 'hi', timeoutMs: 1 },
    { action: 'press', selector: '#q', key: 'Enter', timeoutMs: 1 },
    { action: 'select', selector: '#s', value: 'b', timeoutMs: 1 },
    { action: 'waitForSelector', selector: '#done', timeoutMs: 1 },
    { action: 'goto', path: '/next', timeoutMs: 1 },
  ], 'http://127.0.0.1:4173', runtime);

  assert.deepEqual(page.calls.filter(([kind]) => kind !== 'locator'), [
    ['click', '#open'],
    ['fill', '#q', 'hi'],
    ['press', '#q', 'Enter'],
    ['select', '#s', 'b'],
    ['waitFor', '#done', 'attached'],
    ['goto', 'http://127.0.0.1:4173/next'],
  ]);
});

test('replaySteps records assertion failures as evidence and keeps going', async () => {
  const page = fakePage({ invisible: '#ok', text: { h1: 'Basket' } });
  const runtime = attachRuntimeCollectors(page);
  await replaySteps(page, [
    { action: 'assertVisible', selector: '#ok', timeoutMs: 1 },
    { action: 'assertText', selector: 'h1', equals: 'Cart', timeoutMs: 1 },
    { action: 'assertText', selector: 'h1', contains: 'ask', timeoutMs: 1 },
    { action: 'click', selector: '#after', timeoutMs: 1 },
  ], 'http://127.0.0.1:4173', runtime);

  assert.deepEqual(runtime.assertionFailures, [
    'assertVisible #ok: not visible',
    'assertText h1: expected "Cart", got "Basket"',
  ]);
  assert.ok(page.calls.some(([kind, selector]) => kind === 'click' && selector === '#after'));
});

test('replaySteps throws a labelled error when a non-assertion action fails', async () => {
  const page = fakePage({ waitFails: '#never' });
  const runtime = attachRuntimeCollectors(page);
  await assert.rejects(
    () => replaySteps(page, [{ action: 'waitForSelector', selector: '#never', timeoutMs: 1 }], 'http://127.0.0.1:4173', runtime),
    /step 1 \(waitForSelector #never\) failed: timeout/,
  );
});

test('replaySteps rejects a goto that would leave the preview origin', async () => {
  const page = fakePage();
  await assert.rejects(
    () => replaySteps(page, [{ action: 'goto', path: '//evil.test/x', timeoutMs: 1 }], 'http://127.0.0.1:4173', attachRuntimeCollectors(page)),
    /must stay on the preview origin/,
  );
});

test('collectSemantic gathers title, selected text and an aria snapshot', async () => {
  const page = fakePage({ text: { h1: '  Cart   (2) ' } });
  const semantic = await collectSemantic(page, { title: true, textSelectors: ['h1'], aria: 'main' });
  assert.deepEqual(semantic, { title: 'Title', text: { h1: 'Cart (2)' }, aria: { main: '- heading "main"' } });
});

test('collectSemantic degrades honestly when ariaSnapshot is unavailable', async () => {
  const page = fakePage();
  page.locator = (selector) => ({ async textContent() { return 'x'; } , async ariaSnapshot() { throw new Error('not supported'); } });
  const semantic = await collectSemantic(page, { title: false, textSelectors: [], aria: 'main' });
  assert.deepEqual(semantic, { aria: { main: '<unavailable: not supported>' } });
});

test('summarizeError collapses multi-line driver output into one report-safe line', () => {
  const message = 'locator.waitFor: Timeout 1500ms exceeded.\nCall log:\n  - waiting for locator(\'#x\')\n';
  assert.equal(
    summarizeError(message),
    "locator.waitFor: Timeout 1500ms exceeded. Call log: - waiting for locator('#x')",
  );
  assert.equal(summarizeError('x'.repeat(400)).length, 300);
  assert.match(summarizeError('x'.repeat(400)), /\.\.\.$/);
});
