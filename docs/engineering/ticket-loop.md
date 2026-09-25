# ticket-loop

## What it does

`ticket-loop` takes one ticket from plan to done, and it does not stop at "PR raised". The agent writes a plan and waits for your approval. That approval is the only gate. After it, the agent works through the steps in your config: worktree, run, fix and audit, commit with a guard test, PR, review, verify, artifacts, teardown.

Three pieces keep the loop honest:

- **A checklist page.** `checklist.py` owns `<artifacts.dir>/tasks.html`. The state is a JSON block inside the page, and every command re-renders the page from it, so the agent never edits HTML by hand. The page updates every 20 seconds without a reload, animates a step when it changes, makes URLs and ticket keys clickable, and shows a question card when the agent waits for your decision.
- **A Stop hook.** `loop.py guard` holds the session that armed the loop until the ticket reaches a done status. It holds only that session. It lets the session stop when the tracker or the config cannot be read, and after three holds with no checklist progress, so a stuck loop ends and you can review it.
- **Artifacts.** Plan and explainer pages share one style (`checklist.py assets`), with a theme toggle, chips for the ticket and the task list, and clickable keys.

Nothing about your team is in this repo. The tracker URL, the statuses, the steps, and any playbook live in your own config file.

## When to reach for it

| Your situation | Reach for |
| --- | --- |
| A ticket should go from plan to done without you checking in at each step | `ticket-loop` |
| A pull request needs before/after evidence for a reviewer | `visualize-pr` |
| A one-line fix you will review in the diff anyway | Neither |
| You want the agent to merge | Neither: the loop never merges |

## Common questions

**Where does my team's data go?**
Into `~/.config/ticket-loop/config.json` (or `$TICKET_LOOP_CONFIG`) and any playbook files it names. Keep them out of every repo. `config.example.json` shows every key with fake values.

**How do I add my team's own steps?**
List them in `steps`. Give each a `stage` (`plan`, `start`, `worktree`, `run`, `fix`, `commit`, `pr`, `review`, `verify`, `artifacts`, `teardown`) and, when the default detail is not enough, a `playbook` path. The agent reads the playbook before that step, and it wins on conflict. A top-level `rules` file holds rules for the whole loop.

**How does the guard know the ticket is done?**
`statusCommand` is a shell command that prints the ticket status. `{key}` in it is replaced with the shell-quoted key, and the output must equal one entry of `doneStatuses`. Example for GitHub issues, where the key must match `keyPattern` but `gh` wants the bare number: `"keyPattern": "GH-\\d+"`, `"statusCommand": "k={key}; gh issue view \"${k#GH-}\" --json state -q .state"`, `"doneStatuses": ["CLOSED"]`. With no `statusCommand`, the loop ends when every checklist item is done. `doneGateCommand` runs once the status is done: any output blocks the stop one time and is shown to the agent (for example, "write the lesson first"). No output lets the loop end.

**What if the tracker is down?**
The guard cannot read the status, so it lets the session stop and keeps the loop armed. The next stop checks again.

**Does it need the plugin?**
The plugin installs the two hooks. They need `python3` on the PATH. Without it, they exit quietly and do nothing. With skills.sh or a symlink, add them yourself: `loop.py guard` as a `Stop` hook and `loop.py prompt` as a `UserPromptSubmit` hook. Use one route only, or each hook runs twice.

**Can I publish the pages?**
Set `artifacts.url` and serve the folder. The pages can hold internal details, so put access control in front of the server. With no URL, the pages stay local files.

## It's working if

- `loop.py status` prints the ticket key and the owning session after the start stage (after you approve the plan).
- Every answer during the loop ends with the checklist.
- A stop with open items makes the agent continue with the first open item.
- The checklist page changes within 20 seconds of a `tick`, without a reload.
- Tests pass: `python3 -m unittest discover -s test` from the skill folder.
