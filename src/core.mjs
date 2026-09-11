import path from 'node:path';

export function safeArtifactName(value) {
  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'capture';
}

export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('config must be a JSON object');
  }
  if (typeof raw.startCommand !== 'string' || !raw.startCommand.trim()) {
    throw new Error('startCommand is required');
  }
  if (!Array.isArray(raw.routes) || raw.routes.length === 0) {
    throw new Error('routes must contain at least one route');
  }

  const viewport = raw.viewport ?? { width: 1440, height: 900 };
  if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)) {
    throw new Error('viewport width and height must be integers');
  }

  const routes = raw.routes.map((route, index) => {
    if (!route || typeof route.path !== 'string') {
      throw new Error(`routes[${index}].path is required`);
    }
    return {
      name: route.name ?? route.path,
      path: route.path,
      fullPage: route.fullPage ?? false,
      waitForMs: route.waitForMs ?? 250,
      waitForSelector: route.waitForSelector ?? null,
    };
  });
  const artifactNames = routes.map((route) => safeArtifactName(route.name));
  if (new Set(artifactNames).size !== artifactNames.length) {
    throw new Error('route names must produce unique artifact names');
  }

  return {
    installCommand: raw.installCommand ?? null,
    startCommand: raw.startCommand,
    readyPath: raw.readyPath ?? '/',
    basePort: raw.basePort ?? 4173,
    startupTimeoutMs: raw.startupTimeoutMs ?? 120000,
    pixelThreshold: raw.pixelThreshold ?? 0.1,
    viewport,
    env: raw.env ?? {},
    routes,
  };
}

export function renderReport({
  baseRef,
  baseSha,
  headRef,
  headSha,
  changedFiles,
  diffStat,
  results,
}) {
  const lines = [
    '# Visual PR Review',
    '',
    `**Comparison:** ${baseRef} (\`${baseSha}\`) vs ${headRef} (\`${headSha}\`)`,
    '',
    '## Changed files',
    '',
    ...(changedFiles.length ? changedFiles.map((file) => `- \`${file}\``) : ['- None']),
    '',
    '## Code changes',
    '',
    '```text',
    diffStat || 'No diff stat available.',
    '```',
    '',
    '[Full code diff](changes.patch)',
    '',
    '## Visual evidence',
    '',
  ];

  for (const result of results) {
    lines.push(
      `### ${result.name}`,
      '',
      `Route: \`${result.path}\``,
      '',
      `Changed pixels: **${result.changePercent.toFixed(2)}%** (${result.changedPixels.toLocaleString()} of ${result.totalPixels.toLocaleString()})`,
      '',
      `![${result.name} side-by-side](${path.basename(result.sideBySide)})`,
      '',
      `<details><summary>Individual captures and pixel diff</summary>`,
      '',
      `**Before**`,
      '',
      `![${result.name} before](${path.basename(result.before)})`,
      '',
      `**After**`,
      '',
      `![${result.name} after](${path.basename(result.after)})`,
      '',
      `**Pixel diff**`,
      '',
      `![${result.name} pixel diff](${path.basename(result.diff)})`,
      '',
      '</details>',
      '',
    );
  }

  lines.push(
    '## Review boundary',
    '',
    'These images show rendered differences under the configured route, viewport, and local data. They do not prove functional correctness, accessibility, security, or complete test coverage.',
    '',
  );

  return lines.join('\n');
}
