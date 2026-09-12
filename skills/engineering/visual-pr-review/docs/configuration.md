# Configuration Reference

`visual-review.json` lives in the **application** repository. Validation is strict: any unknown
key is an error, so a typo fails the run instead of silently disabling a feature.

## Top level

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `startCommand` | string | **required** | `{port}` is replaced per revision. The process also gets `PORT`, `VISUAL_REVIEW_PORT` and `BROWSER=none`. |
| `installCommand` | string \| null | `null` | Run once per revision before starting the preview. |
| `readyPath` | string | `"/"` | Must start with `/`. Polled until it returns 2xx. |
| `basePort` | integer | `4173` | Head uses `basePort + 1`. |
| `startupTimeoutMs` | integer | `120000` | Per revision. |
| `env` | object | `{}` | String/number/boolean values. **Only the key names are written to artifacts.** |
| `viewports` | array | `[{ "name": "desktop", "width": 1440, "height": 900 }]` | See below. |
| `capture` | object | see below | Determinism controls. |
| `thresholds` | object | see below | Verdict boundaries. |
| `scenarios` | array | **required** | See below. |
| `impact` | object | `{}` | Glob-to-scenario rules. |
| `viewport`, `routes` | — | — | Deprecated 0.2 shape. Still accepted and migrated; `routes[].waitForSelector` becomes a first `waitForSelector` step and `routes[].waitForMs` becomes `settleMs`. |

## `viewports[]`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | string | `viewport-<index>` | Slugified to `[a-z0-9-]` and used in artifact filenames. Must be unique after slugging. |
| `width` | integer | required | 1–10000. |
| `height` | integer | required | 1–20000. |
| `deviceScaleFactor` | number | `1` | `(0, 4]`. A value above 1 multiplies pixel counts on both sides. |

## `capture`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `reducedMotion` | boolean | `true` | Sets the `prefers-reduced-motion: reduce` emulation. |
| `disableAnimations` | boolean | `true` | Injects CSS zeroing animation/transition durations and hiding the caret. |
| `hideSelectors` | string[] | `[]` | `visibility: hidden`. Layout is preserved, content is gone. Use for clocks and relative timestamps. |
| `maskSelectors` | string[] | `[]` | Painted over with a flat colour. Use where the element must still occupy and tint its box. |
| `settleMs` | integer | `250` | Default post-step wait. A scenario can override it. |
| `waitUntil` | enum | `"networkidle"` | `load`, `domcontentloaded`, `networkidle`, `commit`. |

## `thresholds`

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `pixelmatch` | 0–1 | `0.1` | Per-pixel colour tolerance passed to `pixelmatch`. |
| `changedRatio` | 0–1 | `0.0005` | At or below this changed-pixel ratio, the cell is `unchanged`. |
| `reviewRatio` | 0–1 | `0.02` | Above this ratio, the cell is `review-required`. Between the two, `changed-within-threshold`. |

`changedRatio` must not exceed `reviewRatio`.

## `scenarios[]`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | string | derived from `name`/`path` | Slugified; must be unique. Used in artifact filenames and impact rules. |
| `name` | string | the `id` | Human label in the report. |
| `path` | string | **required** | Must start with `/`. Protocol-relative and absolute URLs are rejected. |
| `description` | string \| null | `null` | Shown in the manifest. |
| `viewports` | string[] | every configured viewport | Must name declared viewports. |
| `fullPage` | boolean | `false` | Full-page captures only compare when both revisions produce the same height. |
| `settleMs` | integer | `capture.settleMs` | Wait after the last step, before the screenshot. |
| `steps` | array | `[]` | See actions below. |
| `semantic` | object | `{ "title": true }` | `title` (boolean), `textSelectors` (string[]), `aria` (selector or null). |

### Actions

Only these action types are accepted. Anything else is a configuration error.

| Action | Required keys | Behaviour |
| --- | --- | --- |
| `goto` | `path` | Navigates within the preview origin. External and protocol-relative paths are rejected. |
| `click` | `selector` | |
| `fill` | `selector`, `value` | Add `"secret": true` to store the value as `<redacted:N>` in artifacts. |
| `press` | `selector`, `key` | |
| `select` | `selector`, `value` | `selectOption`. |
| `waitForSelector` | `selector` | Waits for the element to be attached. |
| `assertVisible` | `selector` | **Evidence, not control flow.** A failure is recorded and the scenario continues. |
| `assertText` | `selector`, and `equals` or `contains` | Whitespace-collapsed comparison. Recorded like `assertVisible`. |

Every action accepts `timeoutMs` (default `10000`).

A failing **assertion** produces a `review-required` verdict. A failing **action** (a selector
that never appears, for example) produces `capture-failed` for that cell and exit code 1, while
every other scenario still captures.

## `impact`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `rules[].glob` / `rules[].globs` | string / string[] | — | `**` matches path segments, `*` matches within a segment, `?` matches one character. Everything else is literal. |
| `rules[].scenarios` | string[] | — | Must reference declared scenario ids. |
| `smokeScenarios` | string[] | `[first scenario]` | Captured when no rule matches a changed file. |

Selection reasons recorded in the report and `summary.json`:

- `impact-rules` — at least one changed file matched a rule
- `no-rule-matched-smoke-fallback` — nothing matched, so the smoke scenarios ran
- `no-impact-rules-configured-capture-all` — no rules exist, so everything ran
- `no-rule-matched-no-smoke-configured-capture-all` — nothing matched and no smoke list exists
- `explicit-scenario-flag` / `explicit-all-flag` — overridden on the command line

## What the structured artifacts redact

The `report.md`, `summary.json` and `manifest.json` text redacts these values. This guarantee
covers structured text artifacts only — **not** screenshots, which are masked only at the
selectors configured in `capture.maskSelectors` and at secret-marked `fill` inputs. A secret the
application renders elsewhere (for example, an echoed value, a query string, or a cookie banner)
can still appear in a screenshot. Use synthetic credentials and audit every image before sharing.

- `env` values (only sorted key names are recorded)
- `fill` values marked `"secret": true`
- Inline `KEY=value` assignments, `--token`/`--password`/`--api-key`-style flags (including
  single- and double-quoted values), and URL userinfo inside any recorded command

## Determinism

Output is byte-identical between runs on the same machine and revisions, except for
`generatedAt`, `durationMs`, runtime values collected from the application, and the SHA-256 of
`report.md` and `summary.json` (which embed those timestamps).
