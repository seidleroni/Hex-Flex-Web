# Hex Flex - Developer Guide

## Introduction

Welcome to the Hex Flex developer documentation. This guide provides a technical overview of the project's architecture, code, and core concepts, intended for those who wish to understand, contribute to, or maintain the codebase.

This guide explores the technology stack, key data structures, and the application's data flow for its main features.

### Project Philosophy

-   **Zero Backend**: The application is entirely client-side. This simplifies deployment (just static files) and guarantees user data privacy.
-   **Performance First**: Firmware files can be large and sparse. The application is architected to handle this gracefully without freezing the user's browser.
-   **Modern but Minimal**: The project uses modern tools (React, TypeScript) but avoids an overly complex ecosystem.

---

## Getting Started: Local Development & Building

This project is built using React, TypeScript, and `esbuild`. To get a local copy running for development or to build it from source, follow these steps.

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

---

## Table of Contents

This guide is broken down into several parts to cover the project in detail.

1.  **[Architecture & Technology Stack](./dev/01-ARCHITECTURE.md)**
    -   A high-level look at the technologies used and the overall structure of the project. A good starting point to understand the "what" and "why" of our tools.

2.  **[Core Concepts](./dev/02-CORE-CONCEPTS.md)**
    -   A deep dive into the most important data structures and patterns that make the application work efficiently. Understanding these is crucial to understanding the application.
    -   Covers: `SparseMemory`, Virtualization, React Hooks, and Canvas Drawing.

3.  **[Walkthrough: Single File View](./dev/03-SINGLE-FILE-VIEW-FLOW.md)**
    -   A step-by-step trace of the application flow, from a user uploading a file to the memory map being rendered on screen. This explains how all the pieces of the "View" mode work together.

4.  **[Walkthrough: Comparison View](./dev/04-COMPARISON-VIEW-FLOW.md)**
    -   A similar step-by-step trace for the "Compare" mode. It explains the diffing logic and how the comparison results are visualized.

5.  **[Component Reference](./dev/05-COMPONENT-REFERENCE.md)**
    -   A quick-reference glossary of the key React components and their primary responsibilities. Useful for quickly finding where specific functionality lives.
