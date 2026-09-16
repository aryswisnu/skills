---
name: visualize-pr
description: Turn a GitHub PR or two Git revisions into reviewer-ready evidence. Browser screenshots and runtime errors for web changes, a diff summary and change map for backend changes, plus an optional PR comment draft.
disable-model-invocation: true
license: MIT
metadata:
  version: 0.13.1
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
to emit a change summary and an architecture diagram without a browser. `--pr` accepts GitHub,
Bitbucket Cloud, and GitLab URLs, self-hosted included. Azure DevOps, Bitbucket Server,
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

The URL may be a GitHub pull request, a Bitbucket Cloud pull request, or a GitLab merge request;
the provider is read from the path shape, so self-hosted GitLab and GitHub Enterprise work too.
This resolves the base and head SHAs, fetches them, captures evidence, and writes a draft comment
to `pr-comment.md`. Add `--post-comment` to publish it, or `--update-description` to write the
same markdown into the PR description between `<!-- visualize-pr:start -->` and
`<!-- visualize-pr:end -->` markers, which a repeat run replaces in place. The two can be
combined. Publishing is also a separate, instant step: after the human has read the draft,
`--publish <output-dir> --post-comment` or `--publish <output-dir> --update-description` posts
`pr-comment.md` as written, with no re-diff, no browser, and no second review run. For a GitHub
web review the screenshots are uploaded at that moment and an Evidence section is appended; every
line the human read stays, only the footer about local images changes. That is the normal path; pass the publish flags on the review run itself only when the human asked for
that up front. Publishing needs a token with write access in the environment: `GITHUB_TOKEN` or
`GH_TOKEN`; `BITBUCKET_TOKEN`, or `BITBUCKET_USERNAME` with `BITBUCKET_APP_PASSWORD`;
`GITLAB_TOKEN`. Backend reviews upload nothing on any provider. The change map is a Mermaid block
where the forge renders Mermaid (GitHub, GitLab) and an ASCII block where it does not (Bitbucket
Cloud renders CommonMark only); the CLI picks per provider, and `--ascii` forces ASCII anywhere,
including in `report.md`. The `--diagram` sequence diagram follows the same rule: a
`sequenceDiagram` is redrawn as ASCII art, anything else is shown as fenced source. Web reviews embed the side-by-side screenshots only on GitHub,
where they are uploaded to a `visual-review-assets` branch, at publish time; on Bitbucket and GitLab the verdicts
and diagrams still publish and the images stay in the output directory, which the CLI says at the
time. Without either flag, only the local draft is written. Bitbucket Server (Data Center) and
Azure DevOps are not implemented.

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
   modules, services, or actors touched by the diff. Mark new or changed messages with a
   `Note over A,B: changed` line. Keep it under roughly 15 messages; split into two diagrams if
   larger. Two Mermaid rules the CLI warns about but cannot fix: `%%` starts a comment only at the
   beginning of a line, so a trailing `%% changed` renders inside the message label as visible
   text, and angle brackets in a label can render as markup, so write `(name)` rather than
   `<name>`.
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
4. Run the CLI without `--post-comment` or `--update-description`. Complete authorized local
   preparation, capture, inspection, and safe retries without repeated confirmation. Never weaken
   scenarios or alter revisions merely to obtain a clean exit.
5. Show the draft before anything leaves the machine, then ask. Print `pr-comment.md` in full when
   it is under about 80 lines; otherwise print the verdict table, the attention list, and the change
   map, plus the file path. Then offer exactly these choices: post as a comment, update the
   description, both, or not now. In Claude Code, call the AskUserQuestion tool with those four
   options; they render as buttons the human can click. In a harness with no question tool, state
   the single publish command and let the harness's own command-approval prompt be the button.
   On approval, run `--publish <output-dir>` with the chosen flag; it posts the draft in under a
   second (a GitHub web review also uploads its screenshots then, so say so when offering). "Not now" ends the task with the draft path and the publish command written out
   so the human can run it later. Treat this step as the safety boundary's checkpoint: it is the
   only place publication is authorized.
6. Read `summary.json` first when it exists. Account for every selected cell, verdict, skipped
   scenario, and omission. Exit `0` means comparable evidence exists for every selected cell. Exit
   `1` means scenario-level capture failures produced a partial report. Exit `2` means usage,
   configuration, or infrastructure failure; after output creation, inspect `failure.json` for its
   phase, error, and cleanup outcome. SIGINT exits `130`; SIGTERM exits `143`. After output
   creation, both write interruption and cleanup evidence to `failure.json` when possible.
7. Establish capture validity before interpreting the diff. Changed comparisons require visual
   inspection. Unchanged captures require meaningful state assertions or image inspection showing
   the intended loaded state, not a loading shell, consent overlay, or error page. If image viewing
   is unavailable, disclose that the visual evidence was not inspected.
8. Finish when selected cells are accounted for, available images show the intended states, summary
   counts and omissions are explained, manifest SHAs and public-config digest match the invocation,
   and every hash listed by the manifest has been checked. `manifest.json` does not hash itself.
9. Confirm preview processes and temporary worktrees were cleaned up. Report retained worktrees,
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
