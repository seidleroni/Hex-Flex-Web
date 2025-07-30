
# 4. Walkthrough: Comparison View

This document traces the flow of data and events for the "Compare" mode. It builds on the concepts from the single file view, adding a layer of diffing logic.

---

### Step 1: Switching to Compare Mode

1.  The user clicks the "Compare" button in the `Header`.
2.  The `setViewMode('compare')` function is called in `App.tsx`.
3.  The `App` component re-renders, and because `viewMode` is now `'compare'`, it renders the `<ComparisonView />` component.

### Step 2: Uploading Files

1.  `ComparisonView` calls the `useHexFileComparison` hook. This hook is similar to the one for the single view but uses a `useReducer` to manage the state of two files (`fileA` and `fileB`) independently within a single state object.
2.  Initially, neither file is loaded. The view renders two `<FileSlot />` components. Each `FileSlot` contains a `<FileUpload />` prompt.
3.  The user uploads a file into the "File A" slot.
    -   The `onFileSelect` prop is wired to `parseFileA` from the `useHexFileComparison` hook.
    -   The hook `dispatches` a `'PARSE_START'` action for `fileA`. The reducer updates the state to show a loading spinner for File A.
    -   The parsing logic (using `hexParser.ts`) is identical to the single file view.
    -   On completion, the hook dispatches either a `'PARSE_SUCCESS'` or `'PARSE_ERROR'` action with the result for `fileA`. The `FileSummaryCard` for File A is now displayed.
4.  The user uploads a second file into the "File B" slot. The same process occurs for `fileB`.

### Step 3: The Comparison Logic

1.  `ComparisonView` has a critical `useMemo` block that depends on `fileA.memory` and `fileB.memory`.
    ```typescript
    const comparisonResult = useMemo(() => {
      if (fileA.memory && fileB.memory) {
        return compareMemory(fileA.memory, fileB.memory);
      }
      return null;
    }, [fileA.memory, fileB.memory]);
    ```
2.  As soon as both `fileA.memory` and `fileB.memory` are available, this memoized function runs.
3.  It calls `compareMemory(memoryA, memoryB)` from `services/memoryComparer.ts`. This is the entry point to the diffing engine.

### Step 4: Inside the `memoryComparer` Service

1.  The `compareMemory` function creates a new instance of the `ComparisonMemory` class.
2.  The `ComparisonMemory` constructor performs the entire diffing operation:
    -   It gets the set of all memory block keys present in *either* file A or file B.
    -   It iterates through every address that contains data in at least one of the files.
    -   For each address, it gets `byteA` and `byteB` from the respective `SparseMemory` objects.
    -   It compares them and determines a `DiffType`: `Unchanged`, `Modified`, `Added`, or `Removed`.
    -   It stores the result in a `diffMap`: a `Map<number, DiffEntry>` where the key is the address and the value is an object `{ type, byteA, byteB }`.
    -   While doing this, it also increments counters for the `DiffStats` (`modified`, `added`, `removed`).
    -   After the `diffMap` is built, it calls an internal `_buildVirtualRows()` method. This method works similarly to the one in the single file view, creating an array of `virtualRows` to be used by the virtualized renderer, but it bases the rows on addresses present in the `diffMap`.

3.  The `compareMemory` function returns the fully populated `comparisonResult` object.

### Step 5: Rendering the Comparison View

1.  Back in `ComparisonView`, the `comparisonResult` is now a `ComparisonMemory` object.
2.  The component re-renders and now displays the full comparison UI:
    -   `<DiffStatistics />`, which displays the stats from `comparisonResult.getStats()`.
    -   `<DiffLegend />`, which shows the color key for the different diff types.
    -   `<ComparisonMap />`, which is the main display. It receives the `comparisonResult` object.

### Step 6: The `ComparisonMap` and Diff Rendering

1.  `ComparisonMap` operates very similarly to `MemoryMap`, using `VirtualizedHexView` to render the data.
2.  The key difference is in its `renderDataRow` function. For each visible row, it iterates through the 16 bytes.
3.  For each byte, it calls `comparison.getDiffEntry(address)` to get the `DiffEntry` object from the `diffMap`.
4.  It then renders a `<DiffHexByte />` and `<DiffAsciiChar />` component for each byte.
5.  **Inside `DiffHexByte` / `DiffAsciiChar`**: These are small, specialized components. They take a `diff` object as a prop. They use a helper function, `getDiffStyle`, to apply a background color based on `diff.type`. They also apply different text colors or styles (like `line-through` for removed bytes) to make the differences clear.

### Step 7: Navigating Differences

1.  `ComparisonMap` renders a `<DiffNavigator />` component if there are any differences.
2.  In a `useMemo` hook, `ComparisonMap` calls `comparison.getDiffAddresses()` to get a pre-sorted array of all addresses where `type !== DiffType.Unchanged`.
3.  When the user clicks the "Next Diff" button in the `DiffNavigator`:
    -   The `handleNextDiff` function is called.
    -   It finds the current highlighted address in the `diffAddresses` array.
    -   It determines the index of the *next* address in the array.
    -   It calls `viewRef.current.goToAddress(nextAddress, nextAddress)`. Note the second argument: this tells `VirtualizedHexView` to also highlight the specific byte at that address.
    -   The process is analogous for `handlePreviousDiff`.
