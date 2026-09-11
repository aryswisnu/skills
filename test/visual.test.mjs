import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

import {
  buildStartCommand,
  browserLaunchOptions,
  createPixelDiff,
  preserveGitOutput,
  processTreeSpawnOptions,
  processTreeTarget,
  startCommandForPlatform,
} from '../src/visual.mjs';

function pngWithPixels(colors) {
  const png = new PNG({ width: colors.length, height: 1 });
  colors.forEach(([r, g, b, a], index) => {
    const offset = index * 4;
    png.data[offset] = r;
    png.data[offset + 1] = g;
    png.data[offset + 2] = b;
    png.data[offset + 3] = a;
  });
  return PNG.sync.write(png);
}

test('buildStartCommand substitutes the selected port everywhere', () => {
  assert.equal(
    buildStartCommand('npm start -- --port {port}', 4174),
    'npm start -- --port 4174',
  );
});

test('browserLaunchOptions accepts an explicit browser executable', () => {
  assert.deepEqual(
    browserLaunchOptions({ VISUAL_REVIEW_BROWSER_PATH: '/custom/chrome' }),
    { headless: true, executablePath: '/custom/chrome' },
  );
  assert.deepEqual(browserLaunchOptions({}), { headless: true });
});

test('startCommandForPlatform replaces the POSIX shell process', () => {
  assert.equal(startCommandForPlatform('npm start', 'linux'), 'exec npm start');
  assert.equal(startCommandForPlatform('npm start', 'darwin'), 'exec npm start');
  assert.equal(startCommandForPlatform('npm start', 'win32'), 'npm start');
});

test('preserveGitOutput keeps patch-significant trailing bytes', () => {
  const patch = 'diff --git a/a b/a\n@@ -1 +1 @@\n-old\n+new\n \n';
  assert.equal(preserveGitOutput(patch, false), patch);
  assert.equal(preserveGitOutput(' main\n', true), 'main');
});

test('process tree helpers isolate and target POSIX process groups', () => {
  assert.deepEqual(processTreeSpawnOptions('linux'), { detached: true });
  assert.deepEqual(processTreeSpawnOptions('win32'), { detached: false });
  assert.equal(processTreeTarget(123, 'linux'), -123);
  assert.equal(processTreeTarget(123, 'win32'), 123);
});

test('createPixelDiff reports changed pixels', () => {
  const before = pngWithPixels([[255, 255, 255, 255], [0, 0, 0, 255]]);
  const after = pngWithPixels([[255, 255, 255, 255], [255, 0, 0, 255]]);
  const result = createPixelDiff(before, after, 0.1);

  assert.equal(result.changedPixels, 1);
  assert.equal(result.totalPixels, 2);
  assert.equal(result.changePercent, 50);
  const diff = PNG.sync.read(result.buffer);
  assert.equal(diff.width, 2);
  assert.equal(diff.height, 1);
});

test('createPixelDiff rejects mismatched screenshot dimensions', () => {
  const onePixel = pngWithPixels([[255, 255, 255, 255]]);
  const twoPixels = pngWithPixels([[255, 255, 255, 255], [0, 0, 0, 255]]);
  assert.throws(() => createPixelDiff(onePixel, twoPixels, 0.1), /dimensions differ/);
});
