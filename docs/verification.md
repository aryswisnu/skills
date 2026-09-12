# Verification

Every command and every number below was run and observed on 2026-09-12. Nothing here is
predicted or reconstructed. Where a run produced a non-zero exit code, that is recorded as
observed rather than explained away.

## Environment

| | |
| --- | --- |
| Host OS | Darwin 25.5.0 (macOS), arm64 |
| Node.js | `v22.23.2` (package `engines` requires `>=20`) |
| Playwright | `1.63.0` |
| Chromium | `browser 153.0.8010.12` (Playwright-managed) |
| Git | working tree of this repository, uncommitted |

Linux was **not** tested in this session. The POSIX process-group and `exec`/`env` behaviour is
covered by unit tests that take `platform` as a parameter, but only macOS was exercised
end-to-end. Windows is not claimed and was not tested.

## 1. Automated test suite

```bash
npm test
```

Observed:

```text
# tests 96
# pass 96
# fail 0
```

The two tests in `test/capture-browser.test.mjs` require a Playwright Chromium install and
skip (94 pass, 2 skipped) when no browser executable is present. The 96/96 figure above was
observed with a Chromium available via the browser executable path.

Test files: `test/capture.test.mjs`, `test/capture-browser.test.mjs`, `test/cleanup.test.mjs`,
`test/cli-args.test.mjs`, `test/config.test.mjs`, `test/core.test.mjs`, `test/examples.test.mjs`,
`test/git.test.mjs`, `test/impact.test.mjs`, `test/network.test.mjs`, `test/output.test.mjs`,
`test/provenance.test.mjs`, `test/redact.test.mjs`, `test/report.test.mjs`,
`test/verdict.test.mjs`, `test/visual.test.mjs`.

## 2. Dependency audit

```bash
npm audit
```

Observed: `found 0 vulnerabilities`.

## 3. Whitespace and conflict-marker check

```bash
git diff --check
```

Observed: no output, exit 0.

## 4. Vendor-neutrality check

A case-insensitive recursive search for the forbidden vendor word was run over maintained source,
documentation, examples and tests, excluding `.git/`, `node_modules/` and the generated
`visual-review-output/`. The search term is supplied from a shell variable so that this record
does not itself reintroduce the word:

```bash
WORD=$(printf 'h%s' 'ermes')
grep -ril "$WORD" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=visual-review-output
```

Observed: no output, zero matches.

## 5. End-to-end demo, two real commits, real browser

A scratch Git repository was created outside this repository at `/tmp/vpr-e2e` so that two
commits could exist without committing anything here. It contained only a copy of
`examples/demo/`. Commit `666e6cc` was the base; commit `0c8685a` changed the accent colour from
`#65d1ff` to `#ffb35c`, changed the `h1` text, and added a head-only `console.error`.

```bash
node <repo>/scripts/visual-pr-review.mjs \
  --base HEAD~1 --head HEAD \
  --config examples/demo/visual-review.json \
  --output out
```

Observed console output:

```text
Preparing worktree (detached HEAD 666e6cc)
Preparing worktree (detached HEAD 0c8685a)
Capturing Home @ desktop...
Capturing Home @ mobile...
Capturing Home with the evidence panel open @ desktop...
Visual review written to /private/tmp/vpr-e2e/out
```

Exit code `0`. Files produced in `out/`:

```text
changes-stat.txt  changes.patch  manifest.json  report.md  summary.json
home-desktop-{before,after,side-by-side,diff}.png
home-mobile-{before,after,side-by-side,diff}.png
home-evidence-open-desktop-{before,after,side-by-side,diff}.png
```

`details` was **not** captured. Only `examples/demo/index.html` changed, and the impact rules map
that file to `home` and `home-evidence-open` only.

### Programmatic inspection of `summary.json`

```text
counts {"capture-failed":0,"review-required":3,"changed-within-threshold":0,"unchanged":0} reviewRequired true
selection impact-rules ["home","home-evidence-open"]
skipped [{"id":"details","name":"Details","reason":"not selected by impact rules"}]
 - home mobile review-required 14.44% runtime:true sem:["aria.main","text.h1"] ["1 new console error on head","semantic change in aria.main, text.h1"]
 - home desktop review-required 12.82% runtime:true sem:["aria.main","text.h1"] ["1 new console error on head","semantic change in aria.main, text.h1"]
 - home-evidence-open desktop review-required 11.64% runtime:true sem:[] ["1 new console error on head"]
```

### Programmatic inspection of `manifest.json`

```text
schema 2  baseSha length 40  publicConfigDigest length 64  artifactHashes 16
commands {"install":null,"startTemplate":"node examples/demo/server.mjs {port}","basePreview":"node examples/demo/server.mjs 4317","headPreview":"node examples/demo/server.mjs 4318"}
runtime head home-desktop {"status":200,"pageErrors":[],"consoleErrors":["demo: head-only console error"],"failedRequests":[],"assertionFailures":[],"captureError":null}
```

Base and head SHAs are full 40-character values. The head-only `console.error` was recorded on
the head side only and produced a `review-required` verdict at a pixel ratio that alone would
also have triggered it; the `home-evidence-open` cell shows the runtime reason standing on its
own in `reasons`.

### Image evidence, inspected visually

Three generated images were opened and read:

- `home-desktop-side-by-side.png` — BEFORE and AFTER panes with readable labels
  `BEFORE · HEAD~1 · 666e6cc · desktop` and `AFTER · HEAD · 0c8685a · desktop`. The blue-to-orange
  accent change and the `Make the diff easier to see.` → `Make the diff obvious.` heading change
  are both visible. The non-deterministic `rendered at <timestamp>` line is absent from both
  panes, confirming `capture.hideSelectors` worked.
- `home-evidence-open-desktop-after.png` — the evidence panel is expanded, confirming the
  `click` → `waitForSelector` → `assertVisible` scenario replay reached the intended state.
- `home-desktop-diff.png` — a pixelmatch diff showing the changed heading, borders and buttons.

## 6. Scenario failure handling

A deliberately broken scenario was added (`waitForSelector` on `#does-not-exist`,
`timeoutMs: 1500`) and the run repeated with `--all`.

Observed exit code: `1`. Observed `summary.json`:

```text
counts {"capture-failed":1,"review-required":3,"changed-within-threshold":0,"unchanged":1}
 - broken desktop capture-failed ["base capture failed: step 1 (waitForSelector #does-not-exist) failed: locator.waitFor: Timeout 1500ms exceeded. ...", "head capture failed: ..."] {}
 - home mobile review-required ...
 - home desktop review-required ...
 - home-evidence-open desktop review-required ...
 - details desktop unchanged []
```

`report.md` contained `| NOT CAPTURED | 1 |` in the verdict tally and 4 occurrences of the
missing selector name. The other four cells captured normally, and `details` was correctly
`unchanged`. **A broken scenario produces a partial report and exit code 1; it does not stop the
run.**

## 7. Determinism

The same comparison was run twice into `r1/` and `r2/`.

- Every PNG was byte-identical (`cmp` over all 20 images produced no differences).
- `report.md` was identical after removing the `**Generated:**` line.
- `manifest.json` differed in exactly two fields beyond `generatedAt` and `durationMs`:

```text
.provenance.artifactHashes.report.md   | 8dd7371f... -> a4be4027...
.provenance.artifactHashes.summary.json | fde6d577... -> fd49b828...
```

Both are the SHA-256 of files that embed `generatedAt`/`durationMs`. No other field varied. This
matches the documented determinism statement in `docs/configuration.md`.

## 8. Secret redaction, end-to-end

The demo config was given `env: {"DEMO_API_TOKEN": "s3cr3t-value-should-not-appear"}` and a
`startCommand` with the same value as an inline assignment, then run with `--all`.

Observed exit code `0`.

```bash
grep -rl "s3cr3t-value-should-not-appear" out3/
```

Observed: no matches across `report.md`, `summary.json`, `manifest.json`, `changes.patch` and all
PNGs. `manifest.json` recorded:

```text
envKeys ["DEMO_API_TOKEN"]
commands {"install":null,"startTemplate":"DEMO_API_TOKEN=<redacted> node examples/demo/server.mjs {port}","basePreview":"DEMO_API_TOKEN=<redacted> node examples/demo/server.mjs 4317","headPreview":"DEMO_API_TOKEN=<redacted> node examples/demo/server.mjs 4318"}
```

This run also surfaced and fixed a real bug: `startCommandForPlatform` prefixed every POSIX
command with `exec`, and `exec FOO=bar cmd` makes the shell treat `FOO=bar` as the program name.
Observed before the fix:

```text
Error: preview process exited early with code 127
Base logs:
/bin/sh: line 0: exec: DEMO_API_TOKEN=s3cr3t-value-should-not-appear: not found
```

The fix emits `exec env FOO=bar cmd` when the command starts with inline assignments, and is
covered by `test/visual.test.mjs`.

## 9. Cleanup guarantees

After all runs, in the scratch repository:

```text
$ git worktree list
/private/tmp/vpr-e2e  0c8685a [main]

$ lsof -nP -iTCP:4317 -iTCP:4318 -sTCP:LISTEN
none
```

No leftover review worktree, no orphaned preview process on either port. The scratch repository
at `/tmp/vpr-e2e` was removed after verification.

## 10. `npm run demo` in this repository

```bash
npm run demo
```

Observed exit code `1`:

```text
Capturing Home @ desktop...
Capturing Home @ mobile...
Capturing Home with the evidence panel open @ desktop...
Capturing Details @ desktop...
Visual review written to .../visual-review-output
At least one scenario could not be captured. The report is partial.
```

```text
counts {"capture-failed":1,"review-required":0,"changed-within-threshold":0,"unchanged":3}
 - home-evidence-open desktop capture-failed ["base capture failed: step 1 (click #open-evidence) failed: locator.click: Timeout 10000ms exceeded...", ...]
 - details desktop unchanged []
 - home desktop unchanged []
 - home mobile unchanged []
```

This is correct, not a defect: the demo app's `#open-evidence` button lives in the **uncommitted**
working tree, so neither `HEAD~1` nor `HEAD` contains it. The tool reports the missing selector
honestly and still produces evidence for the three scenarios it could capture. Once these changes
are committed, `npm run demo` compares two commits that both contain the button. This is stated
in `README.md`.

## 11. Example configuration validity

`test/examples.test.mjs` loads and strictly validates `examples/configs/minimal.json`,
`examples/configs/full.json` and `examples/demo/visual-review.json` on every `npm test` run, so
documentation examples cannot drift from the validator. Both assertions passed.

## Limitations of this verification

- **Linux untested.** Only macOS arm64 was exercised end-to-end.
- **Windows unsupported and untested.** Not claimed anywhere in the documentation.
- **Single browser.** Only Playwright-managed Chromium 153 was used. Firefox and WebKit were not
  exercised. `VISUAL_REVIEW_BROWSER_PATH` was not exercised in this session.
- **Small demo application.** The demo is a two-page static server. Framework build pipelines,
  `installCommand`, long startup times and `fullPage` captures on tall pages were not exercised
  end-to-end; `installCommand` was `null` in every observed run.
- **ARIA snapshot coverage.** `aria` semantic evidence was exercised on Chromium 153 with
  Playwright 1.63 and produced a real diff (`aria.main`). Its `<unavailable: ...>` degradation
  path is unit-tested but was not triggered against a real browser.
- **Determinism scope.** Verified on one machine across two consecutive runs. Cross-machine and
  cross-OS byte-identity of PNGs is not claimed and was not tested.
- **No network egress test.** The origin pin is enforced in code and unit-tested
  (`resolveLocalRoute`, `normalizeConfig`, `replaySteps`), and a real-browser test
  (`test/capture-browser.test.mjs`) blocks external redirects, links, forms and JavaScript
  navigation against two local HTTP servers. Packet-level confirmation of zero outbound traffic
  to arbitrary public hosts was not performed.
- The GitHub Actions example in `examples/github-actions/visual-pr-review.yml` was **not** run.
  It is a manual, opt-in `workflow_dispatch` example that only uploads evidence when the
  `upload-evidence` input is explicitly enabled, and it posts nothing.
