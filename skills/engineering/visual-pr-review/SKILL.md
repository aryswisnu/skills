---
name: visual-pr-review
description: Compare two Git revisions or a GitHub PR URL of a browser-rendered web app.
version: 0.4.1
author: Arys
license: MIT
platforms: [linux, macos]
metadata:
  tags: [code-review, visual-testing, playwright, git, evidence]
---

# Visual PR Review

Run equivalent browser scenarios against two local Git revisions and produce visual, semantic,
runtime, and provenance evidence for a human reviewer. The evidence never approves a change.
`/visualize-pr` is project shorthand, not an executable slash command.

## When to Use

Use this skill when a web change must be compared across two Git revisions, or a GitHub pull
request URL should be resolved and reviewed, and both revisions can provide deterministic local
HTTP previews.

Do not load it for backend-only changes, generic testing, single-page screenshots, supplied image
pairs, or code without a browser-rendered surface. Those adapters, and non-GitHub providers, are
planned, not shipped.

## Prerequisites

- Git and Node.js 20 or newer.
- Both revisions available locally.
- A trusted or sandboxed repository. Its install, build, start, and application code will run.
- A reproducible command that starts each revision on the supplied `{port}`.
- Playwright Chromium, or a compatible executable selected with `VISUAL_REVIEW_BROWSER_PATH`.
- A valid `visual-review.json` in the application repository.

## Conditional References

- Read `docs/configuration.md` when creating or changing configuration.
- Use the **Available now** section of `docs/usage-examples.md` for executable examples.
- Read `docs/language-support.md` only when preview compatibility is uncertain.
- Use `docs/verification.md` only for skill development or diagnosis.
- Planned interfaces in `docs/usage-examples.md` are not executable workflows.

## Run

From the application repository, use the available shell capability:

```bash
node <visual-pr-review-directory>/scripts/visual-pr-review.mjs \
  --base origin/main \
  --head HEAD \
  --config visual-review.json \
  --output visual-review-output
```

Use a fresh output path for every attempt. The CLI refuses pre-existing output directories.

To review a GitHub pull request, run from a clone of the repository and pass its URL:

```bash
node <visual-pr-review-directory>/scripts/visual-pr-review.mjs \
  --pr https://github.com/<owner>/<repo>/pull/<number> \
  --config visual-review.json \
  --output visual-review-output
```

This resolves the PR's base and head SHAs, fetches them, captures evidence, and writes a draft
comment to `pr-comment.md`. Add `--post-comment` to upload the side-by-side images to a
`visual-review-assets` branch, embed them in the comment, and publish it (requires `GITHUB_TOKEN`
or `GH_TOKEN` with write access to the repository). Without it, only the local draft is written.
Other providers are not yet implemented.

## Workflow and Completion Contract

1. Resolve the base and head refs to exact commit SHAs. Read the changed files and patch. Confirm
   that the selected scenarios cover the visible risk, or state the uncovered areas.
2. Prepare dependencies and any required build in each revision through repository-owned,
   reproducible commands. Reuse a compatible installed browser; install one only when needed.
3. Run the CLI. Complete authorized local preparation, capture, inspection, and safe retries without
   repeated confirmation. Never weaken scenarios or alter revisions merely to obtain a clean exit.
4. Read `summary.json` first when it exists. Account for every selected cell, verdict, skipped
   scenario, and omission. Exit `0` means comparable evidence exists for every selected cell. Exit
   `1` means scenario-level capture failures produced a partial report. Exit `2` means usage,
   configuration, or infrastructure failure; after output creation, inspect `failure.json` for its
   phase, error, and cleanup outcome. SIGINT exits `130`; SIGTERM exits `143`. After output
   creation, both write interruption and cleanup evidence to `failure.json` when possible.
5. Establish capture validity before interpreting the diff. Changed comparisons require visual
   inspection. Unchanged captures require meaningful state assertions or image inspection showing
   the intended loaded state, not a loading shell, consent overlay, or error page. If image viewing
   is unavailable, disclose that the visual evidence was not inspected.
6. Finish when selected cells are accounted for, available images show the intended states, summary
   counts and omissions are explained, manifest SHAs and public-config digest match the invocation,
   and every hash listed by the manifest has been checked. `manifest.json` does not hash itself.
7. Confirm preview processes and temporary worktrees were cleaned up. Report retained worktrees,
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
