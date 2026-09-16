// Mermaid change map: turn the changed files of a PR into an import graph and
// render it as a ```mermaid fenced flowchart that GitHub draws natively, so no
// image upload is needed for colleagues to see what moved.

import { commonPrefixLength, directorySegments } from './backend.mjs';

const MAX_NODES = 40;
const MAX_UNCHANGED_PER_FILE = 5;

const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.go', '.rb', '.php', '.java', '.kt', '.rs', '.cs',
]);

const JS_EXTENSIONS = ['.js', '.mjs', '.ts', '.tsx', '.jsx', '.mts', '.cts'];

const JS_SOURCE = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'];

const STATUS_BY_LETTER = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'added', T: 'modified' };
const KNOWN_STATUSES = new Set(['added', 'modified', 'deleted', 'renamed']);

function normalizeStatus(status) {
  const value = String(status ?? '');
  if (KNOWN_STATUSES.has(value)) return value;
  return STATUS_BY_LETTER[value.charAt(0)] ?? 'modified';
}

function extensionOf(filePath) {
  const base = filePath.slice(filePath.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

function dirnameOf(filePath) {
  const idx = filePath.lastIndexOf('/');
  return idx === -1 ? '' : filePath.slice(0, idx);
}

function topSegment(filePath) {
  const idx = filePath.indexOf('/');
  return idx === -1 ? filePath : filePath.slice(0, idx);
}

function joinPath(dir, relative) {
  const segments = dir === '' ? [] : dir.split('/');
  for (const part of relative.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments.join('/');
}

function matchAll(text, regex) {
  const found = [];
  for (const match of String(text).matchAll(regex)) {
    if (match[1]) found.push(match[1]);
  }
  return found;
}

function extractSpecifiers(filePath, text) {
  const ext = extensionOf(filePath);
  const source = String(text);

  if (JS_SOURCE.includes(ext)) {
    return [
      ...matchAll(source, /\bimport\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g),
      ...matchAll(source, /\bimport\s*['"]([^'"]+)['"]/g),
      ...matchAll(source, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...matchAll(source, /\bexport\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g),
    ];
  }
  if (ext === '.py') {
    return [
      ...matchAll(source, /^[ \t]*import[ \t]+([.\w]+)/gm),
      ...matchAll(source, /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]/gm),
    ];
  }
  if (ext === '.go') {
    const specs = [...matchAll(source, /^[ \t]*import[ \t]+"([^"]+)"/gm)];
    for (const block of source.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) {
      specs.push(...matchAll(block[1], /"([^"]+)"/g));
    }
    return specs;
  }
  if (ext === '.rb') {
    return matchAll(source, /\brequire_relative\s+['"]([^'"]+)['"]/g);
  }
  if (ext === '.php') {
    return [
      ...matchAll(source, /^[ \t]*use[ \t]+([A-Za-z_\\][\w\\]*)\s*;/gm),
      ...matchAll(source, /\b(?:require|require_once|include|include_once)\s*\(?\s*['"]([^'"]+)['"]/g),
    ];
  }
  if (ext === '.java' || ext === '.kt') {
    return matchAll(source, /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+)/gm);
  }
  if (ext === '.rs') {
    return [
      ...matchAll(source, /\buse\s+crate::([\w:]+)/g),
      ...matchAll(source, /^[ \t]*(?:pub[ \t]+)?mod[ \t]+(\w+)[ \t]*;/gm),
    ];
  }
  if (ext === '.cs') {
    return matchAll(source, /^[ \t]*using[ \t]+([\w.]+)\s*;/gm);
  }
  return [];
}

function dottedCandidates(spec, roots, extensions) {
  const asPath = spec
    .replace(/::/g, '/')
    .replace(/[.\\]+/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
  if (asPath === '') return [];
  const candidates = [];
  for (const root of roots) {
    const prefix = root === '' ? '' : `${root}/`;
    for (const ext of extensions) {
      candidates.push(`${prefix}${asPath}${ext}`);
      if (ext === '.py') candidates.push(`${prefix}${asPath}/__init__.py`);
      if (ext === '.rs') candidates.push(`${prefix}${asPath}/mod.rs`);
    }
  }
  return candidates;
}

function candidatePaths(filePath, spec) {
  const ext = extensionOf(filePath);
  const dir = dirnameOf(filePath);

  if (JS_SOURCE.includes(ext)) {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return [];
    const resolved = joinPath(dir, spec);
    if (resolved === '') return [];
    const candidates = [resolved];
    for (const candidateExt of JS_EXTENSIONS) candidates.push(`${resolved}${candidateExt}`);
    for (const candidateExt of JS_EXTENSIONS) candidates.push(`${resolved}/index${candidateExt}`);
    return candidates;
  }
  if (ext === '.py') {
    if (spec.startsWith('.')) {
      const leading = spec.match(/^\.+/)[0].length;
      const up = '../'.repeat(Math.max(0, leading - 1));
      const rest = spec.slice(leading).split('.').filter(Boolean).join('/');
      const base = joinPath(dir, `${up}${rest}`);
      return base === '' ? [] : [`${base}.py`, `${base}/__init__.py`];
    }
    return dottedCandidates(spec, [''], ['.py']);
  }
  if (ext === '.go') {
    const trimmed = spec.replace(/^\/|\/$/g, '');
    if (trimmed === '' || !trimmed.includes('/')) return [];
    const leaf = trimmed.slice(trimmed.lastIndexOf('/') + 1);
    return [`${trimmed}.go`, `${trimmed}/${leaf}.go`];
  }
  if (ext === '.rb') {
    const base = joinPath(dir, spec);
    return base === '' ? [] : [base, `${base}.rb`];
  }
  if (ext === '.php') {
    if (spec.includes('/') || spec.startsWith('.')) {
      const base = joinPath(dir, spec);
      return base === '' ? [] : [base, `${base}.php`];
    }
    return dottedCandidates(spec, ['', 'src', 'app'], ['.php']);
  }
  if (ext === '.java' || ext === '.kt') {
    const fileExt = ext === '.java' ? '.java' : '.kt';
    return dottedCandidates(spec, ['', 'src', 'src/main/java', 'src/main/kotlin'], [fileExt]);
  }
  if (ext === '.rs') {
    if (spec.includes('::')) return dottedCandidates(spec, ['', 'src'], ['.rs']);
    const base = joinPath(dir, spec);
    return base === '' ? [] : [`${base}.rs`, `${base}/mod.rs`];
  }
  if (ext === '.cs') {
    return dottedCandidates(spec, ['', 'src'], ['.cs']);
  }
  return [];
}

function sanitizeId(filePath) {
  return `n_${filePath.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

function labelsFor(paths) {
  const dirs = paths.map((path) => directorySegments(path));
  const distinctTops = new Set(paths.map((path) => topSegment(path)));
  const prefixLength = distinctTops.size === 1 ? commonPrefixLength(dirs) : 0;
  const labels = new Map();
  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i];
    const rest = dirs[i].slice(prefixLength);
    const base = path.slice(path.lastIndexOf('/') + 1);
    labels.set(path, rest.length > 0 ? `${rest.join('/')}/${base}` : base);
  }
  return labels;
}

export async function buildModuleGraph({ files = [], readFile = () => null } = {}) {
  const sourceFiles = files
    .filter((file) => file && typeof file.path === 'string' && SOURCE_EXTENSIONS.has(extensionOf(file.path)))
    .map((file) => ({
      path: file.path,
      status: normalizeStatus(file.status),
      weight: Number.isFinite(file.added) || Number.isFinite(file.deleted)
        ? (Number(file.added) || 0) + (Number(file.deleted) || 0)
        : null,
    }));

  const changedPaths = new Set(sourceFiles.map((file) => file.path));
  const cache = new Map();
  const read = async (path) => {
    if (!cache.has(path)) cache.set(path, await readFile(path));
    return cache.get(path);
  };

  const edgeKeys = new Set();
  for (const file of sourceFiles) {
    const text = await read(file.path);
    if (text == null) continue;
    for (const spec of extractSpecifiers(file.path, text)) {
      let target = null;
      for (const candidate of candidatePaths(file.path, spec)) {
        if (candidate === file.path) continue;
        if (changedPaths.has(candidate) || (await read(candidate)) != null) {
          target = candidate;
          break;
        }
      }
      if (target) edgeKeys.add(JSON.stringify([file.path, target]));
    }
  }

  const allEdges = [...edgeKeys]
    .map((key) => {
      const [from, to] = JSON.parse(key);
      return { from, to };
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const inDegree = new Map();
  for (const edge of allEdges) inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);

  const changedRanked = [...sourceFiles].sort((a, b) => {
    if (a.weight != null && b.weight != null && a.weight !== b.weight) return b.weight - a.weight;
    return a.path.localeCompare(b.path);
  });

  const externalRanked = [...new Set(allEdges.map((edge) => edge.to))]
    .filter((path) => !changedPaths.has(path))
    .sort((a, b) => (inDegree.get(b) ?? 0) - (inDegree.get(a) ?? 0) || a.localeCompare(b));

  const kept = [];
  for (const file of changedRanked) {
    if (kept.length >= MAX_NODES) break;
    kept.push({ path: file.path, status: file.status, changed: true });
  }
  for (const path of externalRanked) {
    if (kept.length >= MAX_NODES) break;
    kept.push({ path, status: 'unchanged', changed: false });
  }

  let keptPaths = new Set(kept.map((node) => node.path));
  let edges = allEdges.filter((edge) => keptPaths.has(edge.from) && keptPaths.has(edge.to));

  // Collapse fan-out: a changed file importing many unchanged modules would
  // drown the diagram in grey boxes. Above MAX_UNCHANGED_PER_FILE, those edges
  // fold into one "+N unchanged imports" node per changed file. Unchanged
  // targets also imported by another kept file stay visible.
  const foldedNodes = [];
  const foldedEdges = [];
  for (const node of kept.filter((entry) => entry.changed)) {
    const out = edges.filter((edge) => edge.from === node.path && !changedPaths.has(edge.to));
    if (out.length <= MAX_UNCHANGED_PER_FILE) continue;
    const foldPath = `${node.path}#unchanged-imports`;
    foldedNodes.push({ path: foldPath, status: 'unchanged', changed: false, label: `+${out.length} unchanged imports` });
    foldedEdges.push({ from: node.path, to: foldPath });
    const dropped = new Set(out.map((edge) => edge.to));
    edges = edges.filter((edge) => !(edge.from === node.path && dropped.has(edge.to)));
  }
  if (foldedNodes.length > 0) {
    const referenced = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    const trimmed = kept.filter((node) => node.changed || referenced.has(node.path));
    kept.length = 0;
    kept.push(...trimmed, ...foldedNodes);
    keptPaths = new Set(kept.map((node) => node.path));
    edges = [...edges, ...foldedEdges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  }

  const ordered = [...kept].sort((a, b) => a.path.localeCompare(b.path));
  const labels = labelsFor(ordered.map((node) => node.path));
  const usedIds = new Set();
  const nodes = ordered.map((node) => {
    let id = sanitizeId(node.path);
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}_${suffix}`)) suffix += 1;
      id = `${id}_${suffix}`;
    }
    usedIds.add(id);
    return { id, path: node.path, label: node.label ?? labels.get(node.path), status: node.status, changed: node.changed };
  });

  return { nodes, edges };
}

function escapeLabel(label) {
  return String(label)
    .replaceAll('"', '#quot;')
    .replaceAll('<', '#lt;')
    .replaceAll('>', '#gt;')
    .replaceAll('`', '#96;');
}

function groupDirectory(label) {
  const idx = label.indexOf('/');
  return idx === -1 ? '.' : label.slice(0, idx);
}

const CLASS_DEFS = [
  'classDef added fill:#dcfce7,stroke:#16a34a,color:#14532d',
  'classDef modified fill:#fef3c7,stroke:#d97706,color:#78350f',
  'classDef deleted fill:#fee2e2,stroke:#dc2626,color:#7f1d1d',
  'classDef renamed fill:#dbeafe,stroke:#2563eb,color:#1e3a8a',
  'classDef unchanged fill:#f3f4f6,stroke:#9ca3af,color:#374151',
];

const CLASS_ORDER = ['added', 'modified', 'deleted', 'renamed', 'unchanged'];

export function renderMermaidFlowchart(graph, { base = null, head = null, title = null } = {}) {
  const nodes = [...(graph?.nodes ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  const edges = [...(graph?.edges ?? [])].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const lines = ['```mermaid', 'flowchart LR'];

  if (title) lines.push(`  %% ${String(title).replaceAll('\n', ' ')}`);
  if (base && head) lines.push(`  %% ${String(base).slice(0, 7)} to ${String(head).slice(0, 7)}`);

  if (nodes.length === 0) {
    lines.push('  empty["No source files changed"]');
    lines.push('```');
    return lines.join('\n');
  }

  const idByPath = new Map(nodes.map((node) => [node.path, node.id]));
  const textFor = (node) => {
    const label = node.status === 'deleted' ? `${node.label} (deleted)` : node.label;
    return `${node.id}["${escapeLabel(label)}"]`;
  };

  const byDir = new Map();
  for (const node of nodes) {
    const dir = groupDirectory(node.label);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(node);
  }
  const dirs = [...byDir.keys()].sort((a, b) => a.localeCompare(b));

  if (dirs.length >= 2) {
    for (const dir of dirs) {
      lines.push(`  subgraph dir_${dir.replace(/[^A-Za-z0-9_]/g, '_')} ["${escapeLabel(dir)}"]`);
      for (const node of byDir.get(dir)) lines.push(`    ${textFor(node)}`);
      lines.push('  end');
    }
  } else {
    for (const node of nodes) lines.push(`  ${textFor(node)}`);
  }

  for (const edge of edges) {
    const from = idByPath.get(edge.from);
    const to = idByPath.get(edge.to);
    if (from && to) lines.push(`  ${from} --> ${to}`);
  }

  for (const def of CLASS_DEFS) lines.push(`  ${def}`);
  for (const className of CLASS_ORDER) {
    const ids = nodes
      .filter((node) => (node.changed ? node.status : 'unchanged') === className)
      .map((node) => node.id);
    if (ids.length > 0) lines.push(`class ${ids.join(',')} ${className}`);
  }

  lines.push('```');
  return lines.join('\n');
}
