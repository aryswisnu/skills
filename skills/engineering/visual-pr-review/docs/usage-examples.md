# Usage Examples

> **Implementation status:** The local Git and browser workflow in [Available now](#available-now-v03x)
> is implemented and tested in v0.3.x. The provider URL commands and non-web adapters in
> [Planned interfaces](#planned-interfaces-not-yet-implemented) are design examples, not executable
> features in the current release.

## Available now, v0.3.x

### Install the skill collection

List the available skills:

```bash
npx skills@latest add aryswisnu/skills --list
```

Install `visual-pr-review` with a compatible skills installer, or clone the collection and install
the skill's Node dependencies:

```bash
git clone https://github.com/aryswisnu/skills.git
cd skills/skills/engineering/visual-pr-review
npm install
npx playwright install chromium
```

### Compare a local branch with its base

Run from the application repository, not from the skill collection:

```bash
node /path/to/skills/skills/engineering/visual-pr-review/scripts/visual-pr-review.mjs \
  --base origin/main \
  --head HEAD \
  --config visual-review.json \
  --output visual-review-output
```

The command writes `report.md`, `summary.json`, `manifest.json`, the Git patch and statistics, and
before, after, and side-by-side PNGs, plus a diff PNG when base and head dimensions match.

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
node /path/to/visual-pr-review/scripts/visual-pr-review.mjs \
  --base origin/main \
  --scenario checkout
```

Repeat `--scenario` to select more than one.

### Capture every scenario

```bash
node /path/to/visual-pr-review/scripts/visual-pr-review.mjs \
  --base origin/main \
  --all
```

### Preserve temporary worktrees for debugging

```bash
node /path/to/visual-pr-review/scripts/visual-pr-review.mjs \
  --base origin/main \
  --keep-worktrees
```

### Manual GitHub Actions run

Copy [`../examples/github-actions/visual-pr-review.yml`](../examples/github-actions/visual-pr-review.yml)
to the application's `.github/workflows/` directory. It uses `workflow_dispatch`, never runs on a
pull request automatically, and uploads evidence only when the human-triggered
`upload-evidence` input is enabled.

## Planned interfaces, not yet implemented

The following examples describe the intended lightweight, provider-neutral direction. The current
v0.3.x CLI rejects these commands and configuration keys.

### Pull request URL entry point

```text
/visualize-pr <pull-request-url>
```

The future workflow will read the change request, resolve exact base and head commits, select the
appropriate evidence adapters, generate a managed Markdown section, show the draft, and require
explicit approval before updating the remote description.

### GitHub pull request

```text
/visualize-pr https://github.com/acme/orders/pull/123
```

### Bitbucket Cloud pull request

```text
/visualize-pr https://bitbucket.org/acme/orders/pull-requests/123
```

### GitLab merge request

```text
/visualize-pr https://gitlab.com/acme/orders/-/merge_requests/123
```

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
