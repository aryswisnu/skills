import { diagramSection } from './backend.mjs';

export const VERDICT_ORDER = ['capture-failed', 'review-required', 'changed-within-threshold', 'unchanged'];

const VERDICT_LABEL = {
  'capture-failed': 'NOT CAPTURED',
  'review-required': 'REVIEW REQUIRED',
  'changed-within-threshold': 'CHANGED, WITHIN THRESHOLD',
  unchanged: 'UNCHANGED',
};

const SELECTION_REASON = {
  'impact-rules': 'matched explicit impact rules for the changed files',
  'no-rule-matched-smoke-fallback': 'no impact rule matched the changed files, so the configured smoke scenarios were captured',
  'no-impact-rules-configured-capture-all': 'no impact rules are configured, so every scenario was captured',
  'no-rule-matched-no-smoke-configured-capture-all': 'no impact rule matched and no smoke scenarios are configured, so every scenario was captured',
  'explicit-all-flag': 'every scenario was captured because the --all flag was passed',
  'explicit-scenario-flag': 'only the scenarios named on the command line were captured',
};

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function markdownText(value) {
  return escapeHtml(value).replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]()#+.!|>-])/g, '\\$1');
}

function code(value) {
  return `\`${escapeHtml(value).replace(/[\r\n]+/g, ' ').replaceAll('`', '&#96;')}\``;
}

function imageAlt(value) {
  return escapeHtml(value).replace(/[\r\n]+/g, ' ').replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function sortCells(cells) {
  return [...cells].sort((a, b) => {
    const rank = VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict);
    if (rank !== 0) return rank;
    const ratio = (b.pixel?.changeRatio ?? 0) - (a.pixel?.changeRatio ?? 0);
    if (ratio !== 0) return ratio;
    return `${a.scenarioId}-${a.viewport}`.localeCompare(`${b.scenarioId}-${b.viewport}`);
  });
}

function counts(cells) {
  const result = {};
  for (const verdict of VERDICT_ORDER) result[verdict] = 0;
  for (const cell of cells) result[cell.verdict] += 1;
  return result;
}

function runtimeLines(label, runtime) {
  const lines = [];
  for (const [field, title] of [
    ['pageErrors', 'Page errors'],
    ['consoleErrors', 'Console errors'],
    ['failedRequests', 'Failed requests'],
    ['assertionFailures', 'Assertion failures'],
  ]) {
    const entries = runtime?.[field] ?? [];
    if (entries.length === 0) continue;
    lines.push(`- **${markdownText(label)} · ${title}:**`);
    for (const entry of entries) lines.push(`  - ${code(entry)}`);
  }
  return lines;
}

export function renderReport(report, diagram = null) {
  const cells = sortCells(report.cells);
  const tally = counts(cells);
  const lines = [
    '# Visual PR Review',
    '',
    `**Base:** ${code(report.base.ref)} at ${code(report.base.sha)}`,
    `**Head:** ${code(report.head.ref)} at ${code(report.head.sha)}`,
    `**Generated:** ${report.generatedAt} in ${report.durationMs} ms`,
    `**Public-config digest:** ${code(report.provenance.publicConfigDigest)}`,
    '',
    'This report is evidence for a human reviewer. It does not approve, merge, or bless the change.',
    '',
    '## Verdict tally',
    '',
    '| Verdict | Cells |',
    '| --- | ---: |',
    ...VERDICT_ORDER.map((verdict) => `| ${VERDICT_LABEL[verdict]} | ${tally[verdict]} |`),
    '',
    '## Scenario selection',
    '',
    `Captured ${report.selection.scenarioIds.length} scenario(s) because ${markdownText(SELECTION_REASON[report.selection.reason] ?? report.selection.reason)} (${code(report.selection.reason)}).`,
    '',
  ];

  if (report.selection.matchedRules.length > 0) {
    lines.push('| Changed file | Matched glob | Scenarios |', '| --- | --- | --- |');
    for (const rule of report.selection.matchedRules) {
      lines.push(`| ${code(rule.file)} | ${code(rule.glob)} | ${rule.scenarios.map(markdownText).join(', ')} |`);
    }
    lines.push('');
  }
  if (report.selection.unmatchedFiles.length > 0) {
    lines.push(
      `<details><summary>${report.selection.unmatchedFiles.length} changed file(s) matched no impact rule</summary>`,
      '',
      ...report.selection.unmatchedFiles.map((file) => `- ${code(file)}`),
      '',
      '</details>',
      '',
    );
  }
  if (report.skippedScenarios.length > 0) {
    lines.push(
      '### Not captured in this run',
      '',
      ...report.skippedScenarios.map((scenario) => `- **${markdownText(scenario.name)}** (${code(scenario.id)}) — ${markdownText(scenario.reason)}`),
      '',
      'These states have no evidence here. Absence of an image is not evidence of no change.',
      '',
    );
  }

  lines.push(
    '## Code changes',
    '',
    ...(report.changedFiles.length ? report.changedFiles.map((file) => `- ${code(file)}`) : ['- None']),
    '',
    ...(report.diffStat
      ? String(report.diffStat).split('\n').map((line) => `    ${escapeHtml(line)}`)
      : ['    No diff stat available.']),
    '',
    '[Full binary-safe patch](changes.patch)',
    '',
    '## Evidence',
    '',
  );

  for (const cell of cells) {
    lines.push(
      `### ${markdownText(cell.scenarioName)}`,
      '',
      `**${VERDICT_LABEL[cell.verdict]}** · viewport ${code(cell.viewport)} (${cell.viewportSize.width}x${cell.viewportSize.height}) · route ${code(cell.path)}`,
      '',
    );
    if (cell.reasons.length > 0) {
      lines.push(...cell.reasons.map((reason) => `- ${markdownText(reason)}`), '');
    }
    if (cell.pixel) {
      lines.push(
        `Changed pixels: **${(cell.pixel.changeRatio * 100).toFixed(2)}%** (${cell.pixel.changedPixels.toLocaleString('en-US')} of ${cell.pixel.totalPixels.toLocaleString('en-US')})`,
        '',
      );
    }
    if (cell.runtime?.delta?.regressed) {
      lines.push('**Runtime regression on head:**', '', ...runtimeLines('Head only', cell.runtime.delta), '');
    }
    if (cell.semantic?.changedCount > 0) {
      lines.push(`**Semantic change:** ${cell.semantic.changed.map(code).join(', ')}`, '');
    }
    if (cell.artifacts.sideBySide) {
      lines.push(`![${imageAlt(`${cell.scenarioName} · ${cell.viewport} · side-by-side`)}](${cell.artifacts.sideBySide})`, '');
    }

    const details = [];
    for (const [key, label] of [['before', 'before'], ['after', 'after'], ['diff', 'pixel diff']]) {
      if (!cell.artifacts[key]) continue;
      details.push(`**${label}**`, '', `![${imageAlt(`${cell.scenarioName} · ${cell.viewport} · ${label}`)}](${cell.artifacts[key]})`, '');
    }
    const baseRuntime = runtimeLines('Base', cell.runtime?.base);
    const headRuntime = runtimeLines('Head', cell.runtime?.head);
    if (baseRuntime.length || headRuntime.length) {
      details.push('**Runtime evidence, per revision**', '', ...baseRuntime, ...headRuntime, '');
    }
    if (details.length > 0) {
      lines.push('<details><summary>Individual captures and runtime evidence</summary>', '', ...details, '</details>', '');
    }
    if (cell.verdict === 'capture-failed') {
      lines.push('No comparable evidence exists for this state. Review it by hand.', '');
    }
  }

  lines.push(
    '## Review boundary',
    '',
    'These captures show rendered output for the configured scenarios, viewports and local data of two git revisions. They do not prove functional correctness, accessibility, security, performance, or test coverage, and this report does not approve the change. A human decides.',
    '',
    '## Provenance',
    '',
    `- Browser: \`${report.provenance.browser?.version ?? 'unknown'}\``,
    `- Public-config digest (SHA-256): ${code(report.provenance.publicConfigDigest)}`,
    `- Artifacts hashed: ${Object.keys(report.provenance.artifactHashes ?? {}).length}`,
    '',
    'Full provenance, including self-consistency SHA-256 hashes for every artifact and redacted commands, is in `manifest.json`. These hashes are not signatures or external attestations.',
    '',
  );

  const sequence = diagramSection(diagram, '## Sequence');
  if (sequence) lines.push(sequence, '');

  return lines.join('\n');
}

export function buildSummary(report) {
  const tally = counts(report.cells);
  return {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    durationMs: report.durationMs,
    base: report.base,
    head: report.head,
    counts: tally,
    reviewRequired: tally['review-required'] > 0 || tally['capture-failed'] > 0,
    selection: report.selection,
    skippedScenarios: report.skippedScenarios,
    cells: sortCells(report.cells).map((cell) => ({
      scenarioId: cell.scenarioId,
      scenarioName: cell.scenarioName,
      viewport: cell.viewport,
      path: cell.path,
      verdict: cell.verdict,
      reasons: cell.reasons,
      changeRatio: cell.pixel?.changeRatio ?? null,
      runtimeRegressed: cell.runtime?.delta?.regressed ?? false,
      semanticChanged: cell.semantic?.changed ?? [],
      artifacts: cell.artifacts,
    })),
    provenance: report.provenance,
  };
}
