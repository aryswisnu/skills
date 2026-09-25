import json, os, re, unittest
from helpers import Sandbox, read, write


class ChecklistTest(unittest.TestCase):
    def setUp(self):
        self.s = Sandbox()

    def cli(self, *args):
        return self.s.run("checklist.py", *args)

    def state(self):
        html = read(self.s.page("T-1"))
        return json.loads(re.search(r'id="state">(.*?)</script>', html, re.S).group(1))

    def page_cfg(self, sandbox, key="T-1"):
        m = re.search(r"var CFG = (\{.*?\});\n", read(sandbox.page(key)))
        return json.loads(m.group(1))

    def test_init_and_list(self):
        self.assertEqual(self.cli("init", "T-1").returncode, 0)
        out = self.cli("list", "T-1").stdout.splitlines()
        self.assertEqual(out[0], "**T-1 loop** (0/3) https://example.test/T-1/tasks.html")
        self.assertEqual(out[2], "- [ ] 1. Branch T-1")

    def test_tick_keeps_state_across_init(self):
        self.cli("init", "T-1")
        self.cli("tick", "T-1", "0", "ok")
        self.cli("init", "T-1")
        self.assertIn("- [x] 0. Plan approved (ok)", self.cli("list", "T-1").stdout)

    def test_open_lines(self):
        self.cli("init", "T-1")
        self.cli("tick", "T-1", "0")
        self.cli("block", "T-1", "1", "no", "access")
        self.assertEqual(self.cli("open", "T-1").stdout.splitlines(),
                         ["1. BLOCKED: Branch T-1 -> check: git branch (no access)", "2. PR raised -> check: PR URL"])

    def test_hostile_note_cannot_close_a_script_block(self):
        self.cli("init", "T-1")
        note = "</script><img src=x onerror=alert(1)>"
        self.cli("tick", "T-1", "0", note)
        self.assertEqual(read(self.s.page("T-1")).count("</script>"), 2)
        self.assertIn("- [x] 0. Plan approved (" + note + ")", self.cli("list", "T-1").stdout)

    def test_bad_key_is_rejected_before_any_path(self):
        for key in ("../T-1", "t-1", "T-1/x"):
            r = self.cli("init", key)
            self.assertNotEqual(r.returncode, 0, key)
            self.assertIn("does not match", r.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.s.dir, "T-1")))

    def test_link_validation_and_folder_url(self):
        self.cli("init", "T-1")
        self.assertNotEqual(self.cli("link", "T-1", "pr", "javascript:alert(1)").returncode, 0)
        self.assertNotEqual(self.cli("link", "T-1", "nope", "https://x.test").returncode, 0)
        self.cli("link", "T-1", "explainer", "https://example.test/T-1/")
        self.assertEqual(self.state()["links"]["explainer"], "https://example.test/T-1/index.html")

    def test_ask_and_clear(self):
        self.cli("init", "T-1")
        self.cli("ask", "T-1", "Ship", "it?")
        self.assertEqual(self.state()["ask"]["text"], "Ship it?")
        self.cli("ask", "T-1", "--clear")
        self.assertIsNone(self.state()["ask"])

    def test_unknown_step(self):
        self.cli("init", "T-1")
        r = self.cli("tick", "T-1", "9")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("steps: 0 1 2", r.stderr)

    def test_missing_config(self):
        env = dict(self.s.env, TICKET_LOOP_CONFIG=os.path.join(self.s.dir, "absent.json"))
        r = self.s.run("checklist.py", "list", "T-1", env=env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no config at", r.stderr)

    def test_unknown_step_in_state_goes_to_other_phase(self):
        self.cli("init", "T-1")
        cfg = json.loads(read(self.s.config))
        cfg["steps"] = cfg["steps"][:2]
        self.s.write_config(cfg)
        self.cli("tick", "T-1", "0")
        self.assertEqual(dict(self.page_cfg(self.s)["phases"])["Other"], ["2"])

    def test_local_only_artifacts(self):
        local = Sandbox(url="")
        local.run("checklist.py", "init", "T-1")
        head = local.run("checklist.py", "list", "T-1").stdout.splitlines()[0]
        self.assertEqual(head, "**T-1 loop** (0/3) " + local.page("T-1"))
        self.assertEqual(self.page_cfg(local)["origin"], "")

    def test_bad_state_json_loads_as_none(self):
        self.cli("init", "T-1")
        p = self.s.page("T-1")
        text = read(p)
        write(p, text.replace('"key"', '"key" oops', 1))
        r = self.cli("list", "T-1")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no checklist for T-1", r.stderr)

    def test_example_config_runs(self):
        cfg = json.loads(read(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.example.json")))
        cfg["artifacts"]["dir"] = os.path.join(self.s.dir, "pages", "{key}")
        self.s.write_config(cfg)
        self.assertEqual(self.cli("init", "ABC-12").returncode, 0)
        self.assertEqual(self.cli("list", "ABC-12").stdout.splitlines()[0],
                         "**ABC-12 loop** (0/11) " + self.s.page("ABC-12"))

    def test_assets(self):
        out = os.path.join(self.s.dir, "web")
        self.assertEqual(self.cli("assets", out).returncode, 0)
        js = read(os.path.join(out, "ticket-loop.js"))
        self.assertTrue(js.startswith("var TICKET_LOOP = "))
        self.assertIn("https://issues.example.test/{key}", js)
        self.assertTrue(os.path.exists(os.path.join(out, "ticket-loop.css")))


if __name__ == "__main__":
    unittest.main()
