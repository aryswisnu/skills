Skills are organized into bucket folders under `skills/`:

- `engineering/`: daily code work
- `productivity/`: daily non-code workflow tools (empty until the first one lands)
- `in-progress/`: beta, public on purpose, not shipped in the plugin
- `deprecated/`: no longer used

Every skill in `engineering/` or `productivity/` (the **promoted** buckets) must have a reference in the top-level `README.md`, an entry in the bucket's `README.md`, an entry in `.claude-plugin/plugin.json`'s `skills` array, and a human-facing docs page at `docs/<bucket>/<skill-name>.md` (four sections: **What it does**, **When to reach for it**, **Common questions**, **It's working if**). Skills in `in-progress/` and `deprecated/` appear in none of those.

Every `SKILL.md` is either user-invoked (`disable-model-invocation: true` plus `policy.allow_implicit_invocation: false` in `agents/openai.yaml`, reachable only by the human) or model-invoked (omit both). Keep the two harness settings in sync. Bucket `README.md`s and the top-level `README.md` group entries into **User-invoked** and **Model-invoked**.

Run `claude plugin validate .` after touching either manifest (not `--strict`: it flags the contributor-facing `CLAUDE.md` at the repo root as a warning). Bump `version` in `.claude-plugin/plugin.json` and add a `CHANGELOG.md` entry with every user-visible change.

`skills/engineering/visualize-pr/` is also an npm package with its own `package.json`, tests, and CLI. Run `npm test` from that folder before committing changes to it. Keep `version` in its `package.json`, `SKILL.md` metadata, and `.claude-plugin/plugin.json` aligned.

To (re)link every promoted skill into the local harness skill directories (`~/.claude/skills`, `~/.agents/skills`), run `scripts/link-skills.sh`.

No em-dashes anywhere in this repo's prose. Rewrite the sentence with a comma, colon, period, or parentheses instead.
