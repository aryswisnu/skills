// A deliberately small glob dialect: `**` (any path segments), `*` (within one segment),
// `?` (one non-separator character). Everything else is literal.
// ponytail: hand-rolled because Node 20 has no `path.matchesGlob`; swap to it on Node 22+.
export function globToRegExp(glob) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          pattern += '(?:[^/]+/)*';
        } else {
          pattern += '.*';
        }
      } else {
        pattern += '[^/]*';
      }
    } else if (char === '?') {
      pattern += '[^/]';
    } else {
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * Map changed files to scenario ids using explicit rules. No inference: when nothing matches,
 * the fallback is stated in `reason` so the report can say why a scenario was captured.
 */
export function selectScenarios(changedFiles, impact, allScenarioIds) {
  const rules = impact.rules ?? [];
  if (rules.length === 0) {
    return {
      scenarioIds: [...allScenarioIds],
      reason: 'no-impact-rules-configured-capture-all',
      matchedRules: [],
      unmatchedFiles: [...changedFiles],
    };
  }

  const matchedRules = [];
  const selected = new Set();
  const unmatchedFiles = [];
  for (const file of changedFiles) {
    let fileMatched = false;
    for (const rule of rules) {
      for (const glob of rule.globs) {
        if (!globToRegExp(glob).test(file)) continue;
        fileMatched = true;
        matchedRules.push({ glob, file, scenarios: [...rule.scenarios] });
        for (const id of rule.scenarios) selected.add(id);
        break;
      }
    }
    if (!fileMatched) unmatchedFiles.push(file);
  }

  const order = (ids) => allScenarioIds.filter((id) => ids.has(id));
  if (selected.size > 0) {
    return { scenarioIds: order(selected), reason: 'impact-rules', matchedRules, unmatchedFiles };
  }
  const smoke = impact.smokeScenarios ?? [];
  if (smoke.length > 0) {
    return {
      scenarioIds: order(new Set(smoke)),
      reason: 'no-rule-matched-smoke-fallback',
      matchedRules,
      unmatchedFiles,
    };
  }
  return {
    scenarioIds: [...allScenarioIds],
    reason: 'no-rule-matched-no-smoke-configured-capture-all',
    matchedRules,
    unmatchedFiles,
  };
}
