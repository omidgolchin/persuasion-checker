#!/usr/bin/env python3
"""Download the Winning Arguments corpus (see DATA_SOURCES.md) and
build the paired dataset. The corpus is the authors' distribution via
ConvoKit; it is not redistributed in this repo."""

import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = "http://zissou.infosci.cornell.edu/convokit/datasets/winning-args-corpus/winning-args-corpus.zip"
ZIP = ROOT / "data" / "winning-args-corpus.zip"
RAW = ROOT / "data" / "raw"


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    if not (RAW / "winning-args-corpus" / "utterances.jsonl").exists():
        print("downloading", URL)
        urllib.request.urlretrieve(URL, ZIP)
        with zipfile.ZipFile(ZIP) as z:
            z.extractall(RAW)
    subprocess.run([sys.executable, "-m", "src.persuasion.build_pairs"],
                   cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
