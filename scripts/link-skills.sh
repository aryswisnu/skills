#!/usr/bin/env bash
set -euo pipefail

# Dev-only. Symlinks every promoted skill into the local skill directories of
# each agent harness so a `git pull` keeps installed skills current:
#   ~/.claude/skills  Claude Code
#   ~/.agents/skills  Codex and other Agent Skills-compatible harnesses

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DESTS=("$HOME/.claude/skills" "$HOME/.agents/skills")

while IFS= read -r -d '' skill_md; do
  src="$(dirname "$skill_md")"
  name="$(basename "$src")"
  for DEST in "${DESTS[@]}"; do
    mkdir -p "$DEST"
    target="$DEST/$name"
    if [ -e "$target" ] && [ ! -L "$target" ]; then rm -rf "$target"; fi
    ln -sfn "$src" "$target"
    echo "linked $name -> $src ($DEST)"
  done
done < <(find "$REPO/skills" -name SKILL.md -not -path '*/node_modules/*' -not -path '*/deprecated/*' -not -path '*/in-progress/*' -print0)
