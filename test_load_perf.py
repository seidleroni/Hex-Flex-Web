"""
Load/parse/compare performance harness for the Blazor HexFlex app.

Captures [PERF] console log lines emitted by:
  - Home.razor            (single-file load)
  - Compare.razor         (two-file load + compare)

Runs N iterations and reports min / p50 / p95 / max per metric, optionally
writing a JSON snapshot labelled for before/after diffing.

Usage (foreground):
    # In one shell:
    dotnet run --project blazor/HexFlex.Blazor --configuration Release

    # In another:
    uv run python test_load_perf.py --label before --iters 5
    # make changes...
    uv run python test_load_perf.py --label after  --iters 5
    uv run python test_load_perf.py --compare before after

The port defaults to 5192 (matches blazor/HexFlex.Blazor/Properties/launchSettings.json)
but can be overridden via --port.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "test_output"
TEST_FILE_A = ROOT / "test_files" / "package_complete_123.hex"
TEST_FILE_B = ROOT / "test_files" / "package_complete_v142.hex"

# Matches:   [PERF] <metric>: <ms>ms ...
PERF_RE = re.compile(r"\[PERF\]\s+([^:]+):\s+(\d+)ms")


# ---------- helpers ----------------------------------------------------------


def _parse_perf_line(text: str) -> tuple[str, int] | None:
    m = PERF_RE.search(text)
    if not m:
        return None
    name = m.group(1).strip()
    ms = int(m.group(2))
    return name, ms


def _stats(values: list[int]) -> dict[str, float]:
    if not values:
        return {"n": 0}
    vs = sorted(values)
    return {
        "n": len(vs),
        "min": vs[0],
        "p50": statistics.median(vs),
        "p95": vs[min(len(vs) - 1, int(len(vs) * 0.95))],
        "max": vs[-1],
        "mean": statistics.fmean(vs),
    }


# ---------- single-file load (Home) -----------------------------------------


def run_home_iteration(page, url: str, hex_path: Path) -> dict[str, list[int]]:
    """Navigate to /, upload file, collect [PERF] lines until memory view renders."""
    captured: list[tuple[str, int]] = []

    def on_console(msg):
        parsed = _parse_perf_line(msg.text)
        if parsed:
            captured.append(parsed)

    page.on("console", on_console)
    try:
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector(".upload-zone", timeout=60000)
        page.wait_for_timeout(200)

        with page.expect_file_chooser(timeout=15000) as fc:
            page.click(".upload-zone")
        fc.value.set_files(str(hex_path))

        # Wait until hex rows appear (memory view rendered)
        page.wait_for_selector("[data-testid='data-row']", timeout=120000)
        page.wait_for_timeout(300)
    finally:
        page.remove_listener("console", on_console)

    grouped: dict[str, list[int]] = {}
    for name, ms in captured:
        grouped.setdefault(name, []).append(ms)
    return grouped


# ---------- two-file compare --------------------------------------------------


def run_compare_iteration(
    page, url: str, file_a: Path, file_b: Path
) -> dict[str, list[int]]:
    captured: list[tuple[str, int]] = []

    def on_console(msg):
        parsed = _parse_perf_line(msg.text)
        if parsed:
            captured.append(parsed)

    page.on("console", on_console)
    try:
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector(".upload-zone", timeout=60000)
        page.wait_for_timeout(200)

        # Upload File A (first upload zone)
        with page.expect_file_chooser(timeout=15000) as fc:
            page.locator(".upload-zone").nth(0).click()
        fc.value.set_files(str(file_a))

        # Wait for File A info card to appear
        page.wait_for_selector(".file-info-card", timeout=60000)
        page.wait_for_timeout(200)

        # Now only one upload-zone remains (for B)
        with page.expect_file_chooser(timeout=15000) as fc:
            page.locator(".upload-zone").nth(0).click()
        fc.value.set_files(str(file_b))

        # Wait for comparison viewer to render
        page.wait_for_selector(".hex-viewer", timeout=120000)
        page.wait_for_timeout(300)
    finally:
        page.remove_listener("console", on_console)

    grouped: dict[str, list[int]] = {}
    for name, ms in captured:
        grouped.setdefault(name, []).append(ms)
    return grouped


# ---------- driver ------------------------------------------------------------


def merge_iterations(iters: list[dict[str, list[int]]]) -> dict[str, list[int]]:
    merged: dict[str, list[int]] = {}
    for it in iters:
        for name, values in it.items():
            # If a single iteration produced multiple samples for the same
            # metric (e.g. two Compare.ParseFile.Parse() calls in a compare run),
            # take the mean so each iteration contributes one data point.
            sample = int(round(statistics.fmean(values)))
            merged.setdefault(name, []).append(sample)
    return merged


def run(args) -> dict[str, Any]:
    url_home = f"http://localhost:{args.port}/"
    url_compare = f"http://localhost:{args.port}/compare"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})

        home_iters: list[dict[str, list[int]]] = []
        compare_iters: list[dict[str, list[int]]] = []

        # Home (single file) iterations
        print(f"\n--- Home / single-file load x {args.iters} ---")
        for i in range(args.iters):
            page = context.new_page()
            try:
                result = run_home_iteration(page, url_home, TEST_FILE_A)
                home_iters.append(result)
                print(
                    f"  iter {i + 1}: "
                    + ", ".join(f"{k}={v[0]}ms" for k, v in result.items())
                )
            except Exception as e:
                print(f"  iter {i + 1} FAILED: {e}")
            finally:
                page.close()

        # Compare (two file) iterations
        print(f"\n--- Compare / two-file load + compare x {args.iters} ---")
        for i in range(args.iters):
            page = context.new_page()
            try:
                result = run_compare_iteration(page, url_compare, TEST_FILE_A, TEST_FILE_B)
                compare_iters.append(result)
                top = {k: v for k, v in result.items() if not k.startswith("Compare.ParseFile")}
                print(
                    f"  iter {i + 1}: "
                    + ", ".join(f"{k}={v}" for k, v in top.items())
                )
            except Exception as e:
                print(f"  iter {i + 1} FAILED: {e}")
            finally:
                page.close()

        browser.close()

    home_merged = merge_iterations(home_iters)
    compare_merged = merge_iterations(compare_iters)

    return {
        "label": args.label,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "iters": args.iters,
        "home": {k: _stats(v) for k, v in home_merged.items()},
        "compare": {k: _stats(v) for k, v in compare_merged.items()},
        "_raw_home": home_merged,
        "_raw_compare": compare_merged,
    }


def pretty_print(results: dict[str, Any]) -> None:
    print("\n" + "=" * 72)
    print(f"LOAD PERF RESULTS   label={results['label']!r}   iters={results['iters']}")
    print("=" * 72)

    def _dump(section: str, data: dict[str, dict]) -> None:
        if not data:
            return
        print(f"\n[{section}]")
        name_w = max(len(k) for k in data)
        print(f"  {'metric'.ljust(name_w)}  {'min':>6}  {'p50':>6}  {'p95':>6}  {'max':>6}  n")
        for k in sorted(data):
            s = data[k]
            if s.get("n", 0) == 0:
                print(f"  {k.ljust(name_w)}   (no data)")
                continue
            print(
                f"  {k.ljust(name_w)}  "
                f"{int(s['min']):>6}  {int(s['p50']):>6}  {int(s['p95']):>6}  {int(s['max']):>6}  {s['n']}"
            )

    _dump("home (single-file)", results["home"])
    _dump("compare (two-file)", results["compare"])


def diff_two(before: dict[str, Any], after: dict[str, Any]) -> None:
    print("\n" + "=" * 72)
    print(f"DELTA   before={before['label']!r}   after={after['label']!r}")
    print("=" * 72)

    for section in ("home", "compare"):
        b = before.get(section, {}) or {}
        a = after.get(section, {}) or {}
        keys = sorted(set(b) | set(a))
        if not keys:
            continue
        print(f"\n[{section}]  p50 ms   before → after   delta    ratio")
        name_w = max(len(k) for k in keys)
        for k in keys:
            bp = b.get(k, {}).get("p50")
            ap = a.get(k, {}).get("p50")
            if bp is None or ap is None:
                continue
            delta = ap - bp
            ratio = (ap / bp) if bp else float("inf")
            arrow = "↓" if delta < 0 else ("↑" if delta > 0 else "·")
            print(
                f"  {k.ljust(name_w)}   {int(bp):>5}  →  {int(ap):>5}   "
                f"{delta:+5d}ms   x{ratio:.2f} {arrow}"
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5192)
    parser.add_argument("--iters", type=int, default=3)
    parser.add_argument("--label", default="run")
    parser.add_argument(
        "--compare",
        nargs=2,
        metavar=("BEFORE_LABEL", "AFTER_LABEL"),
        help="Compare two previously-saved results files, do not run anything",
    )
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(exist_ok=True)

    if args.compare:
        before_path = OUTPUT_DIR / f"load_perf_{args.compare[0]}.json"
        after_path = OUTPUT_DIR / f"load_perf_{args.compare[1]}.json"
        if not before_path.exists() or not after_path.exists():
            print(f"Missing: {before_path if not before_path.exists() else after_path}")
            return 2
        before = json.loads(before_path.read_text())
        after = json.loads(after_path.read_text())
        pretty_print(before)
        pretty_print(after)
        diff_two(before, after)
        return 0

    results = run(args)
    pretty_print(results)

    out = OUTPUT_DIR / f"load_perf_{args.label}.json"
    out.write_text(json.dumps(results, indent=2))
    print(f"\nSaved: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
