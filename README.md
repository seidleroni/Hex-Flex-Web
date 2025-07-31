# Hex Flex - Intel HEX File Visualizer

**[View the live application](https://seidleroni.github.io/Hex-Flex-Web/)**

Hex Flex is a fast, modern, and entirely client-side web tool for viewing and comparing the memory contents of Intel HEX files.

The application runs entirely in your browser. No data is ever uploaded to a server.

## Key Features

-   **Single File Viewer**: Upload a HEX file and explore its memory contents.
-   **Comparison (Diff) Tool**: Upload two HEX files to see a visual comparison of their differences (added, removed, modified bytes).
-   **Data Segmentation**: Automatically identifies and lists contiguous blocks of data, making it easy to navigate large, sparse firmware images.
-   **Interactive Minimap**: Provides a bird's-eye view of the entire memory space for quick navigation.
-   **Client-Side Processing**: All parsing and comparison happen locally in your browser, ensuring your data remains private and secure.

---

## Documentation

This project contains several guides to help you get the most out of it.

-   **[User Guide](./docs/USER_GUIDE.md)**: A walkthrough of all features. If you want to learn how to use the tool, start here.

-   **[Developer Guide](./docs/DEVELOPER_GUIDE.md)**: A deep dive into the codebase, architecture, and core concepts for engineers looking to understand how the project is built.
