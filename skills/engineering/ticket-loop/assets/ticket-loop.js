// Shared behaviour for ticket-loop plan pages: theme, header chips, clickable
// ticket keys and URLs, and a staggered reveal. Load with defer.
// `checklist.py assets` prepends TICKET_LOOP (issue URL, key pattern) from the config.
(function () {
  var root = document.documentElement, KEY_STORE = "tasks-theme";
  try {
    root.dataset.theme = localStorage.getItem(KEY_STORE) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  } catch (e) {}

  var main = document.querySelector("main") || document.body;
  var CFG = window.TICKET_LOOP || {issueUrl: "", issueLabel: "Issue", keyPattern: "[A-Z][A-Z0-9]*-\\d+"};
  var issue = function (k) { return CFG.issueUrl ? CFG.issueUrl.replace("{key}", k) : ""; };
  var key = (location.pathname.match(new RegExp("/(" + CFG.keyPattern + ")/")) || [])[1];
  var h1 = main.querySelector("h1");

  // Pages with their own toggle keep it; it flips the same data-theme attribute.
  if (!document.querySelector("button")) {
    var btn = document.createElement("button");
    btn.className = "tl-theme"; btn.type = "button"; btn.textContent = "◐";
    btn.setAttribute("aria-label", "Switch light or dark theme");
    btn.onclick = function () {
      root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem(KEY_STORE, root.dataset.theme); } catch (e) {}
    };
    document.body.appendChild(btn);
  }

  if (key && h1) {
    var eyebrow = document.createElement("p");
    eyebrow.className = "tl-eyebrow"; eyebrow.dataset.nolink = ""; eyebrow.textContent = "Ticket plan · " + key;
    h1.before(eyebrow);
    var chips = document.createElement("nav");
    chips.className = "tl-chips"; chips.setAttribute("aria-label", "Ticket links");
    [[CFG.issueLabel, issue(key), key], ["Tasks", "tasks.html", "loop"]].filter(function (c) { return c[1]; }).forEach(function (c) {
      var a = document.createElement("a");
      a.className = "tl-chip"; a.href = c[1]; a.target = "_blank"; a.rel = "noopener";
      a.append(c[0] + " "); var i = document.createElement("i"); i.textContent = c[2] + " ↗"; a.append(i);
      chips.append(a);
    });
    h1.after(chips);
  }

  // Link bare URLs and ticket keys in text. Skip code, existing links, and diagrams.
  var skip = /^(A|H1|CODE|PRE|SCRIPT|STYLE|TEXTAREA|BUTTON|NAV|svg|text|tspan)$/;
  var re = new RegExp("(https?:\\/\\/[^\\s<]+[^\\s<.,;)])|\\b(" + CFG.keyPattern + ")\\b", "g");
  var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
    acceptNode: function (n) {
      for (var p = n.parentNode; p && p !== main; p = p.parentNode) if (skip.test(p.nodeName) || p.hasAttribute("data-nolink")) return NodeFilter.FILTER_REJECT;
      re.lastIndex = 0;
      return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function (n) {
    var frag = document.createDocumentFragment(), text = n.nodeValue, last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      frag.append(text.slice(last, m.index));
      var href = m[1] || issue(m[2]);
      if (!href) { frag.append(m[0]); last = re.lastIndex; continue; }
      if (m[1] && href.indexOf(location.origin + "/") === 0 && href.slice(-1) === "/") href += "index.html";
      var a = document.createElement("a");
      a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = m[0];
      frag.append(a); last = re.lastIndex;
    }
    frag.append(text.slice(last));
    n.replaceWith(frag);
  });

  // A heading that already carries its own number does not get a second one.
  main.querySelectorAll("h2").forEach(function (h) { if (/^\s*\d+[.)]\s/.test(h.textContent)) h.classList.add("tl-num"); });

  Array.prototype.slice.call(main.children, 0, 40).forEach(function (el, i) {
    el.style.setProperty("--i", i); el.classList.add("tl-rise");
  });
})();
