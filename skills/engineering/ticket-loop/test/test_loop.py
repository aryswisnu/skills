import json, os, subprocess, unittest
from helpers import HERE, Sandbox, read, write


class LoopTest(unittest.TestCase):
    def setUp(self):
        self.s = Sandbox()
        self.status = os.path.join(self.s.dir, "status")
        cfg = json.loads(read(self.s.config))
        cfg["statusCommand"] = "cat " + self.status
        self.s.write_config(cfg)
        self.set_status("In Progress")
        self.sentinel = os.path.join(self.s.dir, "state", "active-ticket")

    def set_status(self, text):
        write(self.status, text)

    def set_config(self, **changes):
        cfg = json.loads(read(self.s.config))
        cfg.update(changes)
        self.s.write_config(cfg)

    def start(self, key="T-1", session="S1"):
        return self.s.run("loop.py", "start", key, env=dict(self.s.env, CLAUDE_CODE_SESSION_ID=session))

    def hook(self, cmd, session="S1", cwd="/tmp", active=False):
        r = self.s.run("loop.py", cmd, stdin=json.dumps({"session_id": session, "cwd": cwd, "stop_hook_active": active}))
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout) if r.stdout.strip() else None

    def test_no_loop_no_output(self):
        self.assertIsNone(self.hook("guard"))
        self.assertIsNone(self.hook("prompt"))

    def test_start_rejects_bad_key(self):
        self.assertNotEqual(self.start("../T-1").returncode, 0)
        self.assertFalse(os.path.exists(self.sentinel))

    def test_owner_is_held_other_session_is_not(self):
        self.start()
        self.assertIsNone(self.hook("guard", session="S2"))
        out = self.hook("guard")
        self.assertEqual(out["decision"], "block")
        self.assertIn("Open items", out["reason"])
        self.assertIn("0. Plan approved -> check: explicit approval", out["reason"])

    def test_stop_hook_active_never_blocks_twice(self):
        self.start()
        self.assertIsNone(self.hook("guard", active=True))

    def test_three_holds_without_progress_then_let_go(self):
        self.start()
        for _ in range(3):
            self.assertEqual(self.hook("guard")["decision"], "block")
        out = self.hook("guard")
        self.assertIn("holds with no checklist progress", out["systemMessage"])
        self.assertTrue(os.path.exists(self.sentinel))

    def test_progress_resets_the_hold_count(self):
        self.start()
        for _ in range(3):
            self.hook("guard")
        self.s.run("checklist.py", "tick", "T-1", "0")
        self.assertEqual(self.hook("guard")["decision"], "block")

    def test_done_status_clears(self):
        self.start()
        self.set_status("Done")
        self.assertIn("Ticket loop cleared", self.hook("guard")["systemMessage"])
        self.assertFalse(os.path.exists(self.sentinel))

    def test_done_gate_blocks_with_its_text(self):
        self.set_config(doneGateCommand="echo write the lesson for {key}")
        self.start()
        self.set_status("Done")
        self.assertEqual(self.hook("guard"), {"decision": "block", "reason": "write the lesson for T-1"})
        self.assertTrue(os.path.exists(self.sentinel))

    def test_done_gate_output_blocks_even_on_nonzero_exit(self):
        self.set_config(doneGateCommand="echo lesson owed for {key}; exit 1")
        self.start()
        self.set_status("Done")
        self.assertEqual(self.hook("guard"), {"decision": "block", "reason": "lesson owed for T-1"})
        self.assertTrue(os.path.exists(self.sentinel))

    def test_block_reason_names_the_done_statuses(self):
        self.start()
        self.assertIn("done statuses: Done", self.hook("guard")["reason"])

    def test_all_ticked_but_status_not_done(self):
        self.start()
        for step in ("0", "1", "2"):
            self.s.run("checklist.py", "tick", "T-1", step)
        self.assertIn("is not really done", self.hook("guard")["reason"])

    def test_status_and_done(self):
        self.start()
        self.assertEqual(self.s.run("loop.py", "status").stdout.splitlines(), ["T-1: In Progress", "owner session: S1"])
        self.assertEqual(self.s.run("loop.py", "done").stdout.strip(), "ticket loop cleared")
        self.assertFalse(os.path.exists(self.sentinel))
        self.assertEqual(self.s.run("loop.py", "status").stdout.strip(), "no active ticket")

    def test_start_keeps_a_broken_page(self):
        self.s.run("checklist.py", "init", "T-1")
        page = self.s.page("T-1")
        write(page, read(page).replace('"key"', '"key" oops', 1))
        broken = read(page)
        self.assertNotEqual(self.start().returncode, 0)
        self.assertEqual(read(page), broken)

    def test_unreadable_status_fails_open(self):
        self.start()
        os.remove(self.status)
        self.assertIn("Could not read", self.hook("guard")["systemMessage"])

    def test_no_status_command_clears_when_all_done(self):
        self.set_config(statusCommand="")
        self.start()
        for step in ("0", "1", "2"):
            self.s.run("checklist.py", "tick", "T-1", step)
        self.assertIn("every checklist item is done", self.hook("guard")["systemMessage"])
        self.assertFalse(os.path.exists(self.sentinel))

    def test_broken_config_while_armed_fails_open(self):
        self.start()
        write(self.s.config, "{not json")
        self.assertIn("config", self.hook("guard")["systemMessage"])

    def test_status_command_with_braces(self):
        self.set_config(statusCommand="awk '{print $1}' " + self.status)
        self.start()
        self.set_status("Done")
        self.assertIn("Ticket loop cleared", self.hook("guard")["systemMessage"])

    def test_wrong_shape_config_while_armed_fails_open(self):
        self.start()
        write(self.s.config, '{"keyPattern": "T-\\\\d+"}')
        self.assertIn("config", self.hook("guard")["systemMessage"])
        self.assertIsNone(self.hook("prompt"))

    def test_plugin_hook_without_python_is_silent(self):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
        hooks = json.loads(read(os.path.join(root, "hooks", "hooks.json")))["hooks"]
        for event in ("Stop", "UserPromptSubmit"):
            cmd = hooks[event][0]["hooks"][0]["command"]
            r = subprocess.run(["/bin/sh", "-c", cmd], input="{}", capture_output=True, text=True,
                               env={"PATH": "/nonexistent", "CLAUDE_PLUGIN_ROOT": root})
            self.assertEqual((r.returncode, r.stdout), (0, ""), event + ": " + r.stderr)

    def test_missing_page_is_held(self):
        self.start()
        os.remove(self.s.page("T-1"))
        self.assertIn("No checklist", self.hook("guard")["reason"])

    def test_legacy_sentinel_adopts_the_worktree_session(self):
        os.makedirs(os.path.dirname(self.sentinel), exist_ok=True)
        write(self.sentinel, "T-1\n")
        self.s.run("checklist.py", "init", "T-1")
        self.assertIn("another session", self.hook("guard", cwd="/work/other")["systemMessage"])
        self.assertEqual(self.hook("guard", session="S9", cwd="/work/T-1-be")["decision"], "block")
        self.assertEqual(read(self.sentinel), "T-1\tS9\n")

    def test_prompt_only_for_owner(self):
        self.start()
        self.assertIsNone(self.hook("prompt", session="S2"))
        ctx = self.hook("prompt")["hookSpecificOutput"]["additionalContext"]
        self.assertIn("**T-1 loop** (0/3)", ctx)


if __name__ == "__main__":
    unittest.main()
