
# 3. Walkthrough: Single File View

This document traces the flow of data and events for the application's primary feature: viewing a single HEX file. We'll follow the journey from the user dropping a file to the memory grid being displayed and interacted with.

---

### Step 1: The Initial State

1.  The user loads the application. `App.tsx` is the root. Its `viewMode` state defaults to `'view'`.
2.  It therefore renders the `<SingleFileView />` component.
3.  `SingleFileView` calls our custom hook: `const [fileState, parseFile, reset] = useHexFileParser();`.
4.  Initially, `fileState.memory` is `null` and `fileState.isLoading` is `false`.
5.  Because `memory` is null, `SingleFileView` renders the welcome text and the `<FileUpload />` component.

### Step 2: File Upload and Parsing

1.  The user drags a `.hex` file onto the `<FileUpload />` component (or clicks to select it).
2.  `FileUpload` handles the browser's file events and calls the `onFileSelect` prop, passing the `File` object.
3.  In `SingleFileView`, this `onFileSelect` prop is wired to the `parseFile` function from our `useHexFileParser` hook.
4.  The `parseFile(file)` function is now executed. This is the start of the processing pipeline.

### Step 3: Inside the `useHexFileParser` Hook

1.  `setIsLoading(true)` is called. React re-renders `SingleFileView`, which now shows a loading spinner instead of the upload prompt.
2.  `isIntelHexFile(file)` from `services/fileValidator.ts` is called first. This service function quickly reads only the first few kilobytes of the file to validate that it looks like a HEX file (lines start with ':'). This prevents trying to parse a large binary file by mistake.
3.  If validation passes, the file content is read as text.
4.  `parseHexFile(content)` from `services/hexParser.ts` is called.
    -   This service function is pure logic. It splits the content into lines.
    -   It iterates through each line, parsing the byte count, address, and record type.
    -   It validates the checksum of every line to ensure data integrity.
    -   It handles different record types, most importantly:
        -   **Type 00 (Data Record):** It calculates the final absolute address (using the current Extended Linear Address) and calls `memory.setByte()` for each byte of data in the record.
        -   **Type 04 (Extended Linear Address):** It updates the high 16 bits of the address for subsequent data records.
    -   Finally, it returns a fully populated `SparseMemory` object.
5.  The hook receives the `parsedMemory` object and calls `setMemory(parsedMemory)`.
6.  `setIsLoading(false)` is called.
7.  Now, the `fileState` object in `SingleFileView` contains the populated `memory` object. React triggers a final re-render.

### Step 4: Rendering the `MemoryView`

1.  On this new render, `SingleFileView` sees that `fileState.memory` is no longer `null`.
2.  It now renders the main data display: `<MemoryView memory={memory} ... />`.
3.  `MemoryView` is the orchestrator for the main display. It does several things:
    -   It calculates statistics (`startAddress`, `endAddress`, etc.) using methods on the `memory` object. This calculation is wrapped in `useMemo` for efficiency.
    -   It renders the `Statistics` cards.
    -   It initializes the `useSegmentManager` hook, passing it the `memory` object. This hook calls `memory.getDataSegments()` to get the list of data blocks and manages which segment is currently active.
    -   If there is more than one segment, it renders the `<SegmentPanel />` on the left.
    -   It renders the core `<MemoryMap />` component, passing the `memory` object to it.

### Step 5: Rendering the `MemoryMap` and Virtualized Grid

1.  `MemoryMap` is a wrapper that combines the hex grid with the minimap.
2.  Its most important job is to prepare the data for the virtualized view. It analyzes the `memory` object's data segments to create a flat array of `virtualRows`. This array contains objects representing either a row of data (`{ type: 'data', ... }`) or a large gap (`{ type: 'gap', ... }`). This calculation is also wrapped in `useMemo`.
3.  `MemoryMap` then renders `<VirtualizedHexView />`, passing the `virtualRows` array and a function to render a single data row (`renderDataRow`).
4.  `VirtualizedHexView` takes over. As described in the Core Concepts, it renders only the visible slice of rows from the `virtualRows` array.
5.  The `renderDataRow` function (defined back in `MemoryMap`) is called for each visible data row. It gets the bytes for that row from `memory.getByte()` and renders the `ViewHexByte` and `ViewAsciiChar` components for the hex and ASCII views.

### Step 6: User Interaction

-   **Scrolling:**
    1.  The user scrolls the `VirtualizedHexView`.
    2.  The component's `onScroll` handler updates its internal `scrollTop` state, causing it to re-render the new "window" of rows.
    3.  The `onScrollUpdate` callback is also triggered. This flows up to `MemoryView`, which updates the `useSegmentManager` hook. The hook determines the new `activeSegmentIndex` based on the scroll position, which highlights the correct segment in the `SegmentPanel`.

-   **Jumping to an Address:**
    1.  The user types an address in the search box in `MemoryView` and hits Enter.
    2.  `MemoryView`'s `handleGoToAddress` function is called.
    3.  It accesses the `MemoryMap` component through a `ref` (a way to call methods on a child component directly). It calls `memoryMapRef.current.goToAddress(address)`.
    4.  `MemoryMap` in turn calls `viewRef.current.goToAddress(address)` on its child, `VirtualizedHexView`.
    5.  `VirtualizedHexView` finds the index of the virtual row corresponding to that address, calculates the required `scrollTop` value (`index * ROW_HEIGHT_PX`), and programmatically sets the scroll position of its container. It also briefly highlights the row for visual feedback.

-   **Clicking a Segment:**
    1.  The user clicks a segment in the `SegmentPanel`.
    2.  The `onSegmentClick(segment.start)` callback is triggered.
    3.  This calls `handleSegmentClick` in `MemoryView`, which then calls `memoryMapRef.current.goToAddress(address)`—the exact same mechanism as jumping to an address.
