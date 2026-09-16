import { resolveLocalRoute } from './visual.mjs';

const navigationViolations = new WeakMap();

export async function installLocalNavigationGuard(page, previewOrigin) {
  const expectedOrigin = new URL(previewOrigin).origin;
  navigationViolations.set(page, null);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  const { frameTree } = await cdp.send('Page.getFrameTree');
  let mainFrameId = frameTree.frame.id;
  cdp.on('Page.frameNavigated', (event) => {
    if (!event.frame.parentId) mainFrameId = event.frame.id;
  });
  await cdp.send('Fetch.enable', { patterns: [{ requestStage: 'Request' }] });
  cdp.on('Fetch.requestPaused', async (event) => {
    if (event.resourceType === 'Document' && event.frameId === mainFrameId) {
      let destination;
      try { destination = new URL(event.request.url); } catch { destination = null; }
      if (destination && destination.origin !== expectedOrigin) {
        navigationViolations.set(page, `main-frame navigation left the preview origin: ${event.request.url}`);
        await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
        return;
      }
    }
    await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
  });
}

export function assertPreviewOrigin(page, previewOrigin) {
  const violation = navigationViolations.get(page);
  if (violation) throw new Error(violation);
  const current = new URL(page.url());
  if (current.origin !== new URL(previewOrigin).origin) {
    throw new Error(`main-frame navigation left the preview origin: ${current.href}`);
  }
}

/**
 * CSS injected into every capture so that base and head differ for code reasons, not for
 * animation-frame or caret-blink reasons. Returns null when nothing needs to be injected.
 */
export function stabilizationCss(capture) {
  const blocks = [];
  if (capture.disableAnimations) {
    blocks.push([
      '*, *::before, *::after {',
      '  animation-duration: 0s !important;',
      '  animation-delay: 0s !important;',
      '  animation-iteration-count: 1 !important;',
      '  transition-duration: 0s !important;',
      '  transition-delay: 0s !important;',
      '  scroll-behavior: auto !important;',
      '  caret-color: transparent !important;',
      '}',
    ].join('\n'));
  }
  for (const selector of capture.hideSelectors) {
    blocks.push(`${selector} { visibility: hidden !important; }`);
  }
  for (const selector of capture.maskSelectors) {
    blocks.push(`${selector} { background: #ff00ff !important; color: transparent !important; box-shadow: none !important; }`);
  }
  return blocks.length ? blocks.join('\n') : null;
}

/**
 * Playwright screenshot masks reliably cover replaced content such as images. Secret-filled
 * fields are always added even when the caller forgot to list them in capture.maskSelectors.
 */
export function screenshotMaskLocators(page, capture, scenario) {
  const selectors = new Set(capture.maskSelectors);
  for (const step of scenario.steps) {
    if (step.action === 'fill' && step.secret) selectors.add(step.selector);
  }
  return [...selectors].map((selector) => page.locator(selector));
}

/**
 * Runtime evidence for one revision. Origin prefixes are stripped so that base and head entries
 * are comparable despite running on different ports.
 */
export function attachRuntimeCollectors(page, previewOrigin = null) {
  const runtime = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    assertionFailures: [],
    status: null,
  };
  const strip = (value) => (previewOrigin ? String(value).split(previewOrigin).join('') : String(value));
  const shortUrl = (url) => {
    try { return new URL(url).pathname; } catch { return strip(url); }
  };

  page.on('pageerror', (error) => {
    runtime.pageErrors.push(strip(`${error.name ?? 'Error'}: ${error.message}`));
  });
  page.on('console', (message) => {
    if (message.type() === 'error') runtime.consoleErrors.push(strip(message.text()));
  });
  page.on('requestfailed', (request) => {
    runtime.failedRequests.push(`${request.method()} ${shortUrl(request.url())} ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    const request = response.request();
    if (request.isNavigationRequest?.() && request.frame?.() === page.mainFrame()) {
      runtime.status = response.status();
    }
    if (response.status() >= 400) {
      runtime.failedRequests.push(`${request.method()} ${shortUrl(response.url())} ${response.status()}`);
    }
  });
  return runtime;
}

function describeStep(step) {
  return step.action === 'goto' ? `goto ${step.path}` : `${step.action} ${step.selector}`;
}

/**
 * Replay the validated action list. Assertion failures are recorded as evidence and the run
 * continues; any other action failure is a capture failure and stops this scenario.
 */
export async function replaySteps(page, steps, baseUrl, runtime) {
  for (const [index, step] of steps.entries()) {
    const label = `step ${index + 1} (${describeStep(step)})`;
    if (step.action === 'assertVisible' || step.action === 'assertText') {
      await runAssertion(page, step, runtime);
      continue;
    }
    try {
      await runAction(page, step, baseUrl);
      assertPreviewOrigin(page, baseUrl);
    } catch (error) {
      if (/must stay on the preview origin/.test(error.message)) throw error;
      throw new Error(`${label} failed: ${error.message}`);
    }
  }
}

async function runAction(page, step, baseUrl) {
  const options = { timeout: step.timeoutMs };
  switch (step.action) {
    case 'goto':
      await page.goto(resolveLocalRoute(baseUrl, step.path), { waitUntil: 'load', ...options });
      return;
    case 'click':
      await page.locator(step.selector).click(options);
      return;
    case 'fill':
      await page.locator(step.selector).fill(step.value, options);
      return;
    case 'press':
      await page.locator(step.selector).press(step.key, options);
      return;
    case 'select':
      await page.locator(step.selector).selectOption(step.value, options);
      return;
    case 'waitForSelector':
      await page.locator(step.selector).waitFor({ state: 'attached', ...options });
      return;
    default:
      throw new Error(`unsupported action: ${step.action}`);
  }
}

async function runAssertion(page, step, runtime) {
  try {
    const locator = page.locator(step.selector);
    if (step.action === 'assertVisible') {
      if (!(await locator.isVisible({ timeout: step.timeoutMs }))) {
        runtime.assertionFailures.push(`assertVisible ${step.selector}: not visible`);
      }
      return;
    }
    const actual = normalizeText(await locator.textContent({ timeout: step.timeoutMs }));
    if (typeof step.equals === 'string' && actual !== step.equals) {
      runtime.assertionFailures.push(`assertText ${step.selector}: expected "${step.equals}", got "${actual}"`);
    }
    if (typeof step.contains === 'string' && !actual.includes(step.contains)) {
      runtime.assertionFailures.push(`assertText ${step.selector}: expected to contain "${step.contains}", got "${actual}"`);
    }
  } catch (error) {
    runtime.assertionFailures.push(`${step.action} ${step.selector}: ${error.message}`);
  }
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Non-pixel evidence: a title change or a text change is visible to review even at zero pixels. */
export async function collectSemantic(page, semantic) {
  const result = {};
  if (semantic.title) result.title = normalizeText(await page.title());
  if (semantic.textSelectors.length > 0) {
    result.text = {};
    for (const selector of semantic.textSelectors) {
      try {
        result.text[selector] = normalizeText(await page.locator(selector).textContent());
      } catch (error) {
        result.text[selector] = `<unavailable: ${error.message}>`;
      }
    }
  }
  if (semantic.aria) {
    try {
      result.aria = { [semantic.aria]: await page.locator(semantic.aria).ariaSnapshot() };
    } catch (error) {
      result.aria = { [semantic.aria]: `<unavailable: ${error.message}>` };
    }
  }
  return result;
}

/** Driver errors are multi-line; reports and JSON summaries need one bounded line. */
export function summarizeError(message) {
  const single = String(message).replace(/\s+/g, ' ').trim();
  return single.length > 300 ? `${single.slice(0, 297)}...` : single;
}
