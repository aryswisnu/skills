<p align="center">
  <img src="skills/engineering/visualize-pr/docs/visualize-pr-logo.svg" alt="Visualize PR" width="600">
</p>

# Skills

[![test](https://github.com/aryswisnu/skills/actions/workflows/test.yml/badge.svg)](https://github.com/aryswisnu/skills/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Agent skills I use for real engineering work. Small, composable, and designed to hand a human
evidence rather than a verdict.

## Installation

Two ways in. **The Claude Code plugin** installs the whole set as a managed bundle that updates when
I ship. **skills.sh** copies editable skill files into your project so you can hack on them. Pick
one; installing both leaves every skill twice.

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude plugins marketplace add aryswisnu/skills
claude plugins install aryswisnu-skills@aryswisnu
```

Or, from inside a session:

```
/plugin marketplace add aryswisnu/skills
/plugin install aryswisnu-skills@aryswisnu
```

</details>

<details>
<summary><strong>Codex, and other agents</strong></summary>

```bash
npx skills@latest add aryswisnu/skills
```

Pick the skills you want and which coding agents to install them on.

</details>

`visualize-pr` also needs Node.js 20+ and, for web changes, a Chromium. From the skill folder:

```bash
npm install
npx playwright install chromium
```

## Reference

Skills split on one axis: who can invoke them. **User-invoked** skills are reachable only when you
type them (e.g. `/visualize-pr`). **Model-invoked** skills can be reached by you or automatically
by the agent when the task fits.

### Engineering

Skills for daily code work. Full list: [skills/engineering](./skills/engineering/README.md).

**User-invoked**

- **[visualize-pr](./skills/engineering/visualize-pr/SKILL.md)**: Turn a GitHub PR or two Git
  revisions into reviewer-ready evidence. Before/after screenshots and runtime errors for web
  changes, a diff summary and change map for backend changes, plus an optional PR comment.
  Docs: [docs/engineering/visualize-pr.md](./docs/engineering/visualize-pr.md).
  Live examples: [web PR](https://github.com/aryswisnu/skills/pull/1#issuecomment-5657518950),
  [backend PR](https://github.com/aryswisnu/skills/pull/2#issuecomment-5657923277).

**Model-invoked**

None yet.

## Repository layout

```text
.claude-plugin/     Plugin and marketplace manifests
docs/<bucket>/      One human-facing page per promoted skill
skills/<bucket>/    One folder per skill, each with SKILL.md and agents/openai.yaml
scripts/            Maintainer helpers (list-skills, link-skills)
CHANGELOG.md        Versioned change history
CLAUDE.md           Rules for agents working on this repo (AGENTS.md is a symlink)
```

## Development

```bash
scripts/list-skills.sh
scripts/link-skills.sh            # symlink promoted skills into ~/.claude/skills and ~/.agents/skills
claude plugin validate .
cd skills/engineering/visualize-pr && npm test
```

## License

MIT
