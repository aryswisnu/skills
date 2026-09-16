#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
find skills -name SKILL.md -not -path '*/node_modules/*' | sort
