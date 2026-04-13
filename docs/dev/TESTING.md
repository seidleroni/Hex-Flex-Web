# Testing Hex Flex with Playwright

## Overview

Playwright can be used to do full end-to-end testing of Hex Flex by building the app, serving it locally, and driving a real browser to load hex files and verify the UI. This all runs through Bash, so no additional permission prompts are needed in Claude Code.

We use **Python Playwright via `uv`** so the Node project stays clean (only esbuild as a dev dependency) and all test tooling is managed by `uv`.

## Setup (one-time)

```bash
uv tool install playwright
playwright install chromium
```

## How It Works

### 1. Build and Serve

```bash
npm run build
cp test_files/*.hex dist/
cd dist && uv run python -m http.server 4002 &
```

### 2. Load a Hex File via Playwright

The file input is hidden (`className="hidden"`) but Playwright's `set_input_files` works directly on hidden inputs — no JavaScript injection needed.

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:4002")
    page.wait_for_load_state("networkidle")

    # Upload a hex file using Playwright's native file upload
    file_input = page.locator('input[type="file"]')
    file_input.set_input_files("test_files/package_complete_123.hex")

    # Wait for the memory map to render
    page.wait_for_selector("text=Memory Map", timeout=10000)

    # Take a screenshot
    page.screenshot(path="screenshot.png", full_page=True)

    # Read text content to verify
    body_text = page.inner_text("body")
    assert "Memory Map" in body_text
    assert "0x" in body_text.lower()

    browser.close()
```

Run with: `uv run python test_e2e.py` (playwright is declared in `pyproject.toml`)

### 3. Playwright Capabilities Relevant to Hex Flex

- **File upload**: `locator('input[type="file"]').set_input_files(path)` — works on hidden inputs
- **Click** elements: `page.locator('button:has-text("Compare")').click()`
- **Scroll**: `page.mouse.wheel(0, 500)` or `element.scroll_into_view_if_needed()`
- **Take screenshots**: `page.screenshot(path="out.png")` — Claude can then read these with the Read tool
- **Element screenshots**: `element.screenshot(path="part.png")` for capturing specific components
- **Read page text**: `page.inner_text("body")`, `locator.text_content()`
- **Evaluate JS**: `page.evaluate("document.title")`
- **Wait for state**: `page.wait_for_selector()`, `page.wait_for_load_state()`

### 4. Test Scenarios (Verified)

| Scenario | How to verify | Status |
|---|---|---|
| Single file view | Load a hex file, check Memory Map heading, addresses, data size, segments | Verified |
| Load New button | Load a file, click "Load New", verify upload screen returns with file input | Verified |
| Compare view | Click Compare tab, load two files sequentially (DOM updates after first), check diff renders | Verified |
| Screenshot capture | Full page and element-level screenshots, viewable via Claude's Read tool | Verified |

### 5. Compare View Notes

The compare view starts with 2 file inputs (File A and File B). After loading File A, the DOM updates and only 1 file input remains (for File B). Tests must **re-query** `input[type="file"]` after loading the first file:

```python
# Load first file
page.locator('input[type="file"]').first.set_input_files(HEX_FILE_1)
page.wait_for_timeout(2000)

# Re-query — DOM has changed
page.locator('input[type="file"]').first.set_input_files(HEX_FILE_2)
```

### 6. Verifying Screenshots from Claude Code

Playwright saves screenshots to disk as PNG files. Claude Code can view these directly using the `Read` tool on the image path, since it supports reading image files. This closes the loop — no browser extension or MCP permissions needed.

## Test Output

All screenshots and artifacts are saved to `test_output/` (gitignored). The directory is cleaned and recreated at the start of each test run.

## Running the Test Suite

```bash
# Build, serve, and test in one go
npm run build
cp test_files/*.hex dist/
cd dist && uv run python -m http.server 4002 &
cd .. && PYTHONIOENCODING=utf-8 uv run python test_e2e.py

# Clean up the server when done
kill %1
```

Dependencies (`playwright`, `intelhex`, etc.) are declared in `pyproject.toml` and resolved automatically by `uv run`.

Note: On Windows, set `PYTHONIOENCODING=utf-8` to handle Unicode characters in button text (e.g., arrow symbols in segment labels).

## Test Files

Located in `test_files/`:
- `package_complete_123.hex` — ~1.8MB, 745.67 KB data, 3 segments
- `package_complete_v142.hex` — ~1.9MB, 764.64 KB data, 3 segments

## Cleanup

Kill the local server when done:

```bash
# Unix/Git Bash
kill %1

# Windows (if backgrounded process is lost)
netstat -ano | grep :4002 | grep LISTENING
taskkill //PID <pid> //F
```
