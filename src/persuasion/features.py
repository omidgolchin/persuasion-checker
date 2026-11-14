"""Interpretable text features for one draft, given the original post.

This module is the reference implementation. docs/persuasion.js mirrors
it exactly, reading the same feature_config.json (which train.py embeds
into the shipped model file), and tests/test_features.py checks the two
agree on fixtures.

Feature order is fixed: FEATURES. Everything is a plain function of the
two texts; nothing is learned here.
"""

import json
import math
import re
from pathlib import Path

CONFIG = json.loads((Path(__file__).parent / "feature_config.json").read_text())
TOK = re.compile(CONFIG["token_pattern"])
STOP = set(CONFIG["stopwords"])
YOU = set(CONFIG["you_words"])
FIRST = set(CONFIG["i_words"])
HEDGE = set(CONFIG["hedge_words"])
EXAMPLE_PHRASES = CONFIG["example_phrases"]
AGREE_PHRASES = CONFIG["agree_phrases"]
PROMO_WORDS = CONFIG["promo_words"]
LEGAL_WORDS = CONFIG["legal_words"]

FEATURES = [
    "log_words", "op_overlap", "op_coverage", "you_rate", "i_rate",
    "question_rate", "example_rate", "number_rate", "hedge_rate",
    "link_count", "agree_rate", "mean_sent_len",
]

# Plain-language labels and one-line meanings, used by the page and README.
FEATURE_INFO = {
    "log_words": ("Length", "How long the draft is. Longer drafts win more often, up to a point."),
    "op_overlap": ("Uses the poster's own words", "Share of the draft's distinct content words that also appear in the original post."),
    "op_coverage": ("Covers the poster's points", "Share of the original post's distinct content words that the draft takes up."),
    "you_rate": ("Speaks to the poster directly", "Second-person words (you, your) per 100 words."),
    "i_rate": ("First-person framing", "First-person words (I, we, my) per 100 words."),
    "question_rate": ("Asks questions", "Question marks per 100 words."),
    "example_rate": ("Gives examples", "Example phrases (for example, such as) per 100 words."),
    "number_rate": ("Uses numbers", "Tokens containing a digit, per 100 words."),
    "hedge_rate": ("Hedges", "Hedge words (maybe, perhaps, might) per 100 words."),
    "link_count": ("Links to evidence", "URLs or markdown links in the draft, capped at 3."),
    "agree_rate": ("Acknowledges the poster", "Agreement and thanks markers (good point, thanks) per 100 words."),
    "mean_sent_len": ("Sentence length", "Average words per sentence."),
}


def tokens(text: str) -> list[str]:
    return TOK.findall(text.lower())


def _content_set(text: str) -> set[str]:
    return {t for t in tokens(text) if t not in STOP}


def _phrase_count(low_text: str, phrases: list[str]) -> int:
    return sum(low_text.count(p) for p in phrases)


def extract(op_text: str, draft_text: str) -> dict[str, float]:
    """All features for one draft. op_text may be "" (no original post)."""
    dtok = tokens(draft_text)
    n = len(dtok)
    low = draft_text.lower()
    if n == 0:
        return {k: 0.0 for k in FEATURES}
    dset, oset = _content_set(draft_text), _content_set(op_text)
    inter = len(dset & oset)
    per100 = 100.0 / n
    sentences = [s for s in re.split(r"[.!?]+", draft_text) if TOK.search(s)]
    return {
        "log_words": math.log(1 + n),
        "op_overlap": inter / len(dset) if dset else 0.0,
        "op_coverage": inter / len(oset) if oset else 0.0,
        "you_rate": per100 * sum(1 for t in dtok if t in YOU),
        "i_rate": per100 * sum(1 for t in dtok if t in FIRST),
        "question_rate": per100 * draft_text.count("?"),
        "example_rate": per100 * _phrase_count(low, EXAMPLE_PHRASES),
        "number_rate": per100 * sum(1 for t in dtok if any(c.isdigit() for c in t)),
        "hedge_rate": per100 * sum(1 for t in dtok if t in HEDGE),
        "link_count": float(min(3, low.count("http") + low.count("]("))),
        "agree_rate": per100 * _phrase_count(low, AGREE_PHRASES),
        "mean_sent_len": n / max(1, len(sentences)),
    }


def vector(op_text: str, draft_text: str) -> list[float]:
    f = extract(op_text, draft_text)
    return [f[k] for k in FEATURES]


def ood_signals(op_text: str, draft_text: str) -> dict:
    """Heuristic out-of-domain signals for one draft (see decide logic).

    Returns word count and how many marketing / legal marker phrases the
    draft contains. The page combines these with the feature-distance
    signal computed from the model's stored training statistics.
    """
    low = draft_text.lower()
    return {
        "words": len(tokens(draft_text)),
        "promo_hits": _phrase_count(low, PROMO_WORDS),
        "legal_hits": _phrase_count(low, LEGAL_WORDS),
    }
