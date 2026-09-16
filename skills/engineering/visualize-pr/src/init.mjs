// Starter config generation for `--init`. Detection is pure: it reads through a
// small `files` adapter so tests never touch the filesystem.

const PAGE_DIRECTORIES = ['src/pages', 'pages', 'app', 'src/app'];
const SCENARIO_NOTE = 'add scenarios for the pages this repo changes most';
const PORT_NOTE = 'The server must read PORT from the environment, otherwise base and head cannot run side by side.';

const LOCKFILE_INSTALL = [
  ['package-lock.json', 'npm ci'],
  ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
  ['yarn.lock', 'yarn install --immutable'],
  ['bun.lockb', 'bun install'],
  ['bun.lock', 'bun install'],
];

// Ordered so the most specific framework wins when several are present.
const FRAMEWORKS = [
  ['next', ['next'], 'npx next dev -p {port} -H 127.0.0.1'],
  ['nuxt', ['nuxt'], 'npx nuxt dev --host 127.0.0.1 --port {port}'],
  ['astro', ['astro'], 'npx astro dev --host 127.0.0.1 --port {port}'],
  ['angular', ['@angular/cli'], 'npx ng serve --host 127.0.0.1 --port {port}'],
  ['react-scripts', ['react-scripts'], 'PORT={port} HOST=127.0.0.1 npx react-scripts start'],
  ['sveltekit', ['@sveltejs/kit'], 'npx vite dev --host 127.0.0.1 --port {port} --strictPort'],
  ['remix', ['remix', '@remix-run/dev'], 'npx remix vite:dev --host 127.0.0.1 --port {port}'],
  ['gatsby', ['gatsby'], 'npx gatsby develop -H 127.0.0.1 -p {port}'],
  ['vite', ['vite'], 'npx vite --host 127.0.0.1 --port {port} --strictPort'],
];

const NODE_SERVER_PACKAGES = ['express', 'fastify', 'koa', 'hono'];

function installCommandFor(files) {
  for (const [lockfile, command] of LOCKFILE_INSTALL) {
    if (files.exists(lockfile)) return command;
  }
  return 'npm install';
}

function parsePackageJson(files, notes) {
  const raw = files.read('package.json');
  if (typeof raw !== 'string') {
    notes.push('package.json could not be read, so detection skipped it.');
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    notes.push('package.json is not valid JSON, so detection skipped it.');
    return null;
  }
}

function detectNode(files, notes) {
  if (!files.exists('package.json')) return null;
  const manifest = parsePackageJson(files, notes);
  if (!manifest) return null;

  const dependencies = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  };
  const names = Object.keys(dependencies);
  const has = (name) => Object.hasOwn(dependencies, name);
  const installCommand = installCommandFor(files);

  for (const [kind, packages, startCommand] of FRAMEWORKS) {
    const matched = packages.some(has)
      || (kind === 'vite' && names.some((name) => name.startsWith('@vitejs/')));
    if (matched) return { kind, startCommand, installCommand };
  }

  const scripts = manifest.scripts ?? {};
  const scriptName = typeof scripts.dev === 'string' && scripts.dev.trim()
    ? 'dev'
    : (typeof scripts.start === 'string' && scripts.start.trim() ? 'start' : null);
  if (!scriptName) return null;

  if (NODE_SERVER_PACKAGES.some(has)) {
    notes.push(PORT_NOTE);
    return { kind: 'node-server', startCommand: `PORT={port} npm run ${scriptName}`, installCommand };
  }
  notes.push(`Check that "npm run ${scriptName}" serves on 127.0.0.1 and honours PORT.`);
  return { kind: 'node', startCommand: `PORT={port} npm run ${scriptName}`, installCommand };
}

function pythonInstall(files) {
  return files.exists('requirements.txt') ? 'python -m pip install -r requirements.txt' : null;
}

function mentions(files, relPath, needle) {
  const text = files.read(relPath);
  return typeof text === 'string' && text.toLowerCase().includes(needle);
}

function detectPython(files, notes) {
  if (files.exists('manage.py')) {
    return {
      kind: 'django',
      startCommand: 'python manage.py runserver 127.0.0.1:{port}',
      installCommand: pythonInstall(files),
    };
  }
  const sources = ['pyproject.toml', 'requirements.txt'].filter((name) => files.exists(name));
  if (sources.length === 0) return null;
  if (sources.some((name) => mentions(files, name, 'fastapi'))) {
    notes.push('Fix the uvicorn module path if your app is not exported as "app" from app.py.');
    return {
      kind: 'fastapi',
      startCommand: 'python -m uvicorn app:app --host 127.0.0.1 --port {port}',
      installCommand: pythonInstall(files),
    };
  }
  if (sources.some((name) => mentions(files, name, 'flask'))) {
    return {
      kind: 'flask',
      startCommand: 'flask run --host 127.0.0.1 --port {port}',
      installCommand: pythonInstall(files),
    };
  }
  return null;
}

function detectOther(files, notes) {
  if (files.exists('go.mod')) {
    notes.push('Go projects vary: adjust to how your server reads its port.');
    return { kind: 'go', startCommand: 'go run . --port {port}', installCommand: null };
  }
  if (files.exists('Gemfile') && mentions(files, 'Gemfile', 'rails')) {
    return {
      kind: 'rails',
      startCommand: 'bin/rails server -b 127.0.0.1 -p {port}',
      installCommand: 'bundle install',
    };
  }
  if (files.exists('artisan')) {
    return {
      kind: 'laravel',
      startCommand: 'php artisan serve --host=127.0.0.1 --port={port}',
      installCommand: 'composer install --no-interaction',
    };
  }
  if (files.exists('index.html')) {
    return {
      kind: 'static',
      startCommand: 'python3 -m http.server {port} --bind 127.0.0.1',
      installCommand: null,
    };
  }
  return null;
}

/**
 * Guess how this repository starts a dev server.
 * `files` is `{ exists(relPath) -> boolean, read(relPath) -> string|null }`.
 */
export function detectProject(files) {
  const notes = [];
  const match = detectNode(files, notes)
    ?? detectPython(files, notes)
    ?? detectOther(files, notes)
    ?? {
      kind: 'unknown',
      startCommand: 'echo "TODO: start your app on 127.0.0.1:{port}"',
      installCommand: null,
    };

  if (match.kind === 'unknown') {
    notes.push('No known project layout was found. Replace startCommand with the command that serves this repo on {port}.');
  }
  if (PAGE_DIRECTORIES.some((directory) => files.exists(directory))) {
    notes.push(SCENARIO_NOTE);
  }
  return { kind: match.kind, startCommand: match.startCommand, installCommand: match.installCommand, notes };
}

/** Turn a detection into a config object that normalizeConfig accepts. */
export function buildStarterConfig(detection) {
  return {
    ...(detection.installCommand ? { installCommand: detection.installCommand } : {}),
    startCommand: detection.startCommand,
    startupTimeoutMs: 60000,
    viewports: [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ],
    scenarios: [
      { id: 'home', name: 'Home', path: '/', viewports: ['desktop', 'mobile'] },
    ],
    impact: { rules: [], smokeScenarios: ['home'] },
  };
}

/** Serialize the starter config exactly as it should land on disk. */
export function renderStarterConfig(detection) {
  return `${JSON.stringify(buildStarterConfig(detection), null, 2)}\n`;
}
