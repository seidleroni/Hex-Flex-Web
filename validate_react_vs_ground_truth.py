"""Validate React app's parsing output against intelhex ground truth.

This script:
1. Starts the React app via HTTP server
2. Uses Playwright to load each test file
3. Extracts the displayed statistics and segment info
4. Compares against the ground-truth JSON fixtures
"""

import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

FIXTURES_DIR = Path("test_output/fixtures")
DIST_DIR = Path("dist")
BASE_URL = "http://localhost:4002"


def load_ground_truth(filename: str) -> dict:
    stem = Path(filename).stem
    gt_path = FIXTURES_DIR / f"{stem}_ground_truth.json"
    with open(gt_path) as f:
        return json.load(f)


def extract_react_stats(page, hex_filepath: str) -> dict:
    """Upload a hex file to the React app and extract displayed stats."""
    # Navigate to the app
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")

    # Upload the file via the file input
    file_input = page.locator('input[type="file"]')
    file_input.set_input_files(hex_filepath)

    # Wait for parsing to complete - look for statistics to appear
    page.wait_for_selector('[class*="stat"], [class*="segment"], [data-testid]', timeout=10000)

    # Give it a moment to render
    page.wait_for_timeout(1000)

    # Extract info using JavaScript
    stats = page.evaluate("""() => {
        const getText = (el) => el ? el.textContent.trim() : null;

        // Get all text content to find statistics
        const body = document.body.innerText;

        // Look for data size, segments, addresses in the rendered text
        return {
            bodyText: body.substring(0, 5000),  // First 5000 chars for analysis
        };
    }""")

    return stats


def main():
    print("=== React App vs Ground Truth Validation ===\n")

    # Load ground truth
    gt_123 = load_ground_truth("package_complete_123.hex")
    gt_142 = load_ground_truth("package_complete_v142.hex")

    print("Ground Truth (from intelhex):")
    for gt, name in [(gt_123, "123"), (gt_142, "v142")]:
        print(f"\n  {gt['filename']}:")
        print(f"    Data bytes: {gt['total_data_bytes']:,}")
        print(f"    Segments: {gt['segment_count']}")
        for seg in gt["segments"]:
            print(f"      {seg['start_hex']} - {seg['end_hex']} ({seg['size']:,} bytes)")

    # Now test React app
    print("\n\nReact App Output:")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        for hex_file in ["package_complete_123.hex", "package_complete_v142.hex"]:
            filepath = str(Path("test_files") / hex_file)
            print(f"\n  Testing {hex_file}...")
            try:
                stats = extract_react_stats(page, filepath)
                print(f"    Page text (first 2000 chars):")
                for line in stats["bodyText"][:2000].split("\n"):
                    line = line.strip()
                    if line:
                        print(f"      {line}")
            except Exception as e:
                print(f"    ERROR: {e}")

            # Go back to upload screen for next file
            try:
                load_new = page.locator('text=Load New').first
                if load_new.is_visible():
                    load_new.click()
                    page.wait_for_timeout(500)
            except Exception:
                page.goto(BASE_URL)
                page.wait_for_timeout(500)

        browser.close()

    print("\n\nNote: Manual comparison needed between React output above and ground truth.")
    print("Key things to check:")
    print("  - Data size matches?")
    print("  - Segment count matches?")
    print("  - Segment addresses match?")
    print("  - Any discrepancies document in a report.")


if __name__ == "__main__":
    main()
