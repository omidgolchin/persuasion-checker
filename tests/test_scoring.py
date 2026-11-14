"""Scoring parity on ten fixed pairs (spec): the browser engine's
probabilities equal the Python scoring mirror's, which applies the
shipped model.json. Six pairs are the shipped page examples (real
ChangeMyView pairs; their reference probabilities below were recorded
when the model was trained and the examples verified); four are short
fixed synthetic pairs kept here.
"""
import json
import subprocess
from pathlib import Path

from persuasion.score import prob_b_beats_a

ROOT = Path(__file__).resolve().parent.parent

# Reference P(draft B persuades) for the shipped examples, recorded at
# build time from the frozen model. Any drift beyond rounding fails.
EXPECTED_PB = {
    "p_3590": 0.843,
    "p_3519": 0.874,
    "p_3478": 0.635,
    "p_3491": 0.500,
    "short-synthetic": 0.615,
    "marketing-synthetic": 0.467,
}

SYNTHETIC = [
    ("CMV: Homework should be banned in primary school.",
     "Homework is bad because kids hate it and it takes time they could spend playing.",
     "You mention stress, and that is the strongest part of your case. But short practice works: ten minutes a day measurably improves retention, and 3 studies found no link between light homework and anxiety."),
    ("CMV: Tipping should be abolished.",
     "Tipping is just how it works, servers would quit without it.",
     "On paying staff properly we agree. But where base wages rose and tips stayed, server income rose about 12% and turnover fell, for example in Seattle."),
    ("No original view at all.",
     "Short one.",
     "A substantially longer reply that speaks to you directly, asks a question, gives an example, cites 2 numbers, and links https://example.com for evidence."),
    ("CMV: The voting age should be 16.",
     "Teens are immature and would vote for memes, it is obvious.",
     "Maturity is fair to ask about. Austria lowered the age in 2007 and 16 year olds turned out at higher rates than older first-time voters. Which matters more to you, turnout or age?"),
]


def pairs():
    ex = json.loads((ROOT / "docs" / "data" / "examples.json").read_text())
    real = [(e["op"], e["a"], e["b"]) for e in ex]
    return real + SYNTHETIC


def js_probs(ps):
    code = (
        "const fs=require('fs');"
        "const P=require(process.argv[1]+'/docs/persuasion.js');"
        "const model=JSON.parse(fs.readFileSync(process.argv[1]+'/docs/data/model.json','utf8'));"
        "const e=P.create(model);let s='';"
        "process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const ps=JSON.parse(s);"
        "console.log(JSON.stringify(ps.map(p=>e.score(p[0],p[1],p[2]))));});"
    )
    proc = subprocess.run(
        ["node", "-e", code, str(ROOT)], input=json.dumps(ps),
        capture_output=True, text=True, cwd=ROOT)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_ten_fixed_pairs_browser_equals_python():
    ps = pairs()
    assert len(ps) == 10
    js = js_probs(ps)
    for (op, a, b), got in zip(ps, js):
        want = prob_b_beats_a(op, a, b)
        assert abs(got - want) < 1e-9, (op[:40], got, want)
        assert 0.0 < got < 1.0


def test_shipped_examples_match_reference_probabilities():
    """The probabilities recorded when the examples were verified still
    match what the engine produces now (guards silent drift)."""
    ex = json.loads((ROOT / "docs" / "data" / "examples.json").read_text())
    js = js_probs([(e["op"], e["a"], e["b"]) for e in ex])
    for e, got in zip(ex, js):
        assert abs(got - EXPECTED_PB[e["id"]]) < 0.002, (e["id"], got, EXPECTED_PB[e["id"]])
