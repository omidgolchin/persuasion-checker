"""Feature parity: the browser extractor (docs/persuasion.js) and the
Python extractor the model was trained with (src/persuasion/features.py)
must produce identical features, or the page would score a different
model than the one that was validated. Fixtures are the shipped page
examples plus edge strings; everything here runs without the corpus.
"""
import json
import subprocess
from pathlib import Path

import pytest

from persuasion import features

ROOT = Path(__file__).resolve().parent.parent

EDGE = [
    ("", "Too short."),
    ("CMV: Cats are great.", ""),
    ("Numbers and links", "Sales rose 42% in 2023, see https://example.com/a and www.example.org. Really? Yes! Maybe you should read it, I think; for example, 3 studies agree."),
    ("one two three", "Short. Very short. Fragments everywhere. OK?"),
]


def fixtures():
    ex = json.loads((ROOT / "docs" / "data" / "examples.json").read_text())
    items = [{"op": e["op"], "text": t} for e in ex for t in (e["a"], e["b"])]
    items += [{"op": op, "text": t} for op, t in EDGE]
    return items


def js_extract(items):
    code = (
        "const fs=require('fs');"
        "const P=require(process.argv[1]+'/docs/persuasion.js');"
        "const model=JSON.parse(fs.readFileSync(process.argv[1]+'/docs/data/model.json','utf8'));"
        "const e=P.create(model);let s='';"
        "process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const items=JSON.parse(s);"
        "console.log(JSON.stringify(items.map(it=>({f:e.extract(it.op,it.text),words:e.tokens(it.text).length}))));});"
    )
    proc = subprocess.run(
        ["node", "-e", code, str(ROOT)], input=json.dumps(items),
        capture_output=True, text=True, cwd=ROOT)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_js_features_match_python():
    items = fixtures()
    js = js_extract(items)
    for it, got in zip(items, js):
        want = features.extract(it["op"], it["text"])
        for k in features.FEATURES:
            assert abs(got["f"][k] - want[k]) < 1e-9, (k, it["text"][:40], got["f"][k], want[k])


def test_word_counts_match():
    items = fixtures()
    js = js_extract(items)
    for it, got in zip(items, js):
        assert got["words"] == len(features.tokens(it["text"]))
