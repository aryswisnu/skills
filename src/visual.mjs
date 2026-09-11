import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export function buildStartCommand(template, port) {
  return template.replaceAll('{port}', String(port));
}

export function startCommandForPlatform(command, platform = process.platform) {
  return platform === 'win32' ? command : `exec ${command}`;
}

export function preserveGitOutput(output, trim = true) {
  return trim ? output.trim() : output;
}

export function processTreeSpawnOptions(platform = process.platform) {
  return { detached: platform !== 'win32' };
}

export function processTreeTarget(pid, platform = process.platform) {
  return platform === 'win32' ? pid : -pid;
}

export function resolveLocalRoute(baseUrl, routePath) {
  const base = new URL(baseUrl);
  const resolved = new URL(routePath, base);
  if (resolved.origin !== base.origin) {
    throw new Error(`route must stay on the preview origin: ${routePath}`);
  }
  return resolved.href;
}

export function browserLaunchOptions(env = process.env) {
  return env.VISUAL_REVIEW_BROWSER_PATH
    ? { headless: true, executablePath: env.VISUAL_REVIEW_BROWSER_PATH }
    : { headless: true };
}

export function createPixelDiff(beforeBuffer, afterBuffer, threshold = 0.1) {
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error(
      `screenshot dimensions differ: ${before.width}x${before.height} vs ${after.width}x${after.height}`,
    );
  }

  const diff = new PNG({ width: before.width, height: before.height });
  const changedPixels = pixelmatch(
    before.data,
    after.data,
    diff.data,
    before.width,
    before.height,
    { threshold },
  );
  const totalPixels = before.width * before.height;
  return {
    buffer: PNG.sync.write(diff),
    changedPixels,
    totalPixels,
    changePercent: totalPixels ? (changedPixels / totalPixels) * 100 : 0,
  };
}
