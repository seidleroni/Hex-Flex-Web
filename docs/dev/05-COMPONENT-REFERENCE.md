
# 5. Component Reference

This document serves as a high-level glossary of the most important components in the Hex Flex application, outlining their primary responsibilities.

---

## Top-Level & View Components

-   **`App.tsx`**
    -   **Role:** The root component of the application.
    -   **Responsibilities:** Holds the state for the current `viewMode` (`'view'` or `'compare'`). Renders the `Header`, `Footer`, and switches between `SingleFileView` and `ComparisonView` based on the mode.

-   **`views/SingleFileView.tsx`**
    -   **Role:** The main "page" for the single file viewer.
    -   **Responsibilities:** Orchestrates the entire single-file viewing experience. Uses the `useHexFileParser` hook to manage file state. Renders the `FileUpload` component initially, and then the `MemoryView` once a file is successfully parsed.

-   **`views/ComparisonView.tsx`**
    -   **Role:** The main "page" for the file comparison tool.
    -   **Responsibilities:** Orchestrates the comparison experience. Uses the `useHexFileComparison` hook. Renders two `FileSlot` components for uploads. Once two files are loaded, it calculates the `comparisonResult` and renders the `ComparisonMap`.

## Core Display Components

-   **`components/MemoryView.tsx`**
    -   **Role:** The main container for displaying a single parsed HEX file.
    -   **Responsibilities:** Renders the file title, `Statistics` cards, `SegmentPanel`, and the `MemoryMap`. Manages the "Go to Address" input and logic.

-   **`components/ComparisonMap.tsx`**
    -   **Role:** The main container for displaying the result of a file comparison.
    -   **Responsibilities:** Renders the `VirtualizedHexView` (configured for diffs), the `ComparisonMinimap`, and the `DiffNavigator`. It manages the state for navigating between differences.

-   **`components/MemoryMap.tsx`**
    -   **Role:** A wrapper that combines the virtualized hex grid (`VirtualizedHexView`) and the `MemoryMinimap` for the single file view.
    -   **Responsibilities:** Prepares the `virtualRows` data needed by `VirtualizedHexView` from a `SparseMemory` object.

-   **`components/shared/VirtualizedHexView.tsx`**
    -   **Role:** The high-performance, virtualized list renderer. This is a critical performance component.
    -   **Responsibilities:** Renders only the visible rows of a large dataset (the "windowing" technique). Handles scrolling logic, positioning the visible rows correctly, and provides an imperative API (`goToAddress`) for programmatic scrolling. It's generic and configured via props to render either normal data or diff data.

-   **`components/shared/GenericMinimap.tsx`**
    -   **Role:** A reusable, high-performance minimap renderer using the HTML `<canvas>` element.
    -   **Responsibilities:** Handles all canvas setup, resizing, and user interactions (clicking/dragging to navigate). It takes a `drawData` function as a prop, which defines *what* to draw, making the component reusable for both single-file and comparison views.

## UI & Helper Components

-   **`components/Header.tsx`**
    -   **Role:** The application's main header.
    -   **Responsibilities:** Displays the app title and the `ViewSwitcher` buttons that toggle the mode in the parent `App` component.

-   **`components/FileUpload.tsx`**
    -   **Role:** A reusable drag-and-drop file upload zone.
    -   **Responsibilities:** Manages the UI state for dragging and dropping. Handles file selection events and passes the selected `File` object to a parent component via a callback.

-   **`components/FileSlot.tsx`**
    -   **Role:** A component used in the `ComparisonView` to manage the state of a single file upload (File A or File B).
    -   **Responsibilities:** Displays the loading spinner, error messages, or the `FileSummaryCard` based on the state of a single file in the comparison.

-   **`components/SegmentPanel.tsx`**
    -   **Role:** The panel that lists the identified data segments.
    -   **Responsibilities:** Renders a clickable list of data segments. Highlights the segment currently visible in the viewport.

-   **`components/comparison/DiffNavigator.tsx`**
    -   **Role:** The UI for stepping through differences in the comparison view.
    -   **Responsibilities:** Renders the "previous" and "next" buttons and calls parent callbacks. Disables buttons when at the beginning or end of the diff list.

-   **`components/view/ViewHexByte.tsx` & `components/comparison/DiffHexByte.tsx`**
    -   **Role:** Small, specialized components for rendering a single byte in the hex grid.
    -   **Responsibilities:** Applies the correct styling based on the byte's value (or diff type). Highly memoized (`React.memo`) for performance, as thousands of these can be rendered.
