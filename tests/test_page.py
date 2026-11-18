"""Page-level check: the rendered verdict, not just the engine.

Runs scripts/page_check.js, which renders docs/index.html in a headless
Chromium and asserts the "What the model rewards" line names the weaker
draft for the default pair, follows the pair when the drafts swap
sides, hides for a pair too short to score, and stays put while the
visitor types (debounce). Skips when node or a headless Chromium is
unavailable locally — but in CI a browser is expected (GitHub runners
ship Chrome), so there a missing browser or node FAILS the test
instead of silently protecting nothing.
"""
import os
import shutil
import subprocess

import pytest

ROOT = os.path.join(os.path.dirname(__file__), "..")
SCRIPT = os.path.join(ROOT, "scripts", "page_check.js")


def _in_ci():
    return os.environ.get("CI", "").strip().lower() in ("true", "1", "yes")


def _skip_or_fail(reason):
    if _in_ci():
        pytest.fail(reason + " (CI=true: the page check must run in CI)")
    pytest.skip(reason)


def test_verdict_move_line_renders():
    node = shutil.which("node")
    if not node:
        _skip_or_fail("node not available")
    r = subprocess.run([node, SCRIPT], capture_output=True, text=True, timeout=600)
    if r.returncode == 3:  # the script's own "no browser" signal
        _skip_or_fail(r.stdout.strip() or "no headless Chromium available")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "All page checks passed." in r.stdout
