#!/usr/bin/env python3
"""Ticket-loop sentinel and Claude Code hooks (ticket-loop skill).

  loop.py start <KEY>   arm the loop for this session and create the checklist
  loop.py done          disarm
  loop.py status        armed ticket, its status, and the owning session
  loop.py guard         Stop hook: hold the owning session while the ticket is not done
  loop.py prompt        UserPromptSubmit hook: put the checklist in every turn

A Stop hook enforces what a document cannot: the loop ends at the done status,
not at "PR raised" or "watcher armed". Every failure path lets the session stop.
"""
import hashlib, json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import checklist

STATE = os.path.expanduser(os.environ.get("TICKET_LOOP_STATE", "~/.claude/state"))
SENTINEL = os.path.join(STATE, "active-ticket")
HOLDS = os.path.join(STATE, "active-ticket.holds")
MAX_HOLDS = 3


def emit(obj):
    print(json.dumps(obj))


def armed():
    try:
        with open(SENTINEL) as f:
            parts = f.read().rstrip("\n").split("\t")
    except OSError:
        return None, ""
    return parts[0], parts[1] if len(parts) > 1 else ""


def arm(key, owner):
    os.makedirs(STATE, exist_ok=True)
    with open(SENTINEL, "w") as f:
        f.write(f"{key}\t{owner}\n")


def clear(*paths):
    for p in paths:
        try:
            os.remove(p)
        except OSError:
            pass


def run(cmd, key, cwd=None):
    """stdout of a config command, or "" when unset, failing, or slow (fail open)."""
    if not cmd:
        return ""
    try:
        r = subprocess.run(cmd.format(key=key), shell=True, capture_output=True, text=True,
                           timeout=60, cwd=cwd if cwd and os.path.isdir(cwd) else None)
    except subprocess.TimeoutExpired:
        return ""
    return r.stdout.strip() if r.returncode == 0 else ""


def hook_input():
    try:
        return json.load(sys.stdin)
    except ValueError:
        return {}


def config_or_none():
    try:
        return checklist.config()
    except SystemExit:
        return None


def guard():
    data = hook_input()
    key, owner = armed()
    if not key or data.get("stop_hook_active") is True:
        return
    me, cwd = data.get("session_id") or "", data.get("cwd") or ""
    if owner:
        if me and me != owner:
            return
    elif key in cwd:
        arm(key, me)  # sentinel with no owner: adopt the session working in the ticket's worktree
    else:
        emit({"systemMessage": f"{key} is tracked by another session (no owner recorded). "
                               f"Not blocking this one. Re-arm with: loop.py start {key}"})
        return
    cfg = config_or_none()
    if cfg is None:
        emit({"systemMessage": f"{key}: the ticket-loop config is missing or broken; not blocking. "
                               "Fix it, or run: loop.py done"})
        return

    status = ""
    if cfg.get("statusCommand"):
        status = run(cfg["statusCommand"], key)
        if not status:
            emit({"systemMessage": f"Could not read the {key} status; the loop stays armed. Run: loop.py status"})
            return
        if status in cfg.get("doneStatuses", []):
            owed = run(cfg.get("doneGateCommand", ""), key, cwd)
            if owed:
                emit({"decision": "block", "reason": owed})
                return
            clear(SENTINEL, HOLDS)
            emit({"systemMessage": f"{key} reached {status}. Ticket loop cleared."})
            return

    state = checklist.load(key)
    page = checklist.path(key)
    open_items = [i for i in state["items"] if i["state"] != "done"] if state else []
    if state and not open_items and not cfg.get("statusCommand"):
        clear(SENTINEL, HOLDS)
        emit({"systemMessage": f"{key}: every checklist item is done. Ticket loop cleared."})
        return

    try:
        with open(page, "rb") as f:
            digest = hashlib.sha1(f.read()).hexdigest()
    except OSError:
        digest = ""
    count, last = 0, ""
    try:
        with open(HOLDS) as f:
            c, last = f.read().split("\t")
        count = int(c)
    except (OSError, ValueError):
        pass
    count = count + 1 if last.strip() == digest else 1
    if count > MAX_HOLDS:
        clear(HOLDS)
        emit({"systemMessage": f"{key}: {MAX_HOLDS} holds with no checklist progress. "
                               "Letting the session stop for review. The loop stays armed."})
        return
    os.makedirs(STATE, exist_ok=True)
    with open(HOLDS, "w") as f:
        f.write(f"{count}\t{digest}")

    if state is None:
        todo = f"No checklist at {page}. Create it with: checklist.py init {key}"
    elif open_items:
        todo = f"Open items in {page}:\n" + "\n".join("- " + checklist.open_line(i) for i in open_items)
    else:
        todo = (f"Every item in {page} is ticked, but the status is '{status}'. "
                f"Find the step that is not really done, and reopen it with: checklist.py reopen {key} <STEP>")
    emit({"decision": "block", "reason": (
        f"The {key} ticket loop is unfinished." + (f" Status: '{status}'." if status else "") + f"\n{todo}\n"
        "Continue with the first open item now. If one is blocked, say what blocks it, "
        f"and record it with: checklist.py block {key} <STEP> <reason>.\n"
        "Follow the ticket-loop skill. Arming a watcher is not finishing a step. "
        "If the user wants to stop here, run: loop.py done")})


def prompt():
    data = hook_input()
    key, owner = armed()
    if not key:
        return
    me = data.get("session_id") or ""
    if owner and me and me != owner:
        return
    if config_or_none() is None:
        return
    state = checklist.load(key)
    if state is None:
        return
    emit({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": (
        "Ticket loop checklist (ticket-loop skill). End your answer with the current checklist, "
        "as printed by `checklist.py list`. Update it with `checklist.py tick/block` before you print it.\n\n"
        + checklist.list_text(key, state))}})


def main(argv):
    cmd = argv[0] if argv else ""
    if cmd == "start" and len(argv) == 2:
        key = argv[1]
        checklist.check_key(key)
        arm(key, os.environ.get("CLAUDE_CODE_SESSION_ID", ""))
        clear(HOLDS)
        print(f"tracking {key} (the Stop hook holds this session until the done status)")
        print(f"checklist: {checklist.init(key)}")
    elif cmd == "done":
        key, _ = armed()
        clear(SENTINEL, HOLDS)
        print("ticket loop cleared" if key else "no active ticket")
    elif cmd == "status":
        key, owner = armed()
        if not key:
            print("no active ticket")
            return
        cfg = config_or_none() or {}
        print(f"{key}: {run(cfg.get('statusCommand', ''), key) or '(no status)'}")
        print(f"owner session: {owner or '(none recorded)'}")
    elif cmd == "guard":
        guard()
    elif cmd == "prompt":
        prompt()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
