#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseArgs, usage } from '../src/cli-args.mjs';
import { publicConfigDigest, normalizeConfig } from '../src/config.mjs';
import { assertPreviewOrigin, attachRuntimeCollectors, collectSemantic, installLocalNavigationGuard, replaySteps, screenshotMaskLocators, stabilizationCss, summarizeError } from '../src/capture.mjs';
import { stopProcessTree, worktreePathsUnder } from '../src/cleanup.mjs';
import { commitRefArgs, parseNulPaths } from '../src/git.mjs';
import { selectScenarios } from '../src/impact.mjs';
import { detectProject, renderStarterConfig } from '../src/init.mjs';
import { waitForReady } from '../src/network.mjs';
import { createOwnedOutputDirectory, safeWriteArtifact } from '../src/output.mjs';
import { cellArtifactNames, hashArtifacts, resolveArtifactPath } from '../src/provenance.mjs';
import { redactCommand, redactKnownValues } from '../src/redact.mjs';
import { buildSummary, renderReport } from '../src/report.mjs';
import { classifyCell, exitCodeFor, runtimeDelta } from '../src/verdict.mjs';
import {
  buildStartCommand,
  browserLaunchOptions,
  createPixelDiff,
  preserveGitOutput,
  processTreeSpawnOptions,
  resolveLocalRoute,
  startCommandForPlatform,
} from '../src/visual.mjs';

import { parsePrUrl } from '../src/pr-url.mjs';
import { ensureAssetsBranch, uploadFile } from '../src/provider-github.mjs';
import { providerFor } from '../src/providers.mjs';
import { buildPrComment } from '../src/pr-comment.mjs';
import { buildArchitectureDiagram, buildBackendComment, buildChangeSummary, parseNameStatus, parseNumstat, summarizeChange } from '../src/backend.mjs';
import { buildModuleGraph, renderMermaidFlowchart } from '../src/mermaid.mjs';
import { setupPlan, setupSummary, unsupportedNodeVersion } from '../src/setup.mjs';
import { formatDiagramWarnings, lintDiagram } from '../src/diagram-lint.mjs';
import { mergeDescription } from '../src/pr-description.mjs';

// Browser dependencies are loaded on first use in the web path only, so backend
// mode runs in a checkout where playwright and pngjs were never installed.
async function loadBrowserDep(name) {
  try {
    return await import(name);
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`Missing dependency "${name}". Run this skill's CLI with --setup once to install it.`);
    }
    throw error;
  }
}

function git(args, cwd, { trim = true } = {}) {
  const output = execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  return preserveGitOutput(output, trim);
}

function gitBuffer(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: null, maxBuffer: 100 * 1024 * 1024 });
}

function startPreview(command, cwd, port, env) {
  const child = spawn(startCommandForPlatform(buildStartCommand(command, port)), {
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
    ...processTreeSpawnOptions(),
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

function runInstall(command, cwd, processes) {
  const child = spawn(command, {
    cwd,
    env: process.env,
    shell: true,
    stdio: 'inherit',
    ...processTreeSpawnOptions(),
  });
  processes.push(child);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed: install exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

function fetchPrCommits(repoRoot, pr, provider, token) {
  if (provider.name === 'GitHub') {
    // GitHub serves any reachable commit by full SHA, and accepts the token
    // as an x-access-token basic credential for private repos.
    const args = ['fetch', '--quiet', 'origin', pr.baseSha, pr.headSha];
    if (token) {
      const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
      args.unshift('-c', `http.extraheader=AUTHORIZATION: basic ${auth}`);
    }
    git(args, repoRoot);
    return;
  }
  // Bitbucket abbreviates commit hashes to 12 characters, and git cannot fetch
  // an abbreviated SHA by name, so fetch the branches instead. The SHAs then
  // resolve locally through rev-parse. No credential header is injected: the
  // clone already has whatever credentials fetched it in the first place.
  try {
    git(['fetch', '--quiet', 'origin', pr.baseRef, pr.headRef], repoRoot);
  } catch (branchError) {
    try {
      git(['fetch', '--quiet', 'origin', pr.baseSha, pr.headSha], repoRoot);
    } catch {
      throw new Error(
        `could not fetch ${provider.reference} from origin by branch (${pr.baseRef}, ${pr.headRef}) ` +
        `or by commit. If the head branch lives on a fork, fetch it first: git fetch <fork-url> ${pr.headRef}. ` +
        `git said: ${branchError.message.trim()}`,
      );
    }
  }
}

async function uploadCellImages(token, pr, outputDir, cells) {
  const branch = 'visual-review-assets';
  await ensureAssetsBranch(token, pr.owner, pr.repo, branch);
  const runId = `pr-${pr.number}-${Date.now()}`;
  const images = {};
  for (const cell of cells) {
    if (!cell.artifacts || !cell.artifacts.sideBySide) continue;
    const name = cell.artifacts.sideBySide;
    const buffer = await readFile(path.join(outputDir, name));
    const url = await uploadFile(token, pr.owner, pr.repo, branch, `${runId}/${name}`, buffer);
    if (url) images[`${cell.scenarioId}--${cell.viewport}`] = url;
  }
  return images;
}

function requirePublishToken(token, options, provider) {
  if (token) return;
  const flag = options.postComment ? '--post-comment' : '--update-description';
  throw new Error(`${flag} requires ${provider.tokenHint} in the environment`);
}

async function readDiagram(filePath) {
  if (!filePath) return null;
  const text = await readFile(filePath, 'utf8');
  if (!text.trim()) throw new Error(`--diagram file is empty: ${filePath}`);
  // Warn, never block: these render wrong rather than failing to parse, so the
  // author still gets their diagram plus a pointer at what a reviewer will see.
  const warnings = formatDiagramWarnings(lintDiagram(text), filePath);
  if (warnings) console.error(warnings);
  return text;
}

async function updatePrDescription(token, pr, section) {
  const provider = providerFor(pr);
  const existing = await provider.getBody(token);
  const body = mergeDescription(existing, section);
  return provider.updateBody(token, body);
}

async function runBackend({ options, repoRoot, outputDir, baseSha, headSha, changedFiles, diffStat, codeDiff, pr }) {
  const nameStatus = parseNameStatus(git(['diff', '--name-status', `${baseSha}...${headSha}`], repoRoot));
  const numstat = parseNumstat(git(['diff', '--numstat', `${baseSha}...${headSha}`], repoRoot));
  const summary = summarizeChange(nameStatus, numstat);
  const deletedPaths = new Set(summary.files.filter((file) => file.status === 'D').map((file) => file.path));
  const readHeadFile = (filePath) => {
    if (deletedPaths.has(filePath)) return null;
    try {
      return execFileSync('git', ['show', `${headSha}:${filePath}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return null; }
  };
  const graph = await buildModuleGraph({ files: summary.files, readFile: readHeadFile });
  const mermaid = renderMermaidFlowchart(graph, { base: baseSha, head: headSha });
  const diagram = await readDiagram(options.diagram);

  await createOwnedOutputDirectory(outputDir);
  await safeWriteArtifact(outputDir, 'changes.patch', codeDiff);
  await safeWriteArtifact(outputDir, 'changes-stat.txt', diffStat ? `${diffStat}\n` : '');
  await safeWriteArtifact(outputDir, 'report.md', `${buildChangeSummary(summary, baseSha, headSha, mermaid, diagram)}\n`);
  await safeWriteArtifact(outputDir, 'change-map.mmd', `${mermaid}\n`);
  await safeWriteArtifact(outputDir, 'architecture.svg', buildArchitectureDiagram(summary, baseSha, headSha));

  const payload = {
    adapter: 'backend',
    base: { ref: options.base, sha: baseSha },
    head: { ref: options.head, sha: headSha },
    changedFiles,
    totalFiles: summary.totalFiles,
    totalAdded: summary.totalAdded,
    totalDeleted: summary.totalDeleted,
    addedCount: summary.addedCount,
    modifiedCount: summary.modifiedCount,
    deletedCount: summary.deletedCount,
    groups: summary.groups,
    files: summary.files,
  };
  await safeWriteArtifact(outputDir, 'summary.json', `${JSON.stringify(payload, null, 2)}\n`);
  await safeWriteArtifact(outputDir, 'manifest.json', `${JSON.stringify({ schemaVersion: 2, generatedAt: new Date().toISOString(), ...payload }, null, 2)}\n`);

  console.log(`Backend review written to ${outputDir}`);

  if (pr) {
    const provider = providerFor(pr);
    const token = provider.tokenFrom(process.env);
    if (options.postComment || options.updateDescription) requirePublishToken(token, options, provider);
    // Mermaid renders natively on GitHub, so backend reviews upload nothing.
    const comment = buildBackendComment(summary, baseSha, headSha, pr, null, mermaid, diagram);
    await safeWriteArtifact(outputDir, 'pr.json', `${JSON.stringify({ ...pr, adapter: 'backend', diagram }, null, 2)}\n`);
    await safeWriteArtifact(outputDir, 'pr-comment.md', `${comment}\n`);
    console.log(`PR comment draft written to ${path.join(outputDir, 'pr-comment.md')}`);
    if (!options.postComment && !options.updateDescription) {
      console.log(`Review it, then publish as-is: --publish ${outputDir} --post-comment (or --update-description)`);
    }
    if (options.postComment) {
      const posted = await provider.postComment(token, comment);
      console.log(`Posted comment: ${posted.htmlUrl ?? pr.htmlUrl}`);
    }
    if (options.updateDescription) {
      const updated = await updatePrDescription(token, pr, comment);
      console.log(`PR description updated: ${updated.htmlUrl}`);
    }
  }
}

async function captureSide(browser, origin, scenario, viewport, capture, outputDir, artifactName) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    reducedMotion: capture.reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const runtime = attachRuntimeCollectors(page, origin);
  await installLocalNavigationGuard(page, origin);
  const css = stabilizationCss(capture);
  const applyCss = async () => {
    if (css) await page.addStyleTag({ content: css }).catch(() => {});
  };
  try {
    if (css) await context.addInitScript(({ content }) => {
      const inject = () => {
        const style = document.createElement('style');
        style.textContent = content;
        (document.head ?? document.documentElement).append(style);
      };
      if (document.head) inject();
      else document.addEventListener('DOMContentLoaded', inject, { once: true });
    }, { content: css });

    const response = await page.goto(resolveLocalRoute(origin, scenario.path), {
      waitUntil: capture.waitUntil,
    });
    runtime.status = response ? response.status() : null;
    await applyCss();
    await replaySteps(page, scenario.steps, origin, runtime);
    await applyCss();
    if (scenario.settleMs) await page.waitForTimeout(scenario.settleMs);
    assertPreviewOrigin(page, origin);
    runtime.semantic = await collectSemantic(page, scenario.semantic);
    assertPreviewOrigin(page, origin);
    const screenshot = await page.screenshot({
      fullPage: scenario.fullPage,
      animations: 'disabled',
      caret: 'hide',
      mask: screenshotMaskLocators(page, capture, scenario),
      maskColor: '#ff00ff',
    });
    await safeWriteArtifact(outputDir, artifactName, screenshot);
    runtime.captured = true;
  } catch (error) {
    runtime.captureError = summarizeError(error.message);
    runtime.captured = false;
  } finally {
    await context.close().catch(() => {});
  }
  return runtime;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function createSideBySide(browser, beforeBuffer, afterBuffer, outputDir, artifactName, labels) {
  const { PNG } = await loadBrowserDep('pngjs');
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
    const screenshot = await page.screenshot({ animations: 'disabled' });
    await safeWriteArtifact(outputDir, artifactName, screenshot);
  } finally {
    await page.close();
  }
}

function fail(message, code = 2) {
  console.error(`Error: ${message}`);
  process.exitCode = code;
}

// Filesystem adapter for detectProject: relative paths only, never throws.
function projectFiles(root) {
  return {
    exists: (relPath) => existsSync(path.join(root, relPath)),
    read: (relPath) => {
      try {
        return readFileSync(path.join(root, relPath), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runStep(step, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${step.command} ${step.args.join(' ')} exited with ${code}`))));
  });
}

async function runSetup(options) {
  const browser = !options.backend;
  const hasNodeModules = existsSync(path.join(skillRoot, 'node_modules'));
  const steps = setupPlan({ hasNodeModules, browser });
  const summary = setupSummary(steps, { hasNodeModules, browser });
  if (summary) {
    console.log(summary);
    return;
  }
  console.log(`Installing into ${skillRoot}`);
  for (const step of steps) {
    console.log(`- ${step.label}: ${step.command} ${step.args.join(' ')}`);
    await runStep(step, skillRoot);
  }
  console.log(browser
    ? 'Setup complete. Web and backend reviews are ready.'
    : 'Setup complete. Backend reviews are ready; re-run --setup without --backend for web reviews.');
}

async function runPublish(options) {
  const dir = path.resolve(options.publish);
  const prPath = path.join(dir, 'pr.json');
  const draftPath = path.join(dir, 'pr-comment.md');
  if (!existsSync(prPath) || !existsSync(draftPath)) {
    throw new Error(`${dir} has no pr.json and pr-comment.md. Run a --pr review first; it writes the draft that --publish posts.`);
  }
  const pr = JSON.parse(await readFile(prPath, 'utf8'));
  // Verbatim: the text the human reviewed is the text that ships. Only the
  // trailing newline the artifact writer added is dropped.
  let comment = (await readFile(draftPath, 'utf8')).replace(/\n$/, '');
  const provider = providerFor(pr);
  const token = provider.tokenFrom(process.env);
  requirePublishToken(token, options, provider);
  console.log(`Publishing ${draftPath} to ${provider.name} ${provider.reference}`);

  // A web draft written without a token has no screenshots in it. Upload them
  // now and rebuild the comment from the saved summary: every line the reviewer
  // read is kept, the Evidence section is added, and the footer stops saying
  // the images are local.
  if (pr.adapter === 'web' && provider.supportsEvidenceUpload) {
    const summaryPath = path.join(dir, 'summary.json');
    if (existsSync(summaryPath)) {
      const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
      const images = await uploadCellImages(token, pr, dir, summary.cells ?? []);
      const count = Object.keys(images).length;
      if (count > 0) {
        comment = buildPrComment(summary, pr, images, pr.diagram ?? null);
        console.log(`Uploaded ${count} screenshot${count === 1 ? '' : 's'} to the visual-review-assets branch and embedded ${count === 1 ? 'it' : 'them'}.`);
      }
    }
  }

  if (options.postComment) {
    const posted = await provider.postComment(token, comment);
    console.log(`Posted comment: ${posted.htmlUrl ?? pr.htmlUrl}`);
  }
  if (options.updateDescription) {
    const updated = await updatePrDescription(token, pr, comment);
    console.log(`PR description updated: ${updated.htmlUrl}`);
  }
}

async function runInit(options) {
  const invocationDir = process.cwd();
  const configPath = path.resolve(invocationDir, options.config);
  if (existsSync(configPath)) {
    fail(`${options.config} already exists; delete it or pass --config <other path>`);
    return;
  }
  const detection = detectProject(projectFiles(invocationDir));
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, renderStarterConfig(detection), 'utf8');
  console.log(`Detected: ${detection.kind}`);
  for (const note of detection.notes) console.log(`- ${note}`);
  console.log(`Wrote ${configPath}. Edit startCommand and add scenarios, then run: node ${process.argv[1]} --base origin/main --head HEAD`);
}

async function main() {
  const startedAt = Date.now();
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
  const versionError = unsupportedNodeVersion(process.versions.node);
if (versionError) {
  console.error(versionError);
  process.exit(2);
}

if (options.setup) {
  try {
    await runSetup(options);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  process.exit(0);
}

if (options.publish) {
  try {
    await runPublish(options);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  process.exit(0);
}

if (options.init) {
    await runInit(options);
    return;
  }

  const invocationDir = process.cwd();
  const repoRoot = git(['rev-parse', '--show-toplevel'], invocationDir);
  const configPath = path.resolve(invocationDir, options.config);
  const outputDir = path.resolve(invocationDir, options.output);

  let config = null;
  if (!options.backend) {
    try {
      config = normalizeConfig(JSON.parse(await readFile(configPath, 'utf8')));
    } catch (error) {
      fail(`${options.config}: ${error.message}`);
      return;
    }
  }

  // Read the diagram before any worktree or browser work, so a bad path fails
  // in front of the user instead of after a full capture.
  let webDiagram = null;
  if (!options.backend) {
    try {
      webDiagram = await readDiagram(options.diagram);
    } catch (error) {
      fail(error.message);
      return;
    }
  }
  const digest = config ? publicConfigDigest(config) : null;

  let pr = null;
  if (options.pr) {
    pr = parsePrUrl(options.pr);
    const provider = providerFor(pr);
    const token = provider.tokenFrom(process.env);
    const resolved = await provider.resolvePr(token);
    pr = { ...pr, ...resolved };
    fetchPrCommits(repoRoot, pr, provider, token);
    options.base = resolved.baseSha;
    options.head = resolved.headSha;
  }

  const baseSha = git(commitRefArgs(options.base), repoRoot);
  const headSha = git(commitRefArgs(options.head), repoRoot);
  const changedFiles = parseNulPaths(gitBuffer(['diff', '--name-only', '-z', `${baseSha}...${headSha}`, '--'], repoRoot));
  const diffStat = git(['diff', '--stat', `${baseSha}...${headSha}`], repoRoot);
  const codeDiff = git(['diff', '--binary', `${baseSha}...${headSha}`], repoRoot, { trim: false });

  if (options.backend) {
    try {
      await runBackend({ options, repoRoot, outputDir, baseSha, headSha, changedFiles, diffStat, codeDiff, pr });
    } catch (error) {
      fail(error.message);
    }
    return;
  }

  const allIds = config.scenarios.map((scenario) => scenario.id);
  let selection;
  if (options.all) {
    selection = { scenarioIds: allIds, reason: 'explicit-all-flag', matchedRules: [], unmatchedFiles: [] };
  } else if (options.scenarios.length > 0) {
    const unknown = options.scenarios.filter((id) => !allIds.includes(id));
    if (unknown.length > 0) {
      fail(`--scenario: unknown scenario(s): ${unknown.join(', ')}`);
      return;
    }
    selection = {
      scenarioIds: allIds.filter((id) => options.scenarios.includes(id)),
      reason: 'explicit-scenario-flag',
      matchedRules: [],
      unmatchedFiles: [],
    };
  } else {
    selection = selectScenarios(changedFiles, config.impact, allIds);
  }
  const selected = config.scenarios.filter((scenario) => selection.scenarioIds.includes(scenario.id));
  const skippedScenarios = config.scenarios
    .filter((scenario) => !selection.scenarioIds.includes(scenario.id))
    .map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      reason: selection.reason === 'impact-rules'
        ? 'not selected by impact rules'
        : `not selected (${selection.reason})`,
    }));

  const knownSecrets = [
    ...Object.values(config.env),
    ...config.scenarios.flatMap((scenario) => scenario.steps
      .filter((step) => step.action === 'fill' && step.secret)
      .map((step) => step.value)),
  ];
  const failureRecord = ({ phase, error, cleanupError = null, status = 'infrastructure-failed' }) => ({
    schemaVersion: 1,
    status,
    phase,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    base: { ref: options.base, sha: baseSha },
    head: { ref: options.head, sha: headSha },
    error: redactCommand(redactKnownValues(error instanceof Error ? error.message : error, knownSecrets)),
    cleanup: {
      completed: cleanupError === null,
      failures: cleanupError
        ? [redactCommand(redactKnownValues(cleanupError.message, knownSecrets))]
        : [],
    },
  });
  const emitFailure = async (failure) => {
    try {
      await safeWriteArtifact(outputDir, 'failure.json', `${JSON.stringify(failure, null, 2)}\n`);
      console.error(`Failure evidence written to ${path.join(outputDir, 'failure.json')}`);
    } catch (error) {
      console.error(`Error: could not write failure.json: ${error.message}`);
    }
  };

  let outputReady = false;
  try {
    await createOwnedOutputDirectory(outputDir);
    outputReady = true;
    await safeWriteArtifact(outputDir, 'changes.patch', codeDiff);
    await safeWriteArtifact(outputDir, 'changes-stat.txt', diffStat ? `${diffStat}\n` : '');
  } catch (error) {
    if (outputReady) await emitFailure(failureRecord({ phase: 'output-initialization', error }));
    fail(error.message);
    return;
  }

  let tempRoot;
  try {
    // realpath: macOS tmpdir is a symlink (/var -> /private/var); git reports real paths
    tempRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'visual-pr-review-')));
  } catch (error) {
    await emitFailure(failureRecord({ phase: 'temporary-directory', error }));
    fail(error.message);
    return;
  }
  const baseDir = path.join(tempRoot, 'base');
  const headDir = path.join(tempRoot, 'head');
  const processes = [];
  let browser;
  let cleanupPromise;
  let phase = 'worktree-base';
  let runError = null;
  let cleanupError = null;

  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      const failures = [];
      if (browser) {
        try { await browser.close(); } catch (error) { failures.push(`browser close: ${error.message}`); }
      }
      const stopped = await Promise.allSettled(processes.map((child) => stopProcessTree(child)));
      for (const result of stopped) {
        if (result.status === 'rejected') failures.push(`preview stop: ${result.reason.message}`);
      }
      if (!options.keepWorktrees) {
        const listUnder = () => worktreePathsUnder(
          git(['worktree', 'list', '--porcelain'], repoRoot, { trim: false }),
          tempRoot,
        );
        let registered = listUnder();
        for (const dir of registered) {
          try { git(['worktree', 'remove', '--force', dir], repoRoot); }
          catch (error) { failures.push(`git worktree remove ${dir}: ${error.message}`); }
        }
        registered = listUnder();
        if (registered.length > 0) {
          try { git(['worktree', 'prune'], repoRoot); }
          catch (error) { failures.push(`git worktree prune: ${error.message}`); }
          registered = listUnder();
        }
        if (registered.length > 0) {
          failures.push(`worktree registrations remain: ${registered.join(', ')}; recover with: git -C ${repoRoot} worktree remove --force <path>`);
        } else {
          try { await rm(tempRoot, { recursive: true, force: true }); }
          catch (error) { failures.push(`remove temporary directory ${tempRoot}: ${error.message}`); }
        }
      } else {
        console.log(`Temporary worktrees preserved at ${tempRoot}`);
      }
      if (failures.length > 0) throw new Error(`cleanup failed:\n- ${failures.join('\n- ')}\nTemporary state preserved when worktree removal could not be verified.`);
    })();
    return cleanupPromise;
  };
  const handleSignal = (signal) => {
    const exitCode = signal === 'SIGINT' ? 130 : 143;
    (async () => {
      let signalCleanupError = null;
      try {
        await cleanup();
      } catch (error) {
        signalCleanupError = error;
      }
      const failure = failureRecord({
        phase: `signal-${signal.toLowerCase()}`,
        error: `interrupted by ${signal}`,
        cleanupError: signalCleanupError,
        status: 'interrupted',
      });
      await emitFailure(failure);
      if (signalCleanupError) console.error(`Error: ${failure.cleanup.failures.join('\n')}`);
      process.exit(exitCode);
    })().catch((error) => {
      console.error(`Error while recording ${signal}: ${error.message}`);
      process.exit(exitCode);
    });
  };
  const handleSigint = () => handleSignal('SIGINT');
  const handleSigterm = () => handleSignal('SIGTERM');
  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  try {
    phase = 'worktree-base';
    git(['worktree', 'add', '--detach', baseDir, baseSha], repoRoot);
    phase = 'worktree-head';
    git(['worktree', 'add', '--detach', headDir, headSha], repoRoot);

    if (config.installCommand) {
      for (const [label, dir] of [['base', baseDir], ['head', headDir]]) {
        phase = `install-${label}`;
        console.log(`Installing ${label} revision dependencies...`);
        await runInstall(config.installCommand, dir, processes);
      }
    }

    const basePort = config.basePort;
    const headPort = config.basePort + 1;
    const baseOrigin = `http://127.0.0.1:${basePort}`;
    const headOrigin = `http://127.0.0.1:${headPort}`;
    phase = 'preview-start';
    const baseProcess = startPreview(config.startCommand, baseDir, basePort, config.env);
    const headProcess = startPreview(config.startCommand, headDir, headPort, config.env);
    processes.push(baseProcess, headProcess);

    try {
      phase = 'readiness';
      await Promise.all([
        waitForReady(`${baseOrigin}${config.readyPath}`, config.startupTimeoutMs, baseProcess),
        waitForReady(`${headOrigin}${config.readyPath}`, config.startupTimeoutMs, headProcess),
      ]);
    } catch (error) {
      throw new Error(`${error.message}\n\nBase logs:\n${baseProcess.getLogs()}\n\nHead logs:\n${headProcess.getLogs()}`);
    }

    phase = 'browser-launch';
    const { chromium } = await loadBrowserDep('playwright');
    browser = await chromium.launch(browserLaunchOptions());
    const browserVersion = browser.version();

    const cells = [];
    const artifactNames = ['changes.patch', 'changes-stat.txt'];
    for (const scenario of selected) {
      const evidenceSecrets = [
        ...Object.values(config.env),
        ...scenario.steps
          .filter((step) => step.action === 'fill' && step.secret)
          .map((step) => step.value),
      ];
      for (const viewportName of scenario.viewports) {
        phase = `capture:${scenario.id}:${viewportName}`;
        const viewport = config.viewports.find((entry) => entry.name === viewportName);
        const names = cellArtifactNames(scenario.id, viewport.name);
        console.log(`Capturing ${scenario.name} @ ${viewport.name}...`);

        const beforePath = resolveArtifactPath(outputDir, names.before);
        const afterPath = resolveArtifactPath(outputDir, names.after);
        const base = redactKnownValues(
          await captureSide(browser, baseOrigin, scenario, viewport, config.capture, outputDir, names.before),
          evidenceSecrets,
        );
        const head = redactKnownValues(
          await captureSide(browser, headOrigin, scenario, viewport, config.capture, outputDir, names.after),
          evidenceSecrets,
        );

        const artifacts = {};
        let pixel = null;
        let sizeMismatch = null;
        if (base.captured && head.captured) {
          artifacts.before = names.before;
          artifacts.after = names.after;
          const beforeBuffer = await readFile(beforePath);
          const afterBuffer = await readFile(afterPath);
          try {
            const diff = await createPixelDiff(beforeBuffer, afterBuffer, config.thresholds.pixelmatch);
            await safeWriteArtifact(outputDir, names.diff, diff.buffer);
            artifacts.diff = names.diff;
            pixel = {
              changedPixels: diff.changedPixels,
              totalPixels: diff.totalPixels,
              changeRatio: diff.totalPixels ? diff.changedPixels / diff.totalPixels : 0,
            };
          } catch (error) {
            sizeMismatch = error.message.replace(/^screenshot dimensions differ: /, '');
          }
          await createSideBySide(browser, beforeBuffer, afterBuffer, outputDir, names.sideBySide, {
            before: `BEFORE · ${options.base} · ${baseSha.slice(0, 7)} · ${viewport.name}`,
            after: `AFTER · ${options.head} · ${headSha.slice(0, 7)} · ${viewport.name}`,
          });
          artifacts.sideBySide = names.sideBySide;
        } else {
          if (base.captured) artifacts.before = names.before;
          if (head.captured) artifacts.after = names.after;
        }
        artifactNames.push(...Object.values(artifacts));

        const classified = classifyCell({ pixel, base, head, sizeMismatch, thresholds: config.thresholds });
        cells.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          path: scenario.path,
          description: scenario.description,
          viewport: viewport.name,
          viewportSize: { width: viewport.width, height: viewport.height },
          verdict: classified.verdict,
          reasons: classified.reasons,
          artifacts,
          pixel,
          runtime: {
            base: runtimeRecord(base),
            head: runtimeRecord(head),
            delta: runtimeDelta(base, head),
          },
          semantic: {
            ...classified.semantic,
            base: base.semantic ?? null,
            head: head.semantic ?? null,
          },
        });
      }
    }

    phase = 'report';
    const artifactHashes = await hashArtifacts(outputDir, artifactNames);
    const recordedCommand = (command) => redactCommand(redactKnownValues(command, knownSecrets));
    const provenance = {
      publicConfigDigest: digest,
      browser: {
        version: browserVersion,
        executable: process.env.VISUAL_REVIEW_BROWSER_PATH ?? 'playwright-managed',
      },
      commands: {
        install: config.installCommand ? recordedCommand(config.installCommand) : null,
        startTemplate: recordedCommand(config.startCommand),
        basePreview: recordedCommand(buildStartCommand(config.startCommand, basePort)),
        headPreview: recordedCommand(buildStartCommand(config.startCommand, headPort)),
      },
      envKeys: config.envKeys,
      ports: { base: basePort, head: headPort },
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
      artifactHashes,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      base: { ref: options.base, sha: baseSha },
      head: { ref: options.head, sha: headSha },
      changedFiles,
      diffStat,
      selection,
      skippedScenarios,
      cells,
      provenance,
    };

    await safeWriteArtifact(outputDir, 'report.md', renderReport(report, webDiagram));
    await safeWriteArtifact(
      outputDir,
      'summary.json',
      `${JSON.stringify(buildSummary(report), null, 2)}\n`,
    );
    const manifest = {
      schemaVersion: 2,
      ...report,
      config: config.public,
      artifacts: { codeDiff: 'changes.patch', diffStat: 'changes-stat.txt', report: 'report.md', summary: 'summary.json' },
      provenance: {
        ...provenance,
        artifactHashesNote: 'Self-consistency SHA-256 hashes of every artifact except manifest.json itself; not signed or externally attested',
        artifactHashes: await hashArtifacts(outputDir, [...artifactNames, 'report.md', 'summary.json']),
      },
    };
    await safeWriteArtifact(
      outputDir,
      'manifest.json',
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const code = exitCodeFor(cells);
    console.log(`Visual review written to ${outputDir}`);
    if (code !== 0) {
      console.error('At least one scenario could not be captured. The report is partial.');
    }
    process.exitCode = code;

    if (pr) {
      const provider = providerFor(pr);
      const token = provider.tokenFrom(process.env);
      const diagram = webDiagram;
      let comment = buildPrComment(report, pr, null, diagram);
      if (options.postComment || options.updateDescription) {
        requirePublishToken(token, options, provider);
        if (provider.supportsEvidenceUpload) {
          phase = 'pr-asset-upload';
          const images = await uploadCellImages(token, pr, outputDir, report.cells);
          comment = buildPrComment(report, pr, images, diagram);
        } else {
          // Only GitHub has a host for the screenshots today. Elsewhere the
          // verdicts and diagrams still post; the images stay in the output
          // directory and the comment says so.
          console.error(`${provider.name} evidence upload is not implemented. The screenshots stay in ${outputDir}; the comment carries verdicts and diagrams only.`);
        }
      }
      await safeWriteArtifact(outputDir, 'pr.json', `${JSON.stringify({ ...pr, adapter: 'web', diagram }, null, 2)}\n`);
      await safeWriteArtifact(outputDir, 'pr-comment.md', `${comment}\n`);
      console.log(`PR comment draft written to ${path.join(outputDir, 'pr-comment.md')}`);
      if (!options.postComment && !options.updateDescription) {
        console.log(`Review it, then publish: --publish ${outputDir} --post-comment (or --update-description)`
          + (provider.supportsEvidenceUpload ? '; the screenshots are uploaded and embedded at that point' : ''));
      }
      if (options.postComment) {
        phase = 'pr-comment-post';
        const posted = await provider.postComment(token, comment);
        console.log(`Posted comment: ${posted.htmlUrl ?? pr.htmlUrl}`);
      }
      if (options.updateDescription) {
        phase = 'pr-description-update';
        const updated = await updatePrDescription(token, pr, comment);
        console.log(`PR description updated: ${updated.htmlUrl}`);
      }
    }
  } catch (error) {
    runError = error;
  } finally {
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
    try {
      await cleanup();
    } catch (error) {
      cleanupError = error;
    }
  }

  if (runError || cleanupError) {
    const failure = failureRecord({
      phase: runError ? phase : 'cleanup',
      error: runError
        ? runError
        : 'capture and report generation completed, but cleanup failed',
      cleanupError,
    });
    await emitFailure(failure);
    console.error(`Error during ${failure.phase}: ${failure.error}`);
    if (cleanupError) console.error(`Error: ${failure.cleanup.failures.join('\n')}`);
    process.exitCode = 2;
  }
}

function runtimeRecord(runtime) {
  return {
    status: runtime.status,
    pageErrors: runtime.pageErrors,
    consoleErrors: runtime.consoleErrors,
    failedRequests: runtime.failedRequests,
    assertionFailures: runtime.assertionFailures,
    captureError: runtime.captureError ?? null,
  };
}

try {
  await main();
} catch (error) {
  fail(error.message);
}
