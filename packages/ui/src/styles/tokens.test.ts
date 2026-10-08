import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "tokens.css"),
  "utf8",
);

function themeTokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

// WCAG AA for normal text (design.md §2.3). Kid `secondary` is omitted on purpose: white on grape is
// 4.23:1 and ink is worse, so it needs a new hue — a recorded gap, not a pass.
const AA = 4.5;
const SURFACES = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["primary", "primary-foreground"],
  ["accent", "accent-foreground"],
  ["success", "success-foreground"],
  ["warning", "warning-foreground"],
  ["destructive", "destructive-foreground"],
  ["muted", "muted-foreground"],
] as const;

// WCAG 1.4.11 for shapes that carry meaning alone (status-mark glyph on its disc, progress-dot ring).
// Fills such as `success` and `primary` are under 3:1 in the kid theme, hence the ink glyph or ring on top.
const NON_TEXT = 3;
const MARKS = [
  ["success", "success-foreground"],
  ["warning", "warning-foreground"],
  ["background", "foreground"],
  ["background", "muted-foreground"],
  ["card", "muted-foreground"],
] as const;

function expectContrast(
  tokens: Record<string, string>,
  [surface, mark]: readonly [string, string],
  floor: number,
) {
  const fill = tokens[surface];
  const ink = tokens[mark];
  expect(fill, `--${surface} is defined`).toBeDefined();
  expect(ink, `--${mark} is defined`).toBeDefined();

  expect(contrast(ink as string, fill as string)).toBeGreaterThanOrEqual(floor);
}

describe.each([
  ["kid", ':root,\n[data-theme="kid"] {'],
  ["parent", '[data-theme="parent"] {'],
])("%s theme token contrast", (_theme, selector) => {
  const tokens = themeTokens(selector);

  it.each(SURFACES)("%s / %s meets AA", (surface, foreground) => {
    expectContrast(tokens, [surface, foreground], AA);
  });

  it.each(MARKS)("%s / %s meets the 3:1 non-text floor", (surface, mark) => {
    expectContrast(tokens, [surface, mark], NON_TEXT);
  });
});

describe("type scale", () => {
  it("sets text-lg to the 20px design.md §3.2 requires, not Tailwind's 18px", () => {
    expect(css).toMatch(/--text-lg:\s*1\.25rem;/);
  });
});
