/* Which Draft Persuades?: the scoring engine. No DOM.
 *
 * Mirrors src/persuasion/features.py and src/persuasion/score.py exactly;
 * tests/test_features.py and tests/test_scoring.py check the agreement.
 * The model (weights, word lists, training statistics) is passed in from
 * docs/data/model.json, so this file holds no numbers of its own.
 *
 *   var engine = Persuasion.create(model);
 *   engine.decide(opText, draftA, draftB) -> verdict object
 */
(function (global) {
  "use strict";

  function create(model) {
    var cfg = model.feature_config;
    var TOK = new RegExp(cfg.token_pattern, "g");
    var STOP = new Set(cfg.stopwords), YOU = new Set(cfg.you_words),
        FIRST = new Set(cfg.i_words), HEDGE = new Set(cfg.hedge_words);
    var KEYS = model.features.map(function (f) { return f.key; });
    var MEAN = model.standardize.mean, STD = model.standardize.std;

    function tokens(text) { return String(text).toLowerCase().match(TOK) || []; }
    function phraseCount(low, phrases) {
      var n = 0;
      phrases.forEach(function (p) { n += low.split(p).length - 1; });
      return n;
    }
    function contentSet(text) {
      var s = new Set();
      tokens(text).forEach(function (t) { if (!STOP.has(t)) s.add(t); });
      return s;
    }

    function extract(op, draft) {
      var dtok = tokens(draft), n = dtok.length, low = String(draft).toLowerCase();
      var out = {};
      if (n === 0) { KEYS.forEach(function (k) { out[k] = 0; }); return out; }
      var dset = contentSet(draft), oset = contentSet(op), inter = 0;
      dset.forEach(function (t) { if (oset.has(t)) inter++; });
      var per100 = 100 / n, count = function (set) {
        var c = 0; dtok.forEach(function (t) { if (set.has(t)) c++; }); return c;
      };
      var sentences = String(draft).split(/[.!?]+/).filter(function (s) { return /[a-z0-9]/.test(s); }).length;
      out.log_words = Math.log(1 + n);
      out.op_overlap = dset.size ? inter / dset.size : 0;
      out.op_coverage = oset.size ? inter / oset.size : 0;
      out.you_rate = per100 * count(YOU);
      out.i_rate = per100 * count(FIRST);
      out.question_rate = per100 * (String(draft).split("?").length - 1);
      out.example_rate = per100 * phraseCount(low, cfg.example_phrases);
      out.number_rate = per100 * dtok.filter(function (t) { return /\d/.test(t); }).length;
      out.hedge_rate = per100 * count(HEDGE);
      out.link_count = Math.min(3, (low.split("http").length - 1) + (low.split("](").length - 1));
      out.agree_rate = per100 * phraseCount(low, cfg.agree_phrases);
      out.mean_sent_len = n / Math.max(1, sentences);
      return out;
    }

    function zvec(op, draft) {
      var f = extract(op, draft);
      return KEYS.map(function (k, i) { return (f[k] - MEAN[i]) / STD[i]; });
    }
    function probFromZ(za, zb) {
      var s = 0;
      model.features.forEach(function (f, i) { s += f.weight * (zb[i] - za[i]); });
      var logit = model.platt.b + model.platt.a * s;
      return 1 / (1 + Math.exp(-logit));
    }
    function score(op, a, b) { return probFromZ(zvec(op, a), zvec(op, b)); }

    function truncateToWords(text, n) {
      var re = new RegExp(cfg.token_pattern, "gi"), m, count = 0;
      while ((m = re.exec(String(text))) !== null) {
        count++;
        if (count === n) return String(text).slice(0, re.lastIndex);
      }
      return String(text);
    }
    function equalLength(op, a, b) {
      var wa = tokens(a).length, wb = tokens(b).length;
      if (wa === wb) return { pB: score(op, a, b), words: wa };
      if (wa > wb) return { pB: score(op, truncateToWords(a, wb), b), words: wb };
      return { pB: score(op, a, truncateToWords(b, wa)), words: wa };
    }

    function ood(op, draft) {
      var low = String(draft).toLowerCase();
      var words = tokens(draft).length;
      var z = zvec(op, draft);
      var meanAbsZ = z.reduce(function (s, v) { return s + Math.abs(v); }, 0) / z.length;
      var promo = phraseCount(low, cfg.promo_words), legal = phraseCount(low, cfg.legal_words);
      var reasons = [];
      if (words > 0 && words < 30) reasons.push("very short (" + words + " words)");
      if (promo > 0) reasons.push("reads like marketing copy");
      if (legal >= 2) reasons.push("reads like legal text");
      if (meanAbsZ > model.ood.mean_abs_z_threshold) reasons.push("unlike ChangeMyView comments in style");
      return { words: words, promoHits: promo, legalHits: legal, meanAbsZ: meanAbsZ,
               flagged: reasons.length > 0, reasons: reasons };
    }

    function decide(op, a, b) {
      var fa = extract(op, a), fb = extract(op, b);
      var wordsA = tokens(a).length, wordsB = tokens(b).length;
      var base = { wordsA: wordsA, wordsB: wordsB, featuresA: fa, featuresB: fb,
                   accuracy: model.held_out.accuracy, heldOutPairs: model.held_out.pairs };
      if (wordsA < 5 || wordsB < 5) return Object.assign(base, { state: "invalid" });
      var za = zvec(op, a), zb = zvec(op, b);
      var contribs = model.features.map(function (f, i) {
        return { key: f.key, label: f.label, weight: f.weight,
                 contribA: f.weight * za[i], contribB: f.weight * zb[i],
                 diff: f.weight * (zb[i] - za[i]) };
      });
      var pB = probFromZ(za, zb);
      var winner = pB >= 0.5 ? "B" : "A", pLead = Math.max(pB, 1 - pB);
      var state = pLead >= 0.65 ? "clear" : pLead >= 0.55 ? "lean" : "close";
      var sign = winner === "B" ? 1 : -1;
      var toward = contribs.filter(function (c) { return c.diff * sign > 0.02; })
        .sort(function (x, y) { return y.diff * sign - x.diff * sign; });
      var against = contribs.filter(function (c) { return c.diff * sign < -0.02; })
        .sort(function (x, y) { return x.diff * sign - y.diff * sign; });
      var eq = equalLength(op, a, b);
      var oodA = ood(op, a), oodB = ood(op, b);
      return Object.assign(base, {
        state: state, pB: pB, winner: winner, pLead: pLead, contribs: contribs,
        drivers: toward.slice(0, 3), drags: against.slice(0, 2),
        equalLength: eq, oodA: oodA, oodB: oodB, oodAny: oodA.flagged || oodB.flagged
      });
    }

    return { extract: extract, zvec: zvec, score: score, decide: decide,
             equalLength: equalLength, ood: ood, truncateToWords: truncateToWords,
             tokens: tokens };
  }

  var api = { create: create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.Persuasion = api;
})(typeof window !== "undefined" ? window : globalThis);
