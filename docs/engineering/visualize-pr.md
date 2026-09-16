## What it does

`visualize-pr` checks out the exact base and head commits of a change into two temporary worktrees, boots both, and writes one evidence directory a reviewer can act on. Web changes get before/after screenshots per scenario and viewport, a pixel diff, and the console, request, and assertion errors each revision produced. Backend changes get a diff summary and an editorial change map. It never approves anything: every verdict (`unchanged`, `changed-within-threshold`, `review-required`, `capture-failed`) is a label on the evidence, and the human supplies judgment.

Nothing leaves your machine unless you say so. With a GitHub PR URL it writes a comment draft locally; only `--post-comment` uploads images and publishes it.

## When to reach for it

You invoke this by typing `/visualize-pr`, and the agent won't reach for it on its own. It runs the install and start commands of both revisions, which is arbitrary code execution, so the decision to run it stays with you.

| Your situation | Reach for |
| --- | --- |
| A web PR needs reproducible before/after evidence | `visualize-pr` |
| A backend PR needs a concise change map instead of a wall of files | `visualize-pr --backend` |
| A reviewer should get the evidence without rebuilding both revisions | `visualize-pr --pr <url> --post-comment` |
| You want bugs hunted in the diff itself | Your harness's built-in code review, not this |
| You need a stored baseline and an approval workflow | A hosted visual-regression service, not this |

## Prerequisites

Git, Node.js 20+, and both revisions available locally (or a GitHub PR URL resolvable from your clone). Web mode needs a `visual-review.json` in the application repo describing how to start each revision on `{port}` and which scenarios to replay, plus Playwright Chromium or a compatible browser via `VISUAL_REVIEW_BROWSER_PATH`. Backend mode needs neither config nor browser. Posting a comment needs `GITHUB_TOKEN` or `GH_TOKEN` with write access.

## Evidence, not approval

The leading idea is **two live revisions**. There is no committed baseline to drift, no hosted account, and no silent publication. Both sides are captured in the same run with the same scenario steps, so a difference in the images is a difference in the code. Each output carries the full commit SHAs, a digest of the public config, and SHA-256 hashes of every artifact, so a reviewer can tell the evidence matches the commits under review.

## Common questions

**Why did it refuse to run? "output directory exists".**
Every attempt gets a fresh output path. The CLI will not overwrite or merge into an existing directory, because a mixed directory is evidence nobody can trust.

**Exit code 1 vs 2?**
`1` means at least one scenario could not be captured and the report is partial. `2` means usage, configuration, or infrastructure failure; look in `failure.json` for the phase. `0` means comparable evidence exists for every selected cell, which is still not an approval.

**Does it edit the PR description?**
No. It posts one comment, and only with `--post-comment`.

**Can it review GitLab or Bitbucket?**
Not yet. Only GitHub URLs resolve. Local `--base`/`--head` works against any repository.

## It's working if

- The report names every selected scenario and viewport, including the ones it could not capture.
- Screenshots show the intended loaded state, not a loading shell, consent overlay, or error page.
- Temporary worktrees and preview processes are gone when the run ends (`git worktree list` is clean).
- The PR comment, if posted, shows the same abbreviated SHAs the run was invoked with.

## Where it fits

A reach-for-it-anytime standalone. Run it after the code is written and before you ask for review, so the reviewer opens the PR to evidence instead of a diff. Full CLI and configuration reference: [skills/engineering/visualize-pr/README.md](https://github.com/aryswisnu/skills/blob/main/skills/engineering/visualize-pr/README.md).
