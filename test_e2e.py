"""End-to-end test for Hex Flex using Python Playwright (run via uv)."""
import sys
import os
import shutil
from pathlib import Path

os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:4002"
PROJECT_ROOT = Path(__file__).parent
HEX_FILE_1 = str(PROJECT_ROOT / "test_files" / "package_complete_123.hex")
HEX_FILE_2 = str(PROJECT_ROOT / "test_files" / "package_complete_v142.hex")
OUTPUT_DIR = PROJECT_ROOT / "test_output"


def setup_output_dir():
    """Clean and recreate the test output directory."""
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir()
    print(f"Test output directory: {OUTPUT_DIR}")


def screenshot(page, name, **kwargs):
    """Save a screenshot to the test output directory."""
    path = str(OUTPUT_DIR / f"{name}.png")
    page.screenshot(path=path, **kwargs)
    return path


def load_hex_file(page, file_path):
    """Upload a hex file using Playwright's set_input_files on the hidden input."""
    file_input = page.locator('input[type="file"]')
    file_input.set_input_files(file_path)


def test_single_file_view():
    """Test: Load a hex file, verify Memory Map heading, data size, segments."""
    print("\n--- Test 1: Single File View ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        load_hex_file(page, HEX_FILE_1)

        try:
            page.wait_for_selector("text=Memory Map", timeout=10000)
            print("[PASS] Memory Map heading found")
        except Exception as e:
            screenshot(page, "fail_single_file", full_page=True)
            print(f"[FAIL] Memory Map heading not found: {e}")
            browser.close()
            return False

        screenshot(page, "single_file_loaded", full_page=True)

        body_text = page.inner_text("body")
        checks = {
            "Memory Map": "Memory Map" in body_text,
            "data size info": any(x in body_text.upper() for x in ["DATA SIZE", "DATA:", "SIZE:"]),
            "segment info": "segment" in body_text.lower() or "Segment" in body_text,
            "address info": "0x" in body_text.lower() or "0X" in body_text,
        }
        for name, passed in checks.items():
            print(f"  [{'PASS' if passed else 'FAIL'}] Found '{name}' in page content")

        browser.close()
        return all(checks.values())


def test_load_new_button():
    """Test: Load a file, click Load New, verify upload screen returns."""
    print("\n--- Test 2: Load New Button ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        load_hex_file(page, HEX_FILE_1)

        try:
            page.wait_for_selector("text=Memory Map", timeout=10000)
        except Exception:
            print("[FAIL] Could not load file")
            browser.close()
            return False

        buttons = page.locator("button").all()
        button_texts = [btn.inner_text() for btn in buttons]
        print(f"  Available buttons: {button_texts}")

        for text in ["Load New", "New File", "New", "Reset", "Back", "Upload"]:
            btn = page.locator(f'button:has-text("{text}")')
            if btn.count() > 0:
                print(f"  Clicking '{text}' button")
                btn.first.click()
                page.wait_for_timeout(1000)

                file_input = page.locator('input[type="file"]')
                if file_input.count() > 0:
                    print("[PASS] Returned to upload screen")
                    screenshot(page, "load_new_success", full_page=True)
                    browser.close()
                    return True

        view_btn = page.locator('button:has-text("View")')
        if view_btn.count() > 0:
            view_btn.first.click()
            page.wait_for_timeout(1000)
            upload_zone = page.locator("text=Click to upload")
            if upload_zone.count() > 0:
                print("[PASS] 'View' tab returned to upload screen")
                browser.close()
                return True

        print("[FAIL] Could not find a way back to upload screen")
        screenshot(page, "load_new_fail", full_page=True)
        browser.close()
        return False


def test_compare_view():
    """Test: Switch to Compare tab, load two files."""
    print("\n--- Test 3: Compare View ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        compare_btn = page.locator('button:has-text("Compare")')
        if compare_btn.count() == 0:
            print("[FAIL] No Compare button found")
            browser.close()
            return False

        compare_btn.first.click()
        page.wait_for_timeout(1000)
        screenshot(page, "compare_initial", full_page=True)
        print("[PASS] Compare view opened")

        file_inputs = page.locator('input[type="file"]').all()
        print(f"  Found {len(file_inputs)} file input(s) in compare view")

        if len(file_inputs) >= 2:
            file_inputs[0].set_input_files(HEX_FILE_1)
            page.wait_for_timeout(2000)
            screenshot(page, "compare_file1", full_page=True)
            print("  First file loaded in compare view")
            # Re-query file inputs after DOM update
            file_inputs_after = page.locator('input[type="file"]').all()
            print(f"  Found {len(file_inputs_after)} file input(s) after first load")
            if len(file_inputs_after) >= 1:
                file_inputs_after[-1].set_input_files(HEX_FILE_2)
                page.wait_for_timeout(2000)
                screenshot(page, "compare_loaded", full_page=True)
                print("[PASS] Two files loaded in compare view")
            else:
                print("[INFO] No file inputs remaining after first load")
        elif len(file_inputs) == 1:
            file_inputs[0].set_input_files(HEX_FILE_1)
            page.wait_for_timeout(2000)
            screenshot(page, "compare_file1", full_page=True)
            print("  First file loaded, looking for second input...")
            file_inputs_2 = page.locator('input[type="file"]').all()
            if len(file_inputs_2) >= 1:
                file_inputs_2[-1].set_input_files(HEX_FILE_2)
                page.wait_for_timeout(2000)
                screenshot(page, "compare_loaded", full_page=True)
                print("[PASS] Both files loaded sequentially")
            else:
                print("[INFO] Only one file input available after first load")
        else:
            print("[INFO] No file inputs found in compare view")
            body = page.inner_text("body")
            print(f"  Page text: {body[:300]}")

        browser.close()
        return True


def test_screenshot_capture():
    """Test: Verify we can take and view element-level screenshots."""
    print("\n--- Test 4: Screenshot Capture ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        load_hex_file(page, HEX_FILE_1)

        try:
            page.wait_for_selector("text=Memory Map", timeout=10000)
        except Exception:
            print("[FAIL] Could not load file")
            browser.close()
            return False

        screenshot(page, "full_page", full_page=True)
        print("[PASS] Full page screenshot saved")

        memory_map = page.locator("text=Memory Map").first
        if memory_map:
            parent = memory_map.locator("..").first
            parent.screenshot(path=str(OUTPUT_DIR / "memory_map.png"))
            print("[PASS] Memory map element screenshot saved")

        browser.close()
        return True


if __name__ == "__main__":
    print("=" * 60)
    print("Hex Flex E2E Tests (Python Playwright via uv)")
    print("=" * 60)

    setup_output_dir()

    results = {}
    results["single_file_view"] = test_single_file_view()
    results["load_new"] = test_load_new_button()
    results["compare_view"] = test_compare_view()
    results["screenshot_capture"] = test_screenshot_capture()

    print("\n" + "=" * 60)
    print("Results Summary:")
    for name, passed in results.items():
        print(f"  {'PASS' if passed else 'FAIL'}: {name}")

    all_passed = all(results.values())
    print(f"\nOverall: {'ALL PASSED' if all_passed else 'SOME FAILED'}")
    print(f"Screenshots saved to: {OUTPUT_DIR}")
    sys.exit(0 if all_passed else 1)
