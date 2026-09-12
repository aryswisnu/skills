---
name: visual-pr-review
description: Boot two git revisions locally and produce visual, semantic and runtime evidence for a web change.
version: 0.3.0
author: Arys
license: MIT
platforms: [linux, macos]
metadata:
  tags: [code-review, visual-testing, playwright, git, evidence]
---

# Visual PR Review Skill

Start the base and head revisions of a web application at the same time on the local machine,
replay the same reviewer states against both, and write one directory of evidence. The PR raiser
runs it. The human reviewer consumes it. **It never approves a change.**

`/visualize-pr` is this project's shorthand for the workflow below, not a registered slash
command. Invoke the skill by name, or run the CLI directly.

## When to Use

- Before requesting review on a pull request with visible web changes.
- When a reviewer needs the same route and the same interactive state rendered at two revisions.
- When a textual diff does not communicate layout, style, state, or runtime impact.
- When a change is expected to be visually inert and you want evidence that it was.

Do not use it as proof of correctness, accessibility, security, performance, or test coverage.
Do not invent a preview for code that cannot be rendered. Do not post results anywhere without
the user's explicit approval.

## Prerequisites

- A Git repository with both revisions available locally.
- Node.js 20 or newer, and Git.
- A deterministic command that starts the web app on a supplied port.
- Playwright Chromium: `terminal(command="npx playwright install chromium")`. If a compatible
  Chromium already exists, set `VISUAL_REVIEW_BROWSER_PATH` to its executable path instead.
- A `visual-review.json` in the target repository.

The configured install and start commands execute code from **both** revisions. Run this only on
code you trust or inside a sandbox.

The application may use any programming language. The adapter requires only a deterministic HTTP
preview on the supplied local port; Git diff collection is language-independent. Native mobile,
native desktop, CLI, library, worker, API-only and infrastructure changes need a different
capture adapter or an explicit visual fixture. See `docs/language-support.md`.

## How to Run

1. `terminal(command="npm install", workdir="<visual-pr-review-directory>")`.
2. From the application repository:

```text
terminal(command="node <visual-pr-review-directory>/scripts/visual-pr-review.mjs --base origin/main --head HEAD --config visual-review.json --output visual-review-output", workdir="<application-repository>", timeout=900)
```

3. Read `visual-review-output/summary.json` first. It gives verdict counts, the scenario
   selection reason, and which scenarios were skipped.
4. Use `vision_analyze` on every `*-side-by-side.png` that is not `unchanged`.
5. Read `visual-review-output/report.md` and `manifest.json` before sharing them.

## Configuration

Minimal:

```json
{
  "startCommand": "npm run dev -- --host 127.0.0.1 --port {port}",
  "scenarios": [{ "id": "home", "path": "/" }]
}
```

Realistic:

```json
{
  "installCommand": "npm ci",
  "startCommand": "npm run preview -- --host 127.0.0.1 --port {port}",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "capture": { "hideSelectors": [".relative-timestamp"], "maskSelectors": [".user-avatar"] },
  "thresholds": { "changedRatio": 0.0005, "reviewRatio": 0.02 },
  "scenarios": [
    { "id": "home", "path": "/", "viewports": ["desktop", "mobile"],
      "semantic": { "title": true, "textSelectors": ["h1"], "aria": "main" } },
    { "id": "checkout-error", "name": "Checkout showing a declined card", "path": "/checkout",
      "steps": [
        { "action": "fill", "selector": "#card-number", "value": "4000000000000002" },
        { "action": "click", "selector": "#pay" },
        { "action": "waitForSelector", "selector": "[role='alert']" },
        { "action": "assertText", "selector": "[role='alert']", "contains": "declined" }
      ] }
  ],
  "impact": {
    "rules": [{ "glob": "src/checkout/**", "scenarios": ["checkout-error"] }],
    "smokeScenarios": ["home"]
  }
}
```

Every key is documented in `docs/configuration.md`. Validation is strict: unknown keys, unknown
action types, external navigation, duplicate scenario ids, colliding artifact names, invalid
viewports and out-of-range thresholds are all rejected before anything starts.

## Procedure

1. **Confirm the revisions.** `terminal(command="git rev-parse <base> <head>", workdir="<application-repository>")`.
   Completion criterion: two commit SHAs are returned.
2. **Read the change.** `terminal(command="git diff --name-only <base>...<head> && git diff <base>...<head>")`.
   Summarize intent, visible impact and risk areas. Completion criterion: every changed file is
   accounted for, and every scenario the run will capture has a defensible connection to the
   change or is explicitly a smoke scenario.
3. **Check the impact rules.** If changed files fall outside every `impact.rules` glob, either
   add a rule or accept the smoke fallback knowingly. Completion criterion: you can state why
   each captured scenario was captured and each skipped one was skipped.
4. **Run the CLI.** Completion criterion: it exits `0`, or exits `1` and you can name which
   scenario failed to capture and why.
5. **Read `summary.json`.** Completion criterion: `counts`, `selection.reason` and
   `skippedScenarios` are all accounted for in your summary to the user.
6. **Inspect the images.** `vision_analyze` every side-by-side for any cell that is not
   `unchanged`. Completion criterion: BEFORE and AFTER labels are readable, content is loaded,
   dimensions are comparable, and no consent dialog or error overlay obscures the page.
7. **Check provenance.** Completion criterion: `manifest.json` carries the exact 40-character
   SHAs you resolved in step 1, a public-config digest, and a self-consistency SHA-256 for every
   artifact.
8. **Present the report to the PR raiser.** Do not post it to GitHub, Slack, or anywhere else
   without explicit approval.

## Verdicts

| Verdict | Meaning | Exit impact |
| --- | --- | --- |
| `unchanged` | Changed-pixel ratio at or below `thresholds.changedRatio`, no semantic change, no new runtime error. | none |
| `changed-within-threshold` | Visible change below `thresholds.reviewRatio`. | none |
| `review-required` | Above the review threshold, or a semantic change, or a head-only runtime error, or a failed assertion, or mismatched capture dimensions. | none |
| `capture-failed` | One or both sides could not be captured. The reason is recorded. | exit code 1 |

`review-required` is a pointer, not a failure. `unchanged` is not an approval. A zero-pixel diff
can still hide a behavioural regression; a large diff can be entirely intended.

## Output

- `report.md` — severity-ordered evidence, individual captures collapsed behind a details
  block, skipped states named
- `summary.json` — machine-readable verdicts and counts
- `manifest.json` — full provenance
- `changes.patch`, `changes-stat.txt`
- `<scenario>-<viewport>-before.png`, `-after.png`, `-side-by-side.png`, `-diff.png`

## Pitfalls

- Full-page captures must produce the same height on both revisions, or the cell becomes
  `review-required` with no pixel diff. Use viewport captures for pages whose height changes.
- Live APIs, clocks, randomized content and animations create noise. Use `capture.hideSelectors`,
  `capture.maskSelectors`, and a seeded review mode in the application.
- Authentication is application-specific. Use deterministic test accounts or preconfigured state,
  never credentials in the config. Mark any credential-like `fill` value `"secret": true`.
- The CLI executes repository commands from both revisions. Untrusted pull requests need
  isolation.
- Impact rules are explicit, not smart. If you do not write a rule, the smoke scenarios run.

## Verification

- `terminal(command="npm test", workdir="<visual-pr-review-directory>")` passes.
- The CLI exits `0` against a repository with two visibly different commits.
- `manifest.json` contains the exact 40-character base and head SHAs and a public-config digest.
- Every captured cell has before, after, side-by-side and diff PNGs, and every uncaptured cell is
  labelled `NOT CAPTURED` in the report with a reason.
- `vision_analyze` confirms the side-by-side labels and layout are readable.
- No secret value appears in the structured text of `report.md`, `summary.json` or `manifest.json`
  when it was declared as a secret or recorded in a scanned command. Screenshots are masked only
  at configured selectors, so prefer synthetic credentials and audit every image before sharing.
- No GitHub comment, review, or upload occurs without the user's explicit approval.
