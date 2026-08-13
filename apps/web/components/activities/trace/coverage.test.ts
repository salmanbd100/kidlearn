import { describe, expect, it } from "vitest";
import {
  COMPLETE_RATIO,
  countCovered,
  createCoverage,
  DEFAULT_TOLERANCE,
  isStrokeComplete,
  JITTER_BEHIND,
  LOOK_AHEAD,
  updateCoverage,
} from "./coverage";
import type { Point } from "./geometry";

/** A horizontal stroke of 21 points ten units apart — (0,0) through (200,0). */
const POINTS: Point[] = Array.from({ length: 21 }, (_, index) => ({
  x: index * 10,
  y: 0,
}));

/**
 * Half the spacing between points, so a pointer sitting on one point reaches no
 * other. Tests about *ordering* need that: at the default tolerance a single
 * position covers its neighbours too, which hides which rule did the covering.
 */
const TIGHT = 5;

const at = (index: number): Point => POINTS[index] ?? { x: 0, y: 0 };

/** Walk the pointer along the first `upTo` points, the way a careful child would. */
function walk(upTo: number, tolerance = DEFAULT_TOLERANCE) {
  let state = createCoverage(POINTS.length);
  for (let index = 0; index < upTo; index += 1) {
    state = updateCoverage(POINTS, state, at(index), tolerance);
  }
  return state;
}

describe("updateCoverage", () => {
  it("starts with nothing covered and no frontier", () => {
    const state = createCoverage(POINTS.length);
    expect(countCovered(state)).toBe(0);
    expect(state.frontier).toBe(-1);
  });

  it("covers the whole stroke when the pointer walks it in order", () => {
    const state = walk(POINTS.length);
    expect(countCovered(state)).toBe(POINTS.length);
    expect(state.frontier).toBe(POINTS.length - 1);
  });

  it("counts a point the pointer passes near, not only one it lands on", () => {
    const state = updateCoverage(
      POINTS,
      createCoverage(POINTS.length),
      { x: 0, y: DEFAULT_TOLERANCE - 1 },
      DEFAULT_TOLERANCE,
    );
    expect(state.frontier).toBe(0);
  });

  it("ignores a point further off the guide than the tolerance allows", () => {
    const state = updateCoverage(
      POINTS,
      createCoverage(POINTS.length),
      { x: 0, y: DEFAULT_TOLERANCE + 1 },
      DEFAULT_TOLERANCE,
    );
    expect(state.frontier).toBe(-1);
  });

  it("covers nothing when the pointer jumps straight to the end of the stroke", () => {
    // Scribbling over the far end of the guide must never finish the stroke.
    const state = updateCoverage(
      POINTS,
      createCoverage(POINTS.length),
      at(POINTS.length - 1),
      DEFAULT_TOLERANCE,
    );
    expect(countCovered(state)).toBe(0);
  });

  it("marks nothing past the look-ahead window", () => {
    const state = updateCoverage(
      POINTS,
      createCoverage(POINTS.length),
      at(LOOK_AHEAD),
      TIGHT,
    );
    expect(state.frontier).toBe(-1);
  });

  it("marks the last point inside the look-ahead window", () => {
    const state = updateCoverage(
      POINTS,
      createCoverage(POINTS.length),
      at(LOOK_AHEAD - 1),
      TIGHT,
    );
    expect(state.frontier).toBe(LOOK_AHEAD - 1);
  });

  it("fills in a point the finger skipped just behind the frontier", () => {
    let state = updateCoverage(
      POINTS,
      createCoverage(POINTS.length),
      at(0),
      TIGHT,
    );
    state = updateCoverage(POINTS, state, at(2), TIGHT);
    expect(countCovered(state)).toBe(2);

    state = updateCoverage(POINTS, state, at(1), TIGHT);

    expect(countCovered(state)).toBe(3);
    expect(state.frontier).toBe(2);
  });

  it("does not reach back further than the jitter window", () => {
    let state = updateCoverage(
      POINTS,
      createCoverage(POINTS.length),
      at(0),
      TIGHT,
    );
    state = updateCoverage(POINTS, state, at(4), TIGHT);
    const before = countCovered(state);

    state = updateCoverage(POINTS, state, at(4 - JITTER_BEHIND - 1), TIGHT);

    expect(countCovered(state)).toBe(before);
  });

  it("returns the same state object when the pointer covers nothing new", () => {
    // The rAF loop leans on this — an unchanged reference means no re-render.
    const state = walk(4);
    expect(
      updateCoverage(POINTS, state, { x: 0, y: 500 }, DEFAULT_TOLERANCE),
    ).toBe(state);
  });

  it("returns the same state object when the pointer re-covers a covered point", () => {
    const state = walk(4);
    expect(updateCoverage(POINTS, state, at(0), DEFAULT_TOLERANCE)).toBe(state);
  });

  it("leaves the state it was given untouched when anything is covered", () => {
    const state = createCoverage(POINTS.length);
    const next = updateCoverage(POINTS, state, at(0), DEFAULT_TOLERANCE);
    expect(next).not.toBe(state);
    expect(state.frontier).toBe(-1);
    expect(countCovered(state)).toBe(0);
  });

  it("widens what counts as on-path when the payload asks for more tolerance", () => {
    const wobble = { x: 0, y: 20 };
    expect(
      countCovered(
        updateCoverage(POINTS, createCoverage(POINTS.length), wobble, 12),
      ),
    ).toBe(0);
    expect(
      countCovered(
        updateCoverage(POINTS, createCoverage(POINTS.length), wobble, 24),
      ),
    ).toBeGreaterThan(0);
  });

  it("does nothing at all for a stroke with no sampled points", () => {
    const state = createCoverage(0);
    expect(updateCoverage([], state, { x: 0, y: 0 }, DEFAULT_TOLERANCE)).toBe(
      state,
    );
  });
});

describe("isStrokeComplete", () => {
  it("completes a stroke traced all the way along", () => {
    expect(isStrokeComplete(walk(POINTS.length), POINTS.length)).toBe(true);
  });

  it("does not complete a stroke traced only half way", () => {
    expect(isStrokeComplete(walk(10), POINTS.length)).toBe(false);
  });

  it("completes short of every point — a child who lifts a fraction early has traced it", () => {
    const nearly = walk(19, TIGHT);
    expect(countCovered(nearly) / POINTS.length).toBeGreaterThanOrEqual(
      COMPLETE_RATIO,
    );
    expect(isStrokeComplete(nearly, POINTS.length)).toBe(true);
  });

  it("does not complete a stroke still short of the ratio", () => {
    const most = walk(18, TIGHT);
    expect(countCovered(most) / POINTS.length).toBeLessThan(COMPLETE_RATIO);
    expect(isStrokeComplete(most, POINTS.length)).toBe(false);
  });

  it("does not complete a stroke that has no points to trace", () => {
    expect(isStrokeComplete(createCoverage(0), 0)).toBe(false);
  });
});
