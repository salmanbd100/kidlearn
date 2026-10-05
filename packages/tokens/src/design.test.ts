import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand, motion, radius, themes } from "./index";

// design.md is the prose source of truth: every value its tables state exactly is
// checked here. Rows naming a hue by word ("slate-100") state no value and are skipped.

const design = readFileSync(
  new URL("../../../document/design.md", import.meta.url),
  "utf8",
);

function tableRows(heading: string): string[][] {
  const start = design.indexOf(`### ${heading}`);
  expect(start, `design.md has a "${heading}" section`).toBeGreaterThan(-1);
  const end = design.indexOf("\n#", start + 4);
  return design
    .slice(start, end === -1 ? undefined : end)
    .split("\n")
    .filter((line) => line.startsWith("| `--"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

const hexIn = (cell: string): string | undefined =>
  /#[0-9a-fA-F]{6}\b/.exec(cell)?.[0].toLowerCase();

// The casts index a token map by a name read from design.md; a missing name reads
// `undefined` and fails the comparison, which is the point.

const camel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

describe("@kidlearn/tokens agrees with design.md", () => {
  it("§2.1 — every brand hue", () => {
    const rows = tableRows("2.1 Brand palette");
    expect(rows.length).toBeGreaterThan(0);
    for (const [token, , value] of rows) {
      const name = /`--brand-([a-z]+)`/.exec(token ?? "")?.[1];
      expect(name, token).toBeDefined();
      expect(brand[name as keyof typeof brand], token).toBe(hexIn(value ?? ""));
    }
  });

  it("§2.2 — every semantic colour design.md gives as a hex", () => {
    let checked = 0;
    for (const [token, kid, parent] of tableRows("2.2 Semantic tokens")) {
      const name = /^`--([a-z-]+)`$/.exec(token ?? "")?.[1];
      if (name === undefined) continue;
      const key = camel(name) as keyof typeof themes.kid.colors;
      for (const [theme, cell] of [
        ["kid", kid],
        ["parent", parent],
      ] as const) {
        const stated = hexIn(cell ?? "");
        if (stated === undefined) continue;
        expect(themes[theme].colors[key], `${theme} --${name}`).toBe(stated);
        checked += 1;
      }
    }
    // A table reformatted out from under the parser would otherwise pass.
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  it("§4.2 — the radius scale and each theme's base", () => {
    const rows = tableRows("4.2 Radius");
    expect(rows).toHaveLength(Object.keys(radius).length);
    for (const [token, value] of rows) {
      const step = /`--radius-([a-z]+)`/.exec(token ?? "")?.[1];
      expect(radius[step as keyof typeof radius], token).toBe(
        Number.parseInt(value ?? "", 10),
      );
    }
    expect(design).toContain(
      "Kid theme sets base `--radius` to `--radius-lg`; parent theme to `--radius-md`.",
    );
    expect(themes.kid.radius).toBe("lg");
    expect(themes.parent.radius).toBe("md");
  });

  it("§5.1 — the easing curve and the three durations", () => {
    const rows = new Map(
      tableRows("5.1 Tokens").map(([token, value]) => [token, value]),
    );
    expect(rows.get("`--ease-standard`")).toBe(
      `\`cubic-bezier(${motion.easeStandard.join(", ")})\``,
    );
    for (const [speed, ms] of Object.entries(motion.durationMs)) {
      expect(rows.get(`\`--dur-${speed}\``)).toBe(`${ms}ms`);
    }
  });
});
