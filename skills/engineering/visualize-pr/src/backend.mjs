// Backend / non-web change evidence: turn a git diff into a plain-language
// change summary plus an editorial "change map" diagram. No browser required.
//
// Styling follows the diagram-design editorial system (paper / ink / one accent
// color, sparse density, no rounded-box slop).

const ACCENT = '#eb6c36';
const PAPER = '#f5f5f5';
const INK = '#2d3142';
const MUTED = '#6b7280';

function topSegment(filePath) {
  const idx = filePath.indexOf('/');
  return idx === -1 ? filePath : filePath.slice(0, idx);
}

export function directorySegments(filePath) {
  const idx = filePath.lastIndexOf('/');
  return idx === -1 ? [] : filePath.slice(0, idx).split('/');
}

export function commonPrefixLength(listOfSegments) {
  if (listOfSegments.length === 0) return 0;
  const first = listOfSegments[0];
  let depth = 0;
  while (depth < first.length) {
    const segment = first[depth];
    if (listOfSegments.every((segs) => segs[depth] === segment)) depth += 1;
    else break;
  }
  return depth;
}

function statusLabel(status) {
  const labels = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', T: 'type changed' };
  return labels[status] ?? status;
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function parseNumstat(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const [added, deleted, ...rest] = line.split('\t');
    let path = rest.join('\t');
    if (path.includes(' => ')) path = path.split(' => ')[1];
    rows.push({
      added: added === '-' ? 0 : Number(added),
      deleted: deleted === '-' ? 0 : Number(deleted),
      path,
    });
  }
  return rows;
}

export function parseNameStatus(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0].charAt(0);
    const path = parts.length >= 3 ? parts[2] : parts[1];
    rows.push({ status, path });
  }
  return rows;
}

export function summarizeChange(nameStatus, numstat) {
  const byPath = new Map();
  for (const row of numstat) byPath.set(row.path, row);

  const files = [];
  let totalAdded = 0;
  let totalDeleted = 0;
  let addedCount = 0;
  let modifiedCount = 0;
  let deletedCount = 0;

  for (const entry of nameStatus) {
    const ns = byPath.get(entry.path) ?? { added: 0, deleted: 0 };
    totalAdded += ns.added;
    totalDeleted += ns.deleted;
    if (entry.status === 'A') addedCount += 1;
    else if (entry.status === 'D') deletedCount += 1;
    else modifiedCount += 1;
    files.push({ path: entry.path, status: entry.status, added: ns.added, deleted: ns.deleted });
  }

  const dirs = files.map((file) => directorySegments(file.path));
  const distinctTopSegments = new Set(files.map((file) => topSegment(file.path)));
  const stripPrefix = distinctTopSegments.size === 1;
  const prefixLength = stripPrefix ? commonPrefixLength(dirs) : 0;

  const groupMap = new Map();
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const rest = dirs[i].slice(prefixLength);
    const name = rest.length > 0 ? rest[0] : topSegment(file.path);
    if (!groupMap.has(name)) groupMap.set(name, { name, files: 0, added: 0, deleted: 0 });
    const group = groupMap.get(name);
    group.files += 1;
    group.added += file.added;
    group.deleted += file.deleted;
  }

  const groups = [...groupMap.values()]
    .map((group) => ({ ...group, changed: group.added + group.deleted }))
    .sort((a, b) => b.changed - a.changed || a.name.localeCompare(b.name));

  return {
    totalFiles: files.length,
    totalAdded,
    totalDeleted,
    addedCount,
    modifiedCount,
    deletedCount,
    groups,
    files,
  };
}

export function buildChangeSummary(summary, base, head, mermaid = null, diagram = null) {
  const lines = [];
  lines.push('## Change summary');
  lines.push('');
  lines.push(`\`${base.slice(0, 7)}\` -> \`${head.slice(0, 7)}\``);
  lines.push('');
  lines.push(`- **${summary.totalFiles} files changed** (+${summary.totalAdded} -${summary.totalDeleted})`);
  lines.push(`- Added: ${summary.addedCount} - Modified: ${summary.modifiedCount} - Deleted: ${summary.deletedCount}`);
  lines.push('');

  const sequence = diagramSection(diagram);
  if (sequence) {
    lines.push(sequence);
    lines.push('');
  }

  if (mermaid) {
    lines.push('### Change map');
    lines.push('');
    lines.push(mermaid);
    lines.push('');
  }

  if (summary.groups.length > 0) {
    lines.push('### By module');
    lines.push('');
    lines.push('| Module | Files | +Added | -Deleted |');
    lines.push('| --- | --- | --- | --- |');
    for (const group of summary.groups) {
      lines.push(`| \`${group.name}\` | ${group.files} | +${group.added} | -${group.deleted} |`);
    }
    lines.push('');
  }

  const top = [...summary.files]
    .sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted))
    .slice(0, 5);
  if (top.length > 0) {
    lines.push('### Most changed files');
    lines.push('');
    for (const file of top) {
      lines.push(`- \`${file.path}\` (${statusLabel(file.status)}, +${file.added} -${file.deleted})`);
    }
  }
  return lines.join('\n');
}

export function diagramSection(diagram, heading = '### Sequence') {
  if (!diagram) return null;
  const text = String(diagram).trim();
  if (!text) return null;
  const fenced = text.startsWith('```') ? text : `\`\`\`mermaid\n${text}\n\`\`\``;
  return [heading, '', fenced].join('\n');
}

export function compactChangeLine(summary) {
  const n = summary.totalFiles;
  const head = `${n} file${n === 1 ? '' : 's'} changed (+${summary.totalAdded} -${summary.totalDeleted})`;
  if (n > 0 && n <= 3) return `${head}: ${summary.files.map((file) => `\`${file.path}\``).join(', ')}`;
  return head;
}

export function buildBackendComment(summary, base, head, pr, imageUrl = null, mermaid = null, diagram = null, notes = null) {
  const lines = [];
  lines.push('## Visual review');
  lines.push('');
  lines.push(`**${pr.title}** \`${pr.baseRef}\` (\`${base.slice(0, 7)}\`) -> \`${pr.headRef}\` (\`${head.slice(0, 7)}\`)`);
  lines.push('');
  // Agent-written summary and pseudocode come first: that is what a reviewer
  // reads, the rest is evidence for it.
  const noteText = notes ? String(notes).trim() : '';
  if (noteText) {
    lines.push(noteText);
    lines.push('');
  }
  // The sequence diagram is the first piece of evidence, directly under the
  // headline the notes give it; the file-level map comes last.
  const sequence = diagramSection(diagram);
  if (sequence) {
    lines.push(sequence);
    lines.push('');
  }
  lines.push(compactChangeLine(summary));
  lines.push('');
  // The module table and the ranking only earn their space when they say more
  // than the one-line summary already did.
  if (summary.groups.length >= 2) {
    lines.push('### By module');
    lines.push('');
    lines.push('| Module | Files | +Added | -Deleted |');
    lines.push('| --- | --- | --- | --- |');
    for (const group of summary.groups) {
      lines.push(`| \`${group.name}\` | ${group.files} | +${group.added} | -${group.deleted} |`);
    }
    lines.push('');
  }
  if (summary.totalFiles > 3) {
    lines.push('### Most changed files');
    lines.push('');
    for (const file of [...summary.files].sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted)).slice(0, 5)) {
      lines.push(`- \`${file.path}\` (${statusLabel(file.status)}, +${file.added} -${file.deleted})`);
    }
    lines.push('');
  }
  if (mermaid) {
    lines.push('### Change map');
    lines.push('');
    lines.push(mermaid);
    lines.push('');
  }
  if (imageUrl) {
    lines.push('## Evidence');
    lines.push('');
    lines.push(`![Architecture change map](${imageUrl})`);
    lines.push('');
  }
  lines.push('> Generated by `visualize-pr`. Evidence for a reviewer, not an approval.');
  return lines.join('\n');
}

export function buildArchitectureDiagram(summary, base, head) {
  const groups = summary.groups.slice(0, 8);
  const focal = new Set(groups.slice(0, 2).map((group) => group.name));
  const maxChanged = groups.length > 0 ? groups[0].changed : 1;

  const width = 720;
  const margin = 28;
  const headerH = 74;
  const cardH = 58;
  const gap = 12;
  const footerH = 20;
  const height = headerH + groups.length * (cardH + gap) + footerH;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Change map">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(`<text x="${margin}" y="34" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="${INK}">Change map</text>`);
  parts.push(`<text x="${margin}" y="56" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="${MUTED}">${esc(base.slice(0, 7))} -&gt; ${esc(head.slice(0, 7))} - ${summary.totalFiles} files (+${summary.totalAdded} -${summary.totalDeleted})</text>`);

  let y = headerH;
  for (const group of groups) {
    const focalGroup = focal.has(group.name);
    const fill = focalGroup ? ACCENT : PAPER;
    const text = focalGroup ? '#ffffff' : INK;
    const sub = focalGroup ? '#ffffff' : MUTED;
    const barW = Math.round((group.changed / maxChanged) * (width - margin * 2 - 150));

    parts.push(`<rect x="${margin}" y="${y}" width="${width - margin * 2}" height="${cardH}" rx="4" fill="${fill}" stroke="${focalGroup ? ACCENT : '#d9d9d9'}" stroke-width="1"/>`);
    parts.push(`<text x="${margin + 16}" y="${y + 24}" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600" fill="${text}">${esc(group.name)}</text>`);
    parts.push(`<text x="${margin + 16}" y="${y + 42}" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${sub}">${group.files} files - +${group.added} / -${group.deleted}</text>`);
    parts.push(`<rect x="${margin + 150}" y="${y + 38}" width="${barW}" height="6" rx="3" fill="${focalGroup ? '#ffffff' : ACCENT}" opacity="${focalGroup ? '0.9' : '0.55'}"/>`);

    y += cardH + gap;
  }

  parts.push(`<text x="${margin}" y="${height - 6}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${MUTED}">Modules with the most churn are highlighted. Draft evidence only - no review was approved.</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}
