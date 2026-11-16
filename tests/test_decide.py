"""Verdict states and the length control (spec): every verdict state
is reached, the equal-length comparison moves the length example the
way the page claims, and the out-of-domain examples flag.

The expected states were verified against the frozen model when the
examples were built (see scripts/build_examples.py); they are pinned
here so any drift fails loudly.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# id -> (state, winner or None at a coin flip, P(B), out-of-domain?)
EXPECTED = {
    "p_3801": ("clear", "B", 0.781, False),
    "p_3519": ("clear", "B", 0.874, False),
    "p_3478": ("lean", "B", 0.635, False),
    "p_3491": ("close", None, 0.500, False),
    "short-synthetic": ("lean", "B", 0.615, True),
    "marketing-synthetic": ("close", "A", 0.467, True),
}


def decide(cases):
    code = (
        "const fs=require('fs');"
        "const P=require(process.argv[1]+'/docs/persuasion.js');"
        "const model=JSON.parse(fs.readFileSync(process.argv[1]+'/docs/data/model.json','utf8'));"
        "const e=P.create(model);let s='';"
        "process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const cs=JSON.parse(s);"
        "console.log(JSON.stringify(cs.map(c=>e.decide(c[0],c[1],c[2]))));});"
    )
    proc = subprocess.run(
        ["node", "-e", code, str(ROOT)], input=json.dumps(cases),
        capture_output=True, text=True, cwd=ROOT)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def examples():
    return json.loads((ROOT / "docs" / "data" / "examples.json").read_text())


def test_every_example_lands_in_its_verified_state():
    ex = examples()
    out = decide([(e["op"], e["a"], e["b"]) for e in ex])
    for e, d in zip(ex, out):
        state, winner, pb, ood = EXPECTED[e["id"]]
        assert d["state"] == state, (e["id"], d["state"], state)
        if winner is not None:
            assert d["winner"] == winner, (e["id"], d["winner"], winner)
        assert abs(d["pB"] - pb) < 0.002, (e["id"], d["pB"], pb)
        assert d["oodAny"] == ood, (e["id"], "ood")


def test_all_states_reached():
    assert {"clear", "lean", "close"} <= {v[0] for v in EXPECTED.values()}
    out = decide([("", "", "text here now please"), ("op", "real words in this draft", "")])
    assert all(d["state"] == "invalid" for d in out)


def test_length_control_on_the_length_example():
    ex = {e["id"]: e for e in examples()}["p_3478"]
    (d,) = decide([(ex["op"], ex["a"], ex["b"])])
    assert d["pB"] > 0.55                       # B leans ahead at full length
    assert d["equalLength"]["pB"] < 0.45        # and falls behind cut to A's length (0.395)
    assert d["equalLength"]["words"] == d["wordsA"]


def test_length_control_constructed_pair():
    base = ("You make a fair point about cost. But the numbers tell a calmer story: "
            "in trials the change saved about 12% and complaints fell.")
    longer = base + (" Another trial the next year found the same pattern again, "
                     "with savings holding steady across every site they measured.")
    (d,) = decide([("CMV: The policy should change.", base, longer)])
    assert d["pB"] > d["equalLength"]["pB"]    # extra length earns score
    assert abs(d["equalLength"]["pB"] - 0.5) < 0.02  # identical at equal length


def test_out_of_domain_examples_flag():
    ex = {e["id"]: e for e in examples()}
    out = decide([(ex[k]["op"], ex[k]["a"], ex[k]["b"]) for k in ("short-synthetic", "marketing-synthetic")])
    assert all(d["oodAny"] for d in out)
    in_domain = ex["p_3519"]
    (d,) = decide([(in_domain["op"], in_domain["a"], in_domain["b"])])
    assert not d["oodAny"]
