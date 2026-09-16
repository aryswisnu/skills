// Plain-text renderers for hosts that do not draw Mermaid. Bitbucket Cloud
// shows raw Mermaid source in PR text, so the same information is emitted as
// monospace ASCII that reads correctly inside any ``` fence. Both functions are
// pure: no Node imports, no I/O, same input gives the same output.

const MARKERS = {
  added: '[A]',
  modified: '[M]',
  deleted: '[D]',
  renamed: '[R]',
  unchanged: '[ ]',
};

const LEGEND = '  [A] added  [M] modified  [D] deleted  [R] renamed  [ ] unchanged';
const EMPTY_MAP = 'Change map\n\n  (no source files changed)\n';

function basenameOf(label) {
  const idx = label.lastIndexOf('/');
  return idx === -1 ? label : label.slice(idx + 1);
}

function lastTwoSegments(label) {
  const parts = label.split('/');
  return parts.length <= 2 ? label : parts.slice(-2).join('/');
}

function groupDirectory(label) {
  const idx = label.indexOf('/');
  return idx === -1 ? '.' : label.slice(0, idx);
}

function statusOf(node) {
  const status = node.changed ? node.status : 'unchanged';
  return MARKERS[status] ? status : 'modified';
}

function isFold(node) {
  return typeof node.path === 'string' && node.path.endsWith('#unchanged-imports');
}

export function renderAsciiChangeMap(graph, { base = null, head = null } = {}) {
  const nodes = [...(graph?.nodes ?? [])];
  if (nodes.length === 0) return EMPTY_MAP;

  const edges = [...(graph?.edges ?? [])];
  const byPath = new Map(nodes.map((node) => [node.path, node]));

  // Targets are shown by basename; when two of them collide, both fall back to
  // the last two label segments so the reader can still tell them apart.
  const targetLabels = [...new Set(edges.map((edge) => edge.to))]
    .map((path) => byPath.get(path)?.label)
    .filter((label) => typeof label === 'string');
  const basenameCount = new Map();
  for (const label of targetLabels) {
    const base = basenameOf(label);
    basenameCount.set(base, (basenameCount.get(base) ?? 0) + 1);
  }
  const displayTarget = (label) => (basenameCount.get(basenameOf(label)) > 1 ? lastTwoSegments(label) : basenameOf(label));

  const inDegree = new Map();
  for (const edge of edges) inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);

  const rendered = nodes.filter((node) => !isFold(node));
  const width = rendered.reduce((max, node) => Math.max(max, basenameOf(node.label).length), 0);

  const byDir = new Map();
  for (const node of rendered) {
    const dir = groupDirectory(node.label);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(node);
  }
  const dirs = [...byDir.keys()].sort((a, b) => {
    if (a === '.') return b === '.' ? 0 : 1;
    if (b === '.') return -1;
    return a.localeCompare(b);
  });

  const changedCount = nodes.filter((node) => node.changed).length;
  const range = base && head ? `  ${String(base).slice(0, 7)} -> ${String(head).slice(0, 7)}` : '';
  const lines = [`Change map${range}  (${changedCount} changed files)`, ''];

  for (const dir of dirs) {
    lines.push(`  ${dir === '.' ? '.' : `${dir}/`}`);
    const group = [...byDir.get(dir)].sort((a, b) => a.label.localeCompare(b.label));
    for (const node of group) {
      const cell = basenameOf(node.label).padEnd(width, ' ');
      let tail = '';
      if (statusOf(node) === 'unchanged') {
        tail = `(imported by ${inDegree.get(node.path) ?? 0})`;
      } else {
        const targets = edges
          .filter((edge) => edge.from === node.path)
          .map((edge) => byPath.get(edge.to)?.label)
          .filter((label) => typeof label === 'string')
          // A folded "+N unchanged imports" target reads best last, after the
      // named files, so it is not sorted by its leading "+".
      .sort((a, b) => (a.startsWith('+') - b.startsWith('+')) || a.localeCompare(b))
          .map(displayTarget);
        if (targets.length > 0) tail = `-> ${targets.join(', ')}`;
      }
      lines.push(`    ${MARKERS[statusOf(node)]} ${cell}  ${tail}`.trimEnd());
    }
  }

  lines.push('', LEGEND, '');
  return lines.join('\n');
}

const ARROW = /^(\S+?)\s*(--?>>|--?>|--?\)|--?x)\s*(\S+?)\s*:\s*(.*)$/;
const PARTICIPANT = /^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i;
const NOTE = /^note\s+(?:over|left of|right of)\s+([^:]+):\s*(.*)$/i;
const BLOCK = /^(loop|alt|else|opt|par)\b\s*(.*)$/i;

function stripFence(text) {
  const lines = String(text).split('\n');
  if (lines.length > 0 && lines[0].trim().startsWith('```')) {
    lines.shift();
    while (lines.length > 0 && !lines[lines.length - 1].trim().startsWith('```')) lines.pop();
    lines.pop();
  }
  return lines;
}

// Writes text into a row, growing the row with spaces when the text runs past
// the last column so nothing is silently truncated.
function place(row, col, text) {
  for (let i = 0; i < text.length; i += 1) {
    const at = col + i;
    if (at < 0) continue;
    while (row.length <= at) row.push(' ');
    row[at] = text[i];
  }
}

export function renderAsciiSequence(mermaidText) {
  if (typeof mermaidText !== 'string') return null;

  const raw = stripFence(mermaidText)
    .map((line) => (line.trim().startsWith('%%') ? '' : line.replace(/\s*%%.*$/, '')).trim())
    .filter((line) => line !== '');
  if (raw.length === 0) return null;
  if (!/^sequenceDiagram\b/i.test(raw[0])) return null;

  const body = raw.slice(1);
  const order = [];
  const display = new Map();
  const see = (id) => {
    if (!order.includes(id)) order.push(id);
  };

  for (const line of body) {
    const declared = PARTICIPANT.exec(line);
    if (declared) {
      see(declared[1]);
      display.set(declared[1], (declared[2] ?? declared[1]).trim());
      continue;
    }
    const message = ARROW.exec(line);
    if (message) {
      see(message[1]);
      see(message[3]);
      continue;
    }
    const note = NOTE.exec(line);
    if (note) for (const name of note[1].split(',')) see(name.trim());
  }
  if (order.length === 0) return null;

  const nameOf = (id) => display.get(id) ?? id;
  const columnWidth = Math.max(12, ...order.map((id) => nameOf(id).length)) + 4;
  const total = order.length * columnWidth;
  const centerOf = (id) => order.indexOf(id) * columnWidth + Math.floor(columnWidth / 2);

  const lifelines = () => {
    const row = new Array(total).fill(' ');
    for (const id of order) row[centerOf(id)] = '|';
    return row;
  };

  const rows = [];
  const header = new Array(total).fill(' ');
  for (const id of order) {
    const name = nameOf(id);
    place(header, centerOf(id) - Math.floor(name.length / 2), name);
  }
  rows.push(header);
  rows.push(lifelines());

  let hasContent = false;

  for (const line of body) {
    if (PARTICIPANT.test(line)) continue;
    if (/^autonumber\b/i.test(line) || /^(?:activate|deactivate)\b/i.test(line)) continue;

    const message = ARROW.exec(line);
    if (message) {
      const [, from, token, to, text] = message;
      const dashed = token.startsWith('--');
      const head = token.endsWith('x') ? 'x' : null;

      if (from === to) {
        const center = centerOf(from);
        const top = lifelines();
        place(top, center + 1, '--.');
        const middle = lifelines();
        place(middle, center + 3, `| ${text}`.trimEnd());
        const bottom = lifelines();
        place(bottom, center + 1, "<-'");
        rows.push(top, middle, bottom);
        hasContent = true;
        continue;
      }

      const source = centerOf(from);
      const dest = centerOf(to);
      const left = Math.min(source, dest);

      const textRow = lifelines();
      place(textRow, left + 3, text);
      rows.push(textRow);

      const arrowRow = lifelines();
      if (dest > source) {
        for (let col = source + 1; col <= dest; col += 1) {
          arrowRow[col] = dashed && (col - (source + 1)) % 2 === 1 ? ' ' : '-';
        }
        arrowRow[dest] = head ?? '>';
      } else {
        for (let col = dest; col <= source - 1; col += 1) {
          arrowRow[col] = dashed && (col - (dest + 1)) % 2 === 1 ? ' ' : '-';
        }
        arrowRow[dest] = head ?? '<';
      }
      rows.push(arrowRow);
      hasContent = true;
      continue;
    }

    const note = NOTE.exec(line);
    if (note) {
      const anchors = note[1].split(',').map((name) => name.trim()).filter((name) => order.includes(name));
      if (anchors.length === 0) continue;
      const col = Math.min(...anchors.map((name) => centerOf(name)));
      const row = lifelines();
      place(row, col, `[ ${note[2].trim()} ]`);
      rows.push(row);
      hasContent = true;
      continue;
    }

    if (/^end\b/i.test(line)) {
      rows.push(`-- end ${'-'.repeat(Math.max(2, total - 8))}`.split(''));
      hasContent = true;
      continue;
    }

    const block = BLOCK.exec(line);
    if (block) {
      const prefix = `-- ${block[1].toLowerCase()}: ${block[2].trim()} `;
      rows.push(`${prefix}${'-'.repeat(Math.max(2, total - prefix.length))}`.split(''));
      hasContent = true;
    }
  }

  if (!hasContent) return null;
  return rows.map((row) => row.join('').replace(/\s+$/, '')).join('\n');
}
