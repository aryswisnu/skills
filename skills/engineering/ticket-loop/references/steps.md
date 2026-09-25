# Default detail per stage

Use this when a step has no playbook. A playbook replaces this section for its step.

## plan
- Name the root cause with a file and line, or say that it is unknown.
- List every file you will change and the test that guards each change.
- List the risks and the rollout. Present each open question with a recommended answer.
- Revise and re-send the plan on each change request. The approval covers the plan that was sent.

## start
- Assign the ticket to the user if it has no assignee.
- Move it to in progress. Then run `loop.py start <KEY>` if the plan stage did not.

## worktree
- `git worktree list` first. Remove leftovers of finished tickets before you add a new one.
- `git fetch origin && git worktree add ../<KEY> -b <KEY> origin/<default-branch>`.
- For a re-fix, reuse the same branch and the same PR: `git worktree add ../<KEY> --track origin/<KEY>`, then merge the default branch.

## run
- Start the app from the worktree. Open the changed screen or call the changed endpoint.
- Record the URL with `checklist.py link <KEY> sandbox <url>` when there is one.

## fix
- Give each issue a severity, file:line, failure mode, and guard.
- Give each agent a time budget.
- After the last fix round, simplify the diff. The auditor checks it against the repo's rules: touch only lines the ticket needs, follow the comment rules.
- The auditor reads every added comment line and runs the tests and the build again.
- Keep the issue log out of git.

## commit
- Commit as `<KEY> - <summary>`.
- Use a deterministic test for a mechanical failure. Use a browser check for a DOM-only one.
- Revert the fix, see the guard go red, restore it.

## pr
- Title with the key. Target the default branch unless the user says otherwise.
- Check that a reviewer is set. Some forge APIs add no default reviewer.

## review
- A push does not always clear a "changes requested" vote. Resolve what you addressed.
- Audit before a bulk resolve. Resolving a comment claims a fix.
- If the default branch moves and conflicts, merge it into the ticket branch, test again, push.

## verify
- Map each acceptance criterion to evidence: a test, a screenshot, a query result.
- After a failure: reproduce it against real data, reopen the steps from `fix` on, and block `fix` with the cause.

## artifacts
- Capture the real running change, before and after, for every changed state. Say what each shot proves, and say when one is staged.
- The explainer has the shots, a flowchart, and a sequence diagram (browser, server, database), with one or two sentences per caption.

## teardown
- Stop the preview, then remove the worktree.
- If teardown stops part way, run it again. A proxy that points at a stopped app fails for everyone.
