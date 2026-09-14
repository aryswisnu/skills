# Verification

## v0.6.0 Backend change-map embedding, 2026-09-14

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

## Reviewer-facing documentation, 2026-09-14

- Added complete rendered web and backend PR comment examples plus a real CLI-generated side-by-side
  artifact.
- Expanded the root and skill READMEs around the reviewer problem, outcomes, supported modes,
  publication boundary, and direct installation path.

## v0.5.0 Backend support, 2026-09-13

- Added `--backend`: removes the frontend-only gate. For a non-web change, the CLI emits a change
  summary (`report.md`), an editorial architecture "change map" (`architecture.svg`, styled after
  the diagram-design system: paper/ink/one accent, density 4/10), and `summary.json`, with no
  config or browser required.
- New module `src/backend.mjs` (numstat/name-status parsing, change summarization, markdown +
  SVG generation). New tests `test/backend.test.mjs` and `test/backend-cli.test.mjs`.
- `npm test`: 135 tests, 135 passed, 0 failed, 0 skipped.

## v0.4.1 Image embedding, 2026-09-13

- `--post-comment` now uploads the side-by-side PNGs to a `visual-review-assets` branch (created via
  the git refs API, files added via the contents API) and embeds them in the comment via
  `raw.githubusercontent.com` URLs. The draft (`--pr` without `--post-comment`) still writes no
  remote state.
- Verified live: created the branch, uploaded a test PNG, fetched the raw URL (HTTP 200,
  `image/png`), then deleted the branch. GitHub's contents API does not auto-create branches, so
  `ensureAssetsBranch` creates it first via `POST /git/refs`.
- `npm test`: 127 tests, 127 passed, 0 failed, 0 skipped.

## v0.4.0 GitHub PR support, 2026-09-13

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

## v0.3.1 Astra remediation, 2026-09-13

The Astra audit findings were addressed with a leaner `SKILL.md`, corrected safety and selection
contracts, and structured infrastructure-failure evidence.

Observed on Linux with an existing compatible Chromium executable:

- `npm test`: 105 tests, 105 passed, 0 failed, 0 skipped.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `node --check scripts/visual-pr-review.mjs`: exit 0.
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

## v0.3.0 verification, 2026-09-12

Every command and every number below was run and observed on 2026-09-12. Nothing here is
predicted or reconstructed. Where a run produced a non-zero exit code, that is recorded as
observed rather than explained away.

## Environment

| | |
| --- | --- |
| Host OS | Darwin 25.5.0 (macOS), arm64 |
| Node.js | `v22.23.2` (package `engines` requires `>=20`) |
| Playwright | `1.63.0` |
| Chromium | `browser 153.0.8010.12` (Playwright-managed) |
| Git | working tree of this repository, uncommitted |

Linux was **not** tested in this session. The POSIX process-group and `exec`/`env` behaviour is
covered by unit tests that take `platform` as a parameter, but only macOS was exercised
end-to-end. Windows is not claimed and was not tested.

## 1. Automated test suite

```bash
npm test
```

Observed:

```text
# tests 96
# pass 96
# fail 0
```

The two tests in `test/capture-browser.test.mjs` require a Playwright Chromium install and
skip (94 pass, 2 skipped) when no browser executable is present. The 96/96 figure above was
observed with a Chromium available via the browser executable path.

Test files: `test/capture.test.mjs`, `test/capture-browser.test.mjs`, `test/cleanup.test.mjs`,
`test/cli-args.test.mjs`, `test/config.test.mjs`, `test/core.test.mjs`, `test/examples.test.mjs`,
`test/git.test.mjs`, `test/impact.test.mjs`, `test/network.test.mjs`, `test/output.test.mjs`,
`test/provenance.test.mjs`, `test/redact.test.mjs`, `test/report.test.mjs`,
`test/verdict.test.mjs`, `test/visual.test.mjs`.

## 2. Dependency audit

```bash
npm audit
```

Observed: `found 0 vulnerabilities`.

## 3. Whitespace and conflict-marker check

```bash
git diff --check
```

Observed: no output, exit 0.

## 4. Vendor-neutrality check

A case-insensitive recursive search for the forbidden vendor word was run over maintained source,
documentation, examples and tests, excluding `.git/`, `node_modules/` and the generated
`visual-review-output/`. The search term is supplied from a shell variable so that this record
does not itself reintroduce the word:

```bash
WORD=$(printf 'h%s' 'ermes')
grep -ril "$WORD" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=visual-review-output
```

Observed: no output, zero matches.

## 5. End-to-end demo, two real commits, real browser

A scratch Git repository was created outside this repository at `/tmp/vpr-e2e` so that two
commits could exist without committing anything here. It contained only a copy of
`examples/demo/`. Commit `666e6cc` was the base; commit `0c8685a` changed the accent colour from
`#65d1ff` to `#ffb35c`, changed the `h1` text, and added a head-only `console.error`.

```bash
node <visual-pr-review-directory>/scripts/visual-pr-review.mjs \
  --base HEAD~1 --head HEAD \
  --config examples/demo/visual-review.json \
  --output out
```

Observed console output:

```text
Preparing worktree (detached HEAD 666e6cc)
Preparing worktree (detached HEAD 0c8685a)
Capturing Home @ desktop...
Capturing Home @ mobile...
Capturing Home with the evidence panel open @ desktop...
Visual review written to /private/tmp/vpr-e2e/out
```

Exit code `0`. Files produced in `out/`:

```text
changes-stat.txt  changes.patch  manifest.json  report.md  summary.json
4-home--7-desktop-{before,after,side-by-side,diff}.png
4-home--6-mobile-{before,after,side-by-side,diff}.png
18-home-evidence-open--7-desktop-{before,after,side-by-side,diff}.png
```

`details` was **not** captured. Only `examples/demo/index.html` changed, and the impact rules map
that file to `home` and `home-evidence-open` only.

### Programmatic inspection of `summary.json`

```text
counts {"capture-failed":0,"review-required":3,"changed-within-threshold":0,"unchanged":0} reviewRequired true
selection impact-rules ["home","home-evidence-open"]
skipped [{"id":"details","name":"Details","reason":"not selected by impact rules"}]
 - home mobile review-required 14.44% runtime:true sem:["aria.main","text.h1"] ["1 new console error on head","semantic change in aria.main, text.h1"]
 - home desktop review-required 12.82% runtime:true sem:["aria.main","text.h1"] ["1 new console error on head","semantic change in aria.main, text.h1"]
 - home-evidence-open desktop review-required 11.64% runtime:true sem:[] ["1 new console error on head"]
```

### Programmatic inspection of `manifest.json`

```text
schema 2  baseSha length 40  publicConfigDigest length 64  artifactHashes 16
commands {"install":null,"startTemplate":"node examples/demo/server.mjs {port}","basePreview":"node examples/demo/server.mjs 4317","headPreview":"node examples/demo/server.mjs 4318"}
runtime head home-desktop {"status":200,"pageErrors":[],"consoleErrors":["demo: head-only console error"],"failedRequests":[],"assertionFailures":[],"captureError":null}
```

Base and head SHAs are full 40-character values. The head-only `console.error` was recorded on
the head side only and produced a `review-required` verdict at a pixel ratio that alone would
also have triggered it; the `home-evidence-open` cell shows the runtime reason standing on its
own in `reasons`.

### Image evidence, inspected visually

Three generated images were opened and read:

- `4-home--7-desktop-side-by-side.png` — BEFORE and AFTER panes with readable labels
  `BEFORE · HEAD~1 · 666e6cc · desktop` and `AFTER · HEAD · 0c8685a · desktop`. The blue-to-orange
  accent change and the `Make the diff easier to see.` → `Make the diff obvious.` heading change
  are both visible. The non-deterministic `rendered at <timestamp>` line is absent from both
  panes, confirming `capture.hideSelectors` worked.
- `18-home-evidence-open--7-desktop-after.png` — the evidence panel is expanded, confirming the
  `click` → `waitForSelector` → `assertVisible` scenario replay reached the intended state.
- `4-home--7-desktop-diff.png` — a pixelmatch diff showing the changed heading, borders and buttons.

## 6. Scenario failure handling

A deliberately broken scenario was added (`waitForSelector` on `#does-not-exist`,
`timeoutMs: 1500`) and the run repeated with `--all`.

Observed exit code: `1`. Observed `summary.json`:

```text
counts {"capture-failed":1,"review-required":3,"changed-within-threshold":0,"unchanged":1}
 - broken desktop capture-failed ["base capture failed: step 1 (waitForSelector #does-not-exist) failed: locator.waitFor: Timeout 1500ms exceeded. ...", "head capture failed: ..."] {}
 - home mobile review-required ...
 - home desktop review-required ...
 - home-evidence-open desktop review-required ...
 - details desktop unchanged []
```

`report.md` contained `| NOT CAPTURED | 1 |` in the verdict tally and 4 occurrences of the
missing selector name. The other four cells captured normally, and `details` was correctly
`unchanged`. **A broken scenario produces a partial report and exit code 1; it does not stop the
run.**

## 7. Determinism

The same comparison was run twice into `r1/` and `r2/`.

- Every PNG was byte-identical (`cmp` over all 20 images produced no differences).
- `report.md` was identical after removing the `**Generated:**` line.
- `manifest.json` differed in exactly two fields beyond `generatedAt` and `durationMs`:

```text
.provenance.artifactHashes.report.md   | 8dd7371f... -> a4be4027...
.provenance.artifactHashes.summary.json | fde6d577... -> fd49b828...
```

Both are the SHA-256 of files that embed `generatedAt`/`durationMs`. No other field varied. This
matches the documented determinism statement in `docs/configuration.md`.

## 8. Secret redaction, end-to-end

The demo config was given `env: {"DEMO_API_TOKEN": "s3cr3t-value-should-not-appear"}` and a
`startCommand` with the same value as an inline assignment, then run with `--all`.

Observed exit code `0`.

```bash
grep -rl "s3cr3t-value-should-not-appear" out3/
```

Observed: no matches across `report.md`, `summary.json`, `manifest.json`, `changes.patch` and all
PNGs. `manifest.json` recorded:

```text
envKeys ["DEMO_API_TOKEN"]
commands {"install":null,"startTemplate":"DEMO_API_TOKEN=<redacted> node examples/demo/server.mjs {port}","basePreview":"DEMO_API_TOKEN=<redacted> node examples/demo/server.mjs 4317","headPreview":"DEMO_API_TOKEN=<redacted> node examples/demo/server.mjs 4318"}
```

This run also surfaced and fixed a real bug: `startCommandForPlatform` prefixed every POSIX
command with `exec`, and `exec FOO=bar cmd` makes the shell treat `FOO=bar` as the program name.
Observed before the fix:

```text
Error: preview process exited early with code 127
Base logs:
/bin/sh: line 0: exec: DEMO_API_TOKEN=s3cr3t-value-should-not-appear: not found
```

The fix emits `exec env FOO=bar cmd` when the command starts with inline assignments, and is
covered by `test/visual.test.mjs`.

## 9. Cleanup guarantees

After all runs, in the scratch repository:

```text
$ git worktree list
/private/tmp/vpr-e2e  0c8685a [main]

$ lsof -nP -iTCP:4317 -iTCP:4318 -sTCP:LISTEN
none
```

No leftover review worktree, no orphaned preview process on either port. The scratch repository
at `/tmp/vpr-e2e` was removed after verification.

## 10. Collection-layout verification

After moving the skill to `skills/engineering/visual-pr-review/`, verification was rerun from the
nested skill directory:

```bash
npm test
npm audit --audit-level=high
npm pack --dry-run
```

Observed: 96 tests passed with Chromium, zero dependency vulnerabilities, and 51 intended package
files including `SKILL.md` and `LICENSE`.

From the collection root:

```bash
npx skills@latest add . --list
```

Observed: exactly one installable skill, `visual-pr-review`. A new two-commit scratch repository
then invoked the nested CLI path and captured four scenario/viewport cells with 20 artifact hashes
and zero capture failures.

## 11. Example configuration validity

`test/examples.test.mjs` loads and strictly validates `examples/configs/minimal.json`,
`examples/configs/full.json` and `examples/demo/visual-review.json` on every `npm test` run, so
documentation examples cannot drift from the validator. Both assertions passed.

## Limitations of this verification

- **Linux untested.** Only macOS arm64 was exercised end-to-end.
- **Windows unsupported and untested.** Not claimed anywhere in the documentation.
- **Single browser.** Only Playwright-managed Chromium 153 was used. Firefox and WebKit were not
  exercised. `VISUAL_REVIEW_BROWSER_PATH` was not exercised in this session.
- **Small demo application.** The demo is a two-page static server. Framework build pipelines,
  `installCommand`, long startup times and `fullPage` captures on tall pages were not exercised
  end-to-end; `installCommand` was `null` in every observed run.
- **ARIA snapshot coverage.** `aria` semantic evidence was exercised on Chromium 153 with
  Playwright 1.63 and produced a real diff (`aria.main`). Its `<unavailable: ...>` degradation
  path is unit-tested but was not triggered against a real browser.
- **Determinism scope.** Verified on one machine across two consecutive runs. Cross-machine and
  cross-OS byte-identity of PNGs is not claimed and was not tested.
- **No network egress test.** The origin pin is enforced in code and unit-tested
  (`resolveLocalRoute`, `normalizeConfig`, `replaySteps`), and a real-browser test
  (`test/capture-browser.test.mjs`) blocks external redirects, links, forms and JavaScript
  navigation against two local HTTP servers. Packet-level confirmation of zero outbound traffic
  to arbitrary public hosts was not performed.
- The GitHub Actions example in `examples/github-actions/visual-pr-review.yml` was **not** run.
  It is a manual, opt-in `workflow_dispatch` example that only uploads evidence when the
  `upload-evidence` input is explicitly enabled, and it posts nothing.
