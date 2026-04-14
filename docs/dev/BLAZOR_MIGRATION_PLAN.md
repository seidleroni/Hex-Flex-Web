# Blazor Migration Plan

## Status

| Phase | Description | Status |
|---|---|---|
| 0 | Setup & Ground Truth Baseline | Complete |
| 1 | Core Services (C# Port) | Complete |
| 2 | Blazor Shell + File Upload | Complete ✓ |
| 3 | Single File View — Statistics & Segments | Complete ✓ |
| 4 | Single File View — Hex/ASCII Table | Complete ✓ |
| 5 | Minimap (Single File) | Complete ✓ |
| 6 | Compare View | Not Started |
| 7 | Polish & Parity | Not Started |

**Current phase:** Phase 5 approved. Proceeding to Phase 6.

---

## Goal

Convert the Hex Flex React/TypeScript app to Blazor WebAssembly (C#/.NET), piece by piece, testing each piece before moving to the next. The React app stays fully functional on `master` throughout.

## Branch

All work on `branch/blazor-migration`. Frequent commits. Push only after human-confirmed checkins.

## Tooling

| Purpose | Tool |
|---|---|
| .NET build/run | `dotnet` CLI |
| .NET packages | NuGet (via `dotnet add package`) |
| .NET unit tests | xUnit + `dotnet test` |
| E2E browser tests | Python Playwright via `uv run python <script>` |
| Hex parsing ground truth | Python `intelhex` library via `uv` |
| HTTP serving | `uv run python -m http.server` |
| Test/validation scripts | Python via `uv run python <script>` |
| Any other Python needs | `uv` (always) |

All Python dependencies are declared in `pyproject.toml` — no `--with` flags needed.

## Architecture Decision: Blazor WebAssembly

- **Client-side only** — no server needed, same deployment model as current React app
- Tradeoff: ~5-10MB initial .NET runtime download (vs current ~100KB bundle)
- Benefit: Full C# ecosystem, type safety, potential for shared libraries with other .NET projects

---

## Phase 0: Setup & Ground Truth Baseline

**Goal:** Create the Blazor project, establish testing infrastructure, and generate ground-truth parsing data from a vetted reference tool (Python `intelhex`).

We do NOT assume the React app is correct. Instead we validate against `intelhex`, a well-established library used across the firmware industry.

### Tasks
1. Create Blazor WASM project: `dotnet new blazorwasm -n HexFlex.Blazor`
2. Set up xUnit test project: `dotnet new xunit -n HexFlex.Tests`
3. Add Playwright E2E test scaffold (Python, in `pyproject.toml`)
4. **Generate ground-truth fixtures using Python `intelhex`:**
   - Parse both test hex files with `intelhex`
   - Extract: start address, end address, data size, segment boundaries
   - Extract: raw byte values at all addresses (full dump)
   - Save as JSON fixtures in `test_output/fixtures/`
5. **Generate comparison ground truth:**
   - Compare the two test files byte-by-byte using `intelhex`
   - Compute: modified/added/removed byte counts
   - Save as JSON fixture
6. Verify the React app's output against these fixtures (are there discrepancies?)

### Checkin 0
- [ ] Blazor project builds and runs (shows default template)
- [ ] xUnit project runs with a placeholder test
- [ ] Ground-truth fixtures generated from `intelhex`
- [ ] React app output compared against ground truth — discrepancies documented
- [ ] Human reviews fixtures and any discrepancies

---

## Phase 1: Core Services (C# Port)

**Goal:** Port the core parsing/memory/comparison logic to C# and prove it matches the `intelhex` ground truth byte-for-byte.

### Tasks
1. Port `SparseMemory` — block-based sparse memory structure
2. Port `hexParser` — Intel HEX record parsing with checksum validation
   - **Fix ISSUE-006:** Implement Extended Segment Address (type 0x02) support
3. Port `memoryComparer` — byte-level diff engine
4. Port `fileValidator` — basic format validation
5. Write xUnit tests validating against the ground-truth JSON fixtures
6. Write a Python cross-validation script (via `uv`) that:
   - Runs the C# parser on test files via `dotnet run`
   - Loads the `intelhex` ground-truth fixtures
   - Compares outputs byte-for-byte
   - Reports any discrepancies

### Checkin 1
- [ ] All xUnit tests pass
- [ ] Cross-validation shows 0 discrepancies between C# parser and `intelhex` ground truth
- [ ] Comparison logic produces correct diff statistics (validated against ground truth)
- [ ] Human reviews test output and cross-validation report

---

## Phase 2: Blazor Shell + File Upload

**Goal:** Basic Blazor app with navigation (View/Compare tabs) and file upload.

### Tasks
1. Set up Playwright E2E scaffold for Blazor app (separate from React test file)
2. Set up Blazor layout: Header, Footer, main content area + E2E test
3. Implement View/Compare tab switching + E2E test
4. Implement file upload component (drag-drop + click) + E2E test
5. Wire up hex file parsing on upload (using Phase 1 services)
6. Display basic file info after upload (filename, data size, segment count) + E2E test (validated against ground truth)
7. Style with CSS to roughly match current dark theme

### Checkin 2
- [ ] Blazor app runs, shows header/footer/tabs
- [ ] File upload works (drag-drop and click)
- [ ] File info displays correctly after upload
- [ ] Playwright tests pass
- [ ] Human tests in browser

---

## Phase 3: Single File View — Statistics & Segments

**Goal:** Display the parsed file data: statistics bar, segment panel, basic memory info.

### Tasks
1. Implement Statistics component (start address, end address, data size)
2. Implement SegmentPanel component (clickable segment list)
3. Implement "Load New" button to return to upload screen
4. Implement "Go to address" search box
5. Playwright E2E tests:
   - Statistics show correct values (cross-check with ground-truth fixtures)
   - Segment list shows correct segments with addresses and sizes
   - Load New returns to upload screen
   - Address search navigates correctly

### Checkin 3
- [ ] Statistics display matches ground truth for both test files
- [ ] Segment panel shows correct segments
- [ ] Load New and address search work
- [ ] Playwright tests pass
- [ ] Human reviews statistics output

---

## Phase 4: Single File View — Hex/ASCII Table

**Goal:** The main hex viewer: address column, hex bytes, ASCII representation, with virtual scrolling.

### Tasks
1. Implement hex table layout (address | hex bytes | ASCII)
2. Implement virtual scrolling for performance with large files
3. Implement gap row collapsing for non-contiguous memory regions
4. Implement segment-based coloring
5. Wire up segment click -> scroll to segment
6. Wire up address search -> scroll to address
7. Implement byte highlighting on hover/click
8. Playwright E2E tests:
   - Table renders with correct hex values at known addresses (spot-checked against ground truth)
   - Virtual scrolling works (scroll down, verify new rows load)
   - Gap rows appear between non-contiguous segments
   - Segment click scrolls to correct position
   - Screenshot review

### Checkin 4
- [ ] Hex table renders correctly for both test files
- [ ] Hex byte values verified correct at spot-checked addresses
- [ ] Virtual scrolling performs well (no visible lag)
- [ ] Gap rows and segment navigation work
- [ ] Playwright tests pass
- [ ] Human scrolls through the hex view, verifies data looks correct

---

## Phase 5: Minimap (Single File)

**Goal:** Canvas-based memory minimap showing data density and navigation.

### Tasks
1. Implement minimap using Blazor's JS interop for canvas rendering
   - Alternative: SVG-based minimap (no JS interop needed, but less performant)
2. Implement click-to-navigate on minimap
3. Implement viewport indicator (shows current scroll position)
4. Implement minimap legend
5. Playwright E2E tests:
   - Minimap renders (screenshot check)
   - Click on minimap scrolls hex view

### Checkin 5
- [ ] Minimap renders and shows data segments visually
- [ ] Click navigation works
- [ ] Playwright tests pass
- [ ] Human tests minimap interaction

---

## Phase 6: Compare View

**Goal:** Side-by-side file comparison with diff highlighting.

### Tasks
1. Implement comparison view layout (File A / File B upload slots)
2. Implement FileSummaryCard for each file
3. Implement DiffStatistics component (modified/added/removed counts)
4. Implement ComparisonMap (hex table with diff coloring)
5. Implement DiffLegend
6. Implement DiffNavigator (previous/next diff buttons)
   - **Fix BUG-002:** Use correct icon mapping for prev/next
7. Implement comparison minimap
8. Implement "New" button on each file slot to swap files
9. Playwright E2E tests:
   - Two files load correctly in compare mode
   - Diff statistics match ground-truth comparison fixture
   - Diff coloring appears at correct addresses
   - Diff navigator cycles through changes

### Checkin 6
- [ ] Compare view works end-to-end
- [ ] Diff statistics match ground truth (verified by cross-validation)
- [ ] Diff coloring is correct at spot-checked addresses
- [ ] Navigator works
- [ ] Playwright tests pass
- [ ] Human loads both test files, reviews diff output

---

## Phase 7: Polish & Parity

**Goal:** Achieve full feature parity with the React app, fix remaining bugs, polish UI.

### Tasks
1. Match styling closely with React app (dark theme, colors, spacing)
2. Responsive layout adjustments
3. **Fix BUG-001:** Proper timeout management for highlights
4. **Implement ISSUE-005:** Add error boundary / error handling for graceful failure
5. **Fix ISSUE-003:** Extract magic numbers to constants
6. **Remove ISSUE-001:** No unused GenAI dependency in Blazor version
7. Performance testing with large files
8. Accessibility review (keyboard navigation, screen reader support)
9. Full Playwright regression suite covering all test scenarios from TESTING.md

### Checkin 7 (Final)
- [ ] Full feature parity with React app
- [ ] All known bugs from BUGS.md addressed
- [ ] All Playwright tests pass
- [ ] Performance acceptable with both test files
- [ ] Human does full walkthrough: upload, view, navigate, compare, diff-navigate
- [ ] Ready to discuss merging strategy (replace React app? keep both? gradual rollout?)

---

## Validation Strategy

Ground truth comes from **established reference tools**, not from the React app:

```
Python intelhex (vetted library)  ──→  JSON fixtures  ←──  C# Services (xUnit)
                                              ↕
                                   Blazor App (Playwright E2E)
```

1. **Byte-level validation:** Parse test hex files with `intelhex`, compare C# parser output byte-for-byte
2. **Diff validation:** Compute diffs with `intelhex`, compare against C# comparer output
3. **Visual validation:** Playwright screenshots at each phase, human reviews
4. **Statistics validation:** Compare computed statistics (data size, segment count, diff counts) against ground truth
5. **React app check:** Optionally compare React app output against the same ground truth to identify any existing bugs

## Checkin Protocol

One checkin between each phase. At each checkin:
1. Claude summarizes what was implemented since last checkin
2. Claude lists what is working and what can be tested
3. Claude lists any known issues or deviations from plan
4. Claude lists any bugs found (from BUGS.md or new discoveries)
5. **Human reviews and confirms** before:
   - Pushing commits to remote
   - Proceeding to next phase
6. Human may request changes, additional tests, or course corrections
