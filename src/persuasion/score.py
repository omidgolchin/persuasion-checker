"""Score a pair of drafts with the shipped model file.

This mirrors docs/persuasion.js exactly (same features, same arithmetic,
reading docs/data/model.json), so the tests can check the browser's
numbers against Python's. It does not use the trained scikit-learn
object: the model file is the model.
"""

import json
import math
from pathlib import Path

from .features import FEATURES, extract

MODEL = json.loads((Path(__file__).resolve().parents[2] / "docs" / "data" / "model.json").read_text())


def _z(op: str, draft: str) -> list[float]:
    f = extract(op, draft)
    return [(f[k] - m) / s for k, m, s in
            zip(FEATURES, MODEL["standardize"]["mean"], MODEL["standardize"]["std"])]


def prob_b_beats_a(op: str, draft_a: str, draft_b: str) -> float:
    """Calibrated probability that draft B persuades and draft A does not."""
    za, zb = _z(op, draft_a), _z(op, draft_b)
    logit = MODEL["platt"]["b"] + MODEL["platt"]["a"] * sum(
        f["weight"] * (b - a) for f, a, b in zip(MODEL["features"], za, zb))
    return 1.0 / (1.0 + math.exp(-logit))
