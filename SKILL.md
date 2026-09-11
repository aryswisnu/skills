---
name: visual-pr-review
description: Generate before-and-after evidence for web changes.
version: 0.1.0
author: Arys, Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [code-review, visual-testing, playwright, git]
---

# Visual PR Review Skill

Generate reproducible before-and-after screenshots for a web change. The PR raiser runs the workflow, while the human reviewer consumes the report and image evidence. It augments code review and does not approve changes.

## When to Use

- Before requesting review for a pull request with visible web changes.
- When a reviewer needs the same route rendered at base and head revisions.
- When a textual diff does not clearly communicate layout, style, or state changes.

Do not use this skill as proof of correctness, accessibility, security, or complete test coverage. Do not invent a preview for code that cannot be rendered.

## Prerequisites

- A Git repository with both revisions available locally.
- Node.js 20 or newer.
- A deterministic command that starts the web app on a supplied port.
- Playwright Chromium installed through `terminal(command="npx playwright install chromium")`. If a compatible Chromium already exists, set `VISUAL_REVIEW_BROWSER_PATH` to its executable path.
- A `visual-review.json` configuration file in the target repository.

The configured install and start commands execute code from both revisions. Run this only on code you trust or inside an appropriate sandbox.

## How to Run

1. Install this repository's dependencies with `terminal(command="npm install", workdir="<visual-pr-review-directory>")`.
2. From the application repository, invoke:

```text
terminal(command="node <visual-pr-review-directory>/scripts/visual-pr-review.mjs --base origin/main --head HEAD --config visual-review.json --output visual-review-output", workdir="<application-repository>", timeout=600)
```

3. Use `vision_analyze` to inspect every generated `*-side-by-side.png` and verify labels, clipping, loading states, and obvious capture failures.
4. Read `visual-review-output/report.md` and `visual-review-output/manifest.json` before sharing them.

## Configuration

Create `visual-review.json` in the application repository:

```json
{
  "installCommand": "npm ci",
  "startCommand": "npm run dev -- --port {port}",
  "readyPath": "/",
  "basePort": 4173,
  "viewport": { "width": 1440, "height": 900 },
  "routes": [
    { "name": "Home", "path": "/" },
    { "name": "Checkout", "path": "/checkout", "waitForSelector": "main" }
  ]
}
```

`{port}` is replaced separately for base and head. The process also receives `PORT` and `VISUAL_REVIEW_PORT`. Keep route data and authentication deterministic across revisions.

## Procedure

1. Confirm the requested base and head refs, then verify both with `terminal(command="git rev-parse <ref>", workdir="<application-repository>")`. Completion criterion: both commands return commit SHAs.
2. Read the changed-file list and patch with `terminal(command="git diff --name-only <base>...<head> && git diff <base>...<head>", workdir="<application-repository>")`. Summarize the intent, visible impact, and risk areas for the reviewer without replacing the generated evidence. Completion criterion: every changed file is accounted for, and every configured route has a defensible connection to the visible changes or is explicitly a smoke route.
3. Run the CLI. It creates detached temporary worktrees, starts both revisions on separate ports, captures matching routes, and writes a report. Completion criterion: the command exits with code 0 and reports the output directory.
4. Inspect every side-by-side image with `vision_analyze`. Completion criterion: BEFORE and AFTER labels are readable, content is loaded, dimensions are comparable, and no consent dialog or error overlay obscures the page.
5. Read the manifest and report. Completion criterion: SHAs, changed files, viewport, route paths, and image filenames agree with the requested comparison.
6. Present the generated report to the PR raiser. Do not post it to GitHub without explicit approval.

## Output

- `changes.patch`
- `changes-stat.txt`
- `<route>-before.png`
- `<route>-after.png`
- `<route>-side-by-side.png`
- `<route>-diff.png`
- `manifest.json`
- `report.md`

## Pitfalls

- Full-page captures must have the same dimensions for pixel comparison. Use viewport captures for pages whose height changes intentionally.
- Live APIs, timestamps, randomized content, animations, and different user accounts create noisy diffs. Freeze or stub them in the app's review mode.
- Authentication is application-specific. Use deterministic test accounts or preconfigured app state, never credentials embedded in the skill configuration.
- The CLI executes repository commands from both revisions. Untrusted pull requests require isolation.
- A zero-pixel diff can still hide behavioral regressions. A large diff can be intentional. Human judgment remains required.

## Verification

- `terminal(command="npm test", workdir="<visual-pr-review-directory>")` passes.
- The CLI exits successfully against a repository with two visibly different commits.
- `manifest.json` contains the exact base and head SHAs.
- Every route has before, after, side-by-side, and diff PNGs.
- `vision_analyze` confirms the side-by-side labels and layout are readable.
- No GitHub comment, review, or upload occurs without the user's explicit approval.
