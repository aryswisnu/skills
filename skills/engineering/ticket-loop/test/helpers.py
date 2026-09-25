import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.dirname(HERE), "scripts")

STEPS = [
    {"id": "0", "title": "Plan approved", "check": "explicit approval", "phase": "Plan", "stage": "plan"},
    {"id": "1", "title": "Branch <KEY>", "check": "git branch", "phase": "Build", "stage": "worktree"},
    {"id": "2", "title": "PR raised", "check": "PR URL", "phase": "Review", "stage": "pr"},
]


def read(p):
    with open(p) as f:
        return f.read()


def write(p, text):
    with open(p, "w") as f:
        f.write(text)


class Sandbox:
    """A temp config, artifacts dir, and state dir; CLI calls run against them."""

    def __init__(self, url="https://example.test/{key}", **extra):
        self.dir = tempfile.mkdtemp()
        self.config = os.path.join(self.dir, "config.json")
        cfg = {"keyPattern": "T-\\d+", "issueUrl": "https://issues.example.test/{key}", "issueLabel": "Issue",
               "artifacts": {"dir": os.path.join(self.dir, "pages", "{key}"), "url": url},
               "statusCommand": "", "doneStatuses": ["Done"], "doneGateCommand": "", "steps": STEPS}
        cfg.update(extra)
        self.write_config(cfg)
        self.env = dict(os.environ, TICKET_LOOP_CONFIG=self.config, TICKET_LOOP_STATE=os.path.join(self.dir, "state"))

    def write_config(self, cfg):
        with open(self.config, "w") as f:
            json.dump(cfg, f)

    def run(self, script, *args, stdin="", env=None):
        return subprocess.run([sys.executable, os.path.join(SCRIPTS, script), *args], input=stdin,
                              capture_output=True, text=True, env=env or self.env)

    def page(self, key):
        return os.path.join(self.dir, "pages", key, "tasks.html")
