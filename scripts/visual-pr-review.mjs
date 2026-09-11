#!/usr/bin/env node

import { spawn, execFileSync, execSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

import { normalizeConfig, renderReport, safeArtifactName } from '../src/core.mjs';
import { buildStartCommand, createPixelDiff } from '../src/visual.mjs';

function usage() {
  return `Usage: visual-pr-review --base <ref> [--head <ref>] [options]

Options:
  --base <ref>       Base git revision, required
  --head <ref>       Head git revision, default: HEAD
  --config <path>    Config path, default: visual-review.json
  --output <path>    Artifact directory, default: visual-review-output
  --keep-worktrees   Preserve temporary worktrees for debugging
  --help             Show this help
`;
}

function parseArgs(argv) {
  const options = {
    head: 'HEAD',
    config: 'visual-review.json',
    output: 'visual-review-output',
    keepWorktrees: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') options.help = true;
    else if (arg === '--keep-worktrees') options.keepWorktrees = true;
    else if (['--base', '--head', '--config', '--output'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.help && !options.base) throw new Error('--base is required');
  return options;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function waitForReady(url, timeoutMs, processHandle) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`preview process exited early with code ${processHandle.exitCode}`);
    }
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`preview did not become ready at ${url}: ${lastError}`);
}

function startPreview(command, cwd, port, env) {
  const child = spawn(buildStartCommand(command, port), {
    cwd,
    env: {
      ...process.env,
      ...Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)])),
      PORT: String(port),
      VISUAL_REVIEW_PORT: String(port),
      BROWSER: 'none',
    },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const collect = (chunk) => {
    logs += chunk.toString();
    if (logs.length > 20000) logs = logs.slice(-20000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.getLogs = () => logs;
  return child;
}

async function stopPreview(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function captureRoute(browser, baseUrl, route, viewport, outputPath) {
  const page = await browser.newPage({ viewport });
  try {
    await page.goto(new URL(route.path, baseUrl).href, { waitUntil: 'networkidle' });
    if (route.waitForSelector) await page.waitForSelector(route.waitForSelector);
    if (route.waitForMs) await page.waitForTimeout(route.waitForMs);
    await page.screenshot({ path: outputPath, fullPage: route.fullPage });
  } finally {
    await page.close();
  }
}

async function createSideBySide(browser, beforeBuffer, afterBuffer, outputPath, labels) {
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  const width = before.width + after.width + 48;
  const height = Math.max(before.height, after.height) + 78;
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    const beforeUri = `data:image/png;base64,${beforeBuffer.toString('base64')}`;
    const afterUri = `data:image/png;base64,${afterBuffer.toString('base64')}`;
    await page.setContent(`<!doctype html><style>
      *{box-sizing:border-box}html,body{margin:0;background:#101216;color:#f5f7fa;font:600 16px system-ui,sans-serif}
      main{display:grid;grid-template-columns:${before.width}px ${after.width}px;gap:24px;padding:18px 12px 12px}
      section{min-width:0}header{height:36px;display:flex;align-items:center;padding:0 12px;background:#1d222b;border:1px solid #343b48;border-radius:8px 8px 0 0}
      img{display:block;width:100%;border:1px solid #343b48;border-top:0}
    </style><main>
      <section><header>${escapeHtml(labels.before)}</header><img src="${beforeUri}"></section>
      <section><header>${escapeHtml(labels.after)}</header><img src="${afterUri}"></section>
    </main>`);
    await page.screenshot({ path: outputPath });
  } finally {
    await page.close();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const invocationDir = process.cwd();
  const repoRoot = git(['rev-parse', '--show-toplevel'], invocationDir);
  const configPath = path.resolve(invocationDir, options.config);
  const outputDir = path.resolve(invocationDir, options.output);
  const config = normalizeConfig(JSON.parse(await readFile(configPath, 'utf8')));
  const baseSha = git(['rev-parse', options.base], repoRoot);
  const headSha = git(['rev-parse', options.head], repoRoot);
  const changedFiles = git(['diff', '--name-only', `${baseSha}...${headSha}`], repoRoot)
    .split('\n').filter(Boolean);

  await mkdir(outputDir, { recursive: true });
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'visual-pr-review-'));
  const baseDir = path.join(tempRoot, 'base');
  const headDir = path.join(tempRoot, 'head');
  const processes = [];
  let browser;

  try {
    git(['worktree', 'add', '--detach', baseDir, baseSha], repoRoot);
    git(['worktree', 'add', '--detach', headDir, headSha], repoRoot);

    if (config.installCommand) {
      console.log('Installing base revision dependencies...');
      execSync(config.installCommand, { cwd: baseDir, env: process.env, stdio: 'inherit' });
      console.log('Installing head revision dependencies...');
      execSync(config.installCommand, { cwd: headDir, env: process.env, stdio: 'inherit' });
    }

    const basePort = config.basePort;
    const headPort = config.basePort + 1;
    const baseProcess = startPreview(config.startCommand, baseDir, basePort, config.env);
    const headProcess = startPreview(config.startCommand, headDir, headPort, config.env);
    processes.push(baseProcess, headProcess);

    try {
      await Promise.all([
        waitForReady(`http://127.0.0.1:${basePort}${config.readyPath}`, config.startupTimeoutMs, baseProcess),
        waitForReady(`http://127.0.0.1:${headPort}${config.readyPath}`, config.startupTimeoutMs, headProcess),
      ]);
    } catch (error) {
      throw new Error(`${error.message}\n\nBase logs:\n${baseProcess.getLogs()}\n\nHead logs:\n${headProcess.getLogs()}`);
    }

    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const route of config.routes) {
      const slug = safeArtifactName(route.name);
      const beforeName = `${slug}-before.png`;
      const afterName = `${slug}-after.png`;
      const sideBySideName = `${slug}-side-by-side.png`;
      const diffName = `${slug}-diff.png`;
      const beforePath = path.join(outputDir, beforeName);
      const afterPath = path.join(outputDir, afterName);
      const sideBySidePath = path.join(outputDir, sideBySideName);
      const diffPath = path.join(outputDir, diffName);

      console.log(`Capturing ${route.name}...`);
      await captureRoute(browser, `http://127.0.0.1:${basePort}`, route, config.viewport, beforePath);
      await captureRoute(browser, `http://127.0.0.1:${headPort}`, route, config.viewport, afterPath);
      const beforeBuffer = await readFile(beforePath);
      const afterBuffer = await readFile(afterPath);
      const diff = createPixelDiff(beforeBuffer, afterBuffer, config.pixelThreshold);
      await writeFile(diffPath, diff.buffer);
      await createSideBySide(browser, beforeBuffer, afterBuffer, sideBySidePath, {
        before: `BEFORE · ${options.base} · ${baseSha.slice(0, 7)}`,
        after: `AFTER · ${options.head} · ${headSha.slice(0, 7)}`,
      });
      results.push({
        name: route.name,
        path: route.path,
        before: beforeName,
        after: afterName,
        sideBySide: sideBySideName,
        diff: diffName,
        changedPixels: diff.changedPixels,
        totalPixels: diff.totalPixels,
        changePercent: diff.changePercent,
      });
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      base: { ref: options.base, sha: baseSha },
      head: { ref: options.head, sha: headSha },
      viewport: config.viewport,
      changedFiles,
      results,
    };
    await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(outputDir, 'report.md'), renderReport({
      baseRef: options.base,
      baseSha: baseSha.slice(0, 7),
      headRef: options.head,
      headSha: headSha.slice(0, 7),
      changedFiles,
      results,
    }));
    console.log(`Visual review written to ${outputDir}`);
  } finally {
    if (browser) await browser.close();
    await Promise.all(processes.map(stopPreview));
    if (!options.keepWorktrees) {
      for (const dir of [baseDir, headDir]) {
        try { git(['worktree', 'remove', '--force', dir], repoRoot); } catch {}
      }
      await rm(tempRoot, { recursive: true, force: true });
    } else {
      console.log(`Temporary worktrees preserved at ${tempRoot}`);
    }
  }
}

await main();
