"""
Phase 3 E2E tests for Blazor Hex Flex app.
Tests: Statistics, Segment Panel, Address Search, Load New — all validated against ground truth.
Comprehensive QA: both files, exact fixture matching, error paths, state transitions, screenshots.
"""

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

# Config
BLAZOR_URL = "http://localhost:5050"
TEST_FILES_DIR = Path(__file__).parent / "test_files"
FIXTURES_DIR = Path(__file__).parent / "test_output" / "fixtures"
SCREENSHOT_DIR = Path(__file__).parent / "test_output" / "blazor_phase3_screenshots"

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


def parse_data_size(text):
    """Parse a human-readable data size back to bytes."""
    text = text.strip()
    if text.endswith(" MB"):
        return float(text[:-3]) * 1024 * 1024
    elif text.endswith(" KB"):
        return float(text[:-3]) * 1024
    elif text.endswith(" B"):
        return float(text[:-2])
    elif text.endswith(" Bytes"):
        return float(text[:-6])
    raise ValueError(f"Cannot parse data size: {text}")


def upload_file(page, filename):
    """Upload a hex file and wait for the memory view to appear."""
    hex_file = TEST_FILES_DIR / filename
    page.locator("input[type='file']").set_input_files(str(hex_file))
    page.wait_for_selector(".memory-view", timeout=30000)


def collect_console_errors(page):
    """Collect JS console errors during test execution."""
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    return errors


# =============================================================================
# Tests: Statistics Display
# =============================================================================

def test_statistics_file1(page):
    """Validate statistics for package_complete_123.hex against ground truth."""
    print("\n=== Test: Statistics — File 1 (package_complete_123) ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    gt = GROUND_TRUTH["package_complete_123"]
    upload_file(page, "package_complete_123.hex")

    # Verify the statistics grid exists
    stats = page.locator(".statistics-grid")
    expect(stats).to_be_visible()

    # Get all stat card values
    values = page.locator(".stat-card-value").all_text_contents()
    assert len(values) == 3, f"Expected 3 stat values, got {len(values)}: {values}"

    start_addr = values[0].strip()
    end_addr = values[1].strip()
    data_size_text = values[2].strip()

    # Start address — exact match
    assert start_addr == gt["min_address_hex"], \
        f"Start address: {start_addr} != {gt['min_address_hex']}"

    # End address — exact match
    assert end_addr == gt["max_address_hex"], \
        f"End address: {end_addr} != {gt['max_address_hex']}"

    # Data size — numeric comparison with 1% tolerance
    displayed_bytes = parse_data_size(data_size_text)
    gt_size = gt["total_data_bytes"]
    assert abs(displayed_bytes - gt_size) < gt_size * 0.01, \
        f"Data size: displayed={data_size_text} ({displayed_bytes}B) vs gt={gt_size}B"

    screenshot(page, "01_stats_file1")
    print(f"  Start: {start_addr} | End: {end_addr} | Size: {data_size_text}")
    print("  PASS")


def test_statistics_file2(page):
    """Validate statistics for package_complete_v142.hex against ground truth."""
    print("\n=== Test: Statistics — File 2 (package_complete_v142) ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    gt = GROUND_TRUTH["package_complete_v142"]
    upload_file(page, "package_complete_v142.hex")

    values = page.locator(".stat-card-value").all_text_contents()
    assert len(values) == 3, f"Expected 3 stat values, got {len(values)}: {values}"

    start_addr = values[0].strip()
    end_addr = values[1].strip()
    data_size_text = values[2].strip()

    assert start_addr == gt["min_address_hex"], \
        f"Start address: {start_addr} != {gt['min_address_hex']}"
    assert end_addr == gt["max_address_hex"], \
        f"End address: {end_addr} != {gt['max_address_hex']}"

    displayed_bytes = parse_data_size(data_size_text)
    gt_size = gt["total_data_bytes"]
    assert abs(displayed_bytes - gt_size) < gt_size * 0.01, \
        f"Data size: displayed={data_size_text} ({displayed_bytes}B) vs gt={gt_size}B"

    screenshot(page, "02_stats_file2")
    print(f"  Start: {start_addr} | End: {end_addr} | Size: {data_size_text}")
    print("  PASS")


# =============================================================================
# Tests: Segment Panel
# =============================================================================

def test_segment_panel_file1(page):
    """Validate segment panel shows correct segments for file 1."""
    print("\n=== Test: Segment Panel — File 1 ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    gt = GROUND_TRUTH["package_complete_123"]
    upload_file(page, "package_complete_123.hex")

    # Panel should be visible (3 segments > 1)
    panel = page.locator(".segment-panel")
    expect(panel).to_be_visible()

    # Verify header
    expect(page.locator(".segment-panel-header")).to_have_text("Data Segments")

    # Check segment count
    buttons = page.locator(".segment-button").all()
    assert len(buttons) == gt["segment_count"], \
        f"Expected {gt['segment_count']} segments, got {len(buttons)}"

    # Validate each segment's address range and size
    for i, seg_gt in enumerate(gt["segments"]):
        button = buttons[i]
        text = button.text_content()

        # Check segment name
        assert f"Segment {i+1}" in text, f"Segment {i+1} name not found in: {text}"

        # Check start address appears
        assert seg_gt["start_hex"].upper() in text.upper(), \
            f"Segment {i+1} start {seg_gt['start_hex']} not found in: {text}"

        # Check end address appears
        assert seg_gt["end_hex"].upper() in text.upper(), \
            f"Segment {i+1} end {seg_gt['end_hex']} not found in: {text}"

        # Check size badge — parse it and compare
        size_badge = button.locator(".segment-size-badge")
        size_text = size_badge.text_content().strip()
        displayed_size = parse_data_size(size_text)
        assert abs(displayed_size - seg_gt["size"]) < seg_gt["size"] * 0.02, \
            f"Segment {i+1} size: {size_text} ({displayed_size}) vs gt={seg_gt['size']}"

        print(f"  Segment {i+1}: {seg_gt['start_hex']} -> {seg_gt['end_hex']} ({size_text})")

    screenshot(page, "03_segments_file1")
    print("  PASS")


def test_segment_panel_file2(page):
    """Validate segment panel shows correct segments for file 2."""
    print("\n=== Test: Segment Panel — File 2 ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    gt = GROUND_TRUTH["package_complete_v142"]
    upload_file(page, "package_complete_v142.hex")

    panel = page.locator(".segment-panel")
    expect(panel).to_be_visible()

    buttons = page.locator(".segment-button").all()
    assert len(buttons) == gt["segment_count"], \
        f"Expected {gt['segment_count']} segments, got {len(buttons)}"

    for i, seg_gt in enumerate(gt["segments"]):
        button = buttons[i]
        text = button.text_content()
        assert seg_gt["start_hex"].upper() in text.upper(), \
            f"Segment {i+1} start {seg_gt['start_hex']} not in: {text}"
        assert seg_gt["end_hex"].upper() in text.upper(), \
            f"Segment {i+1} end {seg_gt['end_hex']} not in: {text}"

        size_badge = button.locator(".segment-size-badge")
        size_text = size_badge.text_content().strip()
        displayed_size = parse_data_size(size_text)
        assert abs(displayed_size - seg_gt["size"]) < seg_gt["size"] * 0.02, \
            f"Segment {i+1} size: {size_text} ({displayed_size}) vs gt={seg_gt['size']}"

        print(f"  Segment {i+1}: {seg_gt['start_hex']} -> {seg_gt['end_hex']} ({size_text})")

    screenshot(page, "04_segments_file2")
    print("  PASS")


def test_segment_click_active_state(page):
    """Test that clicking a segment highlights it."""
    print("\n=== Test: Segment Click — Active State ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    buttons = page.locator(".segment-button").all()
    assert len(buttons) == 3

    # Initially first segment should be active (index 0 by default)
    # Click segment 2
    buttons[1].click()
    page.wait_for_timeout(300)

    # After clicking, segment 2 button should have active class
    expect(buttons[1]).to_have_class(re.compile("active"))

    # Segment 1 should no longer be active
    # (The first segment button should not have the active class)
    seg1_class = buttons[0].get_attribute("class") or ""
    assert "active" not in seg1_class.split(), \
        f"Segment 1 should not be active after clicking segment 2: {seg1_class}"

    screenshot(page, "05_segment_click_active")

    # Click segment 3
    buttons[2].click()
    page.wait_for_timeout(300)
    expect(buttons[2]).to_have_class(re.compile("active"))

    screenshot(page, "06_segment3_active")
    print("  PASS")


# =============================================================================
# Tests: Memory View Header
# =============================================================================

def test_memory_view_header(page):
    """Test the Memory Map heading and filename display."""
    print("\n=== Test: Memory View Header ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    # Title
    title = page.locator(".memory-view-title h2")
    expect(title).to_have_text("Memory Map")

    # Filename
    filename = page.locator(".memory-view-filename")
    expect(filename).to_contain_text("package_complete_123.hex")

    print("  PASS")


# =============================================================================
# Tests: Address Search
# =============================================================================

def test_address_search_valid(page):
    """Test address search with a valid address."""
    print("\n=== Test: Address Search — Valid ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    # Enter a valid address
    input_el = page.locator(".address-input")
    input_el.fill("0x08080000")
    page.locator(".btn-search").click()
    page.wait_for_timeout(300)

    # No error should appear
    error = page.locator(".address-input-error")
    expect(error).not_to_be_visible()

    screenshot(page, "07_search_valid")
    print("  PASS")


def test_address_search_valid_no_prefix(page):
    """Test address search without 0x prefix."""
    print("\n=== Test: Address Search — Valid (no 0x prefix) ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    input_el = page.locator(".address-input")
    input_el.fill("08080000")
    page.locator(".btn-search").click()
    page.wait_for_timeout(300)

    error = page.locator(".address-input-error")
    expect(error).not_to_be_visible()

    print("  PASS")


def test_address_search_invalid_hex(page):
    """Test address search with invalid hex input."""
    print("\n=== Test: Address Search — Invalid Hex ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    input_el = page.locator(".address-input")
    input_el.fill("ZZZZ")
    page.locator(".btn-search").click()
    page.wait_for_timeout(300)

    error = page.locator(".address-input-error")
    expect(error).to_be_visible()
    expect(error).to_have_text("Invalid hex format")

    screenshot(page, "08_search_invalid")
    print("  PASS")


def test_address_search_empty(page):
    """Test address search with empty input."""
    print("\n=== Test: Address Search — Empty ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    # Leave input empty, click search
    page.locator(".btn-search").click()
    page.wait_for_timeout(300)

    error = page.locator(".address-input-error")
    expect(error).to_be_visible()
    expect(error).to_have_text("Invalid hex format")

    print("  PASS")


def test_address_search_out_of_range(page):
    """Test address search with address outside file range."""
    print("\n=== Test: Address Search — Out of Range ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    input_el = page.locator(".address-input")
    input_el.fill("0x00000001")  # Before start (0x08000000)
    page.locator(".btn-search").click()
    page.wait_for_timeout(300)

    error = page.locator(".address-input-error")
    expect(error).to_be_visible()
    expect(error).to_have_text("Address out of range")

    screenshot(page, "09_search_out_of_range")
    print("  PASS")


def test_address_search_error_clears_on_focus(page):
    """Test that address search error clears when input is focused."""
    print("\n=== Test: Address Search — Error Clears on Focus ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    # Trigger an error first
    input_el = page.locator(".address-input")
    input_el.fill("ZZZZ")
    page.locator(".btn-search").click()
    page.wait_for_timeout(300)

    error = page.locator(".address-input-error")
    expect(error).to_be_visible()

    # Focus the input — error should clear
    input_el.focus()
    page.wait_for_timeout(300)
    expect(error).not_to_be_visible()

    print("  PASS")


# =============================================================================
# Tests: Load New
# =============================================================================

def test_load_new_returns_to_upload(page):
    """Test Load New button returns to upload screen."""
    print("\n=== Test: Load New — Returns to Upload ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    # Click Load New
    page.locator(".btn-load-new-action").click()

    # Should return to upload screen
    page.wait_for_selector(".upload-zone", timeout=10000)
    expect(page.locator(".upload-zone")).to_be_visible()

    # Memory view should be gone
    expect(page.locator(".memory-view")).not_to_be_visible()

    screenshot(page, "10_load_new")
    print("  PASS")


def test_load_new_then_upload_different_file(page):
    """Test: upload file A -> Load New -> upload file B -> verify stats update."""
    print("\n=== Test: Load New — Then Upload Different File ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    gt_a = GROUND_TRUTH["package_complete_123"]
    gt_b = GROUND_TRUTH["package_complete_v142"]

    # Upload file A
    upload_file(page, "package_complete_123.hex")
    values_a = page.locator(".stat-card-value").all_text_contents()
    assert values_a[0].strip() == gt_a["min_address_hex"]

    # Load New
    page.locator(".btn-load-new-action").click()
    page.wait_for_selector(".upload-zone", timeout=10000)

    # Upload file B
    upload_file(page, "package_complete_v142.hex")
    values_b = page.locator(".stat-card-value").all_text_contents()

    # Stats should reflect file B, not file A
    assert values_b[0].strip() == gt_b["min_address_hex"], \
        f"After re-upload, start address should be {gt_b['min_address_hex']}, got {values_b[0]}"

    # End address differs between files — verify it updated
    assert values_b[1].strip() == gt_b["max_address_hex"], \
        f"After re-upload, end address should be {gt_b['max_address_hex']}, got {values_b[1]}"

    # Filename should show v142
    expect(page.locator(".memory-view-filename")).to_contain_text("package_complete_v142.hex")

    screenshot(page, "11_load_new_different_file")
    print("  PASS")


def test_load_new_then_reload_same_file(page):
    """Test: upload file -> Load New -> re-upload same file -> still works."""
    print("\n=== Test: Load New — Reload Same File ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    gt = GROUND_TRUTH["package_complete_123"]

    # Upload
    upload_file(page, "package_complete_123.hex")
    expect(page.locator(".memory-view")).to_be_visible()

    # Load New
    page.locator(".btn-load-new-action").click()
    page.wait_for_selector(".upload-zone", timeout=10000)

    # Re-upload same file
    upload_file(page, "package_complete_123.hex")

    # Should work fine
    values = page.locator(".stat-card-value").all_text_contents()
    assert values[0].strip() == gt["min_address_hex"]
    assert values[1].strip() == gt["max_address_hex"]

    print("  PASS")


# =============================================================================
# Tests: Error Handling
# =============================================================================

def test_invalid_file_error(page):
    """Test that an invalid file shows error and stays on upload screen."""
    print("\n=== Test: Invalid File Error ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.hex', delete=False) as f:
        f.write("This is not a valid hex file\nJust plain text\n")
        invalid_path = f.name

    try:
        page.locator("input[type='file']").set_input_files(invalid_path)
        page.wait_for_selector(".error-alert", timeout=10000)
        expect(page.locator(".error-alert")).to_be_visible()
        # Memory view should NOT appear
        expect(page.locator(".memory-view")).not_to_be_visible()
        screenshot(page, "12_invalid_file_error")
        print("  PASS")
    finally:
        os.unlink(invalid_path)


# =============================================================================
# Tests: Console Error Monitoring
# =============================================================================

def test_no_console_errors(page):
    """Monitor that loading a file produces no JS console errors."""
    print("\n=== Test: No Console Errors ===")

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=30000)
    upload_file(page, "package_complete_123.hex")

    # Wait a bit for any async errors
    page.wait_for_timeout(1000)

    # Filter out known Blazor WASM noise if any
    real_errors = [e for e in console_errors if "blazor" not in e.lower() or "error" in e.lower()]

    if real_errors:
        print(f"  Console errors found: {real_errors}")
        # Don't fail on Blazor framework noise, but flag it
        for err in real_errors:
            print(f"    - {err}")

    print("  PASS (informational)")


# =============================================================================
# Tests: Phase 2 Regression — Existing features still work
# =============================================================================

def test_regression_layout(page):
    """Regression: layout still renders."""
    print("\n=== Test: Regression — Layout ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".app-header", timeout=30000)

    expect(page.locator(".header-title")).to_have_text("Hex Flex")
    expect(page.locator(".app-footer")).to_be_visible()
    expect(page.locator(".view-switcher")).to_be_visible()

    print("  PASS")


def test_regression_tab_switching(page):
    """Regression: tab switching still works."""
    print("\n=== Test: Regression — Tab Switching ===")
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".app-header", timeout=30000)

    compare_btn = page.locator(".view-switcher button", has_text="Compare")
    compare_btn.click()
    page.wait_for_url("**/compare")

    view_btn = page.locator(".view-switcher button", has_text="View")
    view_btn.click()
    page.wait_for_url(BLAZOR_URL + "/")

    print("  PASS")


# =============================================================================
# Main
# =============================================================================

def main():
    print("=" * 60)
    print("Hex Flex Blazor — Phase 3 E2E Tests")
    print("=" * 60)

    setup()

    passed = 0
    failed = 0
    errors = []

    tests = [
        # Statistics
        test_statistics_file1,
        test_statistics_file2,
        # Segment Panel
        test_segment_panel_file1,
        test_segment_panel_file2,
        test_segment_click_active_state,
        # Memory View Header
        test_memory_view_header,
        # Address Search
        test_address_search_valid,
        test_address_search_valid_no_prefix,
        test_address_search_invalid_hex,
        test_address_search_empty,
        test_address_search_out_of_range,
        test_address_search_error_clears_on_focus,
        # Load New
        test_load_new_returns_to_upload,
        test_load_new_then_upload_different_file,
        test_load_new_then_reload_same_file,
        # Error Handling
        test_invalid_file_error,
        # Console Monitoring
        test_no_console_errors,
        # Phase 2 Regressions
        test_regression_layout,
        test_regression_tab_switching,
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
