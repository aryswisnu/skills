---
name: visualize-pr
description: Turn a GitHub PR or two Git revisions into reviewer-ready evidence. Browser screenshots and runtime errors for web changes, a diff summary and change map for backend changes, plus an optional PR comment draft.
disable-model-invocation: true
license: MIT
metadata:
  version: 0.10.1
  author: Arys
  platforms: linux, macos
  tags: code-review, visual-testing, playwright, git, evidence
---

# Visualize PR

Run equivalent browser scenarios against two local Git revisions and produce visual, semantic,
runtime, and provenance evidence for a human reviewer. The evidence never approves a change.

## When to Use

Use this skill to compare two Git revisions or review a GitHub pull request URL, whether the
change is web-rendered (browser screenshots) or backend (a diff summary plus an architecture
diagram).

Web changes need deterministic local HTTP previews. For backend-only changes, run with `--backend`
to emit a change summary and an architecture diagram without a browser. Non-GitHub providers,
single-page screenshots, and supplied image pairs remain planned, not shipped.

## Prerequisites

For every mode:

- Git and Node.js 20 or newer.
- Both revisions available locally, or a GitHub PR URL resolvable from the repository clone.
- A trusted or sandboxed repository. Its install, build, start, and application code may run.
- Run this skill's CLI with `--setup` once after installing it. Plugin installers copy the files but do not run npm, so the first run has no dependencies and no browser. `--setup` installs both from the skill's own folder; `--setup --backend` installs the npm dependencies only and skips the browser download.

For web evidence only:

- A reproducible command that starts each revision on the supplied `{port}`.
- Playwright Chromium, or a compatible executable selected with `VISUAL_REVIEW_BROWSER_PATH`.
- A valid `visual-review.json` in the application repository. Generate one with `--init` when missing, then adjust `startCommand` and scenarios.

Backend mode (`--backend`) does not require a preview command, browser, or `visual-review.json`.

## Conditional References

- Read `docs/configuration.md` when creating or changing configuration.
- Use the **Available now** section of `docs/usage-examples.md` for executable examples.
- Read `docs/language-support.md` only when preview compatibility is uncertain.
- Use `docs/verification.md` only for skill development or diagnosis.
- Planned interfaces in `docs/usage-examples.md` are not executable workflows.

## Run

From the application repository, use the available shell capability:

```bash
node <visualize-pr-directory>/scripts/visualize-pr.mjs \
  --base origin/main \
  --head HEAD \
  --config visual-review.json \
  --output visual-review-output
```

Use a fresh output path for every attempt. The CLI refuses pre-existing output directories.

To review a GitHub pull request, run from a clone of the repository and pass its URL:

```bash
node <visualize-pr-directory>/scripts/visualize-pr.mjs \
  --pr https://github.com/<owner>/<repo>/pull/<number> \
  --config visual-review.json \
  --output visual-review-output
```

This resolves the PR's base and head SHAs, fetches them, captures evidence, and writes a draft
comment to `pr-comment.md`. Add `--post-comment` to upload the evidence to a
`visual-review-assets` branch, embed it in the comment, and publish it (requires `GITHUB_TOKEN`
or `GH_TOKEN` with write access to the repository). For web reviews the embedded evidence is the
side-by-side images. Backend reviews upload nothing: the change map is a Mermaid block that
GitHub renders natively. Without `--post-comment`, only the local draft is written. Add `--update-description` to write the same
markdown into the PR description between `<!-- visualize-pr:start -->` and `<!-- visualize-pr:end -->`
markers, which a repeat run replaces in place; it can be combined with `--post-comment`. Other
providers are not yet implemented.

For a backend or non-web change, add `--backend` (no config or browser required):

```bash
node <visualize-pr-directory>/scripts/visualize-pr.mjs \
  --base origin/main --head HEAD --backend --output visual-review-output
```

This writes `report.md` (a change summary with a Mermaid change map), `change-map.mmd` (the
Mermaid source), `architecture.svg` (a churn chart), and `summary.json` from the diff. The change
map is a `flowchart LR` of every changed source file and its in-repo imports, colored by status.
With `--pr`, the same Mermaid block goes into `pr-comment.md`, so the posted comment or PR
description renders the diagram with no image upload.

## Sequence Diagram

Colleagues understand a behavior change faster from a sequence diagram than from a file graph.
The CLI cannot infer behavior, so the agent authors it:

1. Run the CLI once (backend or web) to get `changes.patch` and `report.md`.
2. Read the patch. Write a Mermaid `sequenceDiagram` of the changed call flow into a file outside
   the output directory, for example `visual-review-sequence.mmd`. Participants are the real
   modules, services, or actors touched by the diff. Mark new or changed messages with a `Note`
   or `%% changed` comment. Keep it under roughly 15 messages; split into two diagrams if larger.
   Skip this step, and say so, when the diff has no behavior change (docs, config, renames).
3. Re-run the CLI with `--diagram visual-review-sequence.mmd` and a fresh `--output`. The block is
   inserted as a `Sequence` section in `report.md`, and in `pr-comment.md` when `--pr` is set. Add
   `--update-description` (or `--post-comment`) only after the human has read the draft.

## Workflow and Completion Contract

1. Before the first review on a machine, check for `node_modules` in the skill folder. When it is
   missing, run the CLI with `--setup` (add `--backend` when the change needs no browser) and wait
   for it to finish. A `Missing dependency` error at any later point means the same thing: run
   `--setup`, then retry.
2. Resolve the base and head refs to exact commit SHAs. Read the changed files and patch. Confirm
   that the selected scenarios cover the visible risk, or state the uncovered areas. If
   `visual-review.json` is missing, run `--init`, read the printed notes, fix the start command
   against the repo's own scripts, and add scenarios for the paths the diff touches before
   capturing.
3. Prepare dependencies and any required build in each revision through repository-owned,
   reproducible commands. Reuse a compatible installed browser; install one only when needed.
4. Run the CLI. Complete authorized local preparation, capture, inspection, and safe retries without
   repeated confirmation. Never weaken scenarios or alter revisions merely to obtain a clean exit.
5. Read `summary.json` first when it exists. Account for every selected cell, verdict, skipped
   scenario, and omission. Exit `0` means comparable evidence exists for every selected cell. Exit
   `1` means scenario-level capture failures produced a partial report. Exit `2` means usage,
   configuration, or infrastructure failure; after output creation, inspect `failure.json` for its
   phase, error, and cleanup outcome. SIGINT exits `130`; SIGTERM exits `143`. After output
   creation, both write interruption and cleanup evidence to `failure.json` when possible.
6. Establish capture validity before interpreting the diff. Changed comparisons require visual
   inspection. Unchanged captures require meaningful state assertions or image inspection showing
   the intended loaded state, not a loading shell, consent overlay, or error page. If image viewing
   is unavailable, disclose that the visual evidence was not inspected.
7. Finish when selected cells are accounted for, available images show the intended states, summary
   counts and omissions are explained, manifest SHAs and public-config digest match the invocation,
   and every hash listed by the manifest has been checked. `manifest.json` does not hash itself.
8. Confirm preview processes and temporary worktrees were cleaned up. Report retained worktrees,
   cleanup failures, missing reports, uninspected images, and persistent infrastructure failures.

A dimension mismatch legitimately omits the pixel diff while retaining available before, after,
and side-by-side images. A scenario-level failure retains only the images that were captured.

## Scenario Selection

- `--scenario <id>` selects named scenarios and overrides impact rules.
- `--all` selects every configured scenario.
- With no impact rules, every scenario runs.
- With rules, matching scenarios run. If no rule matches, smoke scenarios run, falling back to all
  scenarios when the smoke list is empty.

## Evidence and Verdicts

The output may contain `report.md`, `summary.json`, `manifest.json`, `changes.patch`,
`changes-stat.txt`, and per-cell before, after, side-by-side, and optional diff PNGs. Use artifact
paths from `summary.json`; names are collision-resistant and not a hand-authored contract.
Infrastructure failures after output creation produce `failure.json` instead of pretending a normal
report exists.

`unchanged`, `changed-within-threshold`, and `review-required` are evidence labels, not approval.
`capture-failed` means one or both sides lack comparable scenario evidence.

## Safety Boundary

- The browser guard restricts main-frame document navigation to the preview origin. It does not
  isolate application processes or block every outbound browser request.
- Structured evidence redacts configured environment values, secret-marked fills, and recognized
  command credentials. Screenshots mask configured selectors only. Use synthetic credentials and
  inspect actual images before sharing.
- Do not publish, upload, comment, or update a pull request without explicit human authorization.
  If an automated workflow uploads immediately after capture, enabling it authorizes that upload
  without a post-capture inspection checkpoint.

## Maintainer Verification

For a release change, run the complete test suite, dependency audit, link check, package dry run,
and a two-commit browser exercise. Inspect generated images with an available image-viewing
capability. For diagnosis, start with checks affected by the suspected fault and expand only when
the result or proposed fix warrants it. Normal review invocations do not rerun maintainer checks.
