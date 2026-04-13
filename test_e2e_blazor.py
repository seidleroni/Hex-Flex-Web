"""
Phase 2 E2E tests for Blazor Hex Flex app.
Tests: layout, tab switching, file upload, file info display (validated against ground truth).
"""

import json
import os
import re
import sys
import subprocess
import time
import signal
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

# Config
BLAZOR_URL = "http://localhost:5050"
TEST_FILES_DIR = Path(__file__).parent / "test_files"
FIXTURES_DIR = Path(__file__).parent / "test_output" / "fixtures"
SCREENSHOT_DIR = Path(__file__).parent / "test_output" / "blazor_screenshots"

# Ground truth from intelhex
GROUND_TRUTH = {}

def load_ground_truth():
    for name in ["package_complete_123", "package_complete_v142"]:
        path = FIXTURES_DIR / f"{name}_ground_truth.json"
        with open(path) as f:
            GROUND_TRUTH[name] = json.load(f)

def setup():
    """Clean screenshot dir, load ground truth."""
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    for f in SCREENSHOT_DIR.iterdir():
        f.unlink()
    load_ground_truth()

def screenshot(page, name):
    path = SCREENSHOT_DIR / f"{name}.png"
    page.screenshot(path=str(path))
    print(f"  Screenshot: {path}")

def test_layout(page):
    """Test that the app shell renders: header, footer, view switcher."""
    print("\n=== Test: Layout ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".app-header", timeout=30000)

    # Header elements
    header = page.locator(".app-header")
    expect(header).to_be_visible()
    expect(page.locator(".header-title")).to_have_text("Hex Flex")

    # View switcher buttons
    view_btn = page.locator(".view-switcher button", has_text="View")
    compare_btn = page.locator(".view-switcher button", has_text="Compare")
    expect(view_btn).to_be_visible()
    expect(compare_btn).to_be_visible()

    # Footer
    footer = page.locator(".app-footer")
    expect(footer).to_be_visible()
    expect(footer).to_contain_text("Jon Seidmann")
    expect(footer).to_contain_text("MIT Licensed")

    # Upload zone visible on home page
    upload_zone = page.locator(".upload-zone")
    expect(upload_zone).to_be_visible()

    screenshot(page, "01_layout")
    print("  PASS: Layout renders correctly")

def test_tab_switching(page):
    """Test View/Compare tab switching."""
    print("\n=== Test: Tab Switching ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".app-header", timeout=30000)

    # Initially on View tab
    view_btn = page.locator(".view-switcher button", has_text="View")
    compare_btn = page.locator(".view-switcher button", has_text="Compare")
    expect(view_btn).to_have_class(re.compile("active"))
    expect(page.locator(".upload-heading")).to_have_text("Intel HEX File Viewer")

    # Click Compare
    compare_btn.click()
    page.wait_for_url("**/compare")
    expect(compare_btn).to_have_class(re.compile("active"))
    expect(page.locator(".upload-heading")).to_have_text("Compare Intel HEX Files")
    screenshot(page, "02_compare_tab")

    # Click back to View
    view_btn.click()
    page.wait_for_url(BLAZOR_URL + "/")
    expect(view_btn).to_have_class(re.compile("active"))
    expect(page.locator(".upload-heading")).to_have_text("Intel HEX File Viewer")
    screenshot(page, "03_view_tab")

    print("  PASS: Tab switching works")

def test_file_upload_view(page):
    """Test file upload in View mode and validate file info against ground truth."""
    print("\n=== Test: File Upload (View) ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    hex_file = TEST_FILES_DIR / "package_complete_123.hex"
    gt = GROUND_TRUTH["package_complete_123"]

    # Upload via the hidden input
    page.locator("input[type='file']").set_input_files(str(hex_file))

    # Wait for file info card
    page.wait_for_selector(".file-info-card", timeout=30000)
    screenshot(page, "04_file_loaded")

    # Validate filename
    filename_el = page.locator(".file-info-header .filename")
    expect(filename_el).to_contain_text("package_complete_123.hex")

    # Validate stats
    stat_values = page.locator(".stat-value").all_text_contents()
    print(f"  Stat values displayed: {stat_values}")

    # Start address
    assert stat_values[0].strip() == gt["min_address_hex"], \
        f"Start address mismatch: {stat_values[0]} != {gt['min_address_hex']}"

    # Data size - compare numeric value
    data_size_text = stat_values[1].strip()
    gt_size = gt["total_data_bytes"]
    # Parse displayed size back to bytes for comparison
    displayed_bytes = parse_data_size(data_size_text)
    # Allow 1% tolerance for rounding
    assert abs(displayed_bytes - gt_size) < gt_size * 0.01, \
        f"Data size mismatch: displayed={data_size_text} ({displayed_bytes}B) vs ground_truth={gt_size}B"

    # Segment count
    assert stat_values[2].strip() == str(gt["segment_count"]), \
        f"Segment count mismatch: {stat_values[2]} != {gt['segment_count']}"

    print(f"  Start Address: {stat_values[0]} (expected {gt['min_address_hex']})")
    print(f"  Data Size: {data_size_text} (expected ~{gt_size} bytes)")
    print(f"  Segments: {stat_values[2]} (expected {gt['segment_count']})")
    print("  PASS: File info matches ground truth")

def test_file_upload_second_file(page):
    """Test uploading the second test file to validate it too."""
    print("\n=== Test: Second File Upload (View) ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    hex_file = TEST_FILES_DIR / "package_complete_v142.hex"
    gt = GROUND_TRUTH["package_complete_v142"]

    page.locator("input[type='file']").set_input_files(str(hex_file))
    page.wait_for_selector(".file-info-card", timeout=30000)
    screenshot(page, "05_file_v142_loaded")

    stat_values = page.locator(".stat-value").all_text_contents()

    assert stat_values[0].strip() == gt["min_address_hex"], \
        f"Start address mismatch: {stat_values[0]} != {gt['min_address_hex']}"
    assert stat_values[2].strip() == str(gt["segment_count"]), \
        f"Segment count mismatch: {stat_values[2]} != {gt['segment_count']}"

    displayed_bytes = parse_data_size(stat_values[1].strip())
    gt_size = gt["total_data_bytes"]
    assert abs(displayed_bytes - gt_size) < gt_size * 0.01, \
        f"Data size mismatch: {displayed_bytes} vs {gt_size}"

    print(f"  Start Address: {stat_values[0]} (expected {gt['min_address_hex']})")
    print(f"  Data Size: {stat_values[1]} (expected ~{gt_size} bytes)")
    print(f"  Segments: {stat_values[2]} (expected {gt['segment_count']})")
    print("  PASS: Second file matches ground truth")

def test_load_new_button(page):
    """Test that Load New returns to upload screen."""
    print("\n=== Test: Load New Button ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    hex_file = TEST_FILES_DIR / "package_complete_123.hex"
    page.locator("input[type='file']").set_input_files(str(hex_file))
    page.wait_for_selector(".file-info-card", timeout=30000)

    # Click Load New
    page.locator(".btn-load-new").click()

    # Should return to upload screen
    page.wait_for_selector(".upload-zone", timeout=10000)
    expect(page.locator(".upload-zone")).to_be_visible()
    screenshot(page, "06_load_new")

    print("  PASS: Load New returns to upload screen")

def test_compare_file_upload(page):
    """Test uploading files in Compare mode."""
    print("\n=== Test: Compare File Upload ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".app-header", timeout=30000)

    # Switch to Compare
    page.locator(".view-switcher button", has_text="Compare").click()
    page.wait_for_url("**/compare")
    page.wait_for_selector(".compare-upload-grid", timeout=10000)

    # Initially should have 2 file inputs
    file_inputs = page.locator("input[type='file']").all()
    assert len(file_inputs) == 2, f"Expected 2 file inputs in compare mode, got {len(file_inputs)}"

    file_a = TEST_FILES_DIR / "package_complete_123.hex"
    file_b = TEST_FILES_DIR / "package_complete_v142.hex"

    # Upload File A (first input)
    file_inputs[0].set_input_files(str(file_a))
    page.wait_for_selector(".file-info-card", timeout=30000)
    screenshot(page, "07_compare_file_a")

    # After File A loads, only one file input remains (for File B)
    remaining_input = page.locator("input[type='file']")
    remaining_input.set_input_files(str(file_b))
    # Wait for second card
    page.locator(".file-info-card").nth(1).wait_for(timeout=30000)
    screenshot(page, "08_compare_both_files")

    # Verify both cards visible
    cards = page.locator(".file-info-card").all()
    assert len(cards) == 2, f"Expected 2 file info cards, got {len(cards)}"

    print("  PASS: Both files load in compare mode")

def test_error_on_invalid_file(page):
    """Test that an invalid file shows an error message."""
    print("\n=== Test: Invalid File Error ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    # Create a temporary invalid file
    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.hex', delete=False) as f:
        f.write("This is not a valid hex file\n")
        invalid_path = f.name

    try:
        page.locator("input[type='file']").set_input_files(invalid_path)
        page.wait_for_selector(".error-alert", timeout=10000)
        expect(page.locator(".error-alert")).to_be_visible()
        screenshot(page, "09_error_invalid_file")
        print("  PASS: Error displayed for invalid file")
    finally:
        os.unlink(invalid_path)

def parse_data_size(text):
    """Parse a human-readable data size back to bytes."""
    text = text.strip()
    if text.endswith(" MB"):
        return float(text[:-3]) * 1024 * 1024
    elif text.endswith(" KB"):
        return float(text[:-3]) * 1024
    elif text.endswith(" B"):
        return float(text[:-2])
    raise ValueError(f"Cannot parse data size: {text}")

def main():
    print("=" * 60)
    print("Hex Flex Blazor - Phase 2 E2E Tests")
    print("=" * 60)

    setup()

    passed = 0
    failed = 0
    errors = []

    tests = [
        test_layout,
        test_tab_switching,
        test_file_upload_view,
        test_file_upload_second_file,
        test_load_new_button,
        test_compare_file_upload,
        test_error_on_invalid_file,
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        for test_fn in tests:
            try:
                test_fn(page)
                passed += 1
            except Exception as e:
                failed += 1
                errors.append((test_fn.__name__, str(e)))
                print(f"  FAIL: {e}")
                try:
                    screenshot(page, f"FAIL_{test_fn.__name__}")
                except:
                    pass

        browser.close()

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)} tests")
    if errors:
        print("\nFailures:")
        for name, err in errors:
            print(f"  {name}: {err}")
    print("=" * 60)

    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
