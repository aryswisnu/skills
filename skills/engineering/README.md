# Engineering

Skills for daily code work.

## User-invoked

Reachable only when you type them (Claude Code: `disable-model-invocation: true`; Codex: `policy.allow_implicit_invocation: false` in `agents/openai.yaml`).

- **[visualize-pr](./visualize-pr/SKILL.md)**: Turn a pull request on GitHub, Bitbucket Cloud, or GitLab, or any two Git revisions, into reviewer-ready evidence in the PR itself: your notes first, then a change map and sequence diagram, and for web changes before/after screenshots. Draft, review, approve.

## Model-invoked

Picked up by the agent when a task fits.

- **[ticket-loop](./ticket-loop/SKILL.md)**: Take one ticket from plan to done: a plan gate, a live checklist page, a Stop hook that holds the session until the ticket is done, and before/after artifacts. Team-specific steps live in private playbooks outside the repo.
