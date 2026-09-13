<p align="center">
  <img src="docs/visualize-pr-logo.svg" alt="Visualize PR" width="900">
</p>

<h1 align="center">Visual PR Review</h1>

<p align="center"><code>/visualize-pr</code> turns code changes into reviewer-ready visual, semantic and runtime evidence.</p>

<p align="center"><sub><code>/visualize-pr</code> is this project's shorthand, not a registered slash command. Invoke the skill by name or run the CLI directly.</sub></p>

Boot **two git revisions side by side on your own machine**, replay the same reviewer states
against both, and write a single directory of evidence a human can act on. No baseline images to
commit, no account, no hosted service, and no remote publishing by the core CLI.

See [docs/competitive-landscape.md](docs/competitive-landscape.md) for what 16 checked projects do
and do not do, and [docs/product-thesis.md](docs/product-thesis.md) for the scope, threat model,
and non-goals.

## What the reviewer gets

- `report.md` — evidence ordered by severity, with the individual captures behind a details block
- `summary.json` — machine-readable verdicts, counts, and artifact paths
- `manifest.json` — full provenance: 40-char SHAs, public-config digest, SHA-256 for every listed artifact except the manifest itself
- Collision-resistant per-cell `before|after|side-by-side|diff.png` paths listed in `summary.json`
- `failure.json` — phase, redacted error, and cleanup outcome for infrastructure failures after output creation
- `changes.patch` — full binary-safe git patch, plus `changes-stat.txt`
- `pr-comment.md` — draft PR comment with a verdict table and embedded side-by-side images (produced with `--pr`)

## Capabilities

| | |
| --- | --- |
| **Two live revisions** | Both revisions are checked out into detached worktrees and started on separate local ports. Nothing is stored as a baseline. |
| **Pull request URL** | `--pr <github-url>` resolves base and head SHAs, runs the same capture, and (with `--post-comment`) uploads the images and posts the review as a PR comment. |
| **Scenario replay** | A validated action list (`goto`, `click`, `fill`, `press`, `select`, `waitForSelector`, `assertVisible`, `assertText`) is replayed identically on base and head. |
| **Capture matrix** | Scenario x viewport, with deterministic artifact names. |
| **Deterministic capture** | Reduced motion, animations disabled, caret hidden, plus configurable `hideSelectors` and `maskSelectors`. |
| **Runtime evidence** | Page errors, console errors, failed requests, document status and assertion failures, recorded separately for each revision. |
| **Semantic evidence** | Normalized title, selected DOM text, and an optional Playwright ARIA snapshot. |
| **Code-aware selection** | No rules means all scenarios. With rules, matches run; no match uses configured smoke scenarios, or all when the smoke list is empty. |
| **Thresholded verdicts** | `unchanged`, `changed-within-threshold`, `review-required`, `capture-failed`. None of them approves a pull request. |
| **Provenance** | Public-config digest, SHA-256 for every listed artifact except the manifest itself, browser build, redacted commands, env key names only. |

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

Full annotated configurations: [`examples/configs/minimal.json`](examples/configs/minimal.json) and
[`examples/configs/full.json`](examples/configs/full.json). Reference for every current key:
[docs/configuration.md](docs/configuration.md).

## Usage examples

See [docs/usage-examples.md](docs/usage-examples.md) for:

- Installation and local branch comparison
- A GitHub pull request URL (`--pr`), with a draft comment, embedded side-by-side images, and opt-in posting
- Static HTML, Node, Python, and Go previews
- Desktop and mobile viewports
- Interactive scenarios, masks, impact rules, and focused runs
- Manual GitHub Actions usage
- Clearly marked, not-yet-implemented designs for Bitbucket, GitLab, Azure DevOps,
  GitHub description-update, backend API, CLI, schema, image-pair, mixed-PR, and direct-CDP workflows

Only examples under **Available now, v0.4.x** describe executable behavior in this release.

## CLI

```text
--base <ref>       Base git revision, required unless --pr is used
--head <ref>       Head git revision, default: HEAD
--pr <url>         GitHub pull request URL; resolves base and head SHAs
--post-comment     Upload evidence, embed images, and post as a PR comment (requires --pr)
--config <path>    Config path, default: visual-review.json
--output <path>    Artifact directory, default: visual-review-output
--scenario <id>    Capture only this scenario, repeatable, overrides impact rules
--all              Capture every configured scenario, ignoring impact rules
--keep-worktrees   Preserve temporary worktrees for debugging
```

Exit codes: `0` every selected scenario produced comparable evidence, `1` at least one scenario
could not be captured and the report is partial, `2` usage, configuration, or infrastructure
failure, `130` interrupted by SIGINT, and `143` interrupted by SIGTERM. Infrastructure failures
and interruptions write `failure.json` when the output directory has been created.

## CI

[`examples/github-actions/visual-pr-review.yml`](examples/github-actions/visual-pr-review.yml)
is a manual, opt-in `workflow_dispatch` example. It does not run automatically, and it only
uploads the evidence directory when the `upload-evidence` input is explicitly enabled. The file
carries a prominent disclosure that enabling upload authorizes newly generated evidence to leave
the runner without a post-capture inspection checkpoint. Use synthetic data and keep upload off
when the generated files must be inspected first. It never posts comments, reviews, or statuses.

## Platforms

Linux and macOS. Windows is not claimed: process-group cleanup and shell semantics are only
tested on POSIX.

## Safety boundary

The tool runs the install and start commands of **both** git revisions, which is arbitrary code
execution by design. Use trusted revisions or a sandbox. Navigation is pinned to the local
preview origin for main-frame documents, but application processes and every outbound browser
request are not isolated. Environment values are redacted from structured artifacts, and recorded
commands are redacted. Screenshots are evidence, not approval, and are masked only at configured
selectors.

## Development

From this skill directory:

```bash
npm install
npm test
npm audit --audit-level=high
npm pack --dry-run
```

For an end-to-end browser check, create a scratch Git repository with two commits containing the
bundled `examples/demo/` application, then invoke this skill's CLI from the scratch repository.
[docs/verification.md](docs/verification.md) records the exact procedure and observed results.

## License

MIT
