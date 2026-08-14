import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom implements no layout, so it ships no ResizeObserver either. A component
// that reflows on resize — the match board's connection lines — would throw on
// mount without this. It deliberately never fires: there is nothing to observe in
// an environment with no box sizes, and a test that needs a reflow drives the
// measurement directly.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Vitest runs without `globals: true`, so React Testing Library cannot install
// its own auto-cleanup hook. Without this, a second render() in the same file
// finds two copies of every element.
afterEach(cleanup);
