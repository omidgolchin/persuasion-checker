"""Train the paired persuasion model exactly as frozen in PLAN.md.

Pipeline: pairs -> features -> standardize (fit subset) -> logistic
regression on feature differences (no intercept, symmetric rows) ->
Platt calibration on the calibration subset -> one evaluation pass on
the authors' held-out conversations.

Outputs:
  docs/data/model.json          everything the page needs to score
  results/model_metrics.json    the same numbers, for the record
  results/test_predictions.jsonl  per-pair held-out predictions
  results/reliability.csv       predicted-probability bins vs outcomes
  results/figures/*.png         reliability diagram, feature weights
  results/summary.md            the study write-up (numbers as computed)
"""

import hashlib
import json
from pathlib import Path

import matplotlib
import numpy as np
from sklearn.linear_model import LogisticRegression

from .features import FEATURES, FEATURE_INFO, extract, vector

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PAIRS = ROOT / "data" / "pairs.jsonl"
SEED = 20261114


def op_text(p: dict) -> str:
    return (p["op_title"] + "\n\n" + p["op_body"]).strip()


def in_calibration(conv_id: str) -> bool:
    return int(hashlib.sha1(conv_id.encode()).hexdigest(), 16) % 5 == 0


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + float(np.exp(-x)))


def main() -> None:
    pairs = [json.loads(l) for l in PAIRS.open()]
    for p in pairs:
        op = op_text(p)
        p["_zw_raw"] = vector(op, p["winner"])
        p["_zl_raw"] = vector(op, p["loser"])

    fit = [p for p in pairs if p["train_flag"] == 1 and not in_calibration(p["conv_id"])]
    calib = [p for p in pairs if p["train_flag"] == 1 and in_calibration(p["conv_id"])]
    test = [p for p in pairs if p["train_flag"] == 0]

    # Standardize on the fit subset's single drafts (both sides).
    draft_feats = np.array([p["_zw_raw"] for p in fit] + [p["_zl_raw"] for p in fit])
    mean, std = draft_feats.mean(axis=0), draft_feats.std(axis=0)
    std = np.maximum(std, 1e-6)

    def z(raw) -> np.ndarray:
        return (np.array(raw) - mean) / std

    for p in pairs:
        p["_dw"] = z(p["_zw_raw"]) - z(p["_zl_raw"])  # winner minus loser

    X, y = [], []
    for p in fit:
        X.append(p["_dw"]); y.append(1)
        X.append(-p["_dw"]); y.append(0)
    clf = LogisticRegression(C=1.0, fit_intercept=False, max_iter=1000)
    clf.fit(np.array(X), np.array(y))
    w = clf.coef_[0]

    # Platt calibration on the calibration subset (both orientations).
    sc = np.array([float(w @ p["_dw"]) for p in calib])
    Xc = np.concatenate([sc, -sc]).reshape(-1, 1)
    yc = np.array([1] * len(sc) + [0] * len(sc))
    platt = LogisticRegression(C=1e6, max_iter=1000).fit(Xc, yc)
    pa, pb = float(platt.coef_[0][0]), float(platt.intercept_[0])

    def p_winner(p: dict) -> float:
        return sigmoid(pa * float(w @ p["_dw"]) + pb)

    # Held-out evaluation, once. Randomized display orientation for the
    # reliability table so bins contain both outcomes.
    rng = np.random.default_rng(SEED)
    rows, correct = [], 0
    for p in test:
        pw = p_winner(p)
        correct += pw > 0.5
        flip = bool(rng.integers(0, 2))
        rows.append({
            "pair_id": p["pair_id"], "conv_id": p["conv_id"], "split": "test",
            "p_winner": round(pw, 6),
            "p_first": round(1.0 - pw if flip else pw, 6),
            "first_won": int(not flip),
        })
    acc = correct / len(test)

    bins = []
    for lo in np.arange(0.0, 1.0, 0.1):
        sel = [r for r in rows if lo <= r["p_first"] < lo + 0.1 or (lo == 0.9 and r["p_first"] == 1.0)]
        if not sel:
            continue
        bins.append({
            "lo": round(float(lo), 1), "hi": round(float(lo) + 0.1, 1), "n": len(sel),
            "mean_predicted": round(float(np.mean([r["p_first"] for r in sel])), 4),
            "actual_rate": round(float(np.mean([r["first_won"] for r in sel])), 4),
        })
    ece = float(sum(b["n"] for b in bins) and
                sum(b["n"] * abs(b["mean_predicted"] - b["actual_rate"]) for b in bins) / len(rows))

    # Out-of-domain distance threshold: 95th percentile, over development
    # drafts, of the mean absolute z across features.
    dev = fit + calib
    dists = []
    for p in dev:
        for raw in (p["_zw_raw"], p["_zl_raw"]):
            dists.append(float(np.mean(np.abs(z(raw)))))
    ood_threshold = float(np.percentile(dists, 95))

    longer_won = float(np.mean([p["_zw_raw"][0] > p["_zl_raw"][0] for p in test]))

    metrics = {
        "split": {
            "rule": "authors' conversation-level train flag; calibration = dev conversations with sha1(conv_id) % 5 == 0",
            "fit_pairs": len(fit), "calibration_pairs": len(calib), "test_pairs": len(test),
        },
        "weights": {k: round(float(v), 6) for k, v in zip(FEATURES, w)},
        "platt": {"a": pa, "b": pb},
        "held_out": {"pairs": len(test), "accuracy": round(acc, 4), "ece": round(ece, 4),
                     "reliability": bins},
        "descriptive": {"longer_draft_won_share_test": round(longer_won, 4)},
        "ood": {"mean_abs_z_threshold_p95_dev": ood_threshold},
    }
    (ROOT / "results" / "model_metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    with (ROOT / "results" / "test_predictions.jsonl").open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    with (ROOT / "results" / "reliability.csv").open("w") as f:
        f.write("bin_lo,bin_hi,n,mean_predicted,actual_rate\n")
        for b in bins:
            f.write(f"{b['lo']},{b['hi']},{b['n']},{b['mean_predicted']},{b['actual_rate']}\n")

    config = json.loads((Path(__file__).parent / "feature_config.json").read_text())
    model = {
        "version": 1,
        "trained": "2026-11-14",
        "features": [{"key": k, "label": FEATURE_INFO[k][0], "meaning": FEATURE_INFO[k][1],
                      "weight": round(float(v), 6)} for k, v in zip(FEATURES, w)],
        "feature_config": config,
        "standardize": {"mean": [round(float(v), 6) for v in mean],
                        "std": [round(float(v), 6) for v in std]},
        "platt": {"a": round(pa, 6), "b": round(pb, 6)},
        "held_out": dict(metrics["held_out"],
                         longer_draft_won_share=metrics["descriptive"]["longer_draft_won_share_test"]),
        "ood": {"mean_abs_z_threshold": round(ood_threshold, 4)},
    }
    (ROOT / "docs" / "data" / "model.json").write_text(json.dumps(model, indent=1) + "\n")
    # The page loads the same numbers as a script (no fetch, so the tool
    # also works from file://), the way the sibling tools embed their
    # result tables. model.json stays the canonical copy.
    (ROOT / "docs" / "model-data.js").write_text(
        "/* Generated by src/persuasion/train.py from docs/data/model.json. Do not edit. */\n"
        "window.PERSUADE_MODEL = " + json.dumps(model) + ";\n")

    # Figures
    fig, ax = plt.subplots(figsize=(4.6, 4.2))
    ax.plot([0, 1], [0, 1], "--", color="#888", lw=1)
    ax.plot([b["mean_predicted"] for b in bins], [b["actual_rate"] for b in bins], "o-", color="#0b5fa5")
    ax.set_xlabel("mean predicted probability")
    ax.set_ylabel("actual win rate")
    ax.set_title("Held-out reliability (807 pairs)")
    fig.tight_layout(); fig.savefig(ROOT / "results" / "figures" / "reliability.png", dpi=150); plt.close(fig)

    order = np.argsort(w)
    fig, ax = plt.subplots(figsize=(5.2, 4.4))
    ax.barh([FEATURE_INFO[FEATURES[i]][0] for i in order], [w[i] for i in order], color="#0b5fa5")
    ax.set_xlabel("logistic weight on standardized feature difference")
    ax.set_title("What the model leans on")
    fig.tight_layout(); fig.savefig(ROOT / "results" / "figures" / "weights.png", dpi=150); plt.close(fig)

    pct = lambda x: f"{100 * x:.1f}%"  # noqa: E731
    lines = [
        "# Results summary — the paired persuasion model",
        "",
        "Question and method are frozen in PLAN.md. Numbers below are as",
        "computed by `python -m src.persuasion.train`; nothing was tuned",
        "after seeing the held-out numbers.",
        "",
        f"- Pairs: {len(pairs)} kept of 4,263 in the corpus (0 exclusions).",
        f"- Split (authors' conversation-level flag): {len(fit)} fit pairs,",
        f"  {len(calib)} calibration pairs, {len(test)} held-out test pairs.",
        f"- **Held-out paired accuracy: {pct(acc)}** (chance is 50%).",
        f"- Expected calibration error on held-out pairs: {ece:.3f}.",
        f"- Descriptive only: on held-out pairs the longer draft won {pct(longer_won)} of the time.",
        "",
        "## Weights (standardized feature differences, winner minus loser)",
        "",
        "| Feature | Weight |",
        "|---|---|",
    ] + [f"| {FEATURE_INFO[k][0]} | {v:+.3f} |" for k, v in zip(FEATURES, w)] + [
        "",
        "## Reliability on held-out pairs",
        "",
        "| Predicted | n | Mean predicted | Actual win rate |",
        "|---|---|---|---|",
    ] + [f"| {b['lo']:.1f}–{b['hi']:.1f} | {b['n']} | {b['mean_predicted']:.2f} | {b['actual_rate']:.2f} |" for b in bins] + [
        "",
        "Figures: results/figures/reliability.png, results/figures/weights.png.",
        "Per-pair held-out predictions: results/test_predictions.jsonl.",
    ]
    (ROOT / "results" / "summary.md").write_text("\n".join(lines) + "\n")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
