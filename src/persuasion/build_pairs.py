"""Build the paired dataset from the ConvoKit Winning Arguments corpus.

A pair is one original post (title + body) and the two top-level comments
the corpus authors paired: one from a thread that earned the poster's
delta, one from a matched thread that did not. The draft kept for each
side is the top-level comment text only.

Reads:  data/raw/winning-args-corpus/{utterances.jsonl,conversations.json}
Writes: data/pairs.jsonl, data/pairs_summary.json

Exclusions (PLAN.md): either comment empty, "[deleted]" / "[removed]",
or under 5 tokens.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "winning-args-corpus"
OUT = ROOT / "data" / "pairs.jsonl"
SUMMARY = ROOT / "data" / "pairs_summary.json"
TOK = re.compile(r"[a-z0-9]+")


def main() -> None:
    convs = json.loads((RAW / "conversations.json").read_text())
    by_pair: dict[str, list[dict]] = defaultdict(list)
    conv_of: dict[str, str] = {}
    for line in (RAW / "utterances.jsonl").open():
        u = json.loads(line)
        conv_of[u["id"]] = u["root"]
        for pid in (u.get("meta") or {}).get("pair_ids") or []:
            by_pair[pid].append(u)

    pairs, skipped = [], {"bad_text": 0, "bad_shape": 0}
    for pid in sorted(by_pair, key=lambda p: int(p.split("_")[1])):
        us = by_pair[pid]
        conv_id = conv_of[us[0]["id"]]
        roots = {1: [], 0: []}
        for u in us:
            if u.get("reply-to") == conv_id:
                s = (u.get("meta") or {}).get("success")
                if s in roots:
                    roots[s].append(u)
        if len(roots[1]) != 1 or len(roots[0]) != 1:
            skipped["bad_shape"] += 1
            continue
        winner, loser = roots[1][0]["text"], roots[0][0]["text"]
        def unusable(t: str) -> bool:
            t = t.strip()
            return t in ("", "[deleted]", "[removed]") or len(TOK.findall(t.lower())) < 5
        if unusable(winner) or unusable(loser):
            skipped["bad_text"] += 1
            continue
        conv = convs[conv_id]
        pairs.append({
            "pair_id": pid,
            "conv_id": conv_id,
            "train_flag": conv["train"],
            "op_title": conv["op-title"],
            "op_body": conv["op-text-body"],
            "winner": winner,
            "loser": loser,
        })

    with OUT.open("w") as f:
        for p in pairs:
            f.write(json.dumps(p) + "\n")
    summary = {
        "pairs_total_in_corpus": len(by_pair),
        "pairs_kept": len(pairs),
        "skipped": skipped,
        "pairs_train_flag_1": sum(1 for p in pairs if p["train_flag"] == 1),
        "pairs_train_flag_0": sum(1 for p in pairs if p["train_flag"] == 0),
        "conversations": len(convs),
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
