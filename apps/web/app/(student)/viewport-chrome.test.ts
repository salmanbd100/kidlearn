import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The student layout owns the viewport: `min-h-dvh` and all four safe-area
// insets (design.md §6). A screen inside it that applies them again doubles the
// insets on a notched phone and overflows by their height, so the lesson scrolls.

const WEB_ROOT = join(import.meta.dirname, "..", "..");
const LAYOUT = join(import.meta.dirname, "layout.tsx");

/** Everything the Student Portal renders, by where it lives. */
const STUDENT_SURFACES = [
  "app/(student)",
  "features/activities",
  "features/lesson",
  "features/quiz",
  "features/screen-time",
  "features/stories",
  "features/student",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

const files = STUDENT_SURFACES.flatMap((dir) =>
  sourceFiles(join(WEB_ROOT, dir)),
).filter((file) => file !== LAYOUT);

function offenders(pattern: RegExp): string[] {
  return files
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => relative(WEB_ROOT, file));
}

describe("Student Portal viewport chrome", () => {
  it("applies the safe-area insets only in the layout", () => {
    expect(offenders(/safe-area-inset/)).toEqual([]);
  });

  it("claims the viewport height only in the layout", () => {
    expect(offenders(/\bmin-h-dvh\b/)).toEqual([]);
  });

  it("sizes against the dynamic viewport, never `vh`", () => {
    // `vh` is the viewport with the mobile browser's toolbar retracted, so a
    // `vh` cap is taller than the screen whenever the toolbar is showing.
    expect(offenders(/\[\d+vh\]/)).toEqual([]);
  });
});
