# Usage Examples

> **Implementation status:** The local Git and browser workflow, the GitHub, Bitbucket Cloud, and
> GitLab pull request URL entry points, and the backend diff-summary path in
> [Available now](#available-now-v0110) are implemented and tested in v0.13.0. Azure DevOps and the
> richer non-web adapters in [Planned interfaces](#planned-interfaces-not-yet-implemented) are
> design examples, not executable features in the current release.

## Available now, v0.13.0

### Install the skill collection

List the available skills:

```bash
npx skills@latest add aryswisnu/skills --list
```

Install `visualize-pr` with a compatible skills installer, or clone the collection and install
the skill's Node dependencies:

```bash
git clone https://github.com/aryswisnu/skills.git
cd skills/skills/engineering/visualize-pr
node scripts/visualize-pr.mjs --setup
```

`--setup` installs the npm dependencies and Chromium into this folder. Add `--backend` to install
the dependencies only:

```bash
node scripts/visualize-pr.mjs --setup --backend
```

### Generate a starter config

Run from the application repository:

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs --init
```

It inspects the repository (package manifests, lockfiles, framework dependencies, or a root
`index.html`), writes `visual-review.json` with one `home` scenario at `/` on a desktop and a mobile
viewport, and prints the detected project kind plus any notes. It never overwrites an existing file:
that exits `2`. Pass `--config <path>` to write somewhere else.

The generated `startCommand` is a starting point. Check it against the repository's own scripts,
then add scenarios for the pages the team changes most.

### Compare a local branch with its base

Run from the application repository, not from the skill collection:

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --base origin/main \
  --head HEAD \
  --config visual-review.json \
  --output visual-review-output
```

The command writes `report.md`, `summary.json`, `manifest.json`, the Git patch and statistics, and
before, after, and side-by-side PNGs, plus a diff PNG when base and head dimensions match.

### Review a GitHub pull request

From a clone of the repository, pass the pull request URL with `--pr`:

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --pr https://github.com/acme/orders/pull/123 \
  --config visual-review.json \
  --output visual-review-output
```

The CLI resolves the PR's base and head SHAs, fetches them, captures evidence, and writes a
`pr-comment.md` draft next to the report. Add `--post-comment` to upload the evidence to a
`visual-review-assets` branch, embed it in the comment, and publish it; posting requires
`GITHUB_TOKEN` (or `GH_TOKEN`) with write access to the repository. For web reviews the evidence is
the side-by-side images; backend reviews carry a Mermaid change map and upload nothing. The default only
writes the local draft.

Add `--update-description` to write the same markdown into the pull request description instead of,
or alongside, a comment:

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --pr https://github.com/acme/orders/pull/123 \
  --config visual-review.json \
  --output visual-review-output \
  --update-description
```

The section is delimited by `<!-- visualize-pr:start -->` and `<!-- visualize-pr:end -->`, so
rerunning replaces the block in place and leaves the rest of the description untouched. It uploads
evidence and requires the same token as `--post-comment`, and the two flags can be combined.

See [What the PR comment looks like](pr-comment-examples.md) for complete rendered web and backend
examples.

### Force ASCII diagrams

Where Mermaid is not rendered (Bitbucket Cloud, email, a terminal), `--ascii` draws the change map
and the sequence diagram as text. Bitbucket gets this automatically; the flag forces it anywhere,
including in the local `report.md`:

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --base origin/main \
  --backend \
  --ascii \
  --diagram visual-review-sequence.mmd \
  --output visual-review-output
```

Both `change-map.mmd` and `change-map.txt` are always written, whichever flavor the report uses.

### Review the draft, then publish it

The review run writes `pr-comment.md` and `pr.json` and posts nothing. Read the draft, then
publish it. Nothing is recomputed, so what you read is what lands. For a GitHub web review the
screenshots are uploaded at this step and an Evidence section is appended below the text you read:

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --publish visual-review-output \
  --update-description
```

`--post-comment`, `--update-description`, or both. The token rules are the same as for the
review run. This is the step an agent asks you to approve; in Claude Code the choices render as
buttons, elsewhere the publish command itself is what you approve.

### Review a Bitbucket Cloud pull request

Same flags, different URL and token. Bitbucket Cloud does not render Mermaid, so the change map
and sequence diagram are sent as ASCII text blocks automatically; web reviews post verdicts and
diagrams, and the screenshots stay in the output directory.

```bash
export BITBUCKET_TOKEN=<repository-or-workspace-access-token>
# or: export BITBUCKET_USERNAME=<user> BITBUCKET_APP_PASSWORD=<app-password>
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --pr https://bitbucket.org/acme/orders/pull-requests/123 \
  --backend \
  --update-description \
  --output visual-review-output
```

Bitbucket Server (Data Center) URLs, the `/projects/KEY/repos/...` shape, are refused with a
message: its API differs from Cloud and is not implemented.

### Review a GitLab merge request

Nested groups and self-hosted instances work; the project path is taken from the URL and encoded
as one segment for the API.

```bash
export GITLAB_TOKEN=<personal-or-project-access-token>
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --pr https://gitlab.example.com/group/subgroup/orders/-/merge_requests/123 \
  --backend \
  --post-comment \
  --output visual-review-output
```

Both providers fetch the PR's base and head **branches** from `origin` using the clone's own
credentials, then resolve the API's commit hashes locally. Bitbucket returns 12-character hashes,
which is why fetching by branch is the path that works. A head branch on a fork must be fetched
first: `git fetch <fork-url> <branch>`.

### Backend or non-web change

For a change with no browser-rendered surface, add `--backend` (no config or browser required):

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --base origin/main \
  --head HEAD \
  --backend \
  --output visual-review-output
```

This writes `report.md` (a change summary with a Mermaid change map), `change-map.mmd`,
`architecture.svg`, and `summary.json` from the diff. With `--pr`, the Mermaid block is embedded in
the posted comment or the updated PR description, and GitHub renders it; nothing is uploaded.

### Lead with notes

Write three to six bullets and a short pseudocode block, and pass the file with `--notes`. It goes
directly under the title, above the generated summary and diagrams:

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --pr https://github.com/acme/orders/pull/9 \
  --backend \
  --notes visual-review-notes.md \
  --diagram visual-review-sequence.mmd \
  --output visual-review-output-2
```

### Add a sequence diagram

Write a Mermaid `sequenceDiagram` of the changed behavior (the agent does this from
`changes.patch`), then pass it with `--diagram`. It becomes a `### Sequence` section in
`report.md` and `pr-comment.md`:

```bash
node /path/to/skills/skills/engineering/visualize-pr/scripts/visualize-pr.mjs \
  --pr https://github.com/acme/orders/pull/9 \
  --backend \
  --diagram visual-review-sequence.mmd \
  --update-description \
  --output visual-review-output-2
```

### Minimal web application

```json
{
  "startCommand": "npm run dev -- --host 127.0.0.1 --port {port}",
  "scenarios": [
    { "id": "home", "path": "/" }
  ]
}
```

### Static HTML

```json
{
  "startCommand": "python3 -m http.server {port} --bind 127.0.0.1",
  "scenarios": [
    { "id": "landing-page", "path": "/index.html" }
  ]
}
```

### Python web application

```json
{
  "installCommand": "python3 -m pip install -r requirements.txt",
  "startCommand": "python3 -m uvicorn app:app --host 127.0.0.1 --port {port}",
  "readyPath": "/health",
  "scenarios": [
    { "id": "dashboard", "path": "/dashboard" }
  ]
}
```

### Go web application

```json
{
  "startCommand": "go run ./cmd/server --host 127.0.0.1 --port {port}",
  "readyPath": "/health",
  "scenarios": [
    { "id": "home", "path": "/" }
  ]
}
```

The application language is not important. Each revision only needs to expose a deterministic
local HTTP preview on the supplied port.

### Desktop and mobile viewports

```json
{
  "startCommand": "npm run preview -- --host 127.0.0.1 --port {port}",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "scenarios": [
    {
      "id": "home",
      "path": "/",
      "viewports": ["desktop", "mobile"]
    }
  ]
}
```

### Interactive state replay

```json
{
  "startCommand": "npm run dev -- --host 127.0.0.1 --port {port}",
  "scenarios": [
    {
      "id": "checkout-error",
      "name": "Checkout showing a declined card",
      "path": "/checkout",
      "steps": [
        {
          "action": "fill",
          "selector": "#card-number",
          "value": "4000000000000002"
        },
        { "action": "click", "selector": "#pay" },
        { "action": "waitForSelector", "selector": "[role='alert']" },
        {
          "action": "assertText",
          "selector": "[role='alert']",
          "contains": "declined"
        }
      ]
    }
  ]
}
```

### Mask unstable or sensitive elements

```json
{
  "startCommand": "npm run dev -- --host 127.0.0.1 --port {port}",
  "capture": {
    "hideSelectors": [".relative-timestamp", ".live-clock"],
    "maskSelectors": [".user-avatar", "[data-sensitive]"]
  },
  "scenarios": [
    {
      "id": "account",
      "path": "/account",
      "steps": [
        {
          "action": "fill",
          "selector": "#api-token",
          "value": "synthetic-test-token",
          "secret": true
        }
      ]
    }
  ]
}
```

Secret-marked inputs are masked in screenshots and redacted from structured evidence. A secret
rendered elsewhere by the application can still appear in an image, so inspect every image before
sharing it.

### Select scenarios from changed files

```json
{
  "startCommand": "npm run dev -- --host 127.0.0.1 --port {port}",
  "scenarios": [
    { "id": "home", "path": "/" },
    { "id": "checkout", "path": "/checkout" },
    { "id": "account", "path": "/account" }
  ],
  "impact": {
    "rules": [
      {
        "glob": "src/checkout/**",
        "scenarios": ["checkout"]
      },
      {
        "glob": "src/account/**",
        "scenarios": ["account"]
      }
    ],
    "smokeScenarios": ["home"]
  }
}
```

### Capture one scenario

```bash
node /path/to/visualize-pr/scripts/visualize-pr.mjs \
  --base origin/main \
  --scenario checkout
```

Repeat `--scenario` to select more than one.

### Capture every scenario

```bash
node /path/to/visualize-pr/scripts/visualize-pr.mjs \
  --base origin/main \
  --all
```

### Preserve temporary worktrees for debugging

```bash
node /path/to/visualize-pr/scripts/visualize-pr.mjs \
  --base origin/main \
  --keep-worktrees
```

### Manual GitHub Actions run

Copy [`../examples/github-actions/visual-pr-review.yml`](../examples/github-actions/visual-pr-review.yml)
to the application's `.github/workflows/` directory. It uses `workflow_dispatch`, never runs on a
pull request automatically, and uploads evidence only when the human-triggered
`upload-evidence` input is enabled.

## Planned interfaces, not yet implemented

The following examples describe the intended direction. The v0.13.0 CLI already resolves GitHub,
Bitbucket Cloud, and GitLab URLs via `--pr` and updates descriptions on all three (see
[Available now](#available-now-v0110)); Azure DevOps and the non-web adapters remain planned.

### Slash-command shorthand

```text
/visualize-pr https://github.com/acme/orders/pull/123
```

This is the future shorthand for the implemented `--pr` flow. It will additionally manage a
Markdown description section, show the draft, and require explicit approval before updating the
remote description.

### Azure DevOps pull request

```text
/visualize-pr https://dev.azure.com/acme/platform/_git/orders/pullrequest/123
```

### Draft only versus remote update

Draft only should remain the default:

```bash
visualize-pr https://github.com/acme/orders/pull/123
```

Updating the managed section should require an explicit flag and human approval:

```bash
visualize-pr https://github.com/acme/orders/pull/123 --update-description
```

The publisher should preserve the author's description and replace only this region:

```html
<!-- visualize-pr:start -->
Generated evidence
<!-- visualize-pr:end -->
```

### Backend API comparison

```json
{
  "adapter": "api",
  "startCommand": "npm start -- --port {port}",
  "scenarios": [
    {
      "id": "create-order",
      "request": {
        "method": "POST",
        "path": "/api/orders",
        "body": {
          "productId": "fixture-123",
          "quantity": 2
        }
      }
    }
  ]
}
```

Expected evidence would include before and after status codes, headers, JSON bodies, structured
response diffs, runtime errors, and an SVG or Mermaid behavior diagram. No browser should be
required.

### CLI comparison

```json
{
  "adapter": "command",
  "scenarios": [
    {
      "id": "invalid-config",
      "command": "node bin/app.mjs --config fixtures/invalid.json"
    }
  ]
}
```

Expected evidence would compare exit codes, stdout, stderr, execution time, and generated files.

### Database or schema comparison

```json
{
  "adapter": "schema",
  "scenarios": [
    {
      "id": "orders-schema",
      "command": "npm run export-schema"
    }
  ]
}
```

Expected evidence would show added, removed, and changed tables, columns, indexes, constraints, or
API schema fields. It must compare declared snapshots or sandbox schemas, never production data.

### Browser-free image comparison

```json
{
  "adapter": "image-pair",
  "scenarios": [
    {
      "id": "mobile-checkout",
      "before": "evidence/before.png",
      "after": "evidence/after.png"
    }
  ]
}
```

This adapter would generate side-by-side, diff, report, and integrity evidence from supplied
images. It would not provide DOM, accessibility, console, or network evidence.

### Lightweight browser capture through direct CDP

```json
{
  "adapter": "web-cdp",
  "browser": {
    "executablePath": "auto"
  },
  "scenarios": [
    { "id": "home", "path": "/" }
  ]
}
```

The intended implementation would control an existing Chrome or Chromium installation directly
through Chrome DevTools Protocol, avoiding Playwright and automatic browser downloads.

### Mixed frontend and backend pull request

```json
{
  "adapters": [
    {
      "type": "api",
      "config": "visual-review.api.json"
    },
    {
      "type": "web-cdp",
      "config": "visual-review.web.json"
    }
  ]
}
```

The report would combine API behavior changes, runtime evidence, browser screenshots, semantic
changes, and one human decision boundary.

## Intended provider and evidence separation

```text
Providers                 Evidence adapters
Local Git                 Web browser
GitHub                    Backend API
Bitbucket Cloud           Command-line interface
GitLab                    Database or schema
Azure DevOps              Supplied image pair
```

The provider determines how revisions and descriptions are read or updated. The application
surface determines which evidence is generated. Remote updates must always be previewed, explicitly
approved, and read back after writing.
