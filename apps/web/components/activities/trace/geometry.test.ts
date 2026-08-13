import { validTrace, validTraceBangla } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  arrowsAlong,
  glyphFrameOf,
  REFERENCE_EXTENT,
  samplePath,
  splitStrokes,
  toPathUnits,
} from "./geometry";

/**
 * Runs in node, not jsdom: nothing here touches an `SVGPathElement`, which is
 * the reason `svg-path-properties` is a dependency at all (jsdom implements no
 * `getPointAtLength`). If a change to this module makes these tests need a DOM,
 * the change has put geometry in the wrong file.
 */

describe("splitStrokes", () => {
  it("splits a glyph into one stroke per moveto", () => {
    expect(splitStrokes("M10 10 L90 10 M50 10 L50 90")).toHaveLength(2);
  });

  it("keeps a single-stroke glyph whole", () => {
    expect(splitStrokes("M 60 40 C 140 40 140 100 80 100")).toEqual([
      "M 60 40 C 140 40 140 100 80 100",
    ]);
  });

  it("does not treat a curve's control-point letters as movetos", () => {
    const strokes = splitStrokes("M0 0 C 10 10 20 20 30 30 Q 40 40 50 50");
    expect(strokes).toHaveLength(1);
  });

  it("resolves a relative moveto against the previous stroke's end point", () => {
    // Without the resolution the second stroke would start at (5,5) instead of
    // (35,15), so the child would be asked to trace it in the wrong place.
    const [, second] = splitStrokes("M10 10 l20 0 m5 5 l10 10");
    expect(samplePath(second ?? "", 2)[0]).toEqual({ x: 35, y: 15 });
  });

  it("resolves a relative moveto after a closed subpath from the subpath start", () => {
    const [, second] = splitStrokes("M10 10 L50 10 L50 50 Z m0 60 l10 0");
    expect(samplePath(second ?? "", 2)[0]).toEqual({ x: 10, y: 70 });
  });

  it("traces the strokes in the order strokeOrder asks for", () => {
    const strokes = splitStrokes("M0 0 L10 0 M0 50 L10 50", [1, 0]);
    expect(samplePath(strokes[0] ?? "", 2)[0]).toEqual({ x: 0, y: 50 });
  });

  it("falls back to document order when strokeOrder misses a stroke", () => {
    // A payload the child could otherwise never finish: stroke 1 is never
    // reachable, so the glyph would stay half-traced forever.
    const strokes = splitStrokes("M0 0 L10 0 M0 50 L10 50", [0]);
    expect(strokes).toHaveLength(2);
    expect(samplePath(strokes[0] ?? "", 2)[0]).toEqual({ x: 0, y: 0 });
  });

  it("falls back to document order when strokeOrder names a stroke that does not exist", () => {
    const strokes = splitStrokes("M0 0 L10 0 M0 50 L10 50", [0, 5]);
    expect(strokes).toHaveLength(2);
    expect(samplePath(strokes[1] ?? "", 2)[0]).toEqual({ x: 0, y: 50 });
  });

  it("falls back to document order when strokeOrder repeats a stroke", () => {
    const strokes = splitStrokes("M0 0 L10 0 M0 50 L10 50", [1, 1]);
    expect(samplePath(strokes[0] ?? "", 2)[0]).toEqual({ x: 0, y: 0 });
  });

  it("ignores leading whitespace before the first moveto", () => {
    expect(splitStrokes("  M0 0 L10 0")).toHaveLength(1);
  });

  it("returns nothing for a path with no moveto at all", () => {
    expect(splitStrokes("L10 10")).toEqual([]);
  });

  // The canonical payloads the CMS and the AI prompts are modelled on. If either
  // stops splitting the way its `strokeOrder` claims, the content is the problem.
  it("splits the canonical capital A into its three authored strokes", () => {
    expect(
      splitStrokes(validTrace.pathData, validTrace.strokeOrder),
    ).toHaveLength(validTrace.strokeOrder?.length ?? 0);
  });

  it("keeps the canonical bangla digit as the one stroke it is drawn with", () => {
    expect(splitStrokes(validTraceBangla.pathData)).toHaveLength(1);
  });
});

describe("samplePath", () => {
  it("samples evenly from the start point to the end point", () => {
    const points = samplePath("M0 0 L100 0", 11);
    expect(points).toHaveLength(11);
    expect(points.map((point) => point.x)).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
    ]);
    expect(points.every((point) => point.y === 0)).toBe(true);
  });

  it("follows a curve rather than cutting across it", () => {
    const points = samplePath("M0 0 Q 50 100 100 0", 5);
    const midpoint = points[2];
    expect(midpoint?.x).toBeCloseTo(50, 5);
    expect(midpoint?.y).toBeGreaterThan(0);
  });

  it("still yields two points for a zero-length path", () => {
    // A degenerate stroke must not divide by zero — the child simply taps it.
    const points = samplePath("M20 20 L20 20", 2);
    expect(points).toEqual([
      { x: 20, y: 20 },
      { x: 20, y: 20 },
    ]);
  });

  it("returns nothing for an unparseable path instead of throwing", () => {
    expect(samplePath("nonsense", 10)).toEqual([]);
  });

  it("returns nothing when asked for fewer than two points", () => {
    expect(samplePath("M0 0 L100 0", 1)).toEqual([]);
  });
});

describe("glyphFrameOf", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
  ];

  it("frames the glyph with padding on every side", () => {
    const { viewBox } = glyphFrameOf(square);
    const [minX, minY, width, height] = viewBox.split(" ").map(Number);
    expect(minX).toBeLessThan(0);
    expect(minY).toBeLessThan(0);
    expect(width).toBeGreaterThan(100);
    expect(height).toBeGreaterThan(100);
  });

  it("gives a glyph authored in the reference space a unit of one", () => {
    expect(glyphFrameOf(square).unit).toBe(1);
  });

  it("scales the unit with the glyph's own coordinate range", () => {
    // The canonical "A" fixture is authored in a 0–200 space. A tolerance of 12
    // has to mean the same fraction of the glyph there as it does in 0–100.
    const doubled = [
      { x: 0, y: 0 },
      { x: 200, y: 200 },
    ];
    expect(glyphFrameOf(doubled).unit).toBe(2);
  });

  it("keeps the aspect ratio of a tall glyph rather than squaring it off", () => {
    const tall = [
      { x: 0, y: 0 },
      { x: 20, y: 100 },
    ];
    const [, , width, height] = glyphFrameOf(tall)
      .viewBox.split(" ")
      .map(Number);
    expect(height).toBeGreaterThan(width ?? 0);
  });

  it("falls back to the reference box when there is nothing to frame", () => {
    const { viewBox, unit } = glyphFrameOf([]);
    expect(viewBox).toBe(`0 0 ${REFERENCE_EXTENT} ${REFERENCE_EXTENT}`);
    expect(unit).toBe(1);
  });

  it("gives a single-point glyph a frame with area", () => {
    const [, , width, height] = glyphFrameOf([{ x: 5, y: 5 }])
      .viewBox.split(" ")
      .map(Number);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});

describe("toPathUnits", () => {
  it("leaves reference lengths untouched at unit one", () => {
    expect(toPathUnits(12, { viewBox: "0 0 100 100", unit: 1 })).toBe(12);
  });

  it("stretches reference lengths to the glyph's own scale", () => {
    expect(toPathUnits(12, { viewBox: "0 0 200 200", unit: 2 })).toBe(24);
  });
});

describe("arrowsAlong", () => {
  it("spaces the arrows along the stroke without landing on either end", () => {
    const arrows = arrowsAlong("M0 0 L100 0", 3);
    expect(arrows.map((arrow) => arrow.x)).toEqual([25, 50, 75]);
  });

  it("points the arrow the way the stroke is travelling", () => {
    expect(arrowsAlong("M0 0 L100 0", 1)[0]?.angle).toBeCloseTo(0, 5);
    expect(arrowsAlong("M0 0 L0 100", 1)[0]?.angle).toBeCloseTo(90, 5);
    expect(arrowsAlong("M100 0 L0 0", 1)[0]?.angle).toBeCloseTo(180, 5);
  });

  it("turns with a curve instead of reporting one angle for the whole stroke", () => {
    const [first, last] = arrowsAlong("M0 0 Q 50 100 100 0", 2);
    expect(first?.angle).not.toBeCloseTo(last?.angle ?? 0, 1);
  });

  it("returns nothing for a zero-length stroke", () => {
    expect(arrowsAlong("M20 20 L20 20", 3)).toEqual([]);
  });

  it("returns nothing for an unparseable path instead of throwing", () => {
    expect(arrowsAlong("nonsense", 3)).toEqual([]);
  });
});
