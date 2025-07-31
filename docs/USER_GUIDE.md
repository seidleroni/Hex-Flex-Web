# Hex Flex - User Guide

Welcome to the Hex Flex User Guide! This document will walk you through all the features of the application. You can follow along using the **[live version](https://seidleroni.github.io/Hex-Flex-Web/)**.

## Table of Contents

1.  [The Main Interface](#the-main-interface)
2.  [Single File View](#single-file-view)
3.  [Comparison View](#comparison-view)

---

## The Main Interface

The Hex Flex interface is designed to be clean and intuitive. Here are the main parts:

1.  **Header**: At the top, you'll find the application title and the View Switcher.
2.  **View Switcher**: Allows you to toggle between the **View** (for a single file) and **Compare** (for two files) modes.
3.  **Main Content Area**: This is where the file upload prompts and memory views will appear.
4.  **Footer**: Displays build information for the application.

---

## Single File View

The Single File View is the default mode. It's designed for inspecting the contents of a single Intel HEX file.

### 1. Uploading a File

To get started, simply drag and drop a `.hex` file onto the upload area, or click the area to open a file selection dialog. The application will immediately parse the file.

If the file is not a valid Intel HEX file, an error message will be displayed.

### 2. The Memory View

Once a file is successfully loaded, the Memory View is displayed. This is the core of the application.

#### The Header Bar

-   **File Name**: The name of the currently loaded file is shown.
-   **Go to address**: A search box that lets you jump directly to a specific memory address. Enter a hexadecimal value (e.g., `8004000`) and press Enter or click the search icon.
-   **Load New**: Click this button to return to the upload screen and load a new file.

#### Statistics

Below the header, you'll find three cards displaying key statistics about your file:
-   **Start Address**: The lowest memory address that contains data.
-   **End Address**: The highest memory address that contains data.
-   **Data Size**: The total number of data bytes in the file.

#### The Memory Grid

This is a standard hex editor view with three main columns:
-   **Address**: The starting memory address for each row (in hexadecimal).
-   **Data (Hex)**: The raw byte values in hexadecimal format. Empty bytes are shown as `--`.
-   **ASCII**: The ASCII representation of the bytes. Non-printable characters are shown as a dot (`.`).

#### Data Segments Panel

For firmware files that have large empty gaps, Hex Flex automatically identifies contiguous regions of data, which it calls "segments." This panel appears on the left if more than one segment is found.

-   Each segment shows its start/end address and total size.
-   The currently visible segment in the memory grid is highlighted.
-   Clicking on any segment in this panel will instantly scroll the memory grid to the start of that segment.

#### The Minimap and Legend

On the right side of the memory grid is a minimap, which provides a high-level, "10,000-foot view" of your entire file's memory layout.

-   **Legend**: Above the memory grid, a legend explains what the colors on the minimap mean:
    -   **Data**: Meaningful data.
    -   **Erased (0xFF)**: Memory that has been erased but not programmed.
    -   **Empty Space**: Gaps in the file where no data is defined.
    -   **Large Gap**: A visual representation of a very large, collapsed gap.
-   **Navigation**: The minimap is interactive.
    -   The translucent rectangle represents your current viewport.
    -   **Click or drag** anywhere on the minimap to navigate to that part of the file.

---

## Comparison View

The Comparison View allows you to see the differences between two HEX files. This is useful for checking what changed between two firmware versions.

### 1. Uploading Two Files

Switch to the **Compare** mode using the view switcher in the header. You will see two upload slots: **File A (Original)** and **File B (Modified)**. Upload a file into each slot.

Once both files are loaded, the comparison view will automatically appear.

### 2. The Comparison View

The comparison view is similar to the single file view, but with added features to highlight differences.

#### Diff Statistics

Three cards show a summary of the differences:
-   **Bytes Modified**: The number of bytes that exist at the same address in both files but have different values.
-   **Bytes Added**: The number of bytes that exist in File B but not in File A.
-   **Bytes Removed**: The number of bytes that exist in File A but not in File B.

#### The Diff Grid

The memory grid now shows a merged view of both files, with differences highlighted by color:
-   <span style="color: #4ade80;">**Green**</span>: Bytes **added** in File B.
-   <span style="color: #facc15;">**Yellow**</span>: Bytes **modified** between File A and File B.
-   <span style="color: #f87171;">**Red**</span> / <span style="text-decoration: line-through;">Strikethrough</span>: Bytes **removed** from File B.

#### Navigating Differences

To the right of the comparison minimap, a special **Diff Navigator** bar appears if there are any differences.
-   Click the **up arrow** to jump to the previous difference.
-   Click the **down arrow** to jump to the next difference.

This allows you to quickly step through every single change between the two files.

#### The Comparison Minimap

The minimap in this view also uses colors to show the locations of differences, allowing you to see where in memory the changes have occurred. The legend is updated to show the meaning of the new colors (green for added, yellow for modified, red for removed).