import { createHash } from 'node:crypto';

import { safeArtifactName } from './core.mjs';
import { redactCommand, redactKnownValues } from './redact.mjs';
import { cellArtifactNames } from './provenance.mjs';

const TOP_LEVEL_KEYS = new Set([
  'installCommand', 'startCommand', 'readyPath', 'basePort', 'startupTimeoutMs',
  'env', 'viewport', 'viewports', 'capture', 'thresholds', 'scenarios', 'routes', 'impact',
]);
const SCENARIO_KEYS = new Set([
  'id', 'name', 'path', 'viewports', 'fullPage', 'steps', 'semantic', 'settleMs', 'description',
]);
// Accepted only under the deprecated top-level `routes` key.
const LEGACY_ROUTE_KEYS = new Set([...SCENARIO_KEYS, 'waitForSelector', 'waitForMs']);
const CAPTURE_KEYS = new Set([
  'reducedMotion', 'disableAnimations', 'hideSelectors', 'maskSelectors', 'settleMs', 'waitUntil',
]);
const SEMANTIC_KEYS = new Set(['title', 'textSelectors', 'aria']);
const THRESHOLD_KEYS = new Set(['pixelmatch', 'changedRatio', 'reviewRatio']);
const IMPACT_KEYS = new Set(['rules', 'smokeScenarios']);
const WAIT_UNTIL = new Set(['load', 'domcontentloaded', 'networkidle', 'commit']);
const VIEWPORT_KEYS = new Set(['name', 'width', 'height', 'deviceScaleFactor']);
const IMPACT_RULE_KEYS = new Set(['glob', 'globs', 'scenarios']);
const STEP_KEYS = {
  goto: new Set(['action', 'path', 'timeoutMs']),
  click: new Set(['action', 'selector', 'timeoutMs']),
  fill: new Set(['action', 'selector', 'value', 'secret', 'timeoutMs']),
  press: new Set(['action', 'selector', 'key', 'timeoutMs']),
  select: new Set(['action', 'selector', 'value', 'timeoutMs']),
  waitForSelector: new Set(['action', 'selector', 'timeoutMs']),
  assertVisible: new Set(['action', 'selector', 'timeoutMs']),
  assertText: new Set(['action', 'selector', 'equals', 'contains', 'timeoutMs']),
};

const DEFAULT_STEP_TIMEOUT_MS = 10000;

function rejectUnknown(object, allowed, label) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new Error(`${label}unknown key: ${key}`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function assertSafePath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw new Error(`${label} must start with "/" and stay on the preview origin`);
  }
  if (value.startsWith('//')) {
    throw new Error(`${label} must not be protocol-relative`);
  }
}

function positiveInteger(value, label, max = 100000) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${label} must be an integer between 1 and ${max}`);
  }
  return value;
}

function selectorList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`${label} must be an array of non-empty selector strings`);
  }
  return [...value];
}

function normalizeStep(raw, label) {
  requireObject(raw, label);
  const action = raw.action;
  if (!Object.hasOwn(STEP_KEYS, action)) throw new Error(`${label}: unknown action: ${String(action)}`);
  rejectUnknown(raw, STEP_KEYS[action], `${label}: `);
  const selector = () => {
    if (typeof raw.selector !== 'string' || !raw.selector.trim()) {
      throw new Error(`${label}: action "${action}" requires "selector"`);
    }
    return raw.selector;
  };
  const timeoutMs = raw.timeoutMs === undefined
    ? DEFAULT_STEP_TIMEOUT_MS
    : positiveInteger(raw.timeoutMs, `${label}.timeoutMs`, 600000);

  switch (action) {
    case 'goto': {
      assertSafePath(raw.path, `${label}.path`);
      return { action, path: raw.path, timeoutMs };
    }
    case 'click':
    case 'waitForSelector':
    case 'assertVisible':
      return { action, selector: selector(), timeoutMs };
    case 'fill': {
      if (typeof raw.value !== 'string') throw new Error(`${label}: action "fill" requires "value"`);
      if (raw.secret !== undefined && typeof raw.secret !== 'boolean') throw new Error(`${label}.secret must be a boolean`);
      return { action, selector: selector(), value: raw.value, secret: raw.secret === true, timeoutMs };
    }
    case 'select': {
      if (typeof raw.value !== 'string') throw new Error(`${label}: action "select" requires "value"`);
      return { action, selector: selector(), value: raw.value, timeoutMs };
    }
    case 'press': {
      if (typeof raw.key !== 'string' || !raw.key.trim()) {
        throw new Error(`${label}: action "press" requires "key"`);
      }
      return { action, selector: selector(), key: raw.key, timeoutMs };
    }
    case 'assertText': {
      if (typeof raw.equals !== 'string' && typeof raw.contains !== 'string') {
        throw new Error(`${label}: action "assertText" requires "equals" or "contains"`);
      }
      return {
        action,
        selector: selector(),
        ...(typeof raw.equals === 'string' ? { equals: raw.equals } : {}),
        ...(typeof raw.contains === 'string' ? { contains: raw.contains } : {}),
        timeoutMs,
      };
    }
    default:
      throw new Error(`${label}: unknown action: ${String(action)}`);
  }
}

function normalizeViewports(raw) {
  const source = raw.viewports ?? (raw.viewport
    ? [{ name: 'desktop', ...raw.viewport }]
    : [{ name: 'desktop', width: 1440, height: 900 }]);
  if (!Array.isArray(source) || source.length === 0) {
    throw new Error('viewports must contain at least one viewport');
  }
  const seen = new Set();
  return source.map((entry, index) => {
    requireObject(entry, `viewports[${index}]`);
    rejectUnknown(entry, VIEWPORT_KEYS, `viewports[${index}]: `);
    if (entry.name !== undefined && (typeof entry.name !== 'string' || !entry.name.trim())) {
      throw new Error(`viewports[${index}].name must be a non-empty string`);
    }
    const name = safeArtifactName(entry.name ?? `viewport-${index}`);
    if (!Number.isInteger(entry.width) || entry.width < 1 || entry.width > 10000) {
      throw new Error(`viewports[${index}].width must be an integer between 1 and 10000`);
    }
    if (!Number.isInteger(entry.height) || entry.height < 1 || entry.height > 20000) {
      throw new Error(`viewports[${index}].height must be an integer between 1 and 20000`);
    }
    if (seen.has(name)) throw new Error(`duplicate viewport name: ${name}`);
    seen.add(name);
    const scale = entry.deviceScaleFactor ?? 1;
    if (typeof scale !== 'number' || !(scale > 0) || scale > 4) {
      throw new Error(`viewports[${index}].deviceScaleFactor must be a number in (0, 4]`);
    }
    return { name, width: entry.width, height: entry.height, deviceScaleFactor: scale };
  });
}

function normalizeCapture(raw) {
  const capture = requireObject(raw ?? {}, 'capture');
  rejectUnknown(capture, CAPTURE_KEYS, 'capture: ');
  const waitUntil = capture.waitUntil ?? 'networkidle';
  if (!WAIT_UNTIL.has(waitUntil)) {
    throw new Error(`capture.waitUntil must be one of ${[...WAIT_UNTIL].join(', ')}`);
  }
  for (const key of ['reducedMotion', 'disableAnimations']) {
    if (capture[key] !== undefined && typeof capture[key] !== 'boolean') {
      throw new Error(`capture.${key} must be a boolean`);
    }
  }
  return {
    reducedMotion: capture.reducedMotion ?? true,
    disableAnimations: capture.disableAnimations ?? true,
    hideSelectors: selectorList(capture.hideSelectors, 'capture.hideSelectors'),
    maskSelectors: selectorList(capture.maskSelectors, 'capture.maskSelectors'),
    settleMs: capture.settleMs === undefined ? 250 : positiveInteger(capture.settleMs + 1, 'capture.settleMs', 600001) - 1,
    waitUntil,
  };
}

function ratio(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(`thresholds.${label} must be between 0 and 1`);
  }
  return value;
}

function normalizeThresholds(raw) {
  const thresholds = requireObject(raw ?? {}, 'thresholds');
  rejectUnknown(thresholds, THRESHOLD_KEYS, 'thresholds: ');
  const changedRatio = ratio(thresholds.changedRatio ?? 0.0005, 'changedRatio');
  const reviewRatio = ratio(thresholds.reviewRatio ?? 0.02, 'reviewRatio');
  if (changedRatio > reviewRatio) {
    throw new Error('thresholds.changedRatio must not exceed reviewRatio');
  }
  return { pixelmatch: ratio(thresholds.pixelmatch ?? 0.1, 'pixelmatch'), changedRatio, reviewRatio };
}

function normalizeSemantic(raw, label) {
  if (raw === undefined) return { title: true, textSelectors: [], aria: null };
  const semantic = requireObject(raw, label);
  rejectUnknown(semantic, SEMANTIC_KEYS, `${label}: `);
  if (semantic.title !== undefined && typeof semantic.title !== 'boolean') {
    throw new Error(`${label}.title must be a boolean`);
  }
  if (semantic.aria !== undefined && semantic.aria !== null && typeof semantic.aria !== 'string') {
    throw new Error(`${label}.aria must be a selector string`);
  }
  return {
    title: semantic.title ?? true,
    textSelectors: selectorList(semantic.textSelectors, `${label}.textSelectors`),
    aria: semantic.aria ?? null,
  };
}

function normalizeScenarios(raw, viewportNames, captureSettleMs) {
  const legacy = !raw.scenarios;
  const source = raw.scenarios ?? raw.routes;
  if (!Array.isArray(source) || source.length === 0) {
    throw new Error('scenarios must contain at least one scenario');
  }
  const seen = new Set();
  return source.map((entry, index) => {
    const label = `scenarios[${index}]`;
    requireObject(entry, label);
    rejectUnknown(entry, legacy ? LEGACY_ROUTE_KEYS : SCENARIO_KEYS, `${label}: `);
    assertSafePath(entry.path, `${label}.path`);
    if (entry.id !== undefined && (typeof entry.id !== 'string' || !entry.id.trim())) {
      throw new Error(`${label}.id must be a non-empty string`);
    }
    if (entry.name !== undefined && (typeof entry.name !== 'string' || !entry.name.trim())) {
      throw new Error(`${label}.name must be a non-empty string`);
    }
    if (entry.description !== undefined && entry.description !== null && typeof entry.description !== 'string') {
      throw new Error(`${label}.description must be a string or null`);
    }
    if (entry.fullPage !== undefined && typeof entry.fullPage !== 'boolean') {
      throw new Error(`${label}.fullPage must be a boolean`);
    }
    const id = safeArtifactName(entry.id ?? entry.name ?? entry.path);
    if (seen.has(id)) throw new Error(`duplicate scenario id: ${id}`);
    seen.add(id);

    const viewports = entry.viewports ?? viewportNames;
    if (!Array.isArray(viewports) || viewports.length === 0) {
      throw new Error(`${label}.viewports must name at least one viewport`);
    }
    for (const name of viewports) {
      if (typeof name !== 'string') throw new Error(`${label}.viewports must contain strings`);
      if (!viewportNames.includes(name)) throw new Error(`${label}: unknown viewport: ${name}`);
    }
    const duplicateViewport = viewports.find((name, position) => viewports.indexOf(name) !== position);
    if (duplicateViewport) throw new Error(`${label}: duplicate viewport: ${duplicateViewport}`);

    const declaredSteps = (entry.steps ?? []).map((step, stepIndex) =>
      normalizeStep(step, `${label}.steps[${stepIndex}]`));
    // Legacy `waitForSelector` on a route becomes an explicit first step.
    const legacyWait = legacy ? entry.waitForSelector : null;
    const steps = legacyWait
      ? [{ action: 'waitForSelector', selector: legacyWait, timeoutMs: DEFAULT_STEP_TIMEOUT_MS }, ...declaredSteps]
      : declaredSteps;

    const settleMs = entry.settleMs ?? entry.waitForMs ?? captureSettleMs;
    if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > 600000) {
      throw new Error(`${label}.settleMs must be an integer between 0 and 600000`);
    }

    return {
      id,
      name: entry.name ?? entry.id ?? entry.path,
      path: entry.path,
      description: entry.description ?? null,
      viewports: [...viewports],
      fullPage: entry.fullPage ?? false,
      settleMs,
      steps,
      semantic: normalizeSemantic(entry.semantic, `${label}.semantic`),
    };
  });
}

function normalizeImpact(raw, scenarioIds) {
  const impact = requireObject(raw ?? {}, 'impact');
  rejectUnknown(impact, IMPACT_KEYS, 'impact: ');
  const rules = (impact.rules ?? []).map((rule, index) => {
    const label = `impact.rules[${index}]`;
    requireObject(rule, label);
    rejectUnknown(rule, IMPACT_RULE_KEYS, `${label}: `);
    const globs = rule.globs ?? (rule.glob === undefined ? undefined : [rule.glob]);
    if (!Array.isArray(globs) || globs.length === 0 || globs.some((g) => typeof g !== 'string' || !g.trim())) {
      throw new Error(`${label}: "glob" or "globs" is required`);
    }
    if (!Array.isArray(rule.scenarios) || rule.scenarios.length === 0) {
      throw new Error(`${label}: "scenarios" must list at least one scenario id`);
    }
    for (const id of rule.scenarios) {
      if (!scenarioIds.includes(id)) throw new Error(`${label}: unknown scenario: ${id}`);
    }
    return { globs: [...globs], scenarios: [...rule.scenarios] };
  });
  const smokeScenarios = impact.smokeScenarios ?? [scenarioIds[0]];
  if (!Array.isArray(smokeScenarios) || smokeScenarios.some((id) => typeof id !== 'string')) {
    throw new Error('impact.smokeScenarios must be an array of scenario ids');
  }
  for (const id of smokeScenarios) {
    if (!scenarioIds.includes(id)) throw new Error(`impact.smokeScenarios: unknown scenario: ${id}`);
  }
  return { rules, smokeScenarios: [...smokeScenarios] };
}

export function normalizeConfig(raw) {
  requireObject(raw, 'config');
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.has(key)) throw new Error(`unknown config key: ${key}`);
  }
  if (typeof raw.startCommand !== 'string' || !raw.startCommand.trim()) {
    throw new Error('startCommand is required');
  }
  if (raw.installCommand !== undefined && raw.installCommand !== null
    && (typeof raw.installCommand !== 'string' || !raw.installCommand.trim())) {
    throw new Error('installCommand must be a non-empty string when present');
  }

  const viewports = normalizeViewports(raw);
  const capture = normalizeCapture(raw.capture);
  const thresholds = normalizeThresholds(raw.thresholds);
  const scenarios = normalizeScenarios(raw, viewports.map((v) => v.name), capture.settleMs);
  const prefixes = new Set();
  for (const scenario of scenarios) {
    for (const viewport of scenario.viewports) {
      const prefix = cellArtifactNames(scenario.id, viewport).prefix;
      if (prefixes.has(prefix)) throw new Error(`colliding artifact name for scenario ${scenario.id} and viewport ${viewport}`);
      prefixes.add(prefix);
    }
  }
  const impact = normalizeImpact(raw.impact, scenarios.map((s) => s.id));

  const readyPath = raw.readyPath ?? '/';
  assertSafePath(readyPath, 'readyPath');
  const env = requireObject(raw.env ?? {}, 'env');
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`env: invalid variable name: ${key}`);
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`env.${key} must be a string, number or boolean`);
    }
  }

  const config = {
    installCommand: raw.installCommand ?? null,
    startCommand: raw.startCommand,
    readyPath,
    basePort: positiveInteger(raw.basePort ?? 4173, 'basePort', 65534),
    startupTimeoutMs: positiveInteger(raw.startupTimeoutMs ?? 120000, 'startupTimeoutMs', 3600000),
    env,
    envKeys: Object.keys(env).sort(),
    viewports,
    capture,
    thresholds,
    scenarios,
    impact,
  };
  config.public = publicConfig(config);
  return config;
}

/** Serializable view of the config with every secret-bearing value removed. */
export function publicConfig(config) {
  const knownSecrets = Object.values(config.env).map(String);
  const redactRecordedCommand = (command) => redactCommand(redactKnownValues(command, knownSecrets));
  return {
    installCommand: config.installCommand ? redactRecordedCommand(config.installCommand) : null,
    startCommand: redactRecordedCommand(config.startCommand),
    readyPath: config.readyPath,
    basePort: config.basePort,
    startupTimeoutMs: config.startupTimeoutMs,
    envKeys: config.envKeys,
    viewports: config.viewports,
    capture: config.capture,
    thresholds: config.thresholds,
    impact: config.impact,
    scenarios: config.scenarios.map((scenario) => ({
      ...scenario,
      steps: scenario.steps.map((step) => (step.secret
        ? { ...step, value: `<redacted:${step.value.length}>` }
        : step)),
    })),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function publicConfigDigest(config) {
  return createHash('sha256').update(JSON.stringify(canonical(config.public))).digest('hex');
}
