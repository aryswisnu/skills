#!/usr/bin/env python3
"""Per-ticket loop checklist, stored as HTML (ticket-loop skill).

The page lives at <artifacts.dir>/tasks.html from the config ($TICKET_LOOP_CONFIG,
default ~/.config/ticket-loop/config.json). The state is a JSON block inside the
page; every command re-renders the whole page from it. The model never edits the
HTML by hand: a script cannot drop a closing tag or tick the wrong box.

  checklist.py init   <KEY>                 # create if absent, print path
  checklist.py tick   <KEY> <STEP> [note]   # mark done
  checklist.py block  <KEY> <STEP> <note>   # mark blocked, with the reason
  checklist.py reopen <KEY> <STEP>...       # mark open again (failed verification: the fix step on)
  checklist.py link   <KEY> <pr|sandbox|explainer> <url>   # header link chip
  checklist.py ask    <KEY> <question>      # question card on the page
  checklist.py ask    <KEY> --clear         # remove it once the user answers
  checklist.py list   <KEY>                 # markdown task list, for every answer
  checklist.py open   <KEY>                 # open + blocked items, one per line
  checklist.py path   <KEY>
  checklist.py assets <dir>                       # plan-page ticket-loop.css + ticket-loop.js
"""
import datetime, html, json, os, re, shutil, sys

LINKS = ("pr", "sandbox", "explainer")
MARK = {"done": "x", "open": " ", "blocked": "!"}
HERE = os.path.dirname(os.path.abspath(__file__))


def config():
    p = os.path.expanduser(os.environ.get("TICKET_LOOP_CONFIG", "~/.config/ticket-loop/config.json"))
    try:
        with open(p) as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        sys.exit(f"no config at {p}: copy config.example.json there and edit it ({e.__class__.__name__})")


def check_key(key):
    if not re.fullmatch(config().get("keyPattern", r"[A-Z][A-Z0-9]*-\d+"), key):
        sys.exit(f"key {key!r} does not match keyPattern in the config")


def folder(key):
    return os.path.expanduser(config()["artifacts"]["dir"].format(key=key))


def web(key):
    url = config()["artifacts"].get("url", "")
    return url.format(key=key) if url else ""


def path(key):
    return os.path.join(folder(key), "tasks.html")


def page_url(key):
    return web(key) + "/tasks.html" if web(key) else path(key)


def now():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M")


def load(key):
    try:
        text = open(path(key)).read()
    except OSError:
        return None
    m = re.search(r'<script type="application/json" id="state">(.*?)</script>', text, re.S)
    try:
        return json.loads(m.group(1)) if m else None
    except ValueError:
        return None


# The page renders itself from the state block and re-reads its own file every
# 20 s, so a tick shows (and animates) without a reload. "at" stamps carry no zone;
# data-tz lets the browser show them in local time.
PAGE = r"""<!doctype html>
<html lang="en" data-tz="__TZ__"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__KEY__ loop</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;600&family=Schibsted+Grotesk:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0f0f0d;--surface:#171714;--line:#2a2a25;--fg:#ecebe4;--muted:#8d8b80;
  --done:#6fd49a;--run:#ffb547;--blocked:#ff6b5e;--grid:rgba(255,255,255,.035);
  --run-soft:rgba(255,181,71,.12);--done-soft:rgba(111,212,154,.14);--blocked-soft:rgba(255,107,94,.12);
  --mono:"Martian Mono",ui-monospace,monospace;--sans:"Schibsted Grotesk",system-ui,sans-serif;
}
:root[data-theme="light"]{
  --bg:#f6f5f0;--surface:#fff;--line:#e3e1d8;--fg:#1b1b18;--muted:#6b6a62;
  --done:#1f8a4c;--run:#b86e00;--blocked:#c62a1f;--grid:rgba(0,0,0,.04);
  --run-soft:rgba(184,110,0,.10);--done-soft:rgba(31,138,76,.10);--blocked-soft:rgba(198,42,31,.08);
}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;color:var(--fg);font:15px/1.5 var(--sans);
  background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);
  background-size:24px 24px;min-height:100vh}
main{max-width:780px;margin:0 auto;padding:28px 18px 64px}
a{color:inherit;text-decoration:underline;text-decoration-color:var(--run);text-underline-offset:3px}
a:hover{color:var(--run)}
button{font:inherit;color:inherit}
.top{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center}
.eyebrow{font:600 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
h1{font:800 clamp(34px,8vw,52px)/1 var(--sans);letter-spacing:-.03em;margin:0}
.status{display:inline-flex;align-items:center;gap:8px;margin-top:12px;padding:6px 12px 6px 10px;border:1px solid var(--line);
  border-radius:99px;background:var(--surface);font:500 13px/1 var(--sans)}
.status .dot{width:8px;height:8px;border-radius:50%;background:var(--run);box-shadow:0 0 0 0 var(--run);animation:beacon 1.8s infinite}
.status.done .dot{background:var(--done);animation:none}
.status.blocked .dot{background:var(--blocked)}
.status small{color:var(--muted);font-size:12px}
.ring{position:relative;width:96px;height:96px}
.ring svg{transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:8}
.ring .track{stroke:var(--line)}
.ring .fill{stroke:var(--done);stroke-linecap:round;stroke-dasharray:251.33;stroke-dashoffset:251.33;transition:stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)}
.ring b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 20px/1 var(--mono)}
.ring b span{font-size:12px;color:var(--muted);margin-left:1px}
.theme{position:absolute;top:16px;right:16px;width:36px;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--surface);cursor:pointer}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 0}
.chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);
  font:500 13px/1 var(--sans);text-decoration:none;transition:border-color .2s,transform .2s}
.chip:hover{border-color:var(--run);color:var(--fg);transform:translateY(-1px)}
.chip i{font:600 10px/1 var(--mono);color:var(--muted);font-style:normal;letter-spacing:.06em}
.chip.off{opacity:.4;pointer-events:none}
.ask{margin:26px 0 0;padding:16px 18px;border:1px solid var(--run);border-radius:12px;background:var(--run-soft);position:relative;overflow:hidden}
.ask.pop{animation:rise .5s both}
.ask::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--run)}
.ask h2{margin:0 0 6px;font:600 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--run)}
.ask p{margin:0 0 12px;font-size:16px;font-weight:500;overflow-wrap:anywhere;white-space:pre-wrap}
.ask .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ask button{padding:8px 14px;border:0;border-radius:8px;background:var(--run);color:#1b1200;font-weight:700;cursor:pointer}
.ask small{color:var(--muted);font-size:12px}
.phase{margin:34px 0 4px;display:flex;align-items:baseline;gap:10px}
.phase b{font:600 11px/1 var(--mono);color:var(--muted);letter-spacing:.1em}
.phase h3{margin:0;font:700 13px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase}
.phase span{flex:1;height:1px;background:var(--line)}
ol{list-style:none;margin:0;padding:0}
li{position:relative;display:grid;grid-template-columns:28px 1fr;gap:14px;padding:12px 10px 12px 0;border-radius:10px;
  animation:rise .45s both;animation-delay:calc(var(--i)*35ms)}
.live li{animation:none}
li::before{content:"";position:absolute;left:13px;top:0;bottom:0;width:2px;background:var(--line)}
li.done::before{background:var(--done)}
li:first-child::before{top:22px}
li:last-child::before{bottom:calc(100% - 22px)}
.node{position:relative;z-index:1;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;
  background:var(--bg);border:2px solid var(--line);transition:background .3s,border-color .3s}
.node svg{width:14px;height:14px;fill:none;stroke:var(--bg);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.node path{stroke-dasharray:20;stroke-dashoffset:20}
.done .node{background:var(--done);border-color:var(--done)}
.done .node path{stroke-dashoffset:0}
.done.fresh .node path{animation:draw .45s .15s ease-out both}
.done.fresh{animation:flash 1.4s ease-out}
.run .node{border-color:var(--run);background:var(--bg)}
.run .node::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--run);animation:beat 1.2s ease-in-out infinite}
.run .node::before{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--run);animation:ripple 1.8s ease-out infinite}
.run{background:var(--run-soft)}
.run .node svg,.blocked .node svg{display:none}
.blocked .node{border-color:var(--blocked);background:var(--blocked);color:var(--bg);font:700 14px/1 var(--mono)}
.blocked .node::after{content:"!"}
.blocked{background:var(--blocked-soft)}
.blocked.fresh{animation:shake .5s}
.body{min-width:0}
.head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.code{font:600 12px/1 var(--mono);color:var(--muted);min-width:24px}
.title{font-weight:600}
.done .title{color:var(--muted);font-weight:500}
.when{margin-left:auto;font:400 11px/1 var(--mono);color:var(--muted);white-space:nowrap}
.run .when{color:var(--run);font-weight:600}
.check{margin:4px 0 0;font:400 11.5px/1.5 var(--mono);color:var(--muted)}
.note{margin:6px 0 0;font-size:14px;overflow-wrap:anywhere}
.blocked .note{color:var(--blocked);font-weight:500}
.bar{height:3px;margin-top:10px;border-radius:2px;background:var(--line);overflow:hidden}
.bar i{display:block;height:100%;width:40%;background:linear-gradient(90deg,transparent,var(--run),transparent);animation:scan 1.6s linear infinite}
.foot{margin-top:40px;color:var(--muted);font:400 11px/1.6 var(--mono)}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;padding:10px 16px;border-radius:8px;
  background:var(--fg);color:var(--bg);font-weight:600;transition:.25s;pointer-events:none}
.toast.on{opacity:1;transform:translate(-50%,0)}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes flash{0%{background:var(--done-soft)}100%{background:transparent}}
@keyframes beat{0%,100%{transform:scale(.7)}50%{transform:scale(1)}}
@keyframes ripple{0%{opacity:.8;transform:scale(.7)}100%{opacity:0;transform:scale(1.35)}}
@keyframes beacon{0%{box-shadow:0 0 0 0 var(--run)}70%,100%{box-shadow:0 0 0 8px transparent}}
@keyframes scan{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}
  .done .node path{stroke-dashoffset:0}}
@media (max-width:520px){.ring{width:72px;height:72px;margin-top:44px}.ring svg{width:72px;height:72px}.ring b{font-size:16px}.when{margin-left:0;width:100%}}
</style></head>
<body><main>
<button class="theme" id="theme" type="button" aria-label="Switch light or dark theme" title="Switch theme">&#9680;</button>
<div class="top">
  <div>
    <p class="eyebrow">Ticket loop</p>
    <h1>__KEY__</h1>
    <div class="status" id="status" role="status"><span class="dot"></span><span id="statusText"></span><small id="updated"></small></div>
  </div>
  <div class="ring" id="ring" role="img"><svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle class="track" cx="48" cy="48" r="40"/><circle class="fill" id="ringFill" cx="48" cy="48" r="40"/></svg><b id="ringText"></b></div>
</div>
<nav class="chips" id="chips" aria-label="Ticket links"></nav>
<section class="ask" id="ask" hidden>
  <h2>Question for you</h2>
  <p id="askText"></p>
  <div class="row"><button type="button" id="copy">Copy question</button><small id="askWhen"></small><small>Answer in the agent session.</small></div>
</section>
<div id="timeline"></div>
<p class="foot">Updates without reload every 20 s</p>
</main>
<div class="toast" id="toast" aria-live="polite">Copied</div>
<script type="application/json" id="state">__STATE__</script>
<script>
(function () {
  var CFG = __CFG__;
  var PHASES = CFG.phases;
  function issue(k) { return CFG.issueUrl ? CFG.issueUrl.replace("{key}", k) : ""; }
  var TZ = document.documentElement.dataset.tz;
  var STATE_RE = /<script type="application\/json" id="state">([\s\S]*?)<\/script>/;
  var S = JSON.parse(document.getElementById("state").textContent);
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c];
    });
  }
  function a(href, text) { return '<a href="' + href + '" target="_blank" rel="noopener">' + text + "</a>"; }
  function links() { return S.links || {}; }
  // A folder URL on the artifacts host may serve no index page, so point at index.html.
  function full(u) { return CFG.origin && u.indexOf(CFG.origin + "/") === 0 && u.slice(-1) === "/" ? u + "index.html" : u; }
  // Only http(s) URLs become links, so a note cannot plant a javascript: href.
  function linkify(s) {
    var pr = links().pr;
    return esc(s)
      .replace(/https?:\/\/[^\s<]+[^\s<.,;)]/g, function (u) { u = full(u); return a(u, u.replace(/^https?:\/\//, "")); })
      .replace(new RegExp("(^|[\\s(])(" + CFG.keyPattern + ")(?![\\w\\/-])", "g"), function (m, p, k) { return issue(k) ? p + a(issue(k), k) : m; })
      .replace(/PR #\d+/g, function (m) { return pr ? a(esc(pr), m) : m; });
  }
  function when(s) { return s ? Date.parse(s.replace(" ", "T") + ":00" + TZ) : 0; }
  function ago(t) {
    var m = Math.max(0, Math.round((Date.now() - t) / 60e3));
    return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 2880 ? Math.floor(m / 60) + "h " + (m % 60) + "m ago" : Math.floor(m / 1440) + "d ago";
  }
  function dur(t) {
    var s = Math.max(0, Math.round((Date.now() - t) / 1e3)), m = Math.floor(s / 60);
    return m < 60 ? m + "m " + String(s % 60).padStart(2, "0") + "s" : Math.floor(m / 60) + "h " + (m % 60) + "m";
  }
  function clock(t) {
    var d = new Date(t), p = function (n) { return String(n).padStart(2, "0"); };
    var today = new Date().toDateString() === d.toDateString();
    return (today ? "" : d.getDate() + "/" + (d.getMonth() + 1) + " ") + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function current() { return S.items.find(function (i) { return i.state !== "done"; }); }
  function runStart() {
    var last = 0;
    S.items.forEach(function (i) { if (i.state === "done") last = Math.max(last, when(i.at)); });
    return last || when(S.updated);
  }

  function render(fresh) {
    var items = S.items, cur = current(), L = links();
    var done = items.filter(function (i) { return i.state === "done"; }).length;
    requestAnimationFrame(function () { $("ringFill").style.strokeDashoffset = 251.33 * (1 - done / items.length); });
    $("ringText").innerHTML = done + "<span>/" + items.length + "</span>";
    $("ring").setAttribute("aria-label", done + " of " + items.length + " done");
    document.title = "(" + done + "/" + items.length + ") " + S.key + " loop";
    $("status").className = "status" + (!cur ? " done" : cur.state === "blocked" ? " blocked" : "");
    $("statusText").textContent = !cur ? "Complete" : (cur.state === "blocked" ? "Blocked at step " : "Running step ") + cur.step;
    $("updated").textContent = "· updated " + ago(when(S.updated));

    var prId = L.pr && (L.pr.match(/(\d+)\/?$/) || [])[1];
    var chips = [[CFG.issueLabel, issue(S.key), S.key], ["Plan", "plan.html", "plan"],
                 ["PR", L.pr, prId ? "#" + prId : L.pr ? "open" : "none"],
                 ["Sandbox", L.sandbox, L.sandbox ? "open" : "none"], ["Explainer", L.explainer, L.explainer ? "open" : "none"]];
    $("chips").innerHTML = chips.map(function (c) {
      return '<a class="chip' + (c[1] ? "" : " off") + '" href="' + esc(c[1] || "#") + '" target="_blank" rel="noopener"' +
        (c[1] ? "" : ' aria-disabled="true" tabindex="-1"') + ">" + c[0] + " <i>" + esc(c[2]) + " ↗</i></a>";
    }).join("");

    var ask = $("ask");
    ask.hidden = !S.ask;
    if (S.ask) {
      if ($("askText").textContent !== S.ask.text) { ask.classList.remove("pop"); void ask.offsetWidth; ask.classList.add("pop"); }
      $("askText").textContent = S.ask.text;
      $("askWhen").textContent = "asked " + ago(when(S.ask.at)) + " ·";
    }

    var n = 0;
    $("timeline").innerHTML = PHASES.map(function (p, pi) {
      var rows = p[1].map(function (step) {
        var i = items.find(function (x) { return x.step === step; });
        if (!i) return "";
        var cls = i === cur && i.state === "open" ? "run" : i.state;
        var t = cls === "run" ? '<span class="when" data-run>running ' + dur(runStart()) + "</span>"
              : i.at ? '<span class="when">' + clock(when(i.at)) + "</span>" : "";
        return '<li class="' + cls + (fresh[step] ? " fresh" : "") + '" style="--i:' + (n++) + '">' +
          '<span class="node" role="img" aria-label="' + cls + '"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5"/></svg></span>' +
          '<div class="body"><div class="head"><span class="code">' + esc(step) + '</span><span class="title">' + esc(i.title) + "</span>" + t + "</div>" +
          '<p class="check">✓ ' + esc(i.check) + "</p>" + (i.note ? '<p class="note">' + linkify(i.note) + "</p>" : "") +
          (cls === "run" ? '<div class="bar"><i></i></div>' : "") + "</div></li>";
      }).join("");
      return '<div class="phase"><b>0' + (pi + 1) + "</b><h3>" + p[0] + "</h3><span></span></div><ol>" + rows + "</ol>";
    }).join("");
  }

  function poll() {
    fetch(location.pathname, {cache: "no-store"}).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      var m = STATE_RE.exec(t);
      if (!m) return;
      var next = JSON.parse(m[1]);
      if (JSON.stringify(next) === JSON.stringify(S)) return;
      var fresh = {};
      next.items.forEach(function (i) {
        var old = S.items.find(function (x) { return x.step === i.step; });
        if (i.state !== "open" && (!old || old.state !== i.state || old.note !== i.note)) fresh[i.step] = 1;
      });
      S = next;
      render(fresh);
    }).catch(function () {});
  }

  $("copy").onclick = function () {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText("Answer to " + S.key + ": " + S.ask.text + "\n> ").then(function () {
      $("toast").classList.add("on");
      setTimeout(function () { $("toast").classList.remove("on"); }, 1400);
    }, function () {});
  };
  var root = document.documentElement, key = "tasks-theme";
  try {
    root.dataset.theme = localStorage.getItem(key) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  } catch (e) {}
  $("theme").onclick = function () {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem(key, root.dataset.theme); } catch (e) {}
  };

  render({});
  setTimeout(function () { document.body.classList.add("live"); }, 1200);
  setInterval(poll, 20000);
  setInterval(function () {
    var el = document.querySelector("[data-run]");
    if (el) el.textContent = "running " + dur(runStart());
  }, 1000);
})();
</script>
</body></html>
"""


def render(state):
    cfg, key = config(), state["key"]
    if os.path.exists(os.path.join(folder(key), "index.html")):
        state.setdefault("links", {}).setdefault("explainer", web(key) + "/index.html" if web(key) else "index.html")
    phase_of = {s["id"]: s.get("phase", "Steps") for s in cfg["steps"]}
    phases = {}
    for i in state["items"]:
        phases.setdefault(phase_of.get(i["step"], "Other"), []).append(i["step"])
    origin = re.match(r"https?://[^/]+", web(key))
    page_cfg = {"issueUrl": cfg.get("issueUrl", ""), "issueLabel": cfg.get("issueLabel", "Issue"),
                "keyPattern": cfg.get("keyPattern", r"[A-Z][A-Z0-9]*-\d+"),
                "phases": list(phases.items()), "origin": origin.group(0) if origin else ""}
    # Escape "</" so a note can never close a script block early.
    blob = json.dumps(state, indent=1).replace("</", "<\\/")
    tz = datetime.datetime.now().astimezone().strftime("%z")
    return (PAGE.replace("__TZ__", tz[:3] + ":" + tz[3:])
                .replace("__KEY__", html.escape(key))
                .replace("__CFG__", json.dumps(page_cfg).replace("</", "<\\/"))
                .replace("__STATE__", blob))


def save(state):
    state["updated"] = now()
    p = path(state["key"])
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w") as f:
        f.write(render(state))
    os.replace(tmp, p)


def need(key):
    state = load(key)
    if state is None:
        sys.exit(f"no checklist for {key}: run checklist.py init {key}")
    return state


def item(state, step):
    for i in state["items"]:
        if i["step"] == step:
            return i
    sys.exit(f"no step {step!r}; steps: {' '.join(i['step'] for i in state['items'])}")


def list_text(key, state):
    done = sum(i["state"] == "done" for i in state["items"])
    lines = [f"**{key} loop** ({done}/{len(state['items'])}) {page_url(key)}"]
    for i in state["items"]:
        note = f" ({i['note']})" if i["note"] else ""
        lines.append(f"- [{MARK[i['state']]}] {i['step']}. {i['title']}{note}")
    return "\n".join(lines)


def open_line(i):
    tag = "BLOCKED: " if i["state"] == "blocked" else ""
    return f"{i['step']}. {tag}{i['title']} -> check: {i['check']}" + (f" ({i['note']})" if i["note"] else "")


def init(key):
    if load(key) is None:
        if os.path.exists(path(key)):
            sys.exit(f"{path(key)} exists but its state block does not parse; fix or move it, then init again")
        save({"key": key, "links": {}, "ask": None, "items": [
            {"step": s["id"], "title": s["title"].replace("<KEY>", key), "check": s["check"].replace("<KEY>", key),
             "state": "open", "note": "", "at": ""} for s in config()["steps"]]})
    return path(key)


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    cmd, key, rest = argv[0], argv[1], argv[2:]
    if cmd != "assets":
        check_key(key)
    if cmd == "path":
        print(path(key))
    elif cmd == "init":
        print(init(key))
    elif cmd in ("tick", "block"):
        state = need(key)
        if not rest or (cmd == "block" and len(rest) < 2):
            sys.exit(f"usage: {cmd} <KEY> <STEP> {'<note>' if cmd == 'block' else '[note]'}")
        i = item(state, rest[0])
        i["state"] = "done" if cmd == "tick" else "blocked"
        i["note"] = " ".join(rest[1:])
        i["at"] = now()
        save(state)
    elif cmd == "reopen":
        state = need(key)
        for step in rest:
            i = item(state, step)
            i.update(state="open", note="", at="")
        save(state)
    elif cmd == "link":
        state = need(key)
        if len(rest) != 2 or rest[0] not in LINKS or not re.match(r"https?://", rest[1]):
            sys.exit(f"usage: link <KEY> <{'|'.join(LINKS)}> <http(s) url>")
        url, origin = rest[1], re.match(r"https?://[^/]+", web(key))
        if origin and url.startswith(origin.group(0) + "/") and url.endswith("/"):
            url += "index.html"
        state.setdefault("links", {})[rest[0]] = url
        save(state)
    elif cmd == "ask":
        state = need(key)
        if not rest:
            sys.exit("usage: ask <KEY> <question> | ask <KEY> --clear")
        state["ask"] = None if rest == ["--clear"] else {"text": " ".join(rest), "at": now()}
        save(state)
    elif cmd == "list":
        print(list_text(key, need(key)))
    elif cmd == "open":
        state = load(key) or {"items": []}
        for i in state["items"]:
            if i["state"] != "done":
                print(open_line(i))
    elif cmd == "assets":
        os.makedirs(key, exist_ok=True)
        cfg = config()
        shutil.copy(os.path.join(HERE, "..", "assets", "ticket-loop.css"), key)
        with open(os.path.join(HERE, "..", "assets", "ticket-loop.js")) as f:
            js = f.read()
        head = {"issueUrl": cfg.get("issueUrl", ""), "issueLabel": cfg.get("issueLabel", "Issue"),
                "keyPattern": cfg.get("keyPattern", r"[A-Z][A-Z0-9]*-\d+")}
        with open(os.path.join(key, "ticket-loop.js"), "w") as f:
            f.write("var TICKET_LOOP = " + json.dumps(head) + ";\n" + js)
        print(key)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
