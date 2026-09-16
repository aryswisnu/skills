// Rasterize an SVG string to a PNG buffer without a browser.
//
// Backend mode must stay Chromium-free and lightweight, so this uses
// @resvg/resvg-js (a Rust SVG renderer with prebuilt binaries for linux and
// macos) rather than Playwright or sharp. The dependency is imported lazily so
// a backend run that never embeds the diagram does not pay its load cost.

export async function rasterizeSvgToPng(svg, { scale = 2 } = {}) {
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, {
    background: '#ffffff',
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: true, defaultFontFamily: 'sans-serif' },
  });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}
