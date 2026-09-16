function sameOrigin(left, right) {
  return new URL(left).origin === new URL(right).origin;
}

export async function waitForReady(url, timeoutMs, processHandle) {
  const expectedOrigin = new URL(url).origin;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`preview process exited early with code ${processHandle.exitCode}`);
    }
    try {
      let current = url;
      let response;
      for (let redirects = 0; redirects <= 10; redirects += 1) {
        response = await fetch(current, {
          redirect: 'manual',
          signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))),
        });
        if (!sameOrigin(response.url, expectedOrigin)) {
          throw new Error(`readiness response left the preview origin: ${response.url}`);
        }
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get('location');
        if (!location) break;
        const next = new URL(location, current);
        if (next.origin !== expectedOrigin) {
          throw new Error(`readiness redirect left the preview origin: ${next.href}`);
        }
        current = next.href;
        if (redirects === 10) throw new Error('readiness exceeded 10 redirects');
      }
      if (response.ok) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      if (/readiness (?:response|redirect) left the preview origin/.test(error.message)) throw error;
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`preview did not become ready at ${url}: ${lastError}`);
}
