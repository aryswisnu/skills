# Skills

[![test](https://github.com/aryswisnu/skills/actions/workflows/test.yml/badge.svg)](https://github.com/aryswisnu/skills/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Agent skills for real engineering work. Each one is small, composable, and built to hand a human
evidence rather than a verdict: the agent drafts, you review, you approve with one click.

Current release: **v0.14.3**. One skill shipped, more on the way.

## The skills

Skills split on one axis: who can invoke them. **User-invoked** skills run only when you type
them. **Model-invoked** skills can also be picked up by the agent when a task fits.

### Engineering

**User-invoked**

| Skill | What it does | Read |
| --- | --- | --- |
| [`/visualize-pr`](./skills/engineering/visualize-pr/SKILL.md) | Turns a pull request on GitHub, Bitbucket Cloud, or GitLab, or any two Git revisions, into reviewer-ready evidence and writes it into the PR: your notes and pseudocode first, then a change map, a sequence diagram, and for web changes before/after screenshots. Draft, review, approve. | [README](./skills/engineering/visualize-pr/README.md), [page](./docs/engineering/visualize-pr.md) |

**Model-invoked**

None yet.

Full bucket list: [skills/engineering](./skills/engineering/README.md).

## Installation

Two routes. The **Claude Code plugin** installs a managed copy that updates when a release ships.
**skills.sh** copies editable files into your project. Pick one; both at once gives you every skill
twice.

<details open>
<summary><strong>Claude Code (plugin)</strong></summary>

```bash
claude plugins marketplace add aryswisnu/skills
```

```bash
claude plugins install aryswisnu-skills@aryswisnu
```

Or, from inside a session: `/plugin marketplace add aryswisnu/skills` then
`/plugin install aryswisnu-skills@aryswisnu`. Update later with
`claude plugins update aryswisnu-skills@aryswisnu`. Restart the session after installing.

</details>

<details>
<summary><strong>Codex, and other agents (skills.sh)</strong></summary>

```bash
npx skills@latest add aryswisnu/skills
```

Pick the skills and the agents to install them on. Files land in your repo as ordinary files you
own.

</details>

A skill that carries its own dependencies installs them itself on first use and says how in its
README. For `visualize-pr` that is one command, `--setup`, which the agent runs for you.

## Repository layout

```text
.claude-plugin/       Plugin and marketplace manifests
docs/<bucket>/        One human-facing page per promoted skill
skills/<bucket>/      One folder per skill: SKILL.md, agents/openai.yaml, and its own README,
                      code, tests, and docs
scripts/              Maintainer helpers (list-skills, link-skills)
CHANGELOG.md          Release history
CLAUDE.md             Rules for agents working on this repo (AGENTS.md is a symlink)
```

## Development

```bash
scripts/list-skills.sh
scripts/link-skills.sh            # symlink promoted skills into ~/.claude/skills and ~/.agents/skills
claude plugin validate .
```

Each skill's tests run from its own folder; `visualize-pr` is `npm test` after `--setup`. CI runs
every suite on Ubuntu and macOS for every push and PR. See [CHANGELOG.md](./CHANGELOG.md) for
what changed in each release.

## License

MIT
