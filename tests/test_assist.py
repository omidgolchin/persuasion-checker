"""The AI assist's plumbing: prompt, reply parsing, quote checks, test set.

The model itself is scored separately by scripts/eval_assist.js (needs
an API key); these tests need none. Adapted from the sibling tools'
test to this tool's generative assist: the model's third field is a
rewrite, so its quote points at the weaker draft's opening words
inside the brief (the rewrite cannot be quoted from the input), and
edited_draft carries no expected value in the testset by design, so
the eval's field accuracy is read on weaker and features_to_add.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not available")


def _node(js: str):
    proc = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=60, cwd=ROOT)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_prompt_lists_every_field_and_the_text():
    out = _node(
        "const T=require('./docs/tool-common.js'),C=require('./docs/assist-config.js');"
        "const p=T._buildPrompt(C,'BRIEF TEXT');"
        "console.log(JSON.stringify({p, keys:C.fields.map(f=>f.key)}))")
    assert out["keys"] == ["weaker", "features_to_add", "edited_draft"]
    for k in out["keys"]:
        assert '"%s"' % k in out["p"]
    assert "BRIEF TEXT" in out["p"]
    assert "do not compute results" in out["p"].lower()


def _section_opening(text, letter):
    marker = "Draft " + letter + ":\n"
    start = text.index(marker) + len(marker)
    return " ".join(text[start:].split()[:4])


def _reply_for(item):
    exp = item["expected"]
    return json.dumps({
        "fields": {
            "weaker": {"value": exp["weaker"], "quote": "Weaker draft: " + exp["weaker"]},
            "features_to_add": {"value": exp["features_to_add"], "quote": "Flagged features"},
            "edited_draft": {"value": "A rewritten version of the weaker draft, for plumbing tests.",
                             "quote": _section_opening(item["text"], exp["weaker"])},
        },
        "questions": [],
    })


def test_reply_parsing_quotes_and_coercion():
    items = json.loads((ROOT / "assist" / "testset.json").read_text())
    payload = [{"text": it["text"], "raw": _reply_for(it)} for it in items[:5]]
    out = _node(
        "const T=require('./docs/tool-common.js'),C=require('./docs/assist-config.js');"
        "const items=" + json.dumps(payload) + ";"
        "const out=items.map(it=>{const r=T._parseReply(it.raw);const o={};"
        "for(const f of C.fields){const v=T._coerce(f,r.fields[f.key].value);"
        "o[f.key]={v, q:T._quoteFound(it.text, r.fields[f.key].quote),"
        "bad:T._quoteFound('an unrelated text', r.fields[f.key].quote)};}"
        "return o;});"
        "console.log(JSON.stringify(out))")
    for item, got in zip(items[:5], out):
        exp = item["expected"]
        assert got["weaker"] == {"v": exp["weaker"], "q": True, "bad": False}
        assert got["features_to_add"]["v"] == exp["features_to_add"]
        assert got["features_to_add"]["q"] and not got["features_to_add"]["bad"]
        assert got["edited_draft"]["q"] and not got["edited_draft"]["bad"]


def test_bad_reply_raises():
    proc = subprocess.run([NODE, "-e", "require('./docs/tool-common.js')._parseReply('no json here')"],
                          capture_output=True, text=True, cwd=ROOT)
    assert proc.returncode != 0


def test_testset_shape():
    keys = set(_node("console.log(JSON.stringify(require('./docs/assist-config.js').fields.map(f=>f.key)))"))
    labels = {f["label"] for f in json.loads(
        (ROOT / "docs" / "data" / "model.json").read_text())["features"]}
    items = json.loads((ROOT / "assist" / "testset.json").read_text())
    assert len(items) == 20
    assert len({r["id"] for r in items}) == len(items)
    weaker_sides = set()
    for r in items:
        assert set(r["expected"]) <= keys, r["id"]
        # The 1,000-char budget is the sibling tools' fixture rule, kept
        # here so briefs stay reviewable. (The page composes longer
        # briefs from full drafts; see DECISIONS.md.)
        assert len(r["text"]) <= 1000
        assert r["expected"]["weaker"] in ("A", "B")
        weaker_sides.add(r["expected"]["weaker"])
        assert set(r["expected"]["features_to_add"]) <= labels
        # the brief carries the expected answers in its own text
        assert "Weaker draft: " + r["expected"]["weaker"] in r["text"]
        for lab in r["expected"]["features_to_add"]:
            assert lab in r["text"]
    assert weaker_sides == {"A", "B"}
