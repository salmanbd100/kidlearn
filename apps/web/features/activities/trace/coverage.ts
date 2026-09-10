import type { Point } from "./geometry";

// Whether the child has actually traced the stroke (FR-ACT-02, FR-ACT-05).

export interface CoverageState {
  /** Parallel to the stroke's sampled points. */
  covered: boolean[];
  /** Furthest point covered so far; `-1` before the child has touched anything. */
  frontier: number;
}

/** Reference-space (0–100) distance from the guide that still counts as on it. */
export const DEFAULT_TOLERANCE = 12;

/** How many points past the frontier a single pointer position may mark. */
export const LOOK_AHEAD = 5;

/** How far behind the frontier a wobbling finger may still fill a gap. */
export const JITTER_BEHIND = 2;

/** Fraction of a stroke's points that counts as having traced it. */
export const COMPLETE_RATIO = 0.9;

export function createCoverage(total: number): CoverageState {
  return { covered: Array.from({ length: total }, () => false), frontier: -1 };
}

export function countCovered(state: CoverageState): number {
  return state.covered.reduce(
    (total, isCovered) => total + (isCovered ? 1 : 0),
    0,
  );
}

function isWithin(a: Point, b: Point, tolerance: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= tolerance * tolerance;
}

/**
 * Returns the **same reference** when the pointer covered nothing new. The rAF
 * loop compares identity to decide whether to touch React state at all, so a
 * finger held still — the common case between two frames — costs nothing.
 */
export function updateCoverage(
  points: readonly Point[],
  state: CoverageState,
  pointer: Point,
  tolerance: number = DEFAULT_TOLERANCE,
  lookAhead: number = LOOK_AHEAD,
): CoverageState {
  if (points.length === 0) return state;

  const from = Math.max(0, state.frontier - JITTER_BEHIND);
  const to = Math.min(points.length - 1, state.frontier + lookAhead);

  let covered: boolean[] | undefined;
  let frontier = state.frontier;

  for (let index = from; index <= to; index += 1) {
    if (state.covered[index] === true) continue;

    const point = points[index];
    if (point === undefined || !isWithin(point, pointer, tolerance)) continue;

    covered ??= [...state.covered];
    covered[index] = true;
    frontier = Math.max(frontier, index);
  }

  if (covered === undefined) return state;
  return { covered, frontier };
}

export function isStrokeComplete(state: CoverageState, total: number): boolean {
  if (total <= 0) return false;
  return countCovered(state) / total >= COMPLETE_RATIO;
}
