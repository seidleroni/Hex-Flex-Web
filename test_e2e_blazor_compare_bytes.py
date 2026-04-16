"""
Byte-level correctness check for the Compare view. Loads both test files into
/compare and — for sample addresses from the fixture — asserts that the bytes
rendered in the DOM match the expected values.

This specifically validates the pipeline rewritten by the MemoryComparer
single-pass + fused-PackVirtualRows work: packed VrAddressBytes / VrFlags /
diffTypes / bytesA / bytesB arrays that get sent to the JS viewer.

Fixture semantics (from generate_fixtures.py):
  sample_modified: {address, value_a, value_b}   — comparison shows value_b
  sample_added:    {address, value}              — comparison shows value (B)
  sample_removed:  {address, value}              — comparison shows value (A)

Comparison viewer DOM (wwwroot/js/comparisonHexViewer.js):
  <div data-testid="data-row" data-address="HHHHHHHH">
    <span class="hex-byte" data-addr="HHHHHHHH">XX</span>...
"""

import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BLAZOR_URL = os.environ.get("BLAZOR_URL", "http://localhost:5192")
TEST_FILES_DIR = Path(__file__).parent / "test_files"
FIXTURE_PATH = Path(__file__).parent / "test_output" / "fixtures" / "comparison_ground_truth.json"

WASM_TIMEOUT = 60000
PAGE_TIMEOUT = 15000

# How many samples to check per diff-type bucket.
SAMPLES_PER_BUCKET = 4


def navigate_to_compare(page):
    page.goto(BLAZOR_URL + "/compare")
    page.wait_for_selector(".compare-upload-grid", timeout=WASM_TIMEOUT)


def upload_both_files(page, name_a, name_b):
    file_inputs = page.locator("input[type='file']")
    assert file_inputs.count() == 2, f"Expected 2 file inputs, got {file_inputs.count()}"
    file_inputs.nth(0).set_input_files(str(TEST_FILES_DIR / name_a))
    # Wait for FileInfoCard to appear — confirms A parsed
    page.wait_for_selector(".file-info-card", timeout=WASM_TIMEOUT)

    # After A uploads, the file-input locator points at B's input (A's slot
    # now shows the FileInfoCard). Re-query to grab the remaining input.
    file_inputs = page.locator("input[type='file']")
    file_inputs.first.set_input_files(str(TEST_FILES_DIR / name_b))

    # Wait for comparison view and at least one data row
    page.wait_for_selector(".comparison-view", timeout=WASM_TIMEOUT)
    page.wait_for_selector("[data-testid='data-row']", timeout=PAGE_TIMEOUT)


def goto_address(page, address):
    """Call the JS hook directly — the Compare view has no built-in search box."""
    # Find the viewer's scroll element id (GUID-based)
    scroll_id = page.evaluate(
        "document.querySelector('.hex-viewer-scroll').id"
    )
    page.evaluate(
        "(args) => hexFlexComparisonHexViewer.goToAddress(args.id, args.addr)",
        {"id": scroll_id, "addr": address},
    )
    # Allow a tick for the scroll + re-render
    page.wait_for_timeout(150)


def read_byte_at(page, address):
    """Read the text content of the hex cell for the given address.
    Returns a 2-char hex string (e.g. '39') or None if the cell isn't in the DOM."""
    addr_hex = f"{address:08X}"
    cell = page.locator(f"span.hex-byte[data-addr='{addr_hex}']").first
    if cell.count() == 0:
        return None
    text = cell.text_content()
    return text.strip() if text else None


def check_sample(page, address, expected_byte, label, results):
    goto_address(page, address)
    actual = read_byte_at(page, address)
    expected_hex = f"{expected_byte:02X}"
    ok = actual == expected_hex
    tag = "OK" if ok else "FAIL"
    print(f"  [{label}] 0x{address:08X}: expected {expected_hex}, got {actual} — {tag}")
    results.append((label, address, expected_hex, actual, ok))


def main():
    print("=" * 60)
    print("Hex Flex Blazor — Compare view byte assertions")
    print("=" * 60)

    if not FIXTURE_PATH.exists():
        print(f"Missing fixture: {FIXTURE_PATH}")
        print("Run: uv run python generate_fixtures.py")
        sys.exit(2)

    fixture = json.loads(FIXTURE_PATH.read_text())
    print(f"Fixture: A={fixture['file_a']}, B={fixture['file_b']}")
    print(f"  total_addresses={fixture['total_addresses']} "
          f"modified={fixture['modified']} added={fixture['added']} removed={fixture['removed']}")

    # Pick samples from each bucket; space them out rather than taking the first N
    def pick(samples, n):
        if not samples:
            return []
        step = max(1, len(samples) // n)
        return [samples[i * step] for i in range(n) if i * step < len(samples)]

    modified_samples = pick(fixture["sample_modified"], SAMPLES_PER_BUCKET)
    added_samples = pick(fixture["sample_added"], SAMPLES_PER_BUCKET)
    removed_samples = pick(fixture["sample_removed"], SAMPLES_PER_BUCKET)

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        print("\n--- Loading /compare and uploading both files ---")
        navigate_to_compare(page)
        upload_both_files(page, fixture["file_a"], fixture["file_b"])
        n_rows = page.locator("[data-testid='data-row']").count()
        print(f"  Compare view ready; data rows visible: {n_rows}")

        print("\n--- Modified samples (expect value_b) ---")
        for s in modified_samples:
            check_sample(page, s["address"], s["value_b"], "modified", results)

        print("\n--- Added samples (expect value) ---")
        for s in added_samples:
            check_sample(page, s["address"], s["value"], "added", results)

        print("\n--- Removed samples (expect value) ---")
        for s in removed_samples:
            check_sample(page, s["address"], s["value"], "removed", results)

        browser.close()

    passed = sum(1 for r in results if r[4])
    failed = len(results) - passed
    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed out of {len(results)} checks")
    print("=" * 60)
    if failed:
        for label, addr, exp, got, ok in results:
            if not ok:
                print(f"  FAIL [{label}] 0x{addr:08X}: expected {exp}, got {got}")
        sys.exit(1)


if __name__ == "__main__":
    main()
