## What it does

`visualize-pr` checks out the exact base and head commits of a change into two temporary worktrees, boots both, and writes one evidence directory a reviewer can act on. Web changes get before/after screenshots per scenario and viewport, a pixel diff, and the console, request, and assertion errors each revision produced. Backend changes get a diff summary and an editorial change map. It never approves anything: every verdict (`unchanged`, `changed-within-threshold`, `review-required`, `capture-failed`) is a label on the evidence, and the human supplies judgment.

Nothing leaves your machine unless you say so. With a GitHub PR URL it writes a comment draft locally; only `--post-comment` (a comment) or `--update-description` (a marked section in the PR body, replaced in place on re-run) publishes it. Backend change maps are Mermaid, which GitHub renders natively, so they need no image upload. With `--diagram` the agent's own `sequenceDiagram` of the changed behavior goes in too.

## When to reach for it

You invoke this by typing `/visualize-pr`, and the agent won't reach for it on its own. It runs the install and start commands of both revisions, which is arbitrary code execution, so the decision to run it stays with you.

| Your situation | Reach for |
| --- | --- |
| A web PR needs reproducible before/after evidence | `visualize-pr` |
| A backend PR needs a concise change map instead of a wall of files | `visualize-pr --backend` |
| Colleagues should see the diagram at the top of the PR | `visualize-pr --pr <url> --update-description` |
| A reviewer should get the evidence without rebuilding both revisions | `visualize-pr --pr <url> --post-comment` |
| You want bugs hunted in the diff itself | Your harness's built-in code review, not this |
| You need a stored baseline and an approval workflow | A hosted visual-regression service, not this |

## Prerequisites

Git, Node.js 20+, and both revisions available locally (or a GitHub PR URL resolvable from your clone). Web mode needs a `visual-review.json` in the application repo describing how to start each revision on `{port}` and which scenarios to replay. Run `--init` once to generate a starter that detects the framework (Next, Vite, Django, Rails, and others) and seeds a home scenario; then adjust it. It also needs Playwright Chromium or a compatible browser via `VISUAL_REVIEW_BROWSER_PATH`. Backend mode needs neither config nor browser. Posting a comment needs `GITHUB_TOKEN` or `GH_TOKEN` with write access.

## Evidence, not approval

The leading idea is **two live revisions**. There is no committed baseline to drift, no hosted account, and no silent publication. Both sides are captured in the same run with the same scenario steps, so a difference in the images is a difference in the code. Each output carries the full commit SHAs, a digest of the public config, and SHA-256 hashes of every artifact, so a reviewer can tell the evidence matches the commits under review.

## Common questions

**Why did it refuse to run? "output directory exists".**
Every attempt gets a fresh output path. The CLI will not overwrite or merge into an existing directory, because a mixed directory is evidence nobody can trust.

**Exit code 1 vs 2?**
`1` means at least one scenario could not be captured and the report is partial. `2` means usage, configuration, or infrastructure failure; look in `failure.json` for the phase. `0` means comparable evidence exists for every selected cell, which is still not an approval.

**How do I approve the draft?**
The review run posts nothing; it writes `pr-comment.md` and stops. The agent shows you the draft and asks. In Claude Code the choices (comment, description, both, not now) render as buttons. In Codex and other harnesses the agent proposes the one publish command and the harness's own approval prompt is the button. Either way, approval runs `--publish <dir>` with the flag you picked, which posts the file in under a second. A GitHub web review uploads and embeds its screenshots at that moment; the text you read is unchanged. You can also run that command yourself later.

**Does it edit the PR description?**
Only with `--update-description`. It inserts one block between `<!-- visualize-pr:start -->` and `<!-- visualize-pr:end -->` markers and replaces that block on every re-run, so the rest of the description is untouched. `--post-comment` posts a comment instead. Both can be combined.

**Where is the sequence diagram?**
The CLI draws the file-level change map on its own. A sequence diagram needs to understand behavior, so the agent writes it from `changes.patch` and passes it back with `--diagram`. If you ran the CLI by hand and see no sequence section, that step was skipped.

**It says "Missing dependency playwright".**
Run the CLI once with `--setup`. It installs the npm dependencies and Chromium into the skill's own folder, because plugin installers copy the files but do not run npm. `--setup --backend` skips the browser download.

**Can it review GitLab or Bitbucket?**
Yes, since v0.11.0. Pass a Bitbucket Cloud pull request or GitLab merge request URL to `--pr`, self-hosted included; the provider is read from the path shape. Set `BITBUCKET_TOKEN` (or `BITBUCKET_USERNAME` plus `BITBUCKET_APP_PASSWORD`) or `GITLAB_TOKEN` to publish. Backend reviews work identically everywhere. Web reviews on those two post the verdicts and diagrams but keep the screenshots local, since only GitHub has an upload path today. Bitbucket Server (Data Center) and Azure DevOps are not implemented.

## It's working if

- The report names every selected scenario and viewport, including the ones it could not capture.
- Screenshots show the intended loaded state, not a loading shell, consent overlay, or error page.
- Temporary worktrees and preview processes are gone when the run ends (`git worktree list` is clean).
- The PR comment, if posted, shows the same abbreviated SHAs the run was invoked with.

## Where it fits

A reach-for-it-anytime standalone. Run it after the code is written and before you ask for review, so the reviewer opens the PR to evidence instead of a diff. Full CLI and configuration reference: [skills/engineering/visualize-pr/README.md](https://github.com/aryswisnu/skills/blob/main/skills/engineering/visualize-pr/README.md).
