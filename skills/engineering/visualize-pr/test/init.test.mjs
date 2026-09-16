import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStarterConfig, detectProject, renderStarterConfig } from '../src/init.mjs';
import { normalizeConfig } from '../src/config.mjs';

/** Build the file adapter detectProject expects from a plain map of contents. */
function filesFrom(map) {
  return {
    exists: (relPath) => Object.hasOwn(map, relPath),
    read: (relPath) => (Object.hasOwn(map, relPath) ? map[relPath] : null),
  };
}

function pkg(contents) {
  return JSON.stringify(contents);
}

test('detectProject recognizes Next.js', () => {
  const detection = detectProject(filesFrom({
    'package.json': pkg({ dependencies: { next: '14.0.0', react: '18.0.0' } }),
    'package-lock.json': '{}',
  }));
  assert.equal(detection.kind, 'next');
  assert.equal(detection.startCommand, 'npx next dev -p {port} -H 127.0.0.1');
  assert.equal(detection.installCommand, 'npm ci');
});

test('detectProject recognizes Vite through devDependencies', () => {
  const detection = detectProject(filesFrom({
    'package.json': pkg({ devDependencies: { vite: '5.0.0' } }),
  }));
  assert.equal(detection.kind, 'vite');
  assert.equal(detection.startCommand, 'npx vite --host 127.0.0.1 --port {port} --strictPort');
  assert.equal(detection.installCommand, 'npm install');
});

test('detectProject recognizes a scoped Vite plugin as Vite', () => {
  const detection = detectProject(filesFrom({
    'package.json': pkg({ devDependencies: { '@vitejs/plugin-react': '4.0.0' } }),
  }));
  assert.equal(detection.kind, 'vite');
});

test('detectProject recognizes Astro, Nuxt, Angular, CRA, SvelteKit, Remix and Gatsby', () => {
  const cases = [
    ['astro', { astro: '4.0.0' }, 'npx astro dev --host 127.0.0.1 --port {port}'],
    ['nuxt', { nuxt: '3.0.0' }, 'npx nuxt dev --host 127.0.0.1 --port {port}'],
    ['angular', { '@angular/cli': '17.0.0' }, 'npx ng serve --host 127.0.0.1 --port {port}'],
    ['react-scripts', { 'react-scripts': '5.0.1' }, 'PORT={port} HOST=127.0.0.1 npx react-scripts start'],
    ['sveltekit', { '@sveltejs/kit': '2.0.0' }, 'npx vite dev --host 127.0.0.1 --port {port} --strictPort'],
    ['remix', { '@remix-run/dev': '2.0.0' }, 'npx remix vite:dev --host 127.0.0.1 --port {port}'],
    ['gatsby', { gatsby: '5.0.0' }, 'npx gatsby develop -H 127.0.0.1 -p {port}'],
  ];
  for (const [kind, dependencies, startCommand] of cases) {
    const detection = detectProject(filesFrom({ 'package.json': pkg({ dependencies }) }));
    assert.equal(detection.kind, kind, `expected ${kind}`);
    assert.equal(detection.startCommand, startCommand);
  }
});

test('detectProject prefers the framework over a plain dev script', () => {
  const detection = detectProject(filesFrom({
    'package.json': pkg({ devDependencies: { vite: '5.0.0' }, scripts: { dev: 'vite' } }),
  }));
  assert.equal(detection.kind, 'vite');
  assert.match(detection.startCommand, /npx vite/);
});

test('detectProject maps an Express server to its own dev script and warns about PORT', () => {
  const detection = detectProject(filesFrom({
    'package.json': pkg({ dependencies: { express: '4.18.0' }, scripts: { dev: 'node server.js' } }),
  }));
  assert.equal(detection.kind, 'node-server');
  assert.equal(detection.startCommand, 'PORT={port} npm run dev');
  assert.ok(detection.notes.some((note) => /PORT/.test(note)));
});

test('detectProject uses the start script when an Express project has no dev script', () => {
  const detection = detectProject(filesFrom({
    'package.json': pkg({ dependencies: { fastify: '4.0.0' }, scripts: { start: 'node index.js' } }),
  }));
  assert.equal(detection.kind, 'node-server');
  assert.equal(detection.startCommand, 'PORT={port} npm run start');
});

test('detectProject falls back to scripts.dev, then scripts.start', () => {
  const dev = detectProject(filesFrom({
    'package.json': pkg({ scripts: { dev: 'node build.js', start: 'node index.js' } }),
  }));
  assert.equal(dev.kind, 'node');
  assert.equal(dev.startCommand, 'PORT={port} npm run dev');
  assert.ok(dev.notes.length > 0);

  const start = detectProject(filesFrom({
    'package.json': pkg({ scripts: { start: 'node index.js' } }),
  }));
  assert.equal(start.kind, 'node');
  assert.equal(start.startCommand, 'PORT={port} npm run start');
});

test('detectProject picks the install command from the lockfile', () => {
  const lockfiles = [
    ['package-lock.json', 'npm ci'],
    ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
    ['yarn.lock', 'yarn install --immutable'],
    ['bun.lockb', 'bun install'],
    ['bun.lock', 'bun install'],
  ];
  for (const [lockfile, installCommand] of lockfiles) {
    const detection = detectProject(filesFrom({
      'package.json': pkg({ devDependencies: { vite: '5.0.0' } }),
      [lockfile]: '',
    }));
    assert.equal(detection.installCommand, installCommand, lockfile);
    assert.match(detection.startCommand, /^npx vite/, `${lockfile} still uses npx`);
  }
});

test('detectProject ignores an unreadable package.json and keeps looking', () => {
  const detection = detectProject(filesFrom({
    'package.json': '{ not json',
    'index.html': '<!doctype html>',
  }));
  assert.equal(detection.kind, 'static');
  assert.ok(detection.notes.some((note) => /package\.json/.test(note)));
});

test('detectProject recognizes Django', () => {
  const withRequirements = detectProject(filesFrom({
    'manage.py': '',
    'requirements.txt': 'django==5.0\n',
  }));
  assert.equal(withRequirements.kind, 'django');
  assert.equal(withRequirements.startCommand, 'python manage.py runserver 127.0.0.1:{port}');
  assert.equal(withRequirements.installCommand, 'python -m pip install -r requirements.txt');

  const withoutRequirements = detectProject(filesFrom({ 'manage.py': '' }));
  assert.equal(withoutRequirements.installCommand, null);
});

test('detectProject recognizes FastAPI and Flask', () => {
  const fastapi = detectProject(filesFrom({ 'pyproject.toml': '[project]\ndependencies = ["fastapi"]\n' }));
  assert.equal(fastapi.kind, 'fastapi');
  assert.equal(fastapi.startCommand, 'python -m uvicorn app:app --host 127.0.0.1 --port {port}');
  assert.ok(fastapi.notes.some((note) => /module path/i.test(note)));

  const flask = detectProject(filesFrom({ 'requirements.txt': 'Flask==3.0.0\n' }));
  assert.equal(flask.kind, 'flask');
  assert.equal(flask.startCommand, 'flask run --host 127.0.0.1 --port {port}');
  assert.equal(flask.installCommand, 'python -m pip install -r requirements.txt');
});

test('detectProject recognizes Go, Rails and Laravel', () => {
  const go = detectProject(filesFrom({ 'go.mod': 'module example.com/app\n' }));
  assert.equal(go.kind, 'go');
  assert.equal(go.startCommand, 'go run . --port {port}');
  assert.ok(go.notes.some((note) => /adjust to how your server reads its port/.test(note)));

  const rails = detectProject(filesFrom({ Gemfile: "gem 'rails', '~> 7.1'\n" }));
  assert.equal(rails.kind, 'rails');
  assert.equal(rails.installCommand, 'bundle install');
  assert.equal(rails.startCommand, 'bin/rails server -b 127.0.0.1 -p {port}');

  const laravel = detectProject(filesFrom({ artisan: '' }));
  assert.equal(laravel.kind, 'laravel');
  assert.equal(laravel.installCommand, 'composer install --no-interaction');
  assert.equal(laravel.startCommand, 'php artisan serve --host=127.0.0.1 --port={port}');
});

test('detectProject recognizes a static site', () => {
  const detection = detectProject(filesFrom({ 'index.html': '<!doctype html>' }));
  assert.equal(detection.kind, 'static');
  assert.equal(detection.installCommand, null);
  assert.equal(detection.startCommand, 'python3 -m http.server {port} --bind 127.0.0.1');
});

test('detectProject reports unknown when nothing matches', () => {
  const detection = detectProject(filesFrom({ 'README.md': '# hello\n' }));
  assert.equal(detection.kind, 'unknown');
  assert.equal(detection.installCommand, null);
  assert.equal(detection.startCommand, 'echo "TODO: start your app on 127.0.0.1:{port}"');
  assert.ok(detection.notes.length > 0);
});

test('detectProject suggests scenarios when a pages or app directory exists', () => {
  for (const directory of ['src/pages', 'pages', 'app', 'src/app']) {
    const detection = detectProject(filesFrom({
      'package.json': pkg({ devDependencies: { vite: '5.0.0' } }),
      [directory]: '',
    }));
    assert.ok(
      detection.notes.some((note) => /add scenarios for the pages this repo changes most/.test(note)),
      directory,
    );
  }
});

test('buildStarterConfig produces a config that normalizeConfig accepts', () => {
  const detection = detectProject(filesFrom({
    'package.json': pkg({ devDependencies: { vite: '5.0.0' } }),
    'package-lock.json': '{}',
  }));
  const starter = buildStarterConfig(detection);
  assert.equal(starter.installCommand, 'npm ci');
  assert.equal(starter.startupTimeoutMs, 60000);
  assert.deepEqual(starter.viewports, [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]);
  assert.deepEqual(starter.scenarios, [
    { id: 'home', name: 'Home', path: '/', viewports: ['desktop', 'mobile'] },
  ]);
  assert.deepEqual(starter.impact, { rules: [], smokeScenarios: ['home'] });

  const config = normalizeConfig(starter);
  assert.equal(config.startCommand, detection.startCommand);
  assert.deepEqual(config.scenarios.map((scenario) => scenario.id), ['home']);
});

test('buildStarterConfig omits installCommand when none was detected', () => {
  const starter = buildStarterConfig(detectProject(filesFrom({ 'index.html': '' })));
  assert.equal(Object.hasOwn(starter, 'installCommand'), false);
  assert.ok(normalizeConfig(starter));
});

test('buildStarterConfig output for an unknown project still validates', () => {
  const starter = buildStarterConfig(detectProject(filesFrom({})));
  assert.ok(normalizeConfig(starter));
});

test('renderStarterConfig writes indented JSON with a trailing newline and no comments', () => {
  const text = renderStarterConfig(detectProject(filesFrom({
    'package.json': pkg({ devDependencies: { vite: '5.0.0' } }),
  })));
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.startsWith('{\n  "'));
  assert.equal(text.includes('//'), false);
  const parsed = JSON.parse(text);
  assert.match(parsed.startCommand, /npx vite/);
  assert.ok(normalizeConfig(parsed));
});
