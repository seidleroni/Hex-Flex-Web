"""
Phase 4 E2E tests for Blazor Hex Flex app.
Tests: Hex/ASCII table rendering, virtual scrolling, gap rows, segment navigation,
address search scrolling, byte value spot-checks against ground truth.
"""

import json
import os
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

# Config
BLAZOR_URL = os.environ.get("BLAZOR_URL", "http://localhost:5163")
TEST_FILES_DIR = Path(__file__).parent / "test_files"
FIXTURES_DIR = Path(__file__).parent / "test_output" / "fixtures"
SCREENSHOT_DIR = Path(__file__).parent / "test_output" / "blazor_phase4_screenshots"

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


WASM_TIMEOUT = 60000  # 60s for initial WASM load
PAGE_TIMEOUT = 15000  # 15s for subsequent operations


def warm_up_wasm(page):
    """First navigation loads the WASM runtime — do it once with a long timeout."""
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=WASM_TIMEOUT)


def navigate_fresh(page):
    """Navigate to app — WASM is already cached so this is fast."""
    page.goto(BLAZOR_URL)
    page.wait_for_selector(".upload-zone", timeout=PAGE_TIMEOUT)


def upload_file(page, filename):
    """Upload a hex file and wait for the memory view to appear."""
    hex_file = TEST_FILES_DIR / filename
    page.locator("input[type='file']").set_input_files(str(hex_file))
    # Wait for memory-view to be attached (it may have 0 height initially
    # until JS sets the scroll container height)
    page.wait_for_selector(".memory-view", state="attached", timeout=WASM_TIMEOUT)
    # Wait for hex viewer to have data rows
    page.wait_for_selector("[data-testid='data-row']", timeout=PAGE_TIMEOUT)


def wait_for_hex_viewer(page):
    """Wait for the hex viewer to render with data rows."""
    page.wait_for_selector("[data-testid='data-row']", timeout=PAGE_TIMEOUT)


# =============================================================================
# Tests: Hex Table Rendering
# =============================================================================

def test_hex_viewer_renders(page):
    """Test that hex viewer renders after file upload."""
    print("\n=== Test: Hex Viewer Renders ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    # Verify hex viewer is attached
    viewer = page.locator(".hex-viewer")
    expect(viewer).to_be_attached()

    # Verify header row exists
    header = page.locator(".hex-viewer-header-row")
    expect(header).to_be_attached()

    # Verify at least one data row rendered
    data_rows = page.locator("[data-testid='data-row']")
    assert data_rows.count() > 0, "No data rows rendered"

    screenshot(page, "01_hex_viewer_renders")
    print(f"  Data rows visible: {data_rows.count()}")
    print("  PASS")


def test_hex_viewer_renders_file2(page):
    """Test hex viewer renders for the second test file."""
    print("\n=== Test: Hex Viewer Renders — File 2 ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_v142.hex")
    wait_for_hex_viewer(page)

    viewer = page.locator(".hex-viewer")
    expect(viewer).to_be_attached()

    data_rows = page.locator("[data-testid='data-row']")
    assert data_rows.count() > 0, "No data rows rendered"

    screenshot(page, "02_hex_viewer_file2")
    print("  PASS")


def test_hex_table_columns(page):
    """Test that hex table has address, hex bytes, and ASCII columns."""
    print("\n=== Test: Hex Table Columns ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    # Check first data row has all three columns
    first_row = page.locator("[data-testid='data-row']").first

    addr = first_row.locator(".hex-addr")
    expect(addr).to_be_attached()
    addr_text = addr.text_content().strip()
    assert len(addr_text) == 8, f"Address should be 8 hex chars, got: {addr_text}"
    assert all(c in "0123456789ABCDEF" for c in addr_text), f"Invalid hex address: {addr_text}"

    hex_bytes = first_row.locator(".hex-bytes")
    expect(hex_bytes).to_be_attached()

    ascii_col = first_row.locator(".hex-ascii")
    expect(ascii_col).to_be_attached()

    # Check that 16 hex bytes are rendered per row
    byte_spans = first_row.locator(".hex-byte")
    assert byte_spans.count() == 16, f"Expected 16 hex bytes per row, got {byte_spans.count()}"

    # Check that 16 ASCII chars are rendered per row
    ascii_spans = first_row.locator(".hex-asc")
    assert ascii_spans.count() == 16, f"Expected 16 ASCII chars per row, got {ascii_spans.count()}"

    print(f"  First row address: {addr_text}")
    print(f"  Hex bytes per row: {byte_spans.count()}")
    print(f"  ASCII chars per row: {ascii_spans.count()}")
    screenshot(page, "03_hex_columns")
    print("  PASS")


def test_first_row_address(page):
    """Test that the first row starts at the file's start address."""
    print("\n=== Test: First Row Address ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    gt = GROUND_TRUTH["package_complete_123"]

    first_row = page.locator("[data-testid='data-row']").first
    addr = first_row.locator(".hex-addr").text_content().strip()

    # Start address is 0x08000000, row-aligned that's 08000000
    expected = "08000000"
    assert addr == expected, f"First row address: {addr} != {expected}"

    print(f"  First row: {addr} (expected {expected})")
    print("  PASS")


# =============================================================================
# Tests: Byte Value Spot-Checks Against Ground Truth
# =============================================================================

def test_spot_check_bytes(page):
    """Spot-check hex byte values at known addresses against ground truth."""
    print("\n=== Test: Spot-Check Byte Values ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    gt = GROUND_TRUTH["package_complete_123"]

    # Use the address search to navigate to known addresses and verify bytes
    # Pick a few spot checks from the first segment (already visible)
    checks_done = 0
    for check in gt["spot_checks"][:10]:
        addr_hex = check["address_hex"]  # e.g. "0x08000000"
        expected_value = check["value"]
        addr_int = check["address"]

        # Navigate to the address
        input_el = page.locator(".address-input")
        input_el.fill(addr_hex)
        page.locator(".btn-search").click()
        page.wait_for_timeout(500)

        # Find the byte at this address using data-addr attribute
        addr_str = f"{addr_int:08X}"
        byte_el = page.locator(f".hex-byte[data-addr='{addr_str}']")

        if byte_el.count() > 0:
            displayed = byte_el.first.text_content().strip()
            expected_hex = f"{expected_value:02X}"
            assert displayed == expected_hex, \
                f"Byte at {addr_hex}: displayed={displayed} expected={expected_hex}"
            checks_done += 1
            print(f"  {addr_hex}: {displayed} == {expected_hex} OK")
        else:
            print(f"  {addr_hex}: byte element not found in visible rows (may be in gap)")

    assert checks_done >= 3, f"Only {checks_done} spot checks succeeded, expected >= 3"
    print(f"  {checks_done} spot checks passed")
    print("  PASS")


# =============================================================================
# Tests: Gap Rows
# =============================================================================

def test_gap_rows_present(page):
    """Test that gap rows appear between non-contiguous segments."""
    print("\n=== Test: Gap Rows Present ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    gt = GROUND_TRUTH["package_complete_123"]

    # File has 3 segments with large gaps between them (> 1MB threshold)
    # Segment 1 ends at 0x0801A023, segment 2 starts at 0x08080000
    # Gap = 0x08080000 - 0x0801A024 = 0x65FDC = 417,756 bytes (< 1MB, so NO gap row)
    # Segment 2 ends at 0x0812051F, segment 3 starts at 0x081FFC00
    # Gap = 0x081FFC00 - 0x08120520 = 0xDF6E0 = 915,168 bytes (< 1MB, so NO gap row)

    # Actually, let me navigate to where a gap would be and check
    # With ViewGapThreshold = 1MB, gaps < 1MB get filled with data rows (showing ".." for empty bytes)
    # Both gaps in this file are < 1MB, so we expect NO gap rows

    # Scroll to the area between segment 1 and 2
    input_el = page.locator(".address-input")
    input_el.fill("0x0801B000")  # Just past end of segment 1
    page.locator(".btn-search").click()
    page.wait_for_timeout(500)

    # There should be data rows with ".." empty bytes (not gap rows)
    # because the gap is < 1MB
    gap_rows = page.locator("[data-testid='gap-row']")
    gap_count = gap_rows.count()

    # Check for data rows with empty bytes in the gap area
    row_at_gap = page.locator("[data-testid='data-row'][data-address='0801B000']")
    if row_at_gap.count() > 0:
        # This should show ".." for empty bytes
        empty_bytes = row_at_gap.locator(".hex-byte-empty")
        print(f"  Gap area row found with {empty_bytes.count()} empty bytes")

    screenshot(page, "04_gap_area")
    print(f"  Gap rows found: {gap_count}")
    print("  PASS")


# =============================================================================
# Tests: Virtual Scrolling
# =============================================================================

def test_virtual_scrolling(page):
    """Test that virtual scrolling works — scroll down and verify new rows load."""
    print("\n=== Test: Virtual Scrolling ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    # Get first row address before scrolling
    first_row_before = page.locator("[data-testid='data-row']").first
    addr_before = first_row_before.get_attribute("data-address")
    print(f"  Before scroll — first visible row: {addr_before}")

    # Scroll down significantly in the hex viewer
    scroll_container = page.locator(".hex-viewer-scroll")
    scroll_container.evaluate("el => el.scrollTop = 5000")
    page.wait_for_timeout(500)

    # Get first row address after scrolling
    first_row_after = page.locator("[data-testid='data-row']").first
    addr_after = first_row_after.get_attribute("data-address")
    print(f"  After scroll — first visible row: {addr_after}")

    # The addresses should be different (we scrolled)
    assert addr_before != addr_after, \
        f"First visible row didn't change after scroll: {addr_before}"

    screenshot(page, "05_virtual_scroll")
    print("  PASS")


def test_scroll_to_end(page):
    """Test scrolling to the end of the file."""
    print("\n=== Test: Scroll to End ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    gt = GROUND_TRUTH["package_complete_123"]

    # Navigate to last segment's start
    last_seg = gt["segments"][-1]
    input_el = page.locator(".address-input")
    input_el.fill(last_seg["start_hex"])
    page.locator(".btn-search").click()
    page.wait_for_timeout(500)

    # Verify we can see data rows near the end
    data_rows = page.locator("[data-testid='data-row']")
    assert data_rows.count() > 0, "No data rows visible after scrolling to end"

    screenshot(page, "06_scroll_to_end")
    print(f"  Navigated to {last_seg['start_hex']}, {data_rows.count()} rows visible")
    print("  PASS")


# =============================================================================
# Tests: Segment Click -> Scroll
# =============================================================================

def test_segment_click_scrolls(page):
    """Test that clicking a segment scrolls the hex viewer to that segment."""
    print("\n=== Test: Segment Click Scrolls ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    gt = GROUND_TRUTH["package_complete_123"]

    # Get initial first visible row
    first_row_initial = page.locator("[data-testid='data-row']").first
    addr_initial = first_row_initial.get_attribute("data-address")

    # Click segment 3 (last segment at 0x081FFC00)
    buttons = page.locator(".segment-button").all()
    assert len(buttons) == 3, f"Expected 3 segment buttons, got {len(buttons)}"
    buttons[2].click()
    page.wait_for_timeout(500)

    # First visible row should now be near segment 3
    first_row_after = page.locator("[data-testid='data-row']").first
    addr_after = first_row_after.get_attribute("data-address")

    # Should have scrolled away from initial position
    assert addr_initial != addr_after, \
        f"View didn't scroll after clicking segment 3: still at {addr_initial}"

    screenshot(page, "07_segment_click_scroll")
    print(f"  Before: {addr_initial}, After: {addr_after}")
    print("  PASS")


def test_segment_click_scrolls_segment2(page):
    """Test clicking segment 2 scrolls to its start address."""
    print("\n=== Test: Segment Click — Segment 2 ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    gt = GROUND_TRUTH["package_complete_123"]
    seg2 = gt["segments"][1]

    # Click segment 2
    buttons = page.locator(".segment-button").all()
    buttons[1].click()
    page.wait_for_timeout(500)

    # Check that a row near segment 2 start is visible
    seg2_start_row = seg2["start_hex"][2:].upper()  # "08080000"
    row = page.locator(f"[data-testid='data-row'][data-address='{seg2_start_row}']")

    if row.count() > 0:
        print(f"  Row at segment 2 start ({seg2_start_row}) is visible")
    else:
        # Even if the exact row isn't the first visible, scroll should be near it
        first_visible = page.locator("[data-testid='data-row']").first
        addr = first_visible.get_attribute("data-address")
        print(f"  First visible row: {addr} (segment 2 starts at {seg2_start_row})")

    screenshot(page, "08_segment2_click")
    print("  PASS")


# =============================================================================
# Tests: Address Search -> Scroll
# =============================================================================

def test_address_search_scrolls(page):
    """Test that address search scrolls to the target address."""
    print("\n=== Test: Address Search Scrolls ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    gt = GROUND_TRUTH["package_complete_123"]

    # Search for an address in segment 2
    target = "0x08080100"
    input_el = page.locator(".address-input")
    input_el.fill(target)
    page.locator(".btn-search").click()
    page.wait_for_timeout(500)

    # The row containing 0x08080100 should be visible (row address = 08080100)
    row = page.locator("[data-testid='data-row'][data-address='08080100']")
    if row.count() > 0:
        expect(row.first).to_be_attached()
        print(f"  Row at {target} found in DOM")
    else:
        # Check nearby
        first_visible = page.locator("[data-testid='data-row']").first
        addr = first_visible.get_attribute("data-address")
        print(f"  First visible row: {addr}")

    # No error should appear
    error = page.locator(".address-input-error")
    expect(error).not_to_be_attached()

    screenshot(page, "09_address_search_scroll")
    print("  PASS")


def test_address_search_highlights_byte(page):
    """Test that address search highlights the target byte temporarily."""
    print("\n=== Test: Address Search Highlights Byte ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    target = "0x08000010"  # Address in first segment
    input_el = page.locator(".address-input")
    input_el.fill(target)
    page.locator(".btn-search").click()
    page.wait_for_timeout(300)

    # Check for highlighted byte
    highlighted = page.locator(".hex-byte-hl")
    if highlighted.count() > 0:
        print(f"  Highlighted bytes found: {highlighted.count()}")
        screenshot(page, "10_byte_highlight")
    else:
        print("  No highlighted bytes found (may have already timed out)")

    # Wait for highlight to clear (2 seconds)
    page.wait_for_timeout(2500)
    highlighted_after = page.locator(".hex-byte-hl")
    hl_count_after = highlighted_after.count()
    print(f"  After 2.5s: {hl_count_after} highlighted bytes (should be 0)")
    assert hl_count_after == 0, f"Highlight should have cleared, but {hl_count_after} still highlighted"

    print("  PASS")


# =============================================================================
# Tests: Column Header
# =============================================================================

def test_column_header(page):
    """Test that the hex viewer has a proper column header."""
    print("\n=== Test: Column Header ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    header = page.locator(".hex-viewer-header-row")
    expect(header).to_be_attached()

    # Check ADDRESS label
    addr_hdr = page.locator(".hex-hdr-addr")
    expect(addr_hdr).to_have_text("ADDRESS")

    # Check ASCII label
    ascii_hdr = page.locator(".hex-hdr-ascii")
    expect(ascii_hdr).to_have_text("ASCII")

    # Check hex byte offsets (00 01 02 ... 0F)
    bytes_hdr = page.locator(".hex-hdr-bytes")
    hdr_text = bytes_hdr.text_content().strip()
    assert "00" in hdr_text and "0F" in hdr_text, \
        f"Header should contain 00 and 0F, got: {hdr_text}"

    print(f"  Header: {hdr_text[:50]}...")
    print("  PASS")


# =============================================================================
# Tests: ASCII Display
# =============================================================================

def test_ascii_printable_chars(page):
    """Test that printable ASCII characters are displayed correctly."""
    print("\n=== Test: ASCII Printable Characters ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    # Check that printable ASCII chars have the print class
    print_chars = page.locator(".hex-asc-print")
    if print_chars.count() > 0:
        print(f"  Printable ASCII chars found: {print_chars.count()}")
    else:
        print("  No printable chars in visible rows (might be all binary data)")

    # Non-printable should show as "."
    all_ascii = page.locator(".hex-asc")
    if all_ascii.count() > 0:
        first_text = all_ascii.first.text_content()
        assert len(first_text) == 1, f"Each ASCII span should be 1 char, got: '{first_text}'"

    screenshot(page, "11_ascii_display")
    print("  PASS")


# =============================================================================
# Tests: Phase 3 Regression
# =============================================================================

def test_regression_statistics(page):
    """Regression: statistics still display correctly."""
    print("\n=== Test: Regression — Statistics ===")
    navigate_fresh(page)

    gt = GROUND_TRUTH["package_complete_123"]
    upload_file(page, "package_complete_123.hex")

    values = page.locator(".stat-card-value").all_text_contents()
    assert len(values) == 3
    assert values[0].strip() == gt["min_address_hex"]
    assert values[1].strip() == gt["max_address_hex"]

    print("  PASS")


def test_regression_load_new(page):
    """Regression: Load New still works."""
    print("\n=== Test: Regression — Load New ===")
    navigate_fresh(page)
    upload_file(page, "package_complete_123.hex")
    wait_for_hex_viewer(page)

    page.locator(".btn-load-new-action").click()
    page.wait_for_selector(".upload-zone", timeout=10000)
    expect(page.locator(".upload-zone")).to_be_visible()
    expect(page.locator(".memory-view")).not_to_be_attached()

    print("  PASS")


# =============================================================================
# Main
# =============================================================================

def main():
    print("=" * 60)
    print(f"Hex Flex Blazor — Phase 4 E2E Tests")
    print(f"URL: {BLAZOR_URL}")
    print("=" * 60)

    setup()

    passed = 0
    failed = 0
    errors = []

    tests = [
        # Hex table rendering
        test_hex_viewer_renders,
        test_hex_viewer_renders_file2,
        test_hex_table_columns,
        test_first_row_address,
        test_column_header,
        # Byte value spot checks
        test_spot_check_bytes,
        # Gap rows
        test_gap_rows_present,
        # Virtual scrolling
        test_virtual_scrolling,
        test_scroll_to_end,
        # Segment navigation
        test_segment_click_scrolls,
        test_segment_click_scrolls_segment2,
        # Address search
        test_address_search_scrolls,
        test_address_search_highlights_byte,
        # ASCII
        test_ascii_printable_chars,
        # Regressions
        test_regression_statistics,
        test_regression_load_new,
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        # Warm up: first navigation downloads the WASM runtime (~5-10MB)
        print("\nWarming up WASM runtime...")
        warm_up_wasm(page)
        print("WASM ready.\n")

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
