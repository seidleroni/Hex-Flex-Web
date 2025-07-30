
# 2. Core Concepts

This document explains the fundamental data structures, algorithms, and patterns that are critical to the functionality and performance of Hex Flex.

---

### 1. The `SparseMemory` Data Structure

**File:** `services/sparseMemory.ts`

**Problem:** A 32-bit address space is 4GB. Creating a 4GB array in JavaScript (`new Array(0xFFFFFFFF)`) would instantly crash the browser tab. Firmware files are almost always *sparse*, meaning they have data in a few locations with vast empty gaps in between.

**Solution:** `SparseMemory` implements a memory-efficient sparse map.

-   **Implementation:** It uses a JavaScript `Map` object. Instead of storing every byte, it divides the 4GB address space into fixed-size "blocks" (e.g., 64KB). The `Map`'s keys are the starting addresses of these blocks. The values are arrays (`(number | null)[]`) representing the data within that block.
-   **Efficiency:** If a block of memory has no data, there is no corresponding entry in the `Map`, and no array is allocated for it. This saves enormous amounts of memory.
-   **Key Methods:**
    -   `setByte(address, value)`: Calculates the block key and offset for the given address. If the block doesn't exist, it creates it on-demand before setting the byte value.
    -   `getByte(address)`: Calculates the block key and offset. If the block exists, it returns the byte; otherwise, it returns `null`.
    -   `getDataSegments()`: This is a crucial method for the UI. It iterates through all the data and identifies contiguous regions of "meaningful" data (not empty or 0xFF). It's smart enough to merge small gaps, providing the `SegmentPanel` with a clean list of data chunks to display.

---

### 2. High-Performance Rendering: Virtualization

**File:** `components/shared/VirtualizedHexView.tsx`

**Problem:** A hex file can represent millions of lines of data. If we tried to render a `<tr>` (table row) element for every line, we would create tens of thousands of DOM elements. The DOM is a heavy data structure; creating and managing that many elements would make the browser slow, unresponsive, and consume a lot of memory.

**Solution:** We use a technique called **virtualization** (or "windowing"). We only render the items that are currently visible in the user's viewport.

-   **How it works:**
    1.  **Sizing the Scrollbar:** The component first calculates the total height the container *would* have if all rows were rendered (e.g., `totalRowCount * ROW_HEIGHT_PX`). It sets this height on a "scroller" div. This creates a correctly-sized scrollbar, giving the user the illusion that all the content is there.
    2.  **Listening to Scroll:** An event listener on the scrollable container tracks the `scrollTop` position.
    3.  **Calculating the "Window":** Based on the `scrollTop` and the height of the viewport, the component calculates which rows should be visible (e.g., `startIndex` to `endIndex`). It usually adds a small buffer of rows above and below for a smoother scrolling experience.
    4.  **Rendering the Slice:** It renders *only* the small slice of rows for the calculated window.
    5.  **Positioning the Slice:** It uses a CSS `transform: translateY(...)` property to move the rendered slice of rows to the correct vertical position within the tall scroller div.

This ensures that whether the file has 100 rows or 100,000, we only ever have a few dozen DOM elements active at any time, keeping the application fast and responsive.

---

### 3. Logic and State Management: React Hooks

In React, a "hook" is a special function that starts with `use`. Hooks let you use state and other React features inside your components without writing classes.

-   **`useState`**: The most common hook. It's like declaring a local variable, but when you update it, React automatically re-renders the component.
    ```typescript
    const [isLoading, setIsLoading] = useState(false);
    // ...later in an event handler...
    setIsLoading(true); // This tells React to re-render the UI
    ```

-   **`useEffect`**: Lets you perform "side effects"—actions that aren't part of the main rendering logic, like fetching data, subscribing to events, or directly manipulating the DOM.
    -   **Analogy**: It's like registering a callback to run *after* the UI has been updated. You can provide a "dependency array" to control when it re-runs.

-   **`useMemo` & `useCallback`**: These are performance optimization hooks.
    -   `useMemo` will memoize the *result* of a complex calculation. The calculation is only re-run if one of its dependencies changes. We use this to avoid re-calculating the `virtualRows` or the `comparisonResult` on every single render.
    -   `useCallback` will memoize a *function definition*. This is useful when passing callbacks to child components to prevent them from re-rendering unnecessarily.

-   **Custom Hooks (`hooks/`)**: We encapsulate complex, stateful logic into our own custom hooks to keep components clean and the logic reusable.
    -   `useHexFileParser`: Manages all the state for a single file (`memory`, `isLoading`, `error`, `fileName`) and contains the logic for parsing it.
    -   `useHexFileComparison`: Similar, but manages the state for *two* files (`fileA`, `fileB`).
    -   `useSegmentManager`: Manages the state related to data segments (`segments`, `activeSegmentIndex`).

---

### 4. High-Performance Drawing: The `<canvas>`

**Files:** `components/shared/GenericMinimap.tsx`, `components/MemoryMinimap.tsx`

**Problem:** The minimap visualizes the entire memory space. Using DOM elements (e.g., thousands of `<div>`s) to draw the tiny pixels of the minimap would be extremely slow.

**Solution:** The `<canvas>` HTML element provides a low-level, 2D drawing API, much like a simple graphics library (e.g., SDL, Skia).

-   **How it works:** `GenericMinimap` is a reusable component that sets up the canvas and handles all user interaction (clicking, dragging to navigate). It exposes a `drawData` prop.
-   The specific minimap components (`MemoryMinimap`, `ComparisonMinimap`) pass a `drawData` function to `GenericMinimap`. This function contains the logic for how to color the pixels.
-   It iterates through the pixels of the canvas and maps them to ranges of rows in the data. It then summarizes the data in that range (e.g., "does this pixel contain modified bytes?") and draws a single pixel of the appropriate color. This is far more efficient than creating thousands of objects.
