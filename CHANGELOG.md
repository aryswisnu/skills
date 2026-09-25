# aryswisnu-skills

## 0.18.0

New skill: `ticket-loop`, model-invoked.

- One ticket from plan to done: a plan gate, a live `tasks.html` checklist, and before/after artifacts.
- A Stop hook holds only the session that armed the loop, fails open when the tracker or the config is unreadable, and lets go after three holds with no progress. The plugin now ships `hooks/hooks.json`.
- Everything team-specific (tracker URL, statuses, steps, playbooks) lives in a private config, never in the repo.
- Python stdlib only. CI runs its tests on Ubuntu and macOS, and a gitleaks secret scan on every push.

## 0.17.1

- `--update-description` keeps the review block on top on re-runs. A block that an earlier version left at the bottom is lifted to the top and the original text folded once. A block already on top is replaced in place.

## 0.17.0 (2026-09-17)

The review block leads the description; the original is folded under it.

- `--update-description` used to append the block below whatever the description already said,
  so a reader met the long original first. The block now goes at the top on first insert, and the
  author's existing text is folded under it in a `<details>` "Original description" on GitHub and
  GitLab, one tap to expand. Bitbucket Cloud strips raw HTML, so there the original sits under a
  plain "Original description" heading, demoted rather than folded, and the docs say so.
- A re-run still replaces only the block, wherever it sits, so the fold is applied once and the
  original text is never touched again. Providers expose `rendersHtml`.
- `npm test`: 322 tests, 5 new.

## 0.16.0 (2026-09-16)

Terse by construction.

- A real PR came out at twice the length a colleague would write: five prose paragraphs where
  bullets were asked for, a 14-line pseudocode block, a 6-participant 14-message sequence diagram
  that rendered as a 140-column grid, and a change map that restated the file line.
- SKILL.md now prescribes an exact shape and shows a real example to match: one headline under 15
  words, three to five bullets under 30 words each, one optional `Heads up:` line, one fenced
  pseudocode block under 8 lines, a sequence diagram with at most 4 participants and 6 messages
  and labels under 4 words. If the PR description already explains the change, the notes carry
  only what it lacks.
- The notes lint enforces that shape with line numbers: prose lines, long bullets, more than five
  bullets, a long headline or block, a repeated or long `Heads up:`. The diagram lint counts
  participants and messages and flags long labels and notes. Warnings only.
- The change map is omitted for a diff that touches one file with at most one import; the
  artifacts are still written.
- `npm test`: 317 tests, 12 new.

## 0.15.0 (2026-09-16)

Sequence diagram directly under the notes.

- The PR block now reads: title, notes (bullets and pseudocode), sequence diagram, one line of
  numbers, change map, footer. The sequence is the first piece of evidence, right under the
  headline the notes give it; the file-level map comes last. Web comments put the sequence before
  the verdict table. `report.md` follows the same order.
- Not strictly first: the bullets stay on top so a reader, and a phone screen, gets what changed
  before a 12-line diagram.
- `npm test`: 305 tests, 3 new.

## 0.14.4 (2026-09-16)

Pseudocode must be fenced. Indented pseudocode after a bullet list is plain text.

- A real PR showed "no pseudocode" even though the agent wrote some. The cause is CommonMark: an
  indented block that follows a bullet list is a paragraph of the last bullet, not a code block,
  so Bitbucket, GitHub, and GitLab all render it as one wrapped sentence. Verified with a
  CommonMark renderer: indented after a list is plain text; fenced, or indented after a
  paragraph, is code.
- SKILL.md now says fenced, three backticks, never indented, and why. The notes lint no longer
  counts an indented block as pseudocode and warns on one with the line number. The README and
  docs-page samples, which used the broken form themselves, now show fenced blocks.
- To repair an affected PR: re-run with a fenced notes file and `--publish --update-description`;
  the block is replaced in place.
- `npm test`: 302 tests, 1 new.

## 0.14.3 (2026-09-16)

Pseudocode is required, and the notes file is linted.

- SKILL.md said to add pseudocode "when there is one", a judgment the agent could decline. It is
  now required whenever the diff changes behavior, the same condition as the sequence diagram; a
  no-logic change carries the bullet "No pseudocode: no logic changed." so the absence is visible.
- New notes lint on `--notes`: warns, with line numbers, when there is no fenced or indented code
  block and no opt-out bullet, and when a prose paragraph of three or more lines appears. Wrapped
  bullets and code blocks are not flagged. Warnings only.
- `npm test`: 301 tests, 7 new.

## 0.14.2 (2026-09-16)

The three layers say the same thing.

- SKILL.md's frontmatter description, the text the slash-command picker shows, said "a GitHub PR"
  and "an optional PR comment draft". It now names all three providers, the notes-first PR text,
  the change map and sequence diagram, and that publishing waits for approval. Its "When to Use"
  section drops the v0.5 "architecture diagram" wording for the same reason.
- The engineering bucket README line and the docs page's opening paragraph carried the same old
  wording and are aligned with the skill README.
- The Codex short description matches.

## 0.14.1 (2026-09-16)

Root README is an index again.

- The root README had grown every visualize-pr feature section (60 seconds, review-then-approve,
  what lands in the PR, ASCII fallback, providers, review modes, CLI reference, safety boundary).
  A collection root should list the skills, say how to install the collection, and show the
  layout; it now does only that.
- All of that content lives in the skill's own README, merged with what it already had
  (capabilities, quick start config, CI workflow, development), and links are skill-relative.
- The stale "How to use" flow diagram (drawn for the pre-publish flow) and its Excalidraw source
  are removed; the pipeline sequence diagram stays.

## 0.14.0 (2026-09-16)

Leaner PR text, invisible markers, and a place for the agent's own summary.

- `--notes <file>`: agent-written markdown placed directly under the title, above everything
  generated. SKILL.md now asks for three to six plain-language bullets and a short pseudocode
  block, no prose paragraphs and no restated statistics.
- The generated block is compact. One line carries the file count, the line counts, and the files
  themselves when there are three or fewer. The module table appears only with two or more
  modules, the most-changed ranking only with more than three files, and the summary heading and
  repeated SHA line are gone. The footer is one sentence.
- Description markers are CommonMark link reference definitions, `[//]: # (visualize-pr:start)`,
  which render as nothing on GitHub, GitLab, and Bitbucket Cloud. The previous HTML comments
  showed as literal text on Bitbucket. A block delimited by the old markers is recognized and
  rewritten with the new ones on the next run.
- `pr.json` records the notes so `--publish` keeps them in a rebuilt web comment.
- `npm test`: 294 tests, 7 new.

## 0.13.2 (2026-09-16)

README section for the ASCII fallback, and two renderer nits.

- Root README gains an "ASCII fallback" section with real renderer output for both the change map
  and the sequence diagram, replacing a hand-drawn sample from before the renderer existed, and
  explains when each form is used and that `change-map.txt` is always written.
- ASCII change map: "1 changed file" is singular now, and a lone `.` directory header is dropped
  when every changed file shared one directory that the labels already stripped.
- `npm test`: 287 tests, 2 new.

## 0.13.1 (2026-09-16)

Fix a race that could leave `failure.json` empty after SIGTERM or SIGINT.

- After a signal, cleanup kills the preview or install child, which also rejects the main flow, so
  the signal handler and the main error path both tried to write `failure.json` after the same
  cleanup. Both used an exclusive create then write; when the main path's create won, the handler
  saw the file exist and called `process.exit` while the other write was still in flight. The
  file was left empty, with the right exit code. Seen once on the macOS CI runner for 0.13.0.
- The failure write is now single-flight: the first caller writes, every caller awaits that same
  write, and nothing exits before it finishes. After a signal the main path no longer writes at
  all, so the record is always the signal's.
- Process note: 0.13.0 was merged with that one macOS job red because the merge step was not
  gated on the check result. Merges are gated on it from here on.

## 0.13.0 (2026-09-16)

ASCII diagrams where Mermaid is not rendered.

- Correction: Bitbucket Cloud renders CommonMark only, so a ```mermaid fence there shows as source
  text. Earlier releases and docs claimed all three forges render Mermaid; that was wrong for
  Bitbucket and is what made the diagram unreadable there.
- The change map and the `--diagram` sequence diagram are now drawn as ASCII on providers that do
  not render Mermaid (Bitbucket Cloud), and Mermaid on those that do (GitHub, GitLab). `--ascii`
  forces the text form anywhere, including the local `report.md`. A `sequenceDiagram` is redrawn
  as ASCII art (participants, solid and dashed arrows, self-messages, notes, loop/alt blocks); any
  other Mermaid is shown as fenced source.
- `change-map.txt` is written next to `change-map.mmd` on every backend run. `pr.json` records the
  chosen flavor so `--publish` keeps it.
- New `src/ascii.mjs`, 15 unit tests. End-to-end: a Bitbucket description update carries `Change map` text and no
  Mermaid fence; `--backend --ascii --diagram` puts both text diagrams in `report.md`.
- `npm test`: 285 tests, 18 new.

## 0.12.1 (2026-09-16)

`--publish` now uploads GitHub web screenshots.

- A tokenless web draft on GitHub used to publish without images, because uploads happened only
  on a review run that carried a publish flag. `--publish` now uploads the side-by-side PNGs to
  the `visual-review-assets` branch and rebuilds the comment from the saved `summary.json`: every
  line the reviewer read is kept, an Evidence section is added, and the footer stops saying the
  images are local. Backend, Bitbucket, and GitLab drafts are still posted byte for byte.
- `pr.json` now records `adapter` (`web` or `backend`) and the `--diagram` text, and
  `summary.json` cells carry `scenarioName`, which is what makes the rebuild possible without a
  second review run.
- End-to-end with real Chromium against a mock GitHub API: the draft uploads nothing;
  `--publish --post-comment` uploads exactly one image per captured cell, does not resolve the PR
  again, and every non-footer line of the draft appears in the posted comment.
- `npm test`: 267 tests, 2 new.

## 0.12.0 (2026-09-16)

Review the draft, then approve it in one step.

- `--publish <dir>` posts the draft in `<dir>/pr-comment.md` exactly as written, with
  `--post-comment` and/or `--update-description`. No re-diff, no fetch, no browser: under a
  second. What the human read is what lands. The review run now writes `pr.json` next to the
  draft so publish knows the provider and PR without any other argument.
- The review run prints the publish command when it posted nothing, and SKILL.md makes the
  approval step explicit: show the draft, offer comment / description / both / not now, use the
  harness's question tool where it has one (Claude Code renders the options as buttons) and the
  harness's command-approval prompt where it does not (Codex and others), then run `--publish`.
  That step is now named as the safety boundary's only authorization point.
- End-to-end test: a tokenless draft run writes nothing remotely; `--publish` later lands the
  draft byte for byte; publish without a token exits 2 and writes nothing; a directory with no
  draft is refused.
- `npm test`: 265 tests, 2 new.

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
