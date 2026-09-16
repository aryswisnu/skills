## What it does

`visualize-pr` checks out the exact base and head commits of a change into two temporary worktrees, boots both, and writes one evidence directory a reviewer can act on. Web changes get before/after screenshots per scenario and viewport, a pixel diff, and the console, request, and assertion errors each revision produced. Backend changes get a change map of the changed files and their in-repo imports, plus the sequence diagram the agent writes. Either way the PR text leads with the agent's notes: a few bullets and a short pseudocode block. It never approves anything: every verdict (`unchanged`, `changed-within-threshold`, `review-required`, `capture-failed`) is a label on the evidence, and the human supplies judgment.

Nothing leaves your machine unless you say so. With a pull request URL on GitHub, Bitbucket Cloud, or GitLab it writes a draft locally; only `--post-comment` (a comment) or `--update-description` (a marked section in the PR body, replaced in place on re-run) publishes it. The draft leads with the agent's own notes, a few bullets and a short pseudocode block passed in with `--notes`, then one line of numbers, then the diagrams: the change map the CLI derives from the diff and the `sequenceDiagram` the agent writes and passes with `--diagram`. Diagrams are Mermaid where the forge renders it and text where it does not.

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

Git, Node.js 20+, and both revisions available locally (or a GitHub, Bitbucket Cloud, or GitLab pull request URL resolvable from your clone). Web mode needs a `visual-review.json` in the application repo describing how to start each revision on `{port}` and which scenarios to replay. Run `--init` once to generate a starter that detects the framework (Next, Vite, Django, Rails, and others) and seeds a home scenario; then adjust it. It also needs Playwright Chromium or a compatible browser via `VISUAL_REVIEW_BROWSER_PATH`. Backend mode needs neither config nor browser. Publishing needs a token with write access: `GITHUB_TOKEN` or `GH_TOKEN`, `BITBUCKET_TOKEN` (or `BITBUCKET_USERNAME` with `BITBUCKET_APP_PASSWORD`), or `GITLAB_TOKEN`.

## What the reviewer reads

The block is ordered the way a reviewer needs it, and for a small change the generated part is one line plus the diagrams. A real one, trimmed, from a Bitbucket PR that changed how an endpoint parses its filters:

~~~markdown
- `property_type`, `listing_type`, `status` accept an array or a comma list.
- A plain object or a non-string item is a 400, so `?uid[$ne]=0` never reaches `$match`.
- Each value expands to every stored spelling of the same concept; exact matching had
  undercounted (206 of 363 in one district) because `room` is not a case variant of `room rental`.
- A value in no group passes through and is listed in `meta.unrecognized`.

```
for v in values:
    group = VALUE_GROUPS[filter].find(g => g.includes(v))
    expanded += group ? group : [v]
match[filter] = { $in: expanded }
```

1 file changed (+110 -20): `src/controllers/agentStats.controller.js`

```text
Change map  6934b9a -> 434fab5  (1 changed file)
  [M] agentStats.controller.js  -> property.model.js
```
~~~

Everything above the numbers line is the agent's, from `--notes`. The pseudocode is a fenced block; an indented one after a bullet list renders as plain text on every forge, and the CLI warns when it sees that. The module table appears only with two or more modules and the most-changed ranking only with more than three files, so a one-file change is not padded with tables that repeat the one line. The markers around the block are CommonMark link reference definitions, invisible on every forge.

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
Only with `--update-description`. It inserts one block delimited by invisible CommonMark markers (`[//]: # (visualize-pr:start)` and the matching end) and replaces that block on every re-run, so the rest of the description is untouched. Older blocks that used HTML-comment markers, which Bitbucket showed as text, are recognized and rewritten. `--post-comment` posts a comment instead. Both can be combined.

**The generated text is long. Where does my own summary go?**
Write a few bullets and a short pseudocode block, pass the file with `--notes`, and it lands directly under the title, above everything generated. The pseudocode is required whenever the change alters behavior; a no-logic change carries the bullet "No pseudocode: no logic changed." instead. The CLI warns, with line numbers, when the block is missing or a prose paragraph slips in.

**The PR has bullets but no pseudocode.**
Most often the pseudocode is there but indented instead of fenced. After a bullet list, CommonMark treats an indented block as a paragraph of the last bullet, so it renders as one wrapped sentence on Bitbucket, GitHub, and GitLab alike. Re-run with a fenced block and `--publish --update-description` replaces the block in place. Since v0.14.4 the CLI warns on an indented block. The other causes: a skill older than v0.14.0, which had no `--notes` at all (its footer reads "The change map shows changed files…"), or the agent leaving the block out, which SKILL.md no longer allows and the CLI warns about. The generated part is one line for a small change: the module table and the most-changed ranking only appear when there is more than one module or more than three files.

**Where is the sequence diagram?**
The CLI draws the file-level change map on its own. A sequence diagram needs to understand behavior, so the agent writes it from `changes.patch` and passes it back with `--diagram`. If you ran the CLI by hand and see no sequence section, that step was skipped.

**The diagram shows up as raw Mermaid source.**
The forge does not render Mermaid. Bitbucket Cloud is the common case and the CLI already sends ASCII there. Anywhere else, pass `--ascii` and both the change map and the sequence diagram are drawn as text; `change-map.txt` is written next to `change-map.mmd` on every run regardless.

**It says "Missing dependency playwright".**
Run the CLI once with `--setup`. It installs the npm dependencies and Chromium into the skill's own folder, because plugin installers copy the files but do not run npm. `--setup --backend` skips the browser download.

**Can it review GitLab or Bitbucket?**
Yes, since v0.11.0. Pass a Bitbucket Cloud pull request or GitLab merge request URL to `--pr`, self-hosted included; the provider is read from the path shape. Set `BITBUCKET_TOKEN` (or `BITBUCKET_USERNAME` plus `BITBUCKET_APP_PASSWORD`) or `GITLAB_TOKEN` to publish. Backend reviews work everywhere; on Bitbucket Cloud, which does not render Mermaid, the change map and sequence diagram are sent as ASCII text automatically. Web reviews on those two post the verdicts and diagrams but keep the screenshots local, since only GitHub has an upload path today. Bitbucket Server (Data Center) and Azure DevOps are not implemented.

## It's working if

- The report names every selected scenario and viewport, including the ones it could not capture.
- Screenshots show the intended loaded state, not a loading shell, consent overlay, or error page.
- Temporary worktrees and preview processes are gone when the run ends (`git worktree list` is clean).
- The PR comment, if posted, shows the same abbreviated SHAs the run was invoked with.
- The PR text opens with your bullets and pseudocode, and for a small change the generated part beneath is one line plus the diagrams, not a stack of tables.

## Where it fits

A reach-for-it-anytime standalone. Run it after the code is written and before you ask for review, so the reviewer opens the PR to evidence instead of a diff. Full CLI and configuration reference: [skills/engineering/visualize-pr/README.md](https://github.com/aryswisnu/skills/blob/main/skills/engineering/visualize-pr/README.md).
