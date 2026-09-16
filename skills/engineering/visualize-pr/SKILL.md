---
name: visualize-pr
description: Turn a pull request on GitHub, Bitbucket Cloud, or GitLab, or any two Git revisions, into reviewer-ready evidence in the PR itself. Your notes first, then a change map and sequence diagram, and for web changes before/after screenshots with runtime errors. Drafts locally; publishes only on your approval.
disable-model-invocation: true
license: MIT
metadata:
  version: 0.17.1
  author: Arys
  platforms: linux, macos
  tags: code-review, visual-testing, playwright, git, evidence
---

# Visualize PR

Run equivalent browser scenarios against two local Git revisions and produce visual, semantic,
runtime, and provenance evidence for a human reviewer. The evidence never approves a change.

## When to Use

Use this skill to compare two Git revisions or review a pull request URL on GitHub, Bitbucket
Cloud, or GitLab (self-hosted included), whether the change is web-rendered (browser screenshots
and runtime errors) or backend (a change map of changed files and their imports, plus the
sequence diagram you write). The PR text leads with your notes.

Web changes need deterministic local HTTP previews. For backend-only changes, run with `--backend`;
no browser or config is needed. Azure DevOps, Bitbucket Server, single-page screenshots, and
supplied image pairs remain planned, not shipped.

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
same markdown into the PR description. The block goes at the top, between invisible CommonMark
markers, and the author's existing text is folded under it in a collapsible "Original
description" on GitHub and GitLab; Bitbucket Cloud strips HTML, so there the original sits under a
plain "Original description" heading instead. A repeat run replaces only the block, in place. The two can be
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

## Notes and Sequence Diagram

A colleague reads the PR text on a phone, in a few seconds, next to the description the author
already wrote. Write like a message to that colleague, not a report. The CLI cannot write it, so
the agent authors two files and passes them in:

1. Run the CLI once (backend or web) to get `changes.patch` and `report.md`. Read the PR's
   existing description as well.
2. Write `visual-review-notes.md` in exactly this shape and nothing else:
   - one headline sentence, under 15 words, saying what changed;
   - three to five bullets, each under 30 words, one idea each, at most one number each, starting
     with the thing that changed. No paragraphs anywhere, not even short ones;
   - one `Heads up:` line, only when behavior changes for existing callers;
   - one fenced pseudocode block, three backticks on their own lines, under 8 lines: the single
     rule a reviewer could get wrong. Fenced, never indented, because after a bullet list
     CommonMark renders an indented block as a paragraph of the last bullet. When the diff changes
     no logic (docs, config, renames), write the bullet `No pseudocode: no logic changed.`
     instead, so the absence is a decision a reader can see.
   If the PR description already explains the change, the notes carry only what it lacks: a
   number, a risk, a fix the description does not mention. Never restate the description. No
   file counts, no SHAs; the CLI adds those. The CLI warns, with line numbers, on prose lines,
   long bullets, more than five bullets, a long block, or a missing one. Pass the file with
   `--notes`; it goes directly under the title, above everything generated.
3. Write `visual-review-sequence.mmd`, a Mermaid `sequenceDiagram` of the one flow that changed
   most: at most 4 participants, at most 6 messages, labels under 4 words, notes under 3 words.
   Pick the riskiest flow, not every branch; a second flow is a second file, rarely needed.
   Participants are real modules, services, or actors touched by the diff. Mark a changed message
   with a `Note over A,B: changed` line. `%%` starts a comment only at the beginning of a line, so
   a trailing `%% changed` renders inside the label; write `(name)` rather than `<name>`, since
   angle brackets can render as markup. The CLI warns on participant, message, and label counts.
   Skip the diagram, and say so, when the diff has no behavior change; the notes are always worth
   writing.
4. Re-run the CLI with `--notes visual-review-notes.md --diagram visual-review-sequence.mmd` and a
   fresh `--output`. The sequence block is inserted directly under the notes, above the file
   summary, in `report.md` and in `pr-comment.md` when `--pr` is set. The change map is omitted
   for a one-file change with at most one import, since it would only repeat the file line. Add
   `--update-description` (or `--post-comment`) only after the human has read the draft.

The whole block for a real one-file PR, as it lands under the title line. Match this length:

~~~markdown
Filters accept arrays and match every spelling of a value.

- `property_type`, `listing_type`, `status`: array, repeated param, or `A,B`. Objects still 400, so `uid[$ne]` never reaches `$match`.
- Each value expands to all stored spellings. District 1024, `for rent` + `room rental`: 206 of 363 before, 363 now.
- Unknown values pass through and are listed in `meta.unrecognized`: a typo is visible, not a silent 0.
- Also fixed: `limit=0` returned 500, paging repeated rows, `uid` past 2^53 rounded silently, empty `?status=` dropped the filter.

Heads up: `for sale` now also matches `For Sale` and `SALE`, about 900 more listings nationally. Intended.

```
for v in values:
    expanded += VALUE_GROUPS[field][lower(v)] or [v]   # unknown: pass through, report
match[field] = { $in: expanded }
```

### Sequence

```text
       Caller        listingCount()    expandValues()      MongoDB
         |                 |                 |                 |
         |  GET listing_count                |                 |
         |---------------->|                 |                 |
         |                 |  expand values  |                 |
         |                 |---------------->|                 |
         |                 |  all spellings  |                 |
         |                 <- - - - - - - - -|                 |
         |                 |  $in expanded   |                 |
         |                 |---------------------------------->|
         |  200 data, meta |                 |                 |
         <-----------------|                 |                 |
```

1 file changed (+110 -20): `src/controllers/agentStats.controller.js`

> Generated by `visualize-pr`. Evidence for a reviewer, not an approval.
~~~

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
