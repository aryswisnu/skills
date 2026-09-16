// Dependency bootstrap. Plugin installers copy the skill's files but do not run
// npm, so the first run has no node_modules and no browser. `--setup` installs
// both from the skill's own folder.

export function setupPlan({ hasNodeModules = false, browser = true } = {}) {
  const steps = [];
  if (!hasNodeModules) {
    steps.push({ label: 'npm dependencies', command: 'npm', args: ['install', '--no-audit', '--no-fund'] });
  }
  if (browser) {
    // Idempotent: playwright reports an already-installed browser and exits 0.
    steps.push({ label: 'Chromium browser', command: 'npx', args: ['playwright', 'install', 'chromium'] });
  }
  return steps;
}

export function setupSummary(steps, { hasNodeModules = false, browser = true } = {}) {
  if (steps.length > 0) return null;
  if (hasNodeModules && !browser) return 'npm dependencies already installed. Chromium skipped (--backend).';
  return 'Nothing to install.';
}

// The CLI is run as `node scripts/visualize-pr.mjs`, which ignores package.json
// "engines", so an old Node fails deep in a stack trace instead of up front.
export function unsupportedNodeVersion(version, minimum = 20) {
  const major = Number.parseInt(String(version).replace(/^v/, '').split('.')[0], 10);
  if (!Number.isFinite(major) || major >= minimum) return null;
  return `visualize-pr needs Node ${minimum} or newer, but this is Node ${version}. Switch with "nvm use ${minimum}" (or install Node ${minimum}+) and run again.`;
}
