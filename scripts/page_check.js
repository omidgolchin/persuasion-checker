/* Page-level check: render docs/index.html in a headless Chromium and
 * assert what the visitor actually sees. The pytest suite covers the
 * engine; this covers the rendering the engine tests cannot reach —
 * starting with the verdict's "What the model rewards" line (PC-2),
 * which must name the weaker draft for the current pair, follow the
 * pair when the drafts swap sides, hide when the pair cannot be
 * scored, and — because it sits inside the aria-live verdict — stay
 * put while the visitor types, updating only once typing has stopped
 * (the debounce section drives the real page in an iframe harness).
 *
 * Needs a headless Chromium: set PAGE_CHECK_BROWSER to its path, or
 * have a Playwright-cache or system Chromium installed. With none
 * found it prints SKIP and exits 3 (tests/test_page.py turns that
 * into a pytest skip locally, and a failure in CI, where a browser
 * is expected to exist).
 *
 *   node scripts/page_check.js
 */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DOCS = path.join(__dirname, "..", "docs");
const PAGE = "file://" + path.join(DOCS, "index.html");

function findBrowser() {
  if (process.env.PAGE_CHECK_BROWSER) return process.env.PAGE_CHECK_BROWSER;
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache).sort().reverse()) {
      const shell = path.join(cache, dir, "chrome-headless-shell-linux64", "chrome-headless-shell");
      if (fs.existsSync(shell)) return shell;
      const full = path.join(cache, dir, "chrome-linux", "chrome");
      if (fs.existsSync(full)) return full;
    }
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    const p = "/usr/bin/" + name;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function dumpDom(browser, url, extraArgs) {
  return execFileSync(browser, ["--no-sandbox", "--disable-gpu", "--dump-dom"].concat(extraArgs || [], [url]),
    { encoding: "utf8", timeout: 90000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

function text(dom, re, what) {
  const m = dom.match(re);
  if (!m) throw new Error("could not find " + what + " in the rendered page");
  return m[1].replace(/<[^>]+>/g, "").trim();
}

function moveTag(dom) {
  const m = dom.match(/<p class="v-move" id="vMove"([^>]*)>/);
  if (!m) throw new Error("could not find the #vMove element in the rendered page");
  return m[1];
}

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
  if (!ok) failures++;
}

function main() {
  const browser = findBrowser();
  if (!browser) { console.log("SKIP: no headless Chromium found (set PAGE_CHECK_BROWSER)"); process.exit(3); }
  const ex = JSON.parse(fs.readFileSync(path.join(DOCS, "data", "examples.json"), "utf8"))[0];
  const q = (op, a, b) => "?op=" + encodeURIComponent(op) + "&a=" + encodeURIComponent(a) + "&b=" + encodeURIComponent(b);
  const TITLE = /id="vTitle">([^<]*)/;
  const MOVE = /id="vMove"[^>]*>([\s\S]*?)<\/p>/;

  // 1. The default pair (p_3801): Draft B leads at 78%, so the line must
  //    name Draft A and its biggest lever, links to evidence.
  let dom = dumpDom(browser, PAGE);
  check("default title", text(dom, TITLE, "the verdict title") === "Draft B is more likely to persuade (78%)",
    text(dom, TITLE, "the verdict title"));
  const mv = text(dom, MOVE, "the what-the-model-rewards line");
  check("default line names the weaker draft", mv.startsWith("What the model rewards: Draft A would score higher with"), mv.slice(0, 90));
  check("default line names the top lever", mv.includes("links to evidence"), mv.slice(0, 120));
  check("default line is visible", !/\bhidden\b/.test(moveTag(dom)));

  // 2. The same pair swapped: the score is antisymmetric (Draft A now
  //    leads at 78%) and the line must follow the pair and name Draft B.
  dom = dumpDom(browser, PAGE + q(ex.op, ex.b, ex.a));
  check("swapped title", text(dom, TITLE, "the verdict title") === "Draft A is more likely to persuade (78%)",
    text(dom, TITLE, "the verdict title"));
  const mv2 = text(dom, MOVE, "the what-the-model-rewards line");
  check("swapped line names the weaker draft", mv2.startsWith("What the model rewards: Draft B would score higher with"), mv2.slice(0, 90));

  // 3. A pair too short to score: no verdict, and the line hides, empty.
  dom = dumpDom(browser, PAGE + q("x", "hi", "hello there"));
  check("invalid title", text(dom, TITLE, "the verdict title") === "Check the highlighted inputs",
    text(dom, TITLE, "the verdict title"));
  check("invalid line hidden and empty", /\bhidden\b/.test(moveTag(dom)) && text(dom, MOVE, "the line") === "");

  // 4. Typing must not recompute the line per keystroke: it sits in the
  //    aria-live verdict, so it updates only after typing stops (the
  //    app's 250 ms input debounce, then the line's own 600 ms). The
  //    harness loads the real page in an iframe, swaps the drafts by
  //    firing input events, and snapshots the line synchronously, at
  //    450 ms (after the run, before the line's debounce) and at
  //    1800 ms (after it). Virtual time makes the waits instant.
  const harness = [
    "<!doctype html><meta charset=\"utf-8\"><body>",
    "<iframe id=\"f\" src=\"" + PAGE + "\" width=\"1200\" height=\"900\"></iframe>",
    "<pre id=\"out\">PENDING</pre>",
    "<script>",
    "var out = { stage: \"init\" };",
    "var f = document.getElementById(\"f\");",
    "f.addEventListener(\"load\", function () {",
    "  var w = f.contentWindow, d = f.contentDocument;",
    "  function mv() { var el = d.getElementById(\"vMove\"); return el ? el.textContent.trim() : \"<missing>\"; }",
    "  var tries = 0;",
    "  var iv = setInterval(function () {",
    "    tries++;",
    "    if (mv().indexOf(\"What the model rewards:\") === 0 || tries > 200) { clearInterval(iv); step1(); }",
    "  }, 25);",
    "  function step1() {",
    "    out.initial = mv();",
    "    var a = d.getElementById(\"draftA\"), b = d.getElementById(\"draftB\");",
    "    var aText = a.value, bText = b.value;",
    "    a.value = bText; b.value = aText;",
    "    for (var i = 0; i < 4; i++) {",
    "      a.dispatchEvent(new w.Event(\"input\", { bubbles: true }));",
    "      b.dispatchEvent(new w.Event(\"input\", { bubbles: true }));",
    "    }",
    "    out.sync = mv();",
    "    setTimeout(function () { out.mid = mv(); }, 450);",
    "    setTimeout(function () {",
    "      out.late = mv();",
    "      out.stage = \"done\";",
    "      document.getElementById(\"out\").textContent = \"RESULT \" + JSON.stringify(out);",
    "    }, 1800);",
    "  }",
    "});",
    "</" + "script>",
    "</body>"
  ].join("\n");
  const hdir = fs.mkdtempSync(path.join(os.tmpdir(), "page-check-"));
  const hfile = path.join(hdir, "harness.html");
  fs.writeFileSync(hfile, harness);
  try {
    const hdom = dumpDom(browser, "file://" + hfile,
      ["--allow-file-access-from-files", "--virtual-time-budget=15000"]);
    const rm = hdom.match(/RESULT (\{[\s\S]*?\})<\/pre>/);
    if (!rm) throw new Error("debounce harness produced no result");
    const r = JSON.parse(rm[1]);
    check("typing does not update the line synchronously", r.sync === r.initial, (r.sync || "").slice(0, 60));
    check("line still unchanged after the run, before its debounce", r.mid === r.initial, (r.mid || "").slice(0, 60));
    check("line updates after typing stops", (r.late || "").startsWith("What the model rewards: Draft B would score higher with"), (r.late || "").slice(0, 90));
  } finally {
    fs.rmSync(hdir, { recursive: true, force: true });
  }

  if (failures) { console.error(failures + " page check(s) failed"); process.exit(1); }
  console.log("All page checks passed.");
}

main();
