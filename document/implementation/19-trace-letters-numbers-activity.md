# 19 — Trace Letters & Numbers Activity

> **Estimated effort:** 3–4 hours
> **Depends on:** 18
> **Requirement IDs:** FR-ACT-02, FR-ACT-05
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Implement `TraceActivity`, the renderer for the `trace` payload type: the child traces a letter or number along a dotted SVG guide path with a finger (touch) or mouse. The glyph is shown as a dotted guide with a start dot and direction arrows; a visual ink trail follows the finger; coverage is measured tolerantly (small hands are imprecise) with per-stroke success feedback and a full-glyph celebration. All correctness logic lives in pure, unit-tested helpers.

## Context & Current State

File 18 is done: `ActivityEngine` parses and dispatches payloads, `useActivityFeedback()` provides `success`/`retry`, and the engine handles instruction audio + completion reporting. The `trace` slot in `ACTIVITY_RENDERERS` currently points at `ComingSoonActivity`. The trace payload from `@kidlearn/types` (file 07) carries `glyph`, `pathData` (SVG path string), `guideDots`, and optional `strokeOrder`; this file extends usage to a `strokes` interpretation: each stroke is one SVG subpath of `pathData` (subpaths split on `M` commands), ordered by `strokeOrder` when present. The payload also carries a `tolerance` number (px in the glyph's 0–100 viewBox space); if your file-07 schema lacks it, add it now as an optional field with default 12 — an additive, version-safe change per NFR-SCALE-02.

## Detailed Requirements

1. **FR-ACT-02 — guide rendering:** the glyph renders as an SVG with a `viewBox="0 0 100 100"`: a faint solid outline (`stroke-width` ~10, low opacity) plus a dotted center guide line (`stroke-dasharray`), a pulsing start dot at the first sample point of the current stroke, and small direction arrows along the guide (one arrow per ~25% of stroke length, rotated to the path tangent).
2. **Pointer capture:** tracing works with finger and mouse via pointer events (`onPointerDown` / `onPointerMove` / `onPointerUp` + `setPointerCapture`) on an overlay element covering the SVG; `touch-action: none` on the overlay so the browser never scrolls mid-trace.
3. **Tolerance-based matching:** each stroke's guide path is sampled into N points (`samplePath`); a point becomes "covered" when the pointer passes within `tolerance` of it, **in order** — only points within a small look-ahead window past the last covered index can be marked, so scribbling over the middle doesn't complete the stroke. A stroke completes at ≥90% coverage.
4. **Multi-stroke support:** strokes are traced one at a time in order; finishing a stroke fires `feedback.success` at the stroke's end point, advances the start dot/arrows to the next stroke, and freezes the finished stroke as solid "ink".
5. **Ink trail:** while the pointer is down, an SVG polyline of the pointer's path renders in a crayon-style color following the finger; lifting the finger before a stroke completes keeps coverage (the child can continue where they left off) but clears the loose trail beyond the covered region.
6. **FR-ACT-05 — no fail state:** drifting off-path never shows an error; if a `pointerup` happens with <90% coverage and no progress was made during that gesture, play the gentle retry audio. Completing all strokes triggers the full-glyph celebration (the glyph fills solid + sparkle) and then `onActivityComplete()`.
7. **Performance:** `pointermove` handling is throttled via `requestAnimationFrame` (process at most one move per frame); coverage state lives in a ref and commits to React state only when the covered count or stroke index changes.
8. **Pure helpers, unit-tested in node (no jsdom SVG):** `samplePath(pathData, n)` and `updateCoverage(points, coveredUpTo, pointerPos, tolerance, lookAhead)`.

## Technical Approach & Suggestions

Install in `apps/web`: `pnpm --filter web add svg-path-properties` — it computes path length and `getPointAtLength` in pure JS, so `samplePath` is testable in Vitest without a browser SVG implementation (jsdom's `SVGPathElement.getPointAtLength` does not exist).

Files to create (under `/Users/salmanrahman/Documents/kidlearn/apps/web/`):

```
components/activities/TraceActivity.tsx       # renderer (registers as "trace")
components/activities/trace/geometry.ts       # samplePath, splitStrokes, pathTangentAt (pure)
components/activities/trace/coverage.ts       # updateCoverage, isStrokeComplete (pure)
components/activities/trace/useTraceState.ts  # stroke index, coverage, ink trail, rAF throttle
components/activities/trace/geometry.test.ts
components/activities/trace/coverage.test.ts
components/activities/TraceActivity.test.tsx
```

Modify: `components/activities/registry.ts` — `trace: TraceActivity`.

Pure helper signatures (exact):

```ts
// geometry.ts
export interface Point { x: number; y: number }

/** Split an SVG path string into subpaths (strokes) on absolute/relative moveto. */
export function splitStrokes(pathData: string, strokeOrder?: number[]): string[];

/** Sample a single-stroke path into n evenly spaced points using svg-path-properties. */
export function samplePath(pathData: string, n: number): Point[];

// coverage.ts
export interface CoverageState {
  covered: boolean[];      // parallel to sampled points
  frontier: number;        // index of furthest covered point (-1 initially)
}

export const DEFAULT_TOLERANCE = 12;  // viewBox units (glyph space is 0–100)
export const LOOK_AHEAD = 5;          // how many points past the frontier may be marked
export const COMPLETE_RATIO = 0.9;

export function updateCoverage(
  points: Point[],
  state: CoverageState,
  pointer: Point,
  tolerance: number = DEFAULT_TOLERANCE,
  lookAhead: number = LOOK_AHEAD,
): CoverageState; // returns the SAME reference if nothing changed (cheap rAF loop)

export function isStrokeComplete(state: CoverageState, total: number): boolean; // covered/total >= 0.9
```

`updateCoverage` rule: scan indices `[max(0, frontier - 2) .. frontier + lookAhead]`; mark any whose distance to `pointer` ≤ `tolerance`; new `frontier` = highest covered index. The small backward window forgives jitter without allowing out-of-order completion.

`useTraceState(definition, feedback, onActivityComplete)` sketch:

```ts
const strokes = useMemo(
  () => splitStrokes(definition.pathData, definition.strokeOrder).map((s) => samplePath(s, 40)),
  [definition],
);
// refs: coverageRef (CoverageState), trailRef (Point[]), pendingMove (Point | null)
// state: strokeIndex, coveredCount (for re-render), trail (committed per frame)
// onPointerMove: store pendingMove; schedule rAF if none pending.
// rAF tick: convert client coords → viewBox coords via svg.getScreenCTM().inverse()
//   (in tests, inject a `toViewBox` fn instead of reading CTM), run updateCoverage,
//   push to trail, commit state if changed; on isStrokeComplete → feedback.success,
//   strokeIndex+1 or (last stroke) celebration + onActivityComplete().
```

Rendering layers inside one `<svg viewBox="0 0 100 100" className="h-full max-h-[70vh] w-auto touch-none">`:

1. faint outline path (full glyph, `opacity-20`, `strokeWidth=10`)
2. dotted guide for current stroke (`strokeDasharray="0.1 6"`, round linecap)
3. completed strokes as solid ink (`stroke-amber-500`, `strokeWidth=7`)
4. live trail polyline for the current gesture
5. start dot (`<circle r={4}>` with `animate-ping` sibling) + direction arrows (`<path d="M-2 -2 L2 0 L-2 2">` rotated by `pathTangentAt`)

The pointer overlay is the `<svg>` itself (`onPointerDown={...}` etc. directly on it). Direction arrows hide while the pointer is down on the current stroke to reduce clutter.

Test plan: `geometry.test.ts` — `splitStrokes("M10 10 L90 10 M50 10 L50 90")` → 2 strokes, `samplePath("M0 0 L100 0", 11)` → 11 points with `x` stepping by 10. `coverage.test.ts` — pointer walking along points covers in order to ≥90%; a pointer jumping to the last point first covers nothing beyond the look-ahead; identical state returns same reference. Component test mocks `useActivityFeedback` and drives `useTraceState` via `renderHook` with an injected identity `toViewBox`, asserting stroke advance and final `onActivityComplete`.

## Step-by-Step Plan

1. Add `svg-path-properties`; write failing `geometry.test.ts` for `splitStrokes` and `samplePath`. (~20 min)
2. Implement `geometry.ts` (use `new svgPathProperties(path)` → `getTotalLength()` / `getPointAtLength()`) → green. (~25 min)
3. Write failing `coverage.test.ts`: in-order coverage, look-ahead enforcement, backward-jitter forgiveness, 90% completion, no-change same-reference. (~25 min)
4. Implement `coverage.ts` → green. (~20 min)
5. Build `useTraceState` with rAF throttling, pendingMove ref, stroke advancement, and feedback/completion calls; test it with `renderHook` (fake timers + manual rAF flush). (~30 min)
6. Build `TraceActivity.tsx` rendering the five SVG layers + start dot + arrows, wiring pointer events with `setPointerCapture` and `touch-none`. (~30 min)
7. Register in `registry.ts`; play a trace lesson in `pnpm dev` with touch emulation — verify finger tracing, off-path forgiveness, multi-stroke glyph (e.g. "T"), portrait + landscape. (~20 min)
8. Run `pnpm lint && pnpm typecheck && pnpm --filter web test`; update the tracker. (~10 min)

## Acceptance Criteria

- [ ] `pnpm --filter web test` passes including `geometry.test.ts`, `coverage.test.ts`, and `TraceActivity.test.tsx`.
- [ ] `samplePath` and `updateCoverage` run under plain Vitest/node (no jsdom SVG APIs, no browser).
- [ ] Tracing along the guide completes a stroke at ≥90% in-order coverage; jumping straight to the end does not complete it.
- [ ] A multi-stroke glyph requires strokes in order, with per-stroke cheer + advancing start dot, then a full-glyph celebration and a single `onComplete` via the engine.
- [ ] Wandering off the path never shows an error; lifting the finger mid-stroke keeps progress; retry audio is gentle and optional (FR-ACT-05).
- [ ] Ink trail follows the finger smoothly; `pointermove` work is rAF-throttled (verify no per-event setState in code review).
- [ ] Page does not scroll while tracing on touch (`touch-action: none` effective).
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of Scope

- Match and puzzle renderers (file 20).
- Stroke-order data authoring for the full A–Z / ১–২০ glyph set (content work via admin CMS, file 33; AI generation 34–35).
- Handwriting quality scoring or letter-formation analytics (post-MVP; only completion is tracked).
- Rewards for activity completion (file 23).
