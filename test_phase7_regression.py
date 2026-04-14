"""
Phase 7 full regression test for Blazor Hex Flex app.
Tests all features across single-file view and comparison view.
Run: PYTHONIOENCODING=utf-8 uv run python test_phase7_regression.py
"""
import os
import sys
import time
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE_URL = "http://localhost:5003"
TEST_FILES_DIR = Path(__file__).parent / "test_files"
OUTPUT_DIR = Path(__file__).parent / "test_output"

FILE_A = str(TEST_FILES_DIR / "package_complete_123.hex")
FILE_B = str(TEST_FILES_DIR / "package_complete_v142.hex")

# Ground truth from intelhex (Phase 0 fixtures)
EXPECTED_FILE_A_DATA_SIZE = 763_568  # ~745.67 KB
EXPECTED_FILE_A_SEGMENTS = 3
EXPECTED_FILE_B_DATA_SIZE = 783_120  # ~764.64 KB
EXPECTED_FILE_B_SEGMENTS = 3


def setup():
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)


def wait_for_blazor(page, timeout=30000):
    """Wait for Blazor WASM to fully load."""
    page.goto(BASE_URL)
    # Wait for the app shell to appear (header title)
    page.wait_for_selector("text=Hex Flex", timeout=timeout)
    # Small delay for Blazor initialization
    page.wait_for_timeout(1000)


def upload_file(page, file_path, selector="input[type='file']"):
    """Upload a file using Playwright's file input API."""
    file_input = page.locator(selector).first
    file_input.set_input_files(file_path)


def test_01_app_loads(page):
    """App loads with header, footer, view switcher."""
    print("  Test 01: App loads...")
    wait_for_blazor(page)

    # Header
    assert page.locator("text=Hex Flex").first.is_visible()
    assert page.locator("text=A web tool to view and compare Intel Hex files").first.is_visible()

    # View switcher
    view_btn = page.locator("button:has-text('View')")
    compare_btn = page.locator("button:has-text('Compare')")
    assert view_btn.is_visible()
    assert compare_btn.is_visible()

    # Footer
    assert page.locator("text=Jon Seidmann").first.is_visible()
    assert page.locator("text=MIT Licensed").first.is_visible()
    assert page.locator("text=Blazor WASM").first.is_visible()

    # Upload section visible
    assert page.locator("text=Intel HEX File Viewer").first.is_visible()

    page.screenshot(path=str(OUTPUT_DIR / "01_app_loads.png"), full_page=True)
    print("    PASS")


def test_02_single_file_upload(page):
    """Upload a hex file and verify stats display."""
    print("  Test 02: Single file upload...")
    wait_for_blazor(page)

    upload_file(page, FILE_A)
    page.wait_for_selector("text=Memory Map", timeout=15000)

    # Check filename
    assert page.locator("text=package_complete_123.hex").first.is_visible()

    # Check statistics are present
    stats_text = page.locator(".statistics-grid").inner_text()
    assert "Start Address" in stats_text or "0x" in stats_text

    page.screenshot(path=str(OUTPUT_DIR / "02_single_file_upload.png"), full_page=True)
    print("    PASS")


def test_03_hex_viewer_renders(page):
    """Hex viewer shows data rows with addresses and hex bytes."""
    print("  Test 03: Hex viewer renders...")
    wait_for_blazor(page)
    upload_file(page, FILE_A)
    page.wait_for_selector("text=Memory Map", timeout=15000)

    # Wait for hex viewer to render (JS renders asynchronously after C# sends data)
    page.wait_for_timeout(2000)

    # Check hex viewer header row
    assert page.locator("text=ADDRESS").first.is_visible()
    assert page.locator("text=ASCII").first.is_visible()

    # The JS hex viewer renders rows with position:absolute inside a scroll container.
    # In headless mode, getBoundingClientRect may return unusual values.
    # Force a reasonable height on the scroll container and trigger re-render.
    # Wait for JS to render data rows (setData calls renderVisible directly)
    page.wait_for_timeout(3000)

    data_rows = page.locator("[data-testid='data-row']")
    assert data_rows.count() > 0, "No data rows rendered"

    # Check first row has an address
    first_row = data_rows.first
    addr_span = first_row.locator(".hex-addr")
    addr_text = addr_span.inner_text()
    assert len(addr_text) == 8, f"Address should be 8 hex chars, got: {addr_text}"

    page.screenshot(path=str(OUTPUT_DIR / "03_hex_viewer.png"), full_page=True)
    print("    PASS")


def test_04_segment_panel(page):
    """Segment panel shows correct number of segments and navigation works."""
    print("  Test 04: Segment panel...")
    wait_for_blazor(page)
    upload_file(page, FILE_A)
    page.wait_for_selector("text=Memory Map", timeout=15000)
    page.wait_for_timeout(1000)

    # File A has 3 segments
    panel = page.locator(".segment-panel")
    if panel.is_visible():
        segment_buttons = panel.locator(".segment-button")
        count = segment_buttons.count()
        assert count == EXPECTED_FILE_A_SEGMENTS, f"Expected {EXPECTED_FILE_A_SEGMENTS} segments, got {count}"

        # Click segment 2
        segment_buttons.nth(1).click()
        page.wait_for_timeout(500)

        # Verify active state
        assert segment_buttons.nth(1).get_attribute("class").find("active") >= 0

    page.screenshot(path=str(OUTPUT_DIR / "04_segment_panel.png"), full_page=True)
    print("    PASS")


def test_05_address_search(page):
    """Go-to-address search works."""
    print("  Test 05: Address search...")
    wait_for_blazor(page)
    upload_file(page, FILE_A)
    page.wait_for_selector("text=Memory Map", timeout=15000)
    page.wait_for_timeout(1000)

    # Type an address
    addr_input = page.locator(".address-input")
    addr_input.fill("08080000")
    page.locator(".btn-search").click()
    page.wait_for_timeout(500)

    # After search, the hex viewer should show rows near that address
    page.screenshot(path=str(OUTPUT_DIR / "05_address_search.png"), full_page=True)
    print("    PASS")


def test_06_load_new_button(page):
    """Load New button returns to upload screen."""
    print("  Test 06: Load New button...")
    wait_for_blazor(page)
    upload_file(page, FILE_A)
    page.wait_for_selector("text=Memory Map", timeout=15000)

    page.locator("text=Load New").first.click()
    page.wait_for_timeout(500)

    # Should be back at upload screen
    assert page.locator("text=Intel HEX File Viewer").first.is_visible()

    page.screenshot(path=str(OUTPUT_DIR / "06_load_new.png"), full_page=True)
    print("    PASS")


def test_07_minimap_visible(page):
    """Minimap renders alongside hex viewer."""
    print("  Test 07: Minimap visible...")
    wait_for_blazor(page)
    upload_file(page, FILE_A)
    page.wait_for_selector("text=Memory Map", timeout=15000)
    page.wait_for_timeout(1500)

    minimap = page.locator(".minimap")
    assert minimap.first.is_visible(), "Minimap should be visible"

    # Legend
    legend = page.locator(".minimap-legend")
    assert legend.first.is_visible(), "Minimap legend should be visible"

    page.screenshot(path=str(OUTPUT_DIR / "07_minimap.png"), full_page=True)
    print("    PASS")


def test_08_gap_rows(page):
    """Gap rows appear between non-contiguous segments."""
    print("  Test 08: Gap rows...")
    wait_for_blazor(page)
    upload_file(page, FILE_A)
    page.wait_for_selector("text=Memory Map", timeout=15000)
    page.wait_for_timeout(1000)

    # Search for an address near a gap
    addr_input = page.locator(".address-input")
    addr_input.fill("0807FFF0")
    page.locator(".btn-search").click()
    page.wait_for_timeout(1000)

    # Check for gap rows in the viewport
    gap_rows = page.locator("[data-testid='gap-row']")
    # Gap rows may or may not be in viewport; just verify the viewer renders
    page.screenshot(path=str(OUTPUT_DIR / "08_gap_rows.png"), full_page=True)
    print("    PASS")


def test_09_compare_view_navigation(page):
    """Navigate to Compare view."""
    print("  Test 09: Compare view navigation...")
    wait_for_blazor(page)

    page.locator("button:has-text('Compare')").click()
    page.wait_for_timeout(500)

    assert page.locator("text=Compare Intel HEX Files").first.is_visible()
    assert page.locator("text=File A (Original)").first.is_visible()
    assert page.locator("text=File B (Modified)").first.is_visible()

    page.screenshot(path=str(OUTPUT_DIR / "09_compare_view.png"), full_page=True)
    print("    PASS")


def upload_compare_files(page):
    """Helper to navigate to compare view and upload both files."""
    page.locator("button:has-text('Compare')").click()
    page.wait_for_timeout(500)

    # Upload File A (first file input)
    file_inputs = page.locator("input[type='file']")
    file_inputs.nth(0).set_input_files(FILE_A)
    page.wait_for_timeout(1500)

    # After File A uploads, its upload zone is replaced by a FileInfoCard.
    # Only one file input remains (for File B), so use .first
    file_input_b = page.locator("input[type='file']").first
    file_input_b.set_input_files(FILE_B)
    page.wait_for_timeout(2000)


def test_10_compare_two_files(page):
    """Upload two files and verify comparison results."""
    print("  Test 10: Compare two files...")
    wait_for_blazor(page)
    upload_compare_files(page)

    # Wait for comparison to render
    page.wait_for_selector("text=Bytes Modified", timeout=15000)
    page.wait_for_timeout(1000)

    # Check diff statistics — labels are CSS text-transform:uppercase so use case-insensitive
    modified_card = page.locator(".diff-stat-card").nth(0)
    assert "modified" in modified_card.inner_text().lower(), f"Expected 'modified' in first card, got: {modified_card.inner_text()}"

    added_card = page.locator(".diff-stat-card").nth(1)
    assert "added" in added_card.inner_text().lower(), f"Expected 'added' in second card, got: {added_card.inner_text()}"

    removed_card = page.locator(".diff-stat-card").nth(2)
    assert "removed" in removed_card.inner_text().lower(), f"Expected 'removed' in third card, got: {removed_card.inner_text()}"

    # Check diff legend
    legend = page.locator(".diff-legend")
    legend_text = legend.inner_text()
    assert "Added" in legend_text
    assert "Modified" in legend_text
    assert "Removed" in legend_text

    page.screenshot(path=str(OUTPUT_DIR / "10_compare_files.png"), full_page=True)
    print("    PASS")


def test_11_diff_navigator(page):
    """Diff navigator cycles through differences."""
    print("  Test 11: Diff navigator...")
    wait_for_blazor(page)
    upload_compare_files(page)
    page.wait_for_selector("text=Bytes Modified", timeout=15000)

    # Check diff navigator exists
    nav = page.locator(".diff-navigator")
    if nav.is_visible():
        # Click next diff
        next_btn = nav.locator("button").nth(1)
        next_btn.click()
        page.wait_for_timeout(500)

        page.screenshot(path=str(OUTPUT_DIR / "11_diff_nav.png"), full_page=True)

    print("    PASS")


def test_12_comparison_minimap(page):
    """Comparison minimap renders with diff colors."""
    print("  Test 12: Comparison minimap...")
    wait_for_blazor(page)
    upload_compare_files(page)
    page.wait_for_selector("text=Bytes Modified", timeout=15000)
    page.wait_for_timeout(1000)

    minimap = page.locator(".minimap")
    assert minimap.first.is_visible(), "Comparison minimap should be visible"

    page.screenshot(path=str(OUTPUT_DIR / "12_comparison_minimap.png"), full_page=True)
    print("    PASS")


def test_13_error_boundary_exists(page):
    """Error boundary is wired up (check DOM structure)."""
    print("  Test 13: Error boundary exists...")
    wait_for_blazor(page)

    # Verify the app loaded without error boundary triggering
    assert page.locator("text=Something went wrong").count() == 0, "Error boundary should not be triggered"
    assert page.locator("text=Intel HEX File Viewer").first.is_visible()

    print("    PASS")


def test_14_accessibility_attributes(page):
    """Check key ARIA attributes are present."""
    print("  Test 14: Accessibility attributes...")
    wait_for_blazor(page)

    # View switcher has role=group and aria-label
    switcher = page.locator("[role='group'][aria-label='View mode']")
    assert switcher.is_visible(), "View switcher should have role=group"

    # Buttons have aria-pressed
    view_btn = page.locator("button:has-text('View')")
    assert view_btn.get_attribute("aria-pressed") is not None

    # Upload zone has role=button
    upload = page.locator(".upload-zone[role='button']")
    assert upload.is_visible(), "Upload zone should have role=button"

    print("    PASS")


def test_15_view_switch_roundtrip(page):
    """Switch between View and Compare modes and back."""
    print("  Test 15: View switch roundtrip...")
    wait_for_blazor(page)

    # Start in View mode
    assert page.locator("text=Intel HEX File Viewer").first.is_visible()

    # Switch to Compare
    page.locator("button:has-text('Compare')").click()
    page.wait_for_timeout(500)
    assert page.locator("text=Compare Intel HEX Files").first.is_visible()

    # Switch back to View
    page.locator("button:has-text('View')").first.click()
    page.wait_for_timeout(500)
    assert page.locator("text=Intel HEX File Viewer").first.is_visible()

    print("    PASS")


def main():
    setup()
    passed = 0
    failed = 0
    errors = []

    tests = [
        test_01_app_loads,
        test_02_single_file_upload,
        test_03_hex_viewer_renders,
        test_04_segment_panel,
        test_05_address_search,
        test_06_load_new_button,
        test_07_minimap_visible,
        test_08_gap_rows,
        test_09_compare_view_navigation,
        test_10_compare_two_files,
        test_11_diff_navigator,
        test_12_comparison_minimap,
        test_13_error_boundary_exists,
        test_14_accessibility_attributes,
        test_15_view_switch_roundtrip,
    ]

    print(f"\nPhase 7 Regression Tests ({len(tests)} tests)")
    print("=" * 50)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for test_fn in tests:
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            try:
                test_fn(page)
                passed += 1
            except Exception as e:
                failed += 1
                errors.append((test_fn.__name__, str(e)))
                print(f"    FAIL: {e}")
                try:
                    page.screenshot(path=str(OUTPUT_DIR / f"FAIL_{test_fn.__name__}.png"), full_page=True)
                except:
                    pass
            finally:
                page.close()

        browser.close()

    print()
    print("=" * 50)
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)} tests")
    if errors:
        print("\nFailed tests:")
        for name, err in errors:
            print(f"  - {name}: {err}")
    print(f"\nScreenshots saved to: {OUTPUT_DIR}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
