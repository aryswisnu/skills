# Arys's Skills

Reusable agent skills for practical engineering work. Each skill is self-contained, model-neutral, and stored under `skills/<category>/<skill-name>/`.

## Install

Install from this collection with a compatible skills installer:

```bash
npx skills@latest add aryswisnu/skills
```

You can then select the skills you want to add to your agent or project.

## Engineering

- [`visual-pr-review`](skills/engineering/visual-pr-review/SKILL.md): Boot two Git revisions locally and produce reviewer-ready visual, semantic, and runtime evidence for a web change.
  - [README](skills/engineering/visual-pr-review/README.md)
  - [Usage examples](skills/engineering/visual-pr-review/docs/usage-examples.md), including shipped local workflows and clearly marked future GitHub, Bitbucket, GitLab, Azure DevOps, API, CLI, schema, image-pair, and lightweight CDP interfaces.

## Repository layout

```text
skills/
  engineering/
    visual-pr-review/
      SKILL.md
      README.md
      package.json
      scripts/
      src/
      test/
      docs/
      examples/
```

New skills should live in their own category and folder. Keep each skill's documentation, implementation, tests, and examples beside its `SKILL.md`.

## License

MIT
