import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

import { rasterizeSvgToPng } from '../src/svg-to-png.mjs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80" width="200" height="80" role="img" aria-label="test">
  <rect width="200" height="80" fill="#ffffff"/>
  <text x="10" y="40" font-family="sans-serif" font-size="18" fill="#2d3142">Change map</text>
</svg>`;

test('rasterizeSvgToPng returns a valid PNG buffer with rendered text', async () => {
  const png = await rasterizeSvgToPng(svg);
  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR width/height are scaled by the default zoom factor of 2.
  assert.equal(png.readUInt32BE(16), 400);
  assert.equal(png.readUInt32BE(20), 160);
});

test('rasterizeSvgToPng actually renders the text glyphs', async () => {
  const png = await rasterizeSvgToPng(svg);
  const decoded = PNG.sync.read(png);
  let ink = 0;
  for (let i = 0; i < decoded.data.length; i += 4) {
    const [r, g, b] = [decoded.data[i], decoded.data[i + 1], decoded.data[i + 2]];
    // Dark text on a white background.
    if (r < 80 && g < 80 && b < 100) ink += 1;
  }
  // A font-less render would skip the text and leave the canvas blank.
  assert.ok(ink > 50, `expected rendered dark text pixels, got ${ink}`);
});
