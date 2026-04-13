# Known Bugs & Issues

Tracked issues in the current React codebase. These should be referenced during the Blazor migration — fix them in the new implementation rather than carrying them forward.

## Bugs

### BUG-001: Race condition in VirtualizedHexView highlight timeout
**File:** `components/shared/VirtualizedHexView.tsx` ~line 134
**Issue:** `setInternalHighlightedRowStart` and `setInternalHighlightedByteAddress` are cleared via `setTimeout` after 2 seconds, but if the user navigates again within that window, the old timeout fires and clears the new highlight.
**Fix:** Store the timeout ID and clear the previous timeout before setting a new one.
**Severity:** Low — cosmetic flicker on rapid navigation

### BUG-002: DiffNavigator icon names are swapped
**File:** `components/comparison/DiffNavigator.tsx` ~lines 14, 23
**Issue:** "Previous" button uses `GoToNextIcon` (rotated), "Next" uses `GoToPreviousIcon` (rotated). Visually correct but semantically backwards.
**Fix:** Swap icon usage or rename icons to match intent.
**Severity:** Low — code maintainability only, no visual bug

## Issues

### ISSUE-001: Unused Google GenAI dependency
**Files:** `index.html` line 15, `vite.config.ts` lines 8-9
**Issue:** `@google/genai` is imported in the HTML import map and referenced in vite config (`GEMINI_API_KEY`) but never used in any source file.
**Fix:** Remove from import map and vite config unless planned for future use.
**Severity:** Low — adds unnecessary network request on page load

### ISSUE-002: File validator only checks first 5 lines
**File:** `services/fileValidator.ts` ~lines 20-24
**Issue:** Validation only inspects the first 5 lines of the file. A file could pass validation but have malformed records later. The parser's checksum validation catches most of these, but the error message from the validator vs parser may confuse users.
**Fix:** Accept as "best effort" validation, or increase sample size. Parser checksum is the real safety net.
**Severity:** Low — parser catches downstream errors

### ISSUE-003: Hardcoded width threshold for ASCII display toggle
**File:** `components/shared/VirtualizedHexView.tsx` ~line 48
**Issue:** ResizeObserver uses magic number `680` for toggling ASCII column visibility.
**Fix:** Extract to `constants.ts` as `ASCII_DISPLAY_WIDTH_THRESHOLD`.
**Severity:** Low — maintainability

### ISSUE-004: ComparisonMinimap diff coloring priority undocumented
**File:** `components/ComparisonMinimap.tsx` ~lines 43-73
**Issue:** When a pixel range contains multiple diff types, priority is: Modified > Added > Removed > Data. This is sensible but undocumented — a `break` statement exits early when modified bytes are found.
**Fix:** Add comments documenting the priority order.
**Severity:** Low — code clarity

### ISSUE-005: No React Error Boundary
**Issue:** No Error Boundary component wrapping the app. JavaScript errors in any component crash the entire application with no recovery.
**Fix:** Add an Error Boundary wrapper with a user-friendly error message and "reload" button.
**Severity:** Medium — poor user experience on any rendering error

### ISSUE-006: Extended Segment Address records (type 0x02) are silently ignored
**File:** `services/hexParser.ts`
**Issue:** Record type 0x02 (Extended Segment Address) is not processed — only type 0x04 (Extended Linear Address) is handled. Most modern firmware uses 0x04, but some older tools emit 0x02 records. Files using only 0x02 for addressing above 64KB would parse incorrectly.
**Fix:** Implement type 0x02 handling: `baseAddress = (data[0] << 8 | data[1]) << 4`
**Severity:** Medium — would silently produce wrong addresses for files using segment addressing
