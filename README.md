<p align="center">
  <img src="docs/visualize-pr-logo.svg" alt="Visualize PR" width="900">
</p>

<h1 align="center">Visual PR Review</h1>

<p align="center"><code>/visualize-pr</code> turns code changes into reviewer-ready visual, semantic and runtime evidence.</p>

<p align="center"><sub><code>/visualize-pr</code> is this project's shorthand, not a registered slash command. Invoke the skill by name or run the CLI directly.</sub></p>

Boot **two git revisions side by side on your own machine**, replay the same reviewer states
against both, and write a single directory of evidence a human can act on. No baseline images to
commit, no account, no cloud, no bucket, and nothing posted anywhere.

See [docs/competitive-landscape.md](docs/competitive-landscape.md) for what 16 checked projects do
and do not do, and [docs/product-thesis.md](docs/product-thesis.md) for the scope, threat model,
and non-goals.

## What the reviewer gets

- `report.md` — evidence ordered by severity, with the individual captures behind a details block
- `summary.json` — machine-readable verdicts, counts, and artifact paths
- `manifest.json` — full provenance: 40-char SHAs, public-config digest, SHA-256 per artifact
- `<scenario>-<viewport>-before|after|side-by-side|diff.png`
- `changes.patch` — full binary-safe git patch, plus `changes-stat.txt`

## Capabilities

| | |
| --- | --- |
| **Two live revisions** | Both revisions are checked out into detached worktrees and started on separate local ports. Nothing is stored as a baseline. |
| **Scenario replay** | A validated action list (`goto`, `click`, `fill`, `press`, `select`, `waitForSelector`, `assertVisible`, `assertText`) is replayed identically on base and head. |
| **Capture matrix** | Scenario x viewport, with deterministic artifact names. |
| **Deterministic capture** | Reduced motion, animations disabled, caret hidden, plus configurable `hideSelectors` and `maskSelectors`. |
| **Runtime evidence** | Page errors, console errors, failed requests, document status and assertion failures, recorded separately for each revision. |
| **Semantic evidence** | Normalized title, selected DOM text, and an optional Playwright ARIA snapshot. |
| **Code-aware selection** | Explicit glob-to-scenario rules. When no rule matches, the configured smoke scenarios run and the report says exactly why. |
| **Thresholded verdicts** | `unchanged`, `changed-within-threshold`, `review-required`, `capture-failed`. None of them approves a pull request. |
| **Provenance** | Public-config digest, per-artifact SHA-256, browser build, redacted commands, env key names only. |

## Sequence

![Visual PR Review sequence](docs/visual-pr-review-sequence.svg)

## Quick start

```bash
npm install
npx playwright install chromium
# Or reuse a compatible browser:
# export VISUAL_REVIEW_BROWSER_PATH=/path/to/chrome-headless-shell
```

In the application repository, create `visual-review.json`:

```json
{
  "startCommand": "npm run dev -- --host 127.0.0.1 --port {port}",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "capture": { "hideSelectors": [".relative-timestamp"] },
  "scenarios": [
    { "id": "home", "path": "/", "viewports": ["desktop", "mobile"] },
    {
      "id": "checkout-error",
      "name": "Checkout showing a declined card",
      "path": "/checkout",
      "steps": [
        { "action": "fill", "selector": "#card-number", "value": "4000000000000002" },
        { "action": "click", "selector": "#pay" },
        { "action": "waitForSelector", "selector": "[role='alert']" },
        { "action": "assertText", "selector": "[role='alert']", "contains": "declined" }
      ]
    }
  ],
  "impact": {
    "rules": [{ "glob": "src/checkout/**", "scenarios": ["checkout-error"] }],
    "smokeScenarios": ["home"]
  }
}
```

Then run:

```bash
node /path/to/visual-pr-review/scripts/visual-pr-review.mjs \
  --base origin/main \
  --head HEAD \
  --config visual-review.json \
  --output visual-review-output
```

Open `visual-review-output/report.md`.

Full annotated examples: [`examples/configs/minimal.json`](examples/configs/minimal.json) and
[`examples/configs/full.json`](examples/configs/full.json). Reference for every key:
[docs/configuration.md](docs/configuration.md).

## CLI

```text
--base <ref>       Base git revision, required
--head <ref>       Head git revision, default: HEAD
--config <path>    Config path, default: visual-review.json
--output <path>    Artifact directory, default: visual-review-output
--scenario <id>    Capture only this scenario, repeatable, overrides impact rules
--all              Capture every configured scenario, ignoring impact rules
--keep-worktrees   Preserve temporary worktrees for debugging
```

Exit codes: `0` every selected scenario produced comparable evidence, `1` at least one scenario
could not be captured and the report is partial, `2` usage or configuration error.

## CI

[`examples/github-actions/visual-pr-review.yml`](examples/github-actions/visual-pr-review.yml)
is a manual, opt-in `workflow_dispatch` example. It does not run automatically, and it only
uploads the evidence directory when the `upload-evidence` input is explicitly enabled. The file
carries a prominent disclosure that uploaded evidence leaves the runner and must be inspected
for secrets first. It never posts comments, reviews or statuses.

## Platforms

Linux and macOS. Windows is not claimed: process-group cleanup and shell semantics are only
tested on POSIX.

## Safety boundary

The tool runs the install and start commands of **both** git revisions, which is arbitrary code
execution by design. Use trusted revisions or a sandbox. Navigation is pinned to the local
preview origin, env values are never written into structured text artifacts, and recorded
commands are redacted. Screenshots are evidence of rendered output, not an approval verdict, and
are masked only at configured selectors.

## Development

```bash
npm test
npm run demo
```

`npm run demo` compares this repository's last two commits using
`examples/demo/visual-review.json`. It boots the bundled demo app from **both** commits, so it
only exits `0` once every scenario's selectors exist in both. Against a commit pair where they do
not, it exits `1` and writes a partial report with a `capture-failed` cell naming the missing
selector, which is the intended behaviour rather than a broken demo.

[docs/verification.md](docs/verification.md) records the exact commands and observed results of
the last full verification run.

## License

MIT
