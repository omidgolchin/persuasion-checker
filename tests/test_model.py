"""The frozen split and the reported numbers (spec): the split the
results came from is recomputed from the pair data and must match the
frozen plan exactly, and the accuracy in docs/data/model.json must
recompute from the stored per-pair held-out predictions.

These need the corpus pair file (data/pairs.jsonl), which is not
redistributed; they skip cleanly where it is absent (CI) and run where
the data was downloaded (the build machine; see RELEASE_CHECK.md).
"""
import json
from pathlib import Path

import numpy as np
import pytest

from persuasion.score import prob_b_beats_a
from persuasion.train import SEED, in_calibration, op_text

ROOT = Path(__file__).resolve().parent.parent
PAIRS = ROOT / "data" / "pairs.jsonl"

pytestmark = pytest.mark.skipif(not PAIRS.exists(),
                                reason="corpus pair file not present (not redistributed)")

PLAN = {"fit": 2772, "calib": 684, "test": 807}


def read_pairs():
    return [json.loads(l) for l in PAIRS.read_text().splitlines() if l.strip()]


def assign(p):
    if p["train_flag"] == 0:
        return "test"
    return "calib" if in_calibration(p["conv_id"]) else "fit"


def test_split_is_the_frozen_one():
    pairs = read_pairs()
    assert len(pairs) == 4263
    counts = {}
    for p in pairs:
        counts[assign(p)] = counts.get(assign(p), 0) + 1
    assert counts == PLAN
    # pair ids unique, and no conversation straddles the authors' flag
    assert len({p["pair_id"] for p in pairs}) == len(pairs)
    by_conv = {}
    for p in pairs:
        side = "holdout" if p["train_flag"] == 0 else "train_side"
        assert by_conv.setdefault(p["conv_id"], side) == side


def test_reported_accuracy_recomputes_from_predictions():
    model = json.loads((ROOT / "docs" / "data" / "model.json").read_text())
    preds = [json.loads(l) for l in (ROOT / "results" / "test_predictions.jsonl").read_text().splitlines()]
    assert len(preds) == model["held_out"]["pairs"] == PLAN["test"]
    hits = sum(1 for r in preds if (r["p_first"] >= 0.5) == bool(r["first_won"]))
    assert abs(hits / len(preds) - model["held_out"]["accuracy"]) < 0.001

    # ECE recomputed exactly as train.py bins it: ten equal-width bins
    # over p_first, weighted by bin share.
    ece = 0.0
    for i in range(10):
        lo = i / 10
        sel = [r for r in preds if lo <= r["p_first"] < lo + 0.1 or (i == 9 and r["p_first"] == 1.0)]
        if not sel:
            continue
        mean_pred = sum(r["p_first"] for r in sel) / len(sel)
        actual = sum(r["first_won"] for r in sel) / len(sel)
        ece += len(sel) / len(preds) * abs(mean_pred - actual)
    assert abs(ece - model["held_out"]["ece"]) < 0.002


def test_score_py_matches_stored_predictions():
    pairs = {p["pair_id"]: p for p in read_pairs()}
    preds = [json.loads(l) for l in (ROOT / "results" / "test_predictions.jsonl").read_text().splitlines()]
    # Rebuild the randomized display orientation exactly as train.py
    # made it (same seed, one draw per held-out pair, file order).
    test_pairs = [p for p in read_pairs() if p["train_flag"] == 0]
    rng = np.random.default_rng(SEED)
    flips = {p["pair_id"]: bool(rng.integers(0, 2)) for p in test_pairs}
    by_id = {r["pair_id"]: r for r in preds}
    for p in test_pairs[:8]:
        flip = flips[p["pair_id"]]
        first, other = (p["loser"], p["winner"]) if flip else (p["winner"], p["loser"])
        assert by_id[p["pair_id"]]["first_won"] == int(not flip)
        # score.py returns P(second text persuades); the stored file
        # holds P(first-listed text won), hence the complement.
        got = prob_b_beats_a(op_text(p), first, other)
        assert abs(got - (1 - by_id[p["pair_id"]]["p_first"])) <= 0.01
