# Results summary — the paired persuasion model

Question and method are frozen in PLAN.md. Numbers below are as
computed by `python -m src.persuasion.train`; nothing was tuned
after seeing the held-out numbers.

- Pairs: 4263 kept of 4,263 in the corpus (0 exclusions).
- Split (authors' conversation-level flag): 2772 fit pairs,
  684 calibration pairs, 807 held-out test pairs.
- **Held-out paired accuracy: 65.6%** (chance is 50%).
- Expected calibration error on held-out pairs: 0.035.
- Descriptive only: on held-out pairs the longer draft won 59.7% of the time.

## Weights (standardized feature differences, winner minus loser)

| Feature | Weight |
|---|---|
| Length | +0.466 |
| Uses the poster's own words | -0.437 |
| Covers the poster's points | +0.060 |
| Speaks to the poster directly | +0.044 |
| First-person framing | +0.043 |
| Asks questions | +0.019 |
| Gives examples | +0.023 |
| Uses numbers | +0.068 |
| Hedges | +0.035 |
| Links to evidence | +0.191 |
| Acknowledges the poster | -0.067 |
| Sentence length | +0.072 |

## Reliability on held-out pairs

| Predicted | n | Mean predicted | Actual win rate |
|---|---|---|---|
| 0.0–0.1 | 6 | 0.09 | 0.17 |
| 0.1–0.2 | 52 | 0.16 | 0.19 |
| 0.2–0.3 | 80 | 0.25 | 0.30 |
| 0.3–0.4 | 124 | 0.36 | 0.34 |
| 0.4–0.5 | 127 | 0.45 | 0.44 |
| 0.5–0.6 | 150 | 0.55 | 0.61 |
| 0.6–0.7 | 134 | 0.65 | 0.62 |
| 0.7–0.8 | 92 | 0.74 | 0.73 |
| 0.8–0.9 | 38 | 0.84 | 0.74 |
| 0.9–1.0 | 4 | 0.93 | 0.75 |

Figures: results/figures/reliability.png, results/figures/weights.png.
Per-pair held-out predictions: results/test_predictions.jsonl.
