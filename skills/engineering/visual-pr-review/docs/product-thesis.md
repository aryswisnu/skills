# Product Thesis

Written before implementation, revised after the survey in
[competitive-landscape.md](competitive-landscape.md).

## 1. Target reviewer job

A human reviewer opens a pull request that touches rendered UI. Their job is to decide whether
the visible result is what the author intended, and whether anything else moved. Today they
either (a) read a text diff and guess, (b) check out the branch and click around, or (c) trust a
screenshot the author pasted in, with no way to know which commit it came from.

The job this project serves: **give that reviewer, in one directory, the same rendered states
from the base revision and the head revision, with enough provenance that they can tell the
evidence has not drifted from the commits under review.**

The author runs it. The author knows which states matter. The reviewer consumes it.

## 2. Differentiated capability bundle

Each item exists somewhere in the survey. The bundle is what is differentiated.

- **B1 Baseline-free two-revision capture.** Both revisions are checked out into isolated
  detached worktrees and booted simultaneously on separate local ports. Nothing is committed,
  nothing is uploaded, nothing is approved. Contrast L1/L2/L9 (baseline files) and L6 (object
  store).
- **B2 Scenario replay.** A reviewer state is not a URL. It is a URL plus the steps to reach it.
  A closed-form, validated action list (`goto`, `click`, `fill`, `press`, `select`,
  `waitForSelector`, `assertVisible`, `assertText`) is replayed identically against both
  revisions.
- **B3 Capture matrix.** Scenario x viewport, with deterministic artifact names and a manifest
  entry per cell.
- **B4 Deterministic stabilization.** Reduced motion, animations disabled, caret hidden,
  configurable hidden and masked selectors, configurable settle rule. Noise suppressed at
  capture time, not explained away in the report.
- **B5 Three evidence kinds, separated per revision.** Visual (PNG + pixel diff), semantic
  (title, selected DOM text, optional ARIA tree), runtime (page errors, console errors, failed
  requests, non-2xx document status, assertion failures). Base and head are recorded separately
  so a reviewer can see a regression that introduced no pixels.
- **B6 Code-aware impact mapping, honestly.** Explicit glob-to-scenario rules map changed files
  to scenarios. When no rule matches, the run falls back to the configured smoke scenarios and
  the report says so. There is no inference, no framework detection, no guessing.
- **B7 Thresholded per-cell verdicts.** `unchanged`, `changed-within-threshold`,
  `review-required`, `capture-failed`. A verdict describes evidence. It never approves a PR.
- **B8 Self-consistency hashes and a public-config digest.** Full 40-char SHAs, a canonical
  public-config digest, SHA-256 of every listed artifact except the manifest itself, browser build,
  redacted commands, capture settings, and every failure reason. These hashes let a reviewer recompute that the directory
  is internally consistent; they are not signatures and are not tamper evidence.
- **B9 Reviewer-first report.** Changed scenarios and runtime regressions first; individual
  captures collapsed behind a details block; uncaptured states labelled as uncaptured rather
  than silently absent.

## 3. Non-goals

- **N1** Not an approval gate. No verdict, threshold or exit code means "ship it".
- **N2** Not a CI baseline system. No stored baselines, no approval workflow, no drift database.
- **N3** Not a hosted service. The core CLI writes locally and requires no account, token, or bucket.
- **N4** Does not post PR comments, reviews, descriptions, or statuses. The shipped GitHub Actions
  example is manual and uploads artifacts only when its human-triggered opt-in input is enabled.
- **N5** Not a correctness, accessibility, security or coverage oracle. An ARIA snapshot diff is
  evidence about the accessibility tree, not an accessibility audit.
- **N6** No native mobile or desktop capture. See L16 in the survey for the honest alternative.
- **N7** No framework auto-detection. The repository supplies its own start command.
- **N8** No Windows claim. Process-group cleanup and shell semantics are POSIX-tested only.
- **N9** Not a faster pixel differ. `pixelmatch` is adequate at this scale (L10 is faster).

## 4. Threat model and trust boundary

**The trust boundary is the `git` revision pair.** Running this tool executes the install and
start commands of both revisions, plus the application code of both revisions. That is arbitrary
code execution by design, because rendering a branch requires running the branch.

| Adversary / hazard | Mitigation in this repository |
| --- | --- |
| Hostile PR branch runs arbitrary code | **Not mitigated in-process.** Documented explicitly: run only on trusted revisions or inside a sandbox/container. The tool refuses to pretend otherwise. |
| Config or page attempts off-origin navigation | `goto` steps accept local paths only, and the browser guard rejects off-origin main-frame document navigation. This is not process isolation or a block on every outbound browser request. |
| Readiness probe used as an SSRF primitive | Readiness polls a fixed `http://127.0.0.1:<port>` URL derived from the allocated port, bounded by `startupTimeoutMs` and an abort signal. |
| Secrets leak into shareable artifacts | Config `env` records key names only, never values. Recorded commands are scanned and redacted for inline `KEY=value` assignments, `--token`/`--password`-style flags (quoted or not), and URL userinfo. Scenario `fill` values are recorded as a length-only descriptor when the step is marked `secret`. This covers structured text artifacts; screenshots are masked only at configured selectors, so rendered secrets outside those selectors still require human review. |
| Artifact path escape / overwrite | Artifacts are written into a freshly created, tool-owned empty output directory with exclusive no-follow file creation; symlink components and pre-existing targets are rejected. Scenario ids and viewport names are slugified to `[a-z0-9-]`, and length-prefixed cell names make collisions across scenario/viewport boundaries impossible and are still validated at config time. |
| Orphaned preview processes | Previews are spawned detached into their own process group and the whole group is signalled on exit and on SIGINT/SIGTERM. |
| Worktrees left behind | Removed in a `finally` block unless `--keep-worktrees` is passed. |
| Evidence silently drifting from the commits | Full SHAs, a public-config digest, and SHA-256 for every artifact listed by the manifest except the manifest itself; a reviewer can recompute them. These are self-consistency checks, not tamper evidence. |
| Binary/patch corruption | The patch is produced with `git diff --binary` and written without trimming. |

What is **out** of the threat model: a malicious *reviewer* (they already have the repo), and a
compromised local machine (nothing here can help).

## 5. Acceptance criteria, testable locally

| # | Criterion | How it is checked |
| --- | --- | --- |
| A1 | A scenario with steps replays identically on base and head | unit test on the compiled step plan; end-to-end demo run |
| A2 | An unknown action type, an external `goto`, a duplicate scenario id, a bad viewport, an out-of-range threshold, or an unknown config key is rejected at config time | unit tests, one per rejection |
| A3 | Capture matrix produces collision-resistant, length-prefixed per-cell before, after, side-by-side, and optional diff PNGs | unit test on the naming function; demo run inspects paths from `summary.json` |
| A4 | Changed files map to scenarios via globs, and fall back to smoke scenarios with an explicit reason when no rule matches | unit tests for match, no-match fallback, and empty-smoke case |
| A5 | Verdicts follow the documented threshold ordering | unit tests at each boundary |
| A6 | Runtime evidence is recorded separately for base and head | unit test on the merge function; demo run with an induced console error |
| A7 | One broken scenario yields a partial report, a `capture-failed` verdict with a reason, and exit code 1 — other scenarios still capture | unit test on exit-code selection; demo run with a deliberately broken scenario |
| A8 | No secret value appears in `manifest.json`, `summary.json` or `report.md` | unit tests on the redactor; grep over demo output |
| A9 | Manifest contains full 40-char SHAs, a public-config digest, and a SHA-256 for every listed artifact except itself | unit tests; demo run verified programmatically |
| A10 | Controlled application state under a stable browser and host produces repeatable output apart from documented variable fields | two demo runs diffed with those fields removed |
| A11 | `npm test` passes and `npm audit` reports no vulnerabilities | verification run, recorded in `docs/verification.md` |

## 6. Deliberate omissions

- **Video / trace capture.** Playwright can record both. Neither is deterministic enough to diff,
  and both balloon artifact size. A reviewer gets the same signal from scenario steps plus
  runtime evidence.
- **SSIM or perceptual diffing.** `pixelmatch` with an antialias-tolerant threshold plus masking
  covers the noise sources actually seen here. Adding a second algorithm adds a tuning knob
  without adding evidence.
- **Automatic route discovery from the framework router.** Rejected as inference (N7). The glob
  rules in B6 are explicit and auditable; a router crawler is neither.
- **Cross-browser capture.** Firefox and WebKit are one config line away but triple the install
  surface and the flake surface for a signal the reviewer rarely needs on a single PR.
