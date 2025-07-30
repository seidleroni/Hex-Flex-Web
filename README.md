# Hex Flex - Intel HEX File Visualizer

Hex Flex is a fast, modern, and entirely client-side web tool for viewing and comparing the memory layout of Intel HEX files. It's designed for engineers, especially in the embedded systems space, who need a quick way to inspect firmware binaries without installing desktop software.

The application runs entirely in your browser. No data is ever uploaded to a server.

## Key Features

-   **Single File Viewer**: Upload a HEX file and explore its memory content in a familiar hex editor format.
-   **Comparison (Diff) Tool**: Upload two HEX files to see a visual comparison of their differences (added, removed, modified bytes).
-   **High Performance**: Uses virtualization to handle large files and memory gaps efficiently, ensuring a smooth experience.
-   **Data Segmentation**: Automatically identifies and lists contiguous blocks of data, making it easy to navigate large, sparse firmware images.
-   **Interactive Minimap**: Provides a bird's-eye view of the entire memory space for quick navigation.
-   **Client-Side Processing**: All parsing and comparison happen locally in your browser, ensuring your data remains private and secure.

---

## Documentation

This project contains several guides to help you get the most out of it.

-   **[User Guide](./docs/USER_GUIDE.md)**: A complete walkthrough of all features from a user's perspective. If you want to learn how to use the tool effectively, start here.

-   **[Developer Guide](./docs/DEVELOPER_GUIDE.md)**: A deep dive into the codebase, architecture, and core concepts for engineers looking to understand how the project is built.

---

## Local Development & Building

This project is built using React, TypeScript, and `esbuild`.

### Prerequisites

You need to have [Node.js](https://nodejs.org/) and `npm` (which comes with Node.js) installed to run the build script.

### Building the Project

1.  **Install Dependencies**: The only development dependency is `esbuild`. Install it by running:
    ```bash
    npm install
    ```

2.  **Run the Build Script**: To build the application, run:
    ```bash
    npm run build
    ```
    This command will compile the TypeScript/React code, bundle it into a single JavaScript file, and place all necessary assets (`index.html`, `bundle.js`, etc.) into a `dist/` directory.

3.  **Run a Local Server**: You cannot open `dist/index.html` directly in your browser due to security restrictions (CORS policy). You need to serve the `dist` directory using a local web server. A simple way to do this is with Python:

    *   If you have Python 3:
        ```bash
        cd dist
        python -m http.server
        ```
    *   Then, open your browser and navigate to `http://localhost:8000`.

That's it! You are now running a local version of Hex Flex.