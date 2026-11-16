/* Which Draft Persuades?: page logic. The model lives in persuasion.js
 * (engine) and model-data.js (weights); this file only renders. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var F = Tool.fmt;
  var MODEL = window.PERSUADE_MODEL;
  var EXAMPLES = window.PERSUADE_EXAMPLES || [];
  var engine = Persuasion.create(MODEL);
  // accuracy is stored to 4 decimals; rebuild the exact share from the pair count
  // so the page rounds it the same way as the README (529 of 807 = 65.6%)
  var PAIRS = MODEL.held_out.pairs, ACC = Math.round(MODEL.held_out.accuracy * PAIRS) / PAIRS, ECE = MODEL.held_out.ece;

  /* What the model makes of each feature, in one line (matches the sign
   * of the fitted weight; see results/summary.md). */
  var GLOSS = {
    log_words: "Length is the model's strongest single signal: more developed replies won more often.",
    op_overlap: "Echoing the poster's exact words predicts losing in this data; fresh wording reads stronger.",
    op_coverage: "Covering more of the poster's own points helps.",
    you_rate: "Speaking to the poster directly helps.",
    i_rate: "First-person framing helps slightly.",
    question_rate: "Asking the poster questions helps slightly.",
    example_rate: "Giving concrete examples helps slightly.",
    number_rate: "Using numbers helps.",
    hedge_rate: "Hedging slightly helps here: it reads as care rather than weakness.",
    link_count: "Linking to evidence is one of the strongest signals in the model.",
    agree_rate: "Acknowledgement markers slightly predict losing once the other features are counted; they often arrive with agreement instead of an argument.",
    mean_sent_len: "Somewhat longer sentences help slightly."
  };

  function fmtVal(key, v) {
    if (key === "op_overlap" || key === "op_coverage") return F.pct(v, 0);
    if (key === "link_count") return String(Math.round(v));
    if (key === "mean_sent_len") return v.toFixed(1);
    return v.toFixed(1);
  }
  function driverClause(c, d) {
    if (c.key === "log_words") return "Length: B " + d.wordsB + " words vs A " + d.wordsA;
    return c.label + ": B " + fmtVal(c.key, d.featuresB[c.key]) + " vs A " + fmtVal(c.key, d.featuresA[c.key]);
  }

  var state = Tool.readParams({ op: "", a: "", b: "" });
  var last = null, currentExample = null, editInfo = null, pendingEdit = null, undoSnapshot = null;

  EXAMPLES.forEach(function (ex, i) {
    var o = document.createElement("option"); o.value = i; o.textContent = ex.label; $("example").appendChild(o);
  });
  function setInputs(op, a, b) { $("op").value = op; $("draftA").value = a; $("draftB").value = b; }
  if (state.op || state.a || state.b) setInputs(state.op, state.a, state.b);
  else if (EXAMPLES.length) { var e0 = EXAMPLES[0]; setInputs(e0.op, e0.a, e0.b); currentExample = 0; $("example").value = "0"; showNote(e0); }

  function showNote(ex) {
    Tool.exampleBanner($("f-main"), ex ? "<b>" + ex.label + "</b>. " + (ex.note ? ex.note + " " : "") + "Paste your own view and drafts over it." : null);
  }
  $("example").addEventListener("change", function () {
    if (this.value === "") return;
    var ex = EXAMPLES[+this.value]; currentExample = +this.value;
    setInputs(ex.op, ex.a, ex.b); showNote(ex);
    document.querySelectorAll(".field.filled").forEach(function (f) { f.classList.remove("filled"); });
    editInfo = null; run();
  });

  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  ["op", "draftA", "draftB"].forEach(function (id) {
    $(id).addEventListener("input", debounce(function () {
      currentExample = null; $("example").value = ""; showNote(null);
      if (editInfo && $(editInfo.which === "B" ? "draftB" : "draftA").value !== editInfo.text) editInfo = null;
      run();
    }, 250));
  });

  function fieldError(id, msg) {
    var f = $(id).closest(".field"); var e = f.querySelector(".err");
    f.classList.toggle("invalid", !!msg);
    if (msg) { if (!e) { e = document.createElement("div"); e.className = "err"; f.appendChild(e); } e.textContent = msg; }
    else if (e) e.remove();
  }

  /* ---------- AI assist: suggest an edit ---------- */
  function gainsFor(winnerSide) {
    /* Where the stronger draft gains on the weaker, split into
     * "add or strengthen" (positive-weight features the weaker trails)
     * and "pull back" (negative-weight features the weaker overdoes). */
    var add = [], pull = [];
    if (!last || !last.contribs) return { add: add, pull: pull };
    var wKey = winnerSide === "B" ? "contribB" : "contribA";
    var lKey = winnerSide === "B" ? "contribA" : "contribB";
    var rawW = winnerSide === "B" ? last.featuresB : last.featuresA;
    var rawL = winnerSide === "B" ? last.featuresA : last.featuresB;
    last.contribs.forEach(function (c) {
      var gain = c[wKey] - c[lKey];
      if (gain <= 0.1) return;
      if (c.weight > 0 && rawL[c.key] < rawW[c.key]) add.push({ label: c.label, gain: gain });
      else if (c.weight < 0 && rawL[c.key] > rawW[c.key]) pull.push({ label: c.label, gain: gain });
    });
    add.sort(function (x, y) { return y.gain - x.gain; });
    pull.sort(function (x, y) { return y.gain - x.gain; });
    return { add: add.slice(0, 3), pull: pull.slice(0, 1) };
  }
  function composeBrief() {
    var op = $("op").value.trim(), a = $("draftA").value, b = $("draftB").value;
    if (!last || last.state === "invalid")
      return "Original view:\n" + (op || "(none given)") + "\n\nDraft A:\n" + a + "\n\nDraft B:\n" + b +
        "\n\nThe tool could not score these drafts yet (a draft is missing or too short).";
    var weaker = last.winner === "B" ? "A" : "B";
    var g = gainsFor(last.winner);
    var lines = [
      "Original view:", op || "(none given)", "",
      "Draft A:", a, "",
      "Draft B:", b, "",
      "The tool scored draft A at " + F.pct(1 - last.pB, 0) + " and draft B at " + F.pct(last.pB, 0) + " likely to persuade. Weaker draft: " + weaker + ".",
      "Flagged features for the weaker draft to add or strengthen: " +
        (g.add.length ? g.add.map(function (x) { return x.label; }).join("; ") : "none clear; strengthen the weakest passages directly") + "."
    ];
    if (g.pull.length) lines.push("The weaker draft also overdoes: " + g.pull[0].label + ". Pull back on that.");
    return lines.join("\n");
  }
  var assist = Tool.assist(Object.assign({}, window.ASSIST_CONFIG, {
    mount: $("assistMount"), toggle: $("assistToggle"),
    apply: function (vals) {
      var weaker = (vals.weaker === "A" || vals.weaker === "B") ? vals.weaker
        : (last ? (last.winner === "B" ? "A" : "B") : null);
      var edited = typeof vals.edited_draft === "string" ? vals.edited_draft.trim() : "";
      if (!weaker || !edited || !last || last.state === "invalid") return;
      var id = weaker === "B" ? "draftB" : "draftA";
      undoSnapshot = { id: id, text: $(id).value };
      pendingEdit = { which: weaker, before: weaker === "B" ? last.pB : 1 - last.pB };
      document.querySelectorAll(".field.filled").forEach(function (f) { f.classList.remove("filled"); });
      $(id).value = edited;
      $(id).closest(".field").classList.add("filled");
      $("undoEdit").hidden = false;
      run();
    }
  }));
  $("assistToggle").addEventListener("click", function () {
    var ta = $("assistMount").querySelector(".assist textarea");
    if (ta) ta.value = composeBrief();
  });
  $("undoEdit").addEventListener("click", function () {
    if (!undoSnapshot) return;
    $(undoSnapshot.id).value = undoSnapshot.text;
    $(undoSnapshot.id).closest(".field").classList.remove("filled");
    undoSnapshot = null; editInfo = null; $("undoEdit").hidden = true;
    run();
  });

  /* ---------- main run ---------- */
  function run() {
    var op = $("op").value, a = $("draftA").value, b = $("draftB").value;
    var total = op.length + a.length + b.length;
    if (total <= 1600) Tool.writeParams({ op: op, a: a, b: b });
    else Tool.writeParams({});
    var d = engine.decide(op, a, b);
    last = d;
    $("wcA").textContent = d.wordsA ? d.wordsA + " words" : "";
    $("wcB").textContent = d.wordsB ? d.wordsB + " words" : "";
    fieldError("draftA", d.wordsA > 0 && d.wordsA < 5 ? "Too short to judge (under 5 words)." : "");
    fieldError("draftB", d.wordsB > 0 && d.wordsB < 5 ? "Too short to judge (under 5 words)." : "");
    if (pendingEdit) {
      editInfo = { which: pendingEdit.which, before: pendingEdit.before,
                   after: pendingEdit.which === "B" ? d.pB : 1 - d.pB,
                   text: $(pendingEdit.which === "B" ? "draftB" : "draftA").value };
      pendingEdit = null;
    }
    if (d.state === "invalid") {
      $("vTitle").textContent = "Check the highlighted inputs";
      $("vBody").textContent = "Add both drafts (at least a few words each) and the tool will compare them.";
      $("verdict").className = "panel verdict v-neutral";
      $("kpis").innerHTML = ""; $("checks").innerHTML = ""; $("kpiNote").textContent = "";
      drawChart(null); renderTable(d); return;
    }
    renderVerdict(d); drawChart(d); renderTable(d);
  }

  function renderVerdict(d) {
    var W = d.winner, p = d.pLead;
    var title, cls;
    if (d.state === "clear") { title = "Draft " + W + " is more likely to persuade (" + F.pct(p, 0) + ")"; cls = "v-good"; }
    else if (d.state === "lean") { title = "Draft " + W + " leans ahead (" + F.pct(p, 0) + ")"; cls = "v-accent"; }
    else { title = "Too close to call (" + F.pct(p, 0) + " for draft " + W + ")"; cls = "v-accent"; }
    if (d.oodAny) cls = "v-warn";
    $("verdict").className = "panel verdict " + cls;
    $("vTitle").textContent = title;

    var parts = [];
    if (d.oodAny) {
      var rs = [];
      if (d.oodA.flagged) rs.push("draft A: " + d.oodA.reasons.join(", "));
      if (d.oodB.flagged) rs.push("draft B: " + d.oodB.reasons.join(", "));
      parts.push("Outside the training data (" + rs.join("; ") + "). The model learned from ChangeMyView arguments, so treat this number as a rough guess.");
    }
    if (d.state === "close") {
      parts.push("On the features the model can see, these two are nearly even." +
        (d.drivers.length ? " The largest single difference: " + driverClause(d.drivers[0], d) + "." : "") +
        " Small edits could tip it either way; the chart shows where each draft is stronger.");
    } else {
      if (d.drivers.length) {
        parts.push("What separates them: " + d.drivers.map(function (c) { return driverClause(c, d); }).join("; ") + ".");
        if (GLOSS[d.drivers[0].key]) parts.push(GLOSS[d.drivers[0].key]);
      }
      if (d.drags.length) parts.push("Working against draft " + W + ": " +
        d.drags.map(function (c) { return driverClause(c, d); }).join("; ") + ".");
      if (d.state === "lean") parts.push("A lean, not a lock: the model separates them, but narrowly.");
    }
    $("vBody").textContent = parts.join(" ");

    var pEqLead = W === "B" ? d.equalLength.pB : 1 - d.equalLength.pB;
    $("kpiNote").textContent = "Read this as a signal, not a judgment: on " + F.int(PAIRS) + " debates it never saw, the model picked the real winner " + F.pct(ACC, 1) + " of the time (a coin flip is 50%).";
    $("kpis").innerHTML = [
      [F.pct(p, 0), "chance draft " + W + " persuades", "prob"],
      [F.pct(pEqLead, 0), "at equal length", "eqlen"],
      [F.pct(ACC, 1), "model accuracy, held-out pairs", "acc"],
      ["±" + Math.round(ECE * 100) + " pts", "average calibration error", "ece"]
    ].map(function (x) { return '<div class="kpi"><span class="k-val">' + x[0] + '</span><span class="k-lbl">' + x[1] + (x[2] ? ' <button type="button" data-tip="' + x[2] + '"></button>' : "") + "</span></div>"; }).join("");

    var c = [];
    c.push(["info", "ACCURACY", "Model accuracy",
      "Right on " + F.pct(ACC, 1) + " of " + F.int(MODEL.held_out.pairs) + " held-out ChangeMyView pairs it never trained on. Chance is 50%: a real signal, not a judge."]);
    var bin = null;
    MODEL.held_out.reliability.forEach(function (b) { if (p >= b.lo && p < b.hi) bin = b; });
    if (bin) {
      /* Wilson 95% interval for the band's observed win rate */
      var wz = 1.96, wn = bin.n, wp = bin.actual_rate, wd = 1 + wz * wz / wn;
      var wc = (wp + wz * wz / (2 * wn)) / wd, wh = wz * Math.sqrt(wp * (1 - wp) / wn + wz * wz / (4 * wn * wn)) / wd;
      var wlo = Math.max(0, wc - wh), whi = Math.min(1, wc + wh);
      var inside = bin.mean_predicted >= wlo && bin.mean_predicted <= whi;
      var gapPts = Math.round((bin.mean_predicted - wp) * 100);
      c.push([inside ? "ok" : "warn", inside ? "CALIBRATED" : "OVERCONFIDENT", "Calibration in this band",
        "Drafts scored " + F.pct(bin.lo, 0) + " to " + F.pct(bin.hi, 0) + " (" + F.pct(bin.mean_predicted, 0) + " on average) won " + F.pct(wp, 0) +
        " of " + wn + " held-out pairs (" + F.pct(wlo, 0) + " to " + F.pct(whi, 0) + " once sampling noise is allowed for, a 95% interval)." +
        (inside ? (Math.abs(gapPts) >= 5 ? " The score sits inside that range, though " + Math.abs(gapPts) + " points " + (gapPts > 0 ? "above" : "below") + " the observed rate: read it as a little " + (gapPts > 0 ? "optimistic." : "cautious.") : " The score means about what it says.")
          : " The score sits outside it: in this band the model runs " + Math.abs(gapPts) + " points " + (gapPts > 0 ? "too confident." : "too cautious."))]);
    }
    var ratio = Math.max(d.wordsA, d.wordsB) / Math.max(1, Math.min(d.wordsA, d.wordsB));
    var longer = d.wordsB > d.wordsA ? "B" : "A";
    if (ratio >= 1.5) c.push(["warn", "LENGTH", "Length is doing real work",
      "Draft " + longer + " is " + ratio.toFixed(1) + "x longer, and length alone leans the score (longer replies won " +
      F.pct(MODEL.held_out.longer_draft_won_share, 0) + " of held-out pairs). Cut to the same length, the score is " + F.pct(pEqLead, 0) + " for draft " + W + "."]);
    else c.push(["info", "LENGTH", "Length is not driving this",
      "Similar lengths (" + d.wordsA + " vs " + d.wordsB + " words). The equal-length score is " + F.pct(pEqLead, 0) + " for draft " + W + "."]);
    if (d.oodAny) {
      var rr = [];
      if (d.oodA.flagged) rr.push("draft A (" + d.oodA.reasons.join(", ") + ")");
      if (d.oodB.flagged) rr.push("draft B (" + d.oodB.reasons.join(", ") + ")");
      c.push(["warn", "DOMAIN", "Outside the training data", "Flagged: " + rr.join("; ") + ". The model was trained on ChangeMyView replies to a stated view."]);
    } else c.push(["ok", "DOMAIN", "In domain", "Both drafts read like the ChangeMyView arguments the model was trained on."]);
    if (editInfo) c.push(["info", "EDIT SCORED", "The suggested edit, rescored",
      "The edit moved draft " + editInfo.which + " from " + F.pct(editInfo.before, 0) + " to " + F.pct(editInfo.after, 0) +
      " under the same model. The model did the scoring; the AI only rewrote the text."]);
    $("checks").innerHTML = c.map(function (x) {
      return '<div class="check is-' + x[0] + '"><span class="badge">' + x[1] + '</span><div><span class="c-name">' + x[2] + '.</span> <span class="c-text">' + x[3] + "</span></div></div>";
    }).join("");
    last.checksText = c;
    last.title = title; last.body = $("vBody").textContent;
  }

  /* ---------- chart: per-feature contributions, both drafts ---------- */
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function drawChart(d) {
    var host = $("contribChart"); host.innerHTML = "";
    if (!d || d.state === "invalid") { $("contribCaption").textContent = "Add both drafts to see what drives the difference."; return; }
    var rows = d.contribs.slice().sort(function (x, y) { return Math.abs(y.diff) - Math.abs(x.diff); }).slice(0, 8);
    var NS = "http://www.w3.org/2000/svg";
    var W = Math.max(300, host.clientWidth || 640), rowH = 52, top = 24;
    var H = top + rows.length * rowH + 8;
    var x0 = 6, x1 = W - 46, cx = (x0 + x1) / 2;
    var maxAbs = Math.max(0.1, Math.max.apply(null, rows.map(function (r) { return Math.max(Math.abs(r.contribA), Math.abs(r.contribB)); })));
    var X = function (v) { return cx + v / maxAbs * ((x1 - x0) / 2); };
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Feature contributions for each draft");
    function el(name, attrs, parent) { var e = document.createElementNS(NS, name); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); (parent || svg).appendChild(e); return e; }
    var cA = cssVar("--series-2", "#b3541e"), cB = cssVar("--accent", "#0b5fa5"), muted = cssVar("--muted", "#777");
    var lg = el("g", {}, svg);
    el("rect", { x: x0, y: 2, width: 10, height: 10, fill: cA }, lg);
    var t = el("text", { x: x0 + 14, y: 11 }, lg); t.textContent = "Draft A";
    el("rect", { x: x0 + 76, y: 2, width: 10, height: 10, fill: cB }, lg);
    t = el("text", { x: x0 + 90, y: 11 }, lg); t.textContent = "Draft B";
    el("line", { x1: cx, x2: cx, y1: top - 4, y2: H - 4, stroke: muted, "stroke-width": 1 }, svg);
    rows.forEach(function (r, i) {
      var y = top + i * rowH;
      var lt = el("text", { x: x0, y: y + 11, class: "title" }, svg); lt.textContent = r.label;
      [["contribA", cA, y + 17], ["contribB", cB, y + 32]].forEach(function (cfg) {
        var v = r[cfg[0]];
        if (Math.abs(v) < 0.005) return;
        var bx = Math.min(cx, X(v)), bw = Math.max(1.5, Math.abs(X(v) - cx));
        el("rect", { x: bx, y: cfg[2], width: bw, height: 13, fill: cfg[1], rx: 1 }, svg);
        var label = (v > 0 ? "+" : "−") + Math.abs(v).toFixed(2);
        var vt;
        if (bw > 52) { /* wide bar: put the value inside its outer end */
          vt = el("text", { x: v >= 0 ? X(v) - 4 : X(v) + 4, y: cfg[2] + 10, "text-anchor": v >= 0 ? "end" : "start", style: "fill:#fff;font-weight:600" }, svg);
        } else {
          vt = el("text", { x: v >= 0 ? X(v) + 4 : X(v) - 4, y: cfg[2] + 10, "text-anchor": v >= 0 ? "start" : "end" }, svg);
        }
        vt.textContent = label;
      });
    });
    host.appendChild(svg);
    $("contribCaption").textContent = "Each bar is one feature's push on a draft's score (on the log-odds scale: +0.1 raises the odds of winning by about 10%; longer bars push harder, and the probability comes from the total). Only the eight features with the biggest difference between the drafts are shown.";
  }

  /* ---------- full numbers ---------- */
  function renderTable(d) {
    var rows = MODEL.features.map(function (f) {
      var a = f.key === "log_words" ? String(d.wordsA) : fmtVal(f.key, d.featuresA[f.key]);
      var b = f.key === "log_words" ? String(d.wordsB) : fmtVal(f.key, d.featuresB[f.key]);
      return "<tr><td>" + f.label + "</td><td class=\"num\">" + a + "</td><td class=\"num\">" + b +
        "</td><td class=\"num\">" + (f.weight < 0 ? "−" : "+") + Math.abs(f.weight).toFixed(2) + "</td></tr>";
    }).join("");
    $("tFeatures").innerHTML = "<thead><tr><th>Feature</th><th class=\"num\">Draft A</th><th class=\"num\">Draft B</th><th class=\"num\">Weight</th></tr></thead><tbody>" + rows + "</tbody>";
    if (d.state !== "invalid") {
      var pEqLead = d.winner === "B" ? d.equalLength.pB : 1 - d.equalLength.pB;
      $("eqNote").textContent = "Equal length: with both drafts cut to " + d.equalLength.words + " words, draft " + d.winner +
        " scores " + F.pct(pEqLead, 0) + " (against " + F.pct(d.pLead, 0) + " at full length). Weights multiply standardized feature differences; the probability is the calibrated total. Feature meanings are in \"How the verdict is decided\".";
    } else $("eqNote").textContent = "";
  }
  (function renderStatic() {
    $("tReliability").innerHTML = "<thead><tr><th>Model said</th><th class=\"num\">Pairs</th><th class=\"num\">Mean prediction</th><th class=\"num\">Actually won</th></tr></thead><tbody>" +
      MODEL.held_out.reliability.map(function (b) {
        return "<tr><td>" + F.pct(b.lo, 0) + " to " + F.pct(b.hi, 0) + "</td><td class=\"num\">" + b.n +
          "</td><td class=\"num\">" + F.pct(b.mean_predicted, 0) + "</td><td class=\"num\">" + F.pct(b.actual_rate, 0) + "</td></tr>";
      }).join("") + "</tbody>";
  })();

  /* ---------- actions ---------- */
  $("copyLink").addEventListener("click", function () { Tool.copy(location.href, $("toast"), "Link copied: it opens with these drafts."); });
  $("copySummary").addEventListener("click", function () {
    if (!last || last.state === "invalid") { $("toast").textContent = "Add both drafts first."; return; }
    var lines = ["Which draft persuades? " + last.title, last.body, "",
      "Model: right on " + F.pct(ACC, 1) + " of " + F.int(MODEL.held_out.pairs) + " held-out ChangeMyView pairs (chance is 50%).",
      "Checks: " + (last.checksText || []).map(function (c) { return c[2]; }).join("; ") + ".", "",
      "Open with these drafts: " + location.href];
    Tool.copy(lines.join("\n"), $("toast"), "Summary copied.");
  });
  window.addEventListener("resize", debounce(function () { if (last) drawChart(last); }, 200));
  if (window.KitTheme) KitTheme.onChange(function () { setTimeout(function () { if (last) drawChart(last); }, 0); });

  Tool.explain({
    prob: { t: "Chance this draft persuades", d: "The model's probability that this draft, rather than the other, is the one that changes the reader's mind. It comes from a logistic regression on the difference between the two drafts' features, trained on pairs of real replies to the same post where only one earned a 'view changed' award (Tan et al., 2016, ChangeMyView data)." },
    eqlen: { t: "At equal length", d: "Longer replies win more often in the data, partly because they simply say more. This is the same verdict with length held equal, so you can see whether length alone is doing the work." },
    acc: { t: "Model accuracy", d: "How often the model picked the real winner on 807 pairs it never saw in training. 50% is a coin flip. Persuasion is hard to predict from text alone, so read the verdict as a signal, not a judgment." },
    ece: { t: "Calibration error", d: "Whether the probabilities can be taken at face value: when the model says 70%, does that draft win about 70% of the time? This is the average gap between stated and observed rates on held-out pairs (expected calibration error)." },
    drivers: { t: "What drives the difference", d: "Each bar is one feature's push on a draft's score, on the log-odds scale: right helps, left hurts. Log-odds add up, so the bars sum to the score; a push of +0.1 multiplies the odds of winning by about 1.1 (10% better odds), +0.7 roughly doubles them. Bars come from the trained weight × the draft's value for that feature, so you can see which habits (echoing the original wording, hedging, long sentences) moved the verdict." }
  });

  run();
})();
