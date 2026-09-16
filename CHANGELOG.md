# aryswisnu-skills

## 0.11.0 (2026-09-16)

Bitbucket Cloud and GitLab.

- `--pr` accepts GitHub pull requests, Bitbucket Cloud pull requests, and GitLab merge requests.
  The provider is read from the URL path shape, not the host, so self-hosted GitLab, GitHub
  Enterprise, and custom Bitbucket domains work. GitLab nested groups are encoded as one API
  segment. Bitbucket Server (Data Center) is detected and refused with a message; Azure DevOps is
  not implemented.
- `--post-comment` and `--update-description` work on all three. Tokens: `GITHUB_TOKEN` or
  `GH_TOKEN`; `BITBUCKET_TOKEN`, or `BITBUCKET_USERNAME` with `BITBUCKET_APP_PASSWORD`;
  `GITLAB_TOKEN` (or `CI_JOB_TOKEN` in CI).
- Non-GitHub providers fetch the base and head branches from `origin` with the clone's own
  credentials and resolve the API's commit hashes locally. Bitbucket returns 12-character hashes,
  and git cannot fetch an abbreviated hash by name, so this is the path that works. Falls back to
  fetching by hash, then names the fork-fetch command.
- Web evidence upload stays GitHub-only for now. On Bitbucket and GitLab a web review still posts
  the verdicts and diagrams; the screenshots stay in the output directory and the CLI says so.
- New `src/pr-url.mjs` (three-provider parser), `src/providers.mjs` (one facade per forge),
  `src/provider-bitbucket.mjs`, `src/provider-gitlab.mjs`. End-to-end tests run the real CLI
  against mock Bitbucket and GitLab APIs, including a re-run that replaces the description block.
- `npm test`: 263 tests, 44 new.

## 0.10.2 (2026-09-16)

Stop the skill from advising broken Mermaid.

- SKILL.md told the agent to mark changed messages with a trailing `%% changed` comment. Mermaid
  treats `%%` as a comment only at the start of a line, so that text rendered inside the message
  label where a reviewer reads it. Verified in Mermaid 11: the diagram parses without error and the
  label comes out as `renders page %% changed: new call`. The guidance now says to use
  `Note over A,B: changed` and to avoid angle brackets in labels.
- New `--diagram` lint. It warns on a `%%` that is not at the start of a line and on angle brackets
  inside a label, naming the line number. Warnings only: both mistakes parse fine, so the run
  continues and the author still gets the diagram.
- `npm test`: 219 tests, 6 new.

## 0.10.1 (2026-09-16)

Fix `--diagram` being silently discarded.

- `--diagram` reached `pr-comment.md` only, and that file is written only when `--pr` is set. A
  `--backend` run without `--pr` read the file, validated it was not empty, then threw it away and
  exited 0, so `report.md` never carried the `Sequence` section SKILL.md promised. The diagram is
  now passed into `buildChangeSummary` (backend) and `renderReport` (web), so it always reaches
  `report.md`. Reported from a remote session against v0.10.0.
- Web mode read the diagram file inside the `--pr` branch, so a missing or empty path was ignored
  without `--pr` and only failed after a full capture with it. The read is hoisted above worktree
  creation: a bad path now exits 2 before either revision is checked out.
- New Node version guard. The CLI is run as `node scripts/visualize-pr.mjs`, which ignores
  package.json `engines`, so Node 18 failed deep in a stack trace. It now exits 2 with the minimum
  version and how to switch.
- `npm test`: 213 tests, 7 new.

## 0.10.0 (2026-09-16)

The skill installs itself.

- `--setup` installs the skill's npm dependencies and Chromium into its own folder, so a plugin
  install is enough to get started. `--setup --backend` installs the dependencies only and skips
  the browser download. A no-op run says what was already present.
- SKILL.md makes dependency setup workflow step 1: the agent checks for `node_modules` and runs
  `--setup` before the first review, so nobody types an npm command by hand.
- The `Missing dependency` error now names `--setup` instead of two npm commands.
- Verified on a fresh copy with no `node_modules`: `--setup --backend` installed 4 packages, and a
  backend review from that copy produced a change map.
- `npm test`: 208 tests.

## 0.9.0 (2026-09-16)

Zero-config start.

- `--init` writes a starter `visual-review.json` for the current repo: detects Next, Vite, Astro,
  Nuxt, Angular, CRA, SvelteKit, Remix, Gatsby, Express-style Node servers, Django, FastAPI, Flask,
  Go, Rails, Laravel, and static HTML, picks the install command from the lockfile, and seeds a
  `home` scenario on desktop and mobile. Refuses to overwrite.
- Change map folds more than five unchanged imports of one file into a single
  "+N unchanged imports" node, so a small change no longer drags the whole import list in.
- Backend mode no longer prints `fatal: path ... does not exist` for deleted files.
- Verified live: `--update-description` on aryswisnu/skills#2 renders the Mermaid change map in the
  PR description; a second run leaves the body byte-identical. Plugin install via
  `claude plugins install aryswisnu-skills@aryswisnu` runs backend mode with no `npm install`.
- `npm test`: 202 tests.

## 0.8.0 (2026-09-16)

Diagrams in the PR itself.

- `--update-description`: insert or refresh the review as a marked block in the PR description
  (`<!-- visualize-pr:start -->` / `<!-- visualize-pr:end -->`), idempotent on re-run. Can be
  combined with `--post-comment`.
- Backend change map is now a Mermaid `flowchart LR` of changed source files and their in-repo
  imports (JS/TS, Python, Go, Ruby, PHP, Java/Kotlin, Rust, C#), colored by status, capped at 40
  nodes. GitHub renders it natively, so backend reviews no longer upload a PNG or create the
  `visual-review-assets` branch. `@resvg/resvg-js` dependency removed. New `change-map.mmd` output.
- `--diagram <file.mmd>`: include an agent-authored Mermaid `sequenceDiagram` as a `### Sequence`
  section. SKILL.md now tells the agent to write one from `changes.patch`.
- `playwright`, `pngjs`, and `pixelmatch` are lazy-loaded, so `--backend` works before
  `npx playwright install`, and a missing module now says to run `npm install` in the skill folder.
- `npm test`: 174 tests.

## 0.7.0 (2026-09-16)

Restructure the repository as a skills collection.

- Rename `visual-pr-review` to `visualize-pr`, so `/visualize-pr` is the real invocation. The CLI
  file is now `scripts/visualize-pr.mjs`. Runtime contracts (`visual-review.json`,
  `visual-review-output`, the `visual-review-assets` branch) are unchanged.
- Mark the skill user-invoked (`disable-model-invocation: true`, `agents/openai.yaml`).
- Add `.claude-plugin/plugin.json` and `marketplace.json`: installable with
  `claude plugins install aryswisnu-skills@aryswisnu`.
- Add `CLAUDE.md` (bucket rules), `docs/engineering/visualize-pr.md` (human-facing page),
  `scripts/link-skills.sh`, `scripts/list-skills.sh`, and this changelog (history moved out of
  `docs/verification.md`).
- Rewrite the root `README.md` as a collection index.

## 0.6.1 (2026-09-16)

macOS worktree cleanup.

- Fixed: on macOS `os.tmpdir()` is a symlink (`/var` -> `/private/var`) while `git worktree list`
  reports real paths, so `worktreePathsUnder` matched nothing and temporary worktrees leaked after
  every run. `tempRoot` is now resolved with `realpath` before use.
- Six `test/cli-failure.test.mjs` cases failed on macOS before the fix and pass after it.
- Moved non-spec SKILL.md frontmatter keys (`version`, `author`, `platforms`) under `metadata`.
- Added `.github/workflows/test.yml`: `npm ci`, Chromium install, `npm test`, `npm audit` on
  Ubuntu and macOS.
- Removed two unreferenced PNG exports from `docs/`.
- `npm test`: 141 tests, 141 passed, 0 failed, 0 skipped (macOS 15, Node 22).

## 0.6.0 (2026-09-14)

Backend change-map embedding.

- Backend `--post-comment` now rasterizes `architecture.svg` to a PNG (browser-free, via
  `@resvg/resvg-js`) and embeds it in the posted comment, mirroring the web evidence flow. GitHub
  refuses inline SVG in comments, so a PNG is the only way to show the change map directly.
- Backend change-summary grouping now strips a common directory prefix, so a monorepo change groups
  by its real modules (e.g. `src`, `scripts`, `test`) instead of collapsing into one umbrella
  directory.
- New module `src/svg-to-png.mjs` (lazy-loaded Rust SVG rasterizer). New tests
  `test/svg-to-png.test.mjs` (valid PNG + rendered glyphs) and `test/backend-post-cli.test.mjs`
  (full browser-free `--backend --post-comment` flow against a mock GitHub API).
- `npm test`: 140 tests, 140 passed, 0 failed, 0 skipped.

### Reviewer-facing documentation, 2026-09-14

- Added complete rendered web and backend PR comment examples plus a real CLI-generated side-by-side
  artifact.
- Expanded the root and skill READMEs around the reviewer problem, outcomes, supported modes,
  publication boundary, and direct installation path.

## 0.5.0 (2026-09-13)

Backend support.

- Added `--backend`: removes the frontend-only gate. For a non-web change, the CLI emits a change
  summary (`report.md`), an editorial architecture "change map" (`architecture.svg`, styled after
  the diagram-design system: paper/ink/one accent, density 4/10), and `summary.json`, with no
  config or browser required.
- New module `src/backend.mjs` (numstat/name-status parsing, change summarization, markdown +
  SVG generation). New tests `test/backend.test.mjs` and `test/backend-cli.test.mjs`.
- `npm test`: 135 tests, 135 passed, 0 failed, 0 skipped.

## 0.4.1 (2026-09-13)

Image embedding.

- `--post-comment` now uploads the side-by-side PNGs to a `visual-review-assets` branch (created via
  the git refs API, files added via the contents API) and embeds them in the comment via
  `raw.githubusercontent.com` URLs. The draft (`--pr` without `--post-comment`) still writes no
  remote state.
- Verified live: created the branch, uploaded a test PNG, fetched the raw URL (HTTP 200,
  `image/png`), then deleted the branch. GitHub's contents API does not auto-create branches, so
  `ensureAssetsBranch` creates it first via `POST /git/refs`.
- `npm test`: 127 tests, 127 passed, 0 failed, 0 skipped.

## 0.4.0 (2026-09-13)

GitHub PR support.

- Added `--pr <github-url>` and `--post-comment`. `--pr` parses the URL, resolves base and head SHAs
  through the GitHub REST API (`GITHUB_TOKEN`/`GH_TOKEN`, or unauthenticated for public repos),
  fetches both commits, runs the normal capture pipeline, and writes a `pr-comment.md` draft.
  `--post-comment` publishes the draft as a PR comment and requires a token.
- New modules: `src/pr-url.mjs`, `src/provider-github.mjs`, `src/pr-comment.mjs`. New tests:
  `test/pr-url.test.mjs`, `test/provider-github.test.mjs`, `test/pr-comment.test.mjs`,
  `test/pr-cli.test.mjs` (a full `--pr` flow against a local bare remote and a mock GitHub API,
  exercised with real Chromium).
- Verified against live GitHub: `resolvePr` resolved `nodejs/node#66015` to full 40-char base and
  head SHAs, refs, and title without a token.
- `npm test`: 122 tests, 122 passed, 0 failed, 0 skipped.
- `git fetch origin <baseSha> <headSha>` confirmed to materialize both commits against a local bare
  remote before worktree creation.

## 0.3.1 (2026-09-13)

Astra remediation.

The Astra audit findings were addressed with a leaner `SKILL.md`, corrected safety and selection
contracts, and structured infrastructure-failure evidence.

Observed on Linux with an existing compatible Chromium executable:

- `npm test`: 105 tests, 105 passed, 0 failed, 0 skipped.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `node --check scripts/visualize-pr.mjs`: exit 0.
- Relative Markdown links: 10 checked, none missing.
- Version alignment: `SKILL.md`, `package.json`, and both package-lock locations are `0.3.1`.
- Skill description: 56 characters; root document: 118 lines.
- `npm pack --dry-run`: 53 files, including `test/cli-failure.test.mjs`, with no ZIP or
  `node_modules` payload.
- `git diff --check`: exit 0.
- Fresh two-commit browser run: 3 selected cells, 3 `review-required`, 0 capture failures,
  16 artifact hashes, 18 output files, and exit 0.
- Visual inspection: desktop, mobile, and replayed-open-panel side-by-side images had readable
  labels, loaded intended states, visible before/after changes, and no clipping, loading shell,
  consent overlay, or error page.
- Forced install failure: exit 2, `failure.json` status `infrastructure-failed`, phase
  `install-base`, cleanup complete, zero cleanup failures, no normal report, and zero registered
  temporary worktrees.
- Unavailable temporary directory after output creation: exit 2 with `failure.json` phase
  `temporary-directory` and cleanup complete.
- Preview readiness failure: exit 2 with `failure.json` phase `readiness`, cleanup complete, and no
  registered temporary worktrees.
- Invalid browser executable: exit 2 with `failure.json` phase `browser-launch`, cleanup complete,
  and no registered temporary worktrees.
- SIGTERM during a live run: exit 143 with `failure.json` status `interrupted`, phase
  `signal-sigterm`, cleanup complete, and no registered temporary worktrees.
- Invalid Git revision: exit 2 with a concise error and no unhandled Node stack trace.
- Secret-bearing install failure test: the configured secret was absent from `failure.json`.
- Partial worktree registration: a shim registered the head worktree then reported exit 128, and
  cleanup removed both worktrees by discovering them from `git worktree list --porcelain` rather
  than a manually tracked array.
- Cleanup discovery helper: `worktreePathsUnder` keeps only paths beneath the temporary root and
  excludes sibling directories that share its name as a prefix.
- GitHub Actions example: the capture step records the CLI exit code and surfaces exit 1 (scenario
  capture failure) and exit 2 (usage, configuration, or infrastructure failure) as distinct
  failure steps instead of flattening both into a generic "scenarios missing" message.
- Install phase is interruptible: `config.installCommand` runs via an asynchronous, process-group
  tracked spawn instead of a synchronous `execSync`, so SIGTERM during a long install (such as
  `npm ci`) exits 143 with `failure.json` phase `signal-sigterm` and cleans worktrees instead of
  hanging until the install finishes.

The remainder of this document preserves the earlier v0.3.0 verification record.
