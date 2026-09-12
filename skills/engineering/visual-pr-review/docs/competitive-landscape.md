# Competitive Landscape

Survey date: 2026-09-12. Every row was checked against the project's own repository or
documentation, not against a roundup article. "Limitation" is stated relative to this
repository's goal: **local-first, two-git-revision, reviewer-facing evidence for a pull
request, with no baseline files to maintain and no hosted service**.

This is not an exhaustive survey of the field. It is a survey of 16 checked sources.

## Evidence table

| # | Project | Verified capability | Limitation relative to this repo's goal | Source |
| --- | --- | --- | --- | --- |
| L1 | BackstopJS | `backstop.json` scenarios with `clickSelector(s)`, `hoverSelector(s)`, `scrollToSelector`, `keyPressSelectors`; per-scenario `viewports`; Puppeteer or Playwright engine; browser/CLI/JUnit/JSON reports; console logs in report via `scenarioLogsInReports` | Compares against approved reference screenshots stored in the repo, not against a second git revision. Baselines must be committed and re-approved. No git provenance in the report. | https://github.com/garris/BackstopJS |
| L2 | Playwright `toHaveScreenshot` | Built-in pixelmatch-based assertion; `maxDiffPixels`; `stylePath` for masking dynamic content; snapshots stored next to the test and committed | Baseline-file model only ("compare against the reference"), updated with `--update-snapshots`. No two-revision orchestration, no reviewer report, no provenance. | https://playwright.dev/docs/test-snapshots |
| L3 | Playwright ARIA snapshots | `page.ariaSnapshot()` / `locator.ariaSnapshot()` produce deterministic YAML of the accessibility tree; comparison is order-sensitive and whitespace-collapsing | A capability, not a review system. Nothing pairs it with a base revision or renders it as reviewer evidence. | https://playwright.dev/docs/aria-snapshots |
| L4 | Argos | Open source (MIT) visual testing platform; integrates Playwright/Cypress/Storybook; PR review workflow is a first-class surface | The review workflow in practice runs on `app.argos-ci.com`; the repo page points to the hosted app for build tracking. Not a local-only, zero-account path. | https://github.com/argos-ci/argos |
| L5 | Lost Pixel | Storybook / Ladle / Histoire / pages / custom-shot modes | **Archived 2026-04-22, read-only.** Approval flow and review UI required the managed SaaS. Not adoptable. | https://github.com/lost-pixel/lost-pixel |
| L6 | reg-suit | `reg-keygen-git-hash-plugin` walks the branch graph to pick the commit to compare against; HTML diff report; GitHub/GitLab PR comment plugins | Requires an external object store (S3 or GCS) to hold snapshots, and its PR integration posts automatically. Neither is local-first, and auto-posting crosses the human-decision boundary this project preserves. | https://github.com/reg-viz/reg-suit |
| L7 | Chromatic | Storybook stories as tests, play-function interaction tests, Vitest component tests, Playwright/Cypress E2E capture | Cloud-only: builds, publishing and rendering all happen in Chromatic's cloud browsers. Account required. No documented local-only mode. | https://www.chromatic.com/docs/ |
| L8 | Percy (BrowserStack) | Cross-browser visual testing, CI integration, automatic build per test run | Snapshots are uploaded and rendered in Percy's infrastructure; project API keys required. Diffing does not happen on the reviewer's machine. | https://www.browserstack.com/docs/percy/overview/visual-testing-basics |
| L9 | jest-image-snapshot | `failureThreshold` with `failureThresholdType: percent|pixel`, `comparisonMethod: pixelmatch\|ssim`, `blur`, `allowSizeMismatch` | Explicitly does not orchestrate a browser ("orchestration remains the user's responsibility"). Baseline-directory model. No revision pairing, no report. | https://github.com/americanexpress/jest-image-snapshot |
| L10 | odiff | Native image diff (Zig + SIMD); ~1.2s vs pixelmatch ~7.7s on full-page shots; antialiasing detection flag | Image comparison only. No capture, no scenarios, no git, no report. Useful as a possible future diff backend, not a competitor system. | https://github.com/dmtrKovalenko/odiff |
| L11 | Storybook test-runner | Turns stories into tests; smoke test for render errors; runs play functions and reports assertion failures | Requires a running Storybook. Image diffing is a `jest-image-snapshot` recipe, not built in. Does not compare git revisions. | https://github.com/storybookjs/test-runner |
| L12 | pa11y | Accessibility runs via HTML_CodeSniffer / axe-core against WCAG2A/AA/AAA; `screenCapture` option and a screen-capture action | Accessibility only, single revision. No before/after pairing. | https://github.com/pa11y/pa11y |
| L13 | Vercel Preview Deployments | A branch- and commit-specific preview URL appears on every PR | Gives the reviewer a live URL, not evidence. No before/after image, no diff, no capture record, and it requires pushing the branch to a hosted account. | https://vercel.com/docs/deployments/environments |
| L14 | `anthropics/claude-code` code-review plugin | Four parallel agents, confidence-scored findings (report at >=80), git blame/history context, posts inline PR comments with full SHA | Text-diff only by its own description: no browser screenshots, no code execution, no runtime behaviour analysis. The visual half of a UI change is invisible to it. | https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md |
| L15 | `VoltAgent/awesome-agent-skills` catalogue | Lists visual/design skills: `openai/screenshot` (capture desktop/window/region), `microsoft/frontend-design-review`, `google-labs-code/design-md`, Trail of Bits `differential-review` (security diff + git history) | Across the catalogue's visual and diff-review skills, none was found that boots two git revisions and captures matched browser states from both. Capture skills are single-shot; diff-review skills are text-only. | https://github.com/VoltAgent/awesome-agent-skills |
| L16 | Maestro | YAML flows with `launchApp`, `tapOn`, `inputText`, `assertVisible`; Android/iOS/web; emulators and real devices | Mobile-first driver, not a web PR-evidence system. Relevant as the honest answer for native surfaces this project does not claim. | https://github.com/mobile-dev-inc/Maestro |

## What appears differentiated

Based on the 16 checked sources above, each individual capability already exists somewhere.
The combination that no checked source provides is:

1. **Two live git revisions, no baseline files.** L6 is the only checked project that picks a
   comparison commit, and it does so by fetching a stored snapshot from S3/GCS rather than by
   booting the base revision. L1, L2, L9 all require committed baseline images.
2. **Baseline-free plus scenario replay plus multi-viewport in one run.** L1 has scenario steps
   and viewports but no second revision. L7/L8 have review workflow but are cloud-rendered.
3. **Visual, semantic and runtime evidence captured from the same page session, separated per
   revision.** L1 can log console output; L11 catches render errors; L3 can emit an ARIA tree;
   L12 checks accessibility. No checked project emits all four for a base/head pair.
4. **Self-consistency hashes and a public-config digest in the artifact** (full SHAs,
   public-config digest, per-artifact SHA-256, browser build, redacted commands). Not present in
   any checked source's output.
5. **No hosted service, no account, no object store, no auto-posting.** L4/L6/L7/L8/L13 each
   fail at least one of these. L1/L2/L9/L10 satisfy them but are not revision-comparing systems.

## Explicit non-claims

- Not claimed: that no tool anywhere does this. Only 16 sources were checked.
- Not claimed: faster or more accurate pixel diffing than L10 — it is measurably faster.
- Not claimed: better team review workflow than L4 or L7 — they have review UIs, this has files.
- Not claimed: any native mobile or desktop support — see L16 for the honest alternative.
