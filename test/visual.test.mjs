import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

import { buildStartCommand, createPixelDiff } from '../src/visual.mjs';

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
