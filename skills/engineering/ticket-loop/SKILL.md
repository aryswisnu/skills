---
name: ticket-loop
description: Autonomous work loop for one ticket, from plan to done, with a live checklist page, a Stop-hook guard, and evidence artifacts. Use when the user says "work on <TICKET>", "run the ticket loop", or resumes a ticket after a failed verification.
---

# Ticket Loop

Run the loop end to end. The end state is the ticket's done status plus evidence sent to the user.
It is not "PR raised", and it is not a merge. Ask only when a step is blocked or needs a product decision.
The plan approval is the only approval gate. Do not add a second one.

## Setup

The scripts are in `scripts/` next to this file. The config is `$TICKET_LOOP_CONFIG`
(default `~/.config/ticket-loop/config.json`). On first use, copy `config.example.json` there and edit it.
The config holds the key pattern, the issue URL, the artifacts folder, the status command, the done statuses, and the steps.
When the config has a `rules` file, read it before the first step. It holds the team's rules for the whole loop and wins on conflict.
The plugin installs the hooks. Without the plugin, add `python3 <this folder>/scripts/loop.py guard` as a `Stop` hook
and `python3 <this folder>/scripts/loop.py prompt` as a `UserPromptSubmit` hook. Do not install both.

## The task list lives in a file

Each ticket has a page, `<artifacts.dir>/tasks.html`. `checklist.py` owns it. Do not edit the HTML by hand.
```bash
checklist.py init   <KEY>                  # loop.py start runs this
checklist.py tick   <KEY> <STEP> [note]    # only after the step's check passes
checklist.py block  <KEY> <STEP> <reason>
checklist.py reopen <KEY> <STEP>...        # after a failed verification
checklist.py link   <KEY> pr|sandbox|explainer <url>
checklist.py ask    <KEY> "<question>"     # when you stop for a product decision
checklist.py ask    <KEY> --clear          # as soon as the user answers
checklist.py list   <KEY>                  # the markdown list for your answer
```
- End every answer during the loop with the output of `checklist.py list <KEY>`. Update the page first.
  The prompt hook puts the list in each turn too.
- Put full URLs in notes. The page makes URLs and ticket keys clickable.
- `init` keeps an existing page, so a re-fix continues the same list.
- After a failed verification, reopen the steps from the `fix` stage on, then `block` the `fix` step with the cause until you reproduce it.

## Steps

The config lists the steps in order. Each step has a `stage`. Do the stage below.
When the step has a `playbook`, read that file before the step: it holds the team's own rules and wins on conflict.
`references/steps.md` holds the default detail for each stage.

- `plan`: Read the ticket and the code it names. Write the root cause, files, tests, risks, and rollout.
  Interview the user about the plan before you send it: one question at a time, each with your recommended answer.
  Follow each answer into the questions it opens, until no decision is open, and fold the answers into the plan.
  Write it to `<artifacts.dir>/plan.html` (see Artifacts).
  Run `checklist.py init <KEY>` beside it, so the checklist shows from the first answer. Send the link and wait for approval.
  Do not touch the tracker, git, or files before approval. Do not arm the loop yet: the Stop hook would hold the approval wait.
- `start`: Claim the ticket and move it to in progress with the user's tracker tools. Then run `loop.py start <KEY>` to arm the Stop hook.
- `worktree`: Branch off the latest default branch, in a worktree named after the key. Never work in a live checkout.
- `run`: Run the change and see it work in the real app before you continue. A green health check proves a server answers, not that this code serves.
- `fix`: One agent logs issues, a second fixes them, a third audits the fixes and runs the build, a fourth repairs.
  Repeat until a round finds nothing new. The fixer and the auditor are separate agents. Every guard must fail when you revert its fix.
- `commit`: Commit with the regression guard in the same commit. Push the branch.
- `pr`: Raise the PR and check that a reviewer is set. Record it with `checklist.py link <KEY> pr <url>`.
- `review`: Loop the PR to approval. Each pass: read the state and the comments, then fix and push, or reply with a precise reason.
  Resolve a comment only when it is fixed or answered. Never merge: the merge belongs to the user.
- `verify`: Check each acceptance criterion against the running change, with evidence. Reproduce a failure against real data before you fix it.
- `artifacts`: Capture before and after screenshots of the real change, and write one explainer page for a reader who knows no code.
- `teardown`: After the done status and after the artifacts are sent, remove the preview and the worktree.
  Refuse on uncommitted or unpushed work, and tell the user. Never force.

## Artifacts

Plan and explainer pages sit in `<artifacts.dir>`. Run `checklist.py assets <folder that holds the ticket folders>` once.
In each page head, put `<link rel="stylesheet" href="../ticket-loop.css"><script src="../ticket-loop.js" defer></script>`.
Write plain `<main>`, `h1`, `h2` sections, `.card`, tables, and lists. Do not number the `h2`, and do not add base CSS or a theme button.
Add CSS only for a diagram, with `var(--fg)`, `var(--muted)`, `var(--line)`, `var(--surface)`, and `var(--run)`.
Save the explainer as `index.html`, and send the full `.../index.html` link.
Check each page in both themes and at phone width, with no console errors and no sideways scroll.
`artifacts.url` publishes the pages on a web server. The pages can hold internal details, so put access control in front of it.

## Rules for the whole loop

- Scripts do the mechanical steps. A smaller model may run a mechanical step when the step ends in a command whose exit code proves it.
  Keep review, plan corrections, and verdicts on the strongest model.
- Wait in the background. A watcher dies with the session, so tell the user when a wait needs the terminal open.
- Judge each review or QA finding on its merits. Answer correct behaviour with evidence, not with "fixed".
- Fix the original bug, including other branches of the same root cause.

## How a turn ends

A message with no tool call ends the turn, and the loop stops until the user writes again.
Do not end a turn in these ways while checklist items are open:
a summary that announces the next step instead of taking it;
an offer to continue ("shall I raise the PR?");
a status update after you arm a watcher, when the watcher's exit is the next event.
End the turn only for these: the plan waits for approval; teardown refuses on unpushed work;
a product decision is needed (`checklist.py ask`); the checklist is complete.
Put a progress note in the same message as the next tool call.
