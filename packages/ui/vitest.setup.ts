import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without `globals: true`, so React Testing Library cannot install
// its own auto-cleanup hook. Without this, a second render() in the same file
// finds two copies of every element. Same reason as `apps/web/vitest.setup.ts`.
afterEach(cleanup);
