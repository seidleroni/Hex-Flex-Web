
# 1. Architecture & Technology Stack

This document provides a high-level overview of the project's architecture, directory structure, and the key technologies used.

---

## A Systems Perspective on the Tech Stack

Think of a web application as a program running on a sandboxed, single-threaded virtual machine (the browser). Here are the key parts of our "runtime" and "language."

-   **UI Rendering Engine (`React`)**: React is a library for building user interfaces. Its core job is to render UI and keep it in sync with application data efficiently.
    -   **Concept**: You define UI elements as functions called "components." These functions return a description of what the UI should look like, using a syntax extension called **JSX** which resembles HTML.
    -   **Analogy**: Think of it like a function `void draw_window(config)`. When `config` changes, you conceptually call the function again. React is the smart layer that compares the new description with the old one and performs the minimal set of changes to the actual screen (the DOM), preventing costly full redraws. This "diffing" algorithm is what makes it performant.

-   **Language (`TypeScript`)**: JavaScript is the native language of the web. TypeScript is a superset of JavaScript that adds a robust static type system.
    -   **Analogy**: It's the difference between Python (dynamically typed) and C++/Rust (statically typed). All our source code (`.ts` for logic, `.tsx` for components with JSX) is written in TypeScript. This catches a huge class of errors during the build step rather than at runtime in the user's browser.

-   **Styling Engine (`Tailwind CSS`)**: Instead of writing separate, large CSS files (stylesheets), Tailwind provides a set of "utility classes" that can be applied directly to elements in the JSX.
    -   **Example**: `<div className="bg-gray-900 text-white font-bold p-4">...</div>`
    -   **Analogy**: This is like setting properties on a UI object directly (`widget.color = "white"; widget.padding = 4;`), but in a more declarative, standardized, and composable way. It keeps styling logic co-located with the component, making components more self-contained.

-   **Build System (`esbuild`)**: Our source code is in TypeScript (`.tsx`), which browsers cannot run directly. The build system's job is to compile, bundle, and optimize all our source files into a single standard JavaScript file (`dist/bundle.js`) that the browser can execute.
    -   **Analogy**: `esbuild` is our `gcc` or `clang`. It takes source files and produces a single executable artifact. It's known for its incredible speed.

-   **Dependency Management (`Import Maps`)**: In many web projects, you'll see a `node_modules` folder with thousands of files for runtime dependencies. We avoid this. The `index.html` file uses a modern browser feature called **Import Maps** to define how dependency names map to URLs.
    ```html
    <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@^19.1.0"
      }
    }
    </script>
    ```
    -   **Analogy**: This is like dynamic linking (`.so`/`.dll` files). The application doesn't have the library code baked in; it tells the runtime (the browser) where to find and load the library from the network (a Content Delivery Network, or CDN) when it's first needed. This keeps our local build fast and our deployed bundle size small.

---

## Directory Structure

The project is organized to separate concerns, making it easier to navigate and maintain.

```
.
├── components/   # UI pieces. Ideally, they are "dumb" and just display data.
│   ├── shared/   # Components used by both View and Compare modes (e.g., VirtualizedHexView).
│   ├── view/     # Components specific to the Single File View.
│   └── comparison/ # Components specific to the Comparison View.
│
├── hooks/        # Reusable stateful logic (the "brains" of components).
│
├── services/     # Pure, stateless data processing logic (no UI, no state).
│
├── types/        # TypeScript type definitions, interfaces, and enums.
│
├── views/        # Top-level components that compose a "page" or major feature.
│
├── App.tsx       # The root component. Manages which main view is active.
│
├── index.css     # Minimal global styles and animations.
│
├── index.html    # The single HTML page that loads the app and defines the import map.
│
├── index.tsx     # The application entry point. Tells React to start rendering the app.
│
└── package.json  # Project metadata and build scripts.
```
