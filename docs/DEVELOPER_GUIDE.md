# Hex Flex - Developer Guide

## Introduction

Welcome to the Hex Flex developer documentation. This guide provides a deep dive into the project's architecture, code, and core concepts.

### Target Audience

This guide is for a seasoned software engineer who is curious about the Hex Flex codebase but may not be an expert in modern web development. We'll assume you understand core programming concepts (data structures, algorithms, modularity) but might be unfamiliar with technologies like React, TypeScript, or the browser environment. We'll try to draw parallels to concepts from other domains where possible.

### Project Philosophy

-   **Zero Backend**: The application is entirely client-side. This simplifies deployment (just static files) and guarantees user data privacy.
-   **Performance First**: Firmware files can be large and sparse. The application is architected to handle this gracefully without freezing the user's browser.
-   **Modern but Minimal**: The project uses modern tools (React, TypeScript) but avoids an overly complex ecosystem.

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