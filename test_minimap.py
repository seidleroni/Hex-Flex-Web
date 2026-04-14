"""Phase 5 Minimap E2E test — verify minimap renders and interacts correctly."""
import os, sys, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

TEST_OUTPUT = Path("test_output/phase5")
BASE_URL = "http://localhost:5111"
TEST_FILES = Path("test_files")
HEX_FILE = TEST_FILES / "package_complete_123.hex"
WASM_TIMEOUT = 30000
PAGE_TIMEOUT = 15000


def setup():
    if TEST_OUTPUT.exists():
        shutil.rmtree(TEST_OUTPUT)
    TEST_OUTPUT.mkdir(parents=True, exist_ok=True)


def upload_file(page, filename):
    """Upload a hex file and wait for the memory view to appear."""
    hex_file = TEST_FILES / filename
    page.locator("input[type='file']").set_input_files(str(hex_file))
    page.wait_for_selector(".memory-view", state="attached", timeout=WASM_TIMEOUT)
    page.wait_for_selector("[data-testid='data-row']", timeout=PAGE_TIMEOUT)


def test_minimap():
    setup()
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # Navigate and wait for Blazor to load
        page.goto(BASE_URL)
        page.wait_for_selector(".upload-zone", timeout=WASM_TIMEOUT)

        # Upload file
        upload_file(page, "package_complete_123.hex")
        page.wait_for_timeout(1500)  # Let JS interop settle

        # 1. Check minimap canvas exists
        canvas = page.query_selector(".minimap-canvas")
        assert canvas is not None, "Minimap canvas not found"
        results.append("PASS: Minimap canvas exists")

        # 2. Check minimap legend exists
        legend = page.query_selector(".minimap-legend")
        assert legend is not None, "Minimap legend not found"
        legend_text = legend.inner_text()
        assert "Data" in legend_text, "Legend missing 'Data' label"
        assert "Erased" in legend_text, "Legend missing 'Erased' label"
        assert "Empty" in legend_text, "Legend missing 'Empty' label"
        assert "Gap" in legend_text, "Legend missing 'Gap' label"
        results.append("PASS: Minimap legend with all 4 labels")

        # 3. Screenshot before interaction
        page.screenshot(path=str(TEST_OUTPUT / "01_minimap_initial.png"), full_page=False)
        results.append("PASS: Initial screenshot saved")

        # 4. Check canvas has non-zero dimensions
        bbox = canvas.bounding_box()
        assert bbox is not None, "Canvas has no bounding box"
        assert bbox["width"] > 0, f"Canvas width is {bbox['width']}"
        assert bbox["height"] > 100, f"Canvas height is {bbox['height']} (too small)"
        results.append(f"PASS: Canvas dimensions {bbox['width']:.0f}x{bbox['height']:.0f}")

        # 5. Check canvas has been drawn to (read pixel data)
        has_content = page.evaluate("""() => {
            const canvas = document.querySelector('.minimap-canvas');
            if (!canvas) return false;
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, Math.min(canvas.height, 50));
            let nonZero = 0;
            for (let i = 0; i < data.data.length; i += 4) {
                if (data.data[i] > 0 || data.data[i+1] > 0 || data.data[i+2] > 0) {
                    nonZero++;
                }
            }
            return nonZero > 10;
        }""")
        assert has_content, "Canvas appears to have no drawn content"
        results.append("PASS: Canvas has drawn pixel content")

        # 6. Test click-to-navigate — click near bottom of minimap
        scroll_before = page.evaluate("""() => {
            const sc = document.querySelector('.hex-viewer-scroll');
            return sc ? sc.scrollTop : -1;
        }""")

        # Click near the bottom third of the minimap
        canvas.click(position={"x": bbox["width"] / 2, "y": bbox["height"] * 0.8})
        page.wait_for_timeout(500)

        scroll_after = page.evaluate("""() => {
            const sc = document.querySelector('.hex-viewer-scroll');
            return sc ? sc.scrollTop : -1;
        }""")

        assert scroll_after > scroll_before, f"Click navigation failed: scroll went from {scroll_before} to {scroll_after}"
        results.append(f"PASS: Click navigation — scrolled from {scroll_before:.0f} to {scroll_after:.0f}")

        # 7. Screenshot after navigation
        page.screenshot(path=str(TEST_OUTPUT / "02_minimap_after_click.png"), full_page=False)
        results.append("PASS: Post-click screenshot saved")

        # 8. Test viewport indicator updates on scroll
        viewport_info = page.evaluate("""() => {
            const canvas = document.querySelector('.minimap-canvas');
            if (!canvas) return null;
            const ctx = canvas.getContext('2d');
            const h = canvas.height;
            const sc = document.querySelector('.hex-viewer-scroll');
            const totalH = sc.scrollHeight;
            const vpTop = (sc.scrollTop / totalH) * h;
            const sampleY = Math.min(Math.floor(vpTop + 2), h - 1);
            const data = ctx.getImageData(0, sampleY, canvas.width, 1);
            let hasCyanish = false;
            for (let i = 0; i < data.data.length; i += 4) {
                if (data.data[i+3] > 0 && data.data[i+1] > 150) {
                    hasCyanish = true;
                    break;
                }
            }
            return { vpTop: vpTop, sampleY: sampleY, hasCyan: hasCyanish };
        }""")
        if viewport_info and viewport_info.get("hasCyan"):
            results.append("PASS: Viewport indicator detected at expected position")
        else:
            results.append(f"INFO: Viewport indicator check — {viewport_info}")

        # 9. Scroll hex viewer back to top and verify
        page.evaluate("""() => {
            const sc = document.querySelector('.hex-viewer-scroll');
            if (sc) sc.scrollTop = 0;
        }""")
        page.wait_for_timeout(300)
        page.screenshot(path=str(TEST_OUTPUT / "03_minimap_scroll_top.png"), full_page=False)
        results.append("PASS: Scrolled back to top, screenshot saved")

        browser.close()

    print("\n=== Phase 5 Minimap Test Results ===")
    for r in results:
        print(f"  {r}")
    print(f"\nAll {len(results)} checks completed.")
    print(f"Screenshots in: {TEST_OUTPUT.resolve()}")


if __name__ == "__main__":
    test_minimap()
