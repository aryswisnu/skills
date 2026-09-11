import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export function buildStartCommand(template, port) {
  return template.replaceAll('{port}', String(port));
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
