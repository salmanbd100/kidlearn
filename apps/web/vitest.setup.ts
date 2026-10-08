import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { FakeIntersectionObserver } from "./shared/testing/intersection-observer";

// jsdom has no ResizeObserver; components that reflow on resize (match board lines) would throw on
// mount. It never fires — tests that need a reflow drive the measurement directly.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!("IntersectionObserver" in globalThis)) {
  globalThis.IntersectionObserver = FakeIntersectionObserver;
}

// jsdom has no pointer capture or `scrollIntoView`; Radix Select (`SelectMenu`) calls both when it opens.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Without `globals: true` RTL cannot install auto-cleanup, so a second render() would find duplicates.
afterEach(cleanup);
