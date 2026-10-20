# M17 — Trace Activity

> **Estimated effort:** 3–4 hours
> **Depends on:** M16
> **Requirement IDs:** FR-ACT-02, FR-ACT-05, FR-ACT-06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Port letter and number tracing to native: the glyph outline, direction arrows and the child's ink rendered with `react-native-svg`, the child's finger tracked by a pan gesture, progress judged by the same coverage maths the web app uses — because it is pure JavaScript (`svg-path-properties` plus two small modules) and crosses to React Native unchanged. Only the rendering and the touch capture are new.

## Context & Current State

- `TraceActivitySchema` (`packages/types/src/activity/schemas.ts`) carries: `schemaVersion: 1`, `type: "trace"`, `instructionAudio`, `glyph` (the character being traced — "A", "৩", …), `pathData` (the SVG path; one subpath per `M`), `guideDots` (≥2 waypoints, in trace order), and two optional fields: **`strokeOrder`** (the order the subpaths are traced; ignored unless it is a permutation of the subpath indices) and **`tolerance`** (max finger stray, in a **reference 0–100 glyph space** the renderer scales; `≤ 50`).
- `apps/web/features/activities/TraceActivity.tsx` and `apps/web/features/activities/trace/` are the reference. The rules to carry over exactly:
  - `trace/geometry.ts`: `splitStrokes(pathData, strokeOrder)` → one path per stroke; `samplePath(d, n)` via `svg-path-properties` (`SAMPLES_PER_STROKE = 40` in `use-trace-state.ts`); `glyphFrameOf(points)` derives the `viewBox` from the sampled points (`REFERENCE_EXTENT = 100`, padded) and a `unit`; `toPathUnits(length, frame)` converts reference units into path units; `arrowsAlong` places the direction arrows.
  - `trace/coverage.ts`: per-stroke coverage over the sampled points, matching only a window around the frontier (`JITTER_BEHIND = 2` behind, `LOOK_AHEAD = 5` ahead) so a finger cannot jump to the end; `DEFAULT_TOLERANCE = 12` reference units; a stroke is complete at `COMPLETE_RATIO = 0.9` of its points covered. Strokes are traced in order; finishing one calls `feedback.success` and starts the next.
  - **Forgiveness:** coverage survives a lift, so the child resumes where they were. The only "try again" is a lift with **nothing** covered on the current stroke → `feedback.retry()` once. Leaving the path is never an error.
  - **Keyboard path:** the board is a `role="application"` surface; Space, Enter or → (`traceAhead`) advance the frontier by `KEYBOARD_STEP = 4` points, so a screen-reader or switch user can complete it. A path that yields no strokes renders `ActivityUnavailable` and is logged.
  - The web renderer does **not** read `guideDots`: it shows a start dot plus `ARROW_COUNT = 3` arrows along the current stroke. Mobile matches web.
- `coverage.ts` has no dependencies and `geometry.ts` depends only on `svg-path-properties` — both platform-free. Per D6, **lift them** rather than copy: `packages/types/src/activity/trace/` (adding `svg-path-properties` as a `@kidlearn/types` dependency, no React), with web re-pointed. If adding a runtime dependency to `@kidlearn/types` is unwelcome, lift `coverage.ts` only and record why `geometry.ts` was ported.
- M16 gives the renderer contract (`{ definition, locale, feedback: { success, retry }, onActivityComplete }`), the engine that speaks the instruction and celebrates, the lifted grader, and the registry this file adds a `case` to.
- `react-native-svg` is needed for the outline, the arrows and the child's ink. It must be added to the M01 `transformIgnorePatterns` list if it is not already covered.
- design.md §7: the glyph must be large — a full-width canvas on a phone; the start dot is drawn at least `MIN_START_DOT_RADIUS` and never smaller than the tolerance.
- Reduced motion (M05) applies to the completion animation, not to the ink following the finger, which is direct manipulation rather than decoration.

## Detailed Requirements

1. **Renderer** `components/activities/TraceActivity.tsx`, registered in M16's registry under `trace`. Implements the game only: the engine still owns instruction audio and the celebration.
2. **Canvas layout.** An `Svg` sized to the available width (safe area and shell padding accounted for) with `viewBox = glyphFrameOf(...)`'s value. Scale by the `viewBox`, **never** by rewriting the path string — the maths runs in path coordinates. Convert touches into path coordinates with the inverse of the current scale and offset.
3. **Layers, drawn in order:** the current stroke's outline (wide, pale — the "road"), finished strokes as solid ink, the direction arrows and start dot on the current stroke, and the child's covered portion. Stroke widths come from web's constants in reference units (`OUTLINE_WIDTH`, `INK_WIDTH`, …) converted with `toPathUnits`.
4. **Progress model.** The lifted `updateCoverage` / `isStrokeComplete` over `samplePath` points, one stroke at a time in `splitStrokes` order. No second implementation of the matching rule.
5. **Tolerance.** `toPathUnits(definition.tolerance ?? DEFAULT_TOLERANCE, frame)` — the payload's value in reference glyph units, exactly as web. Because it is relative to the glyph, it already scales with the canvas; a fingertip on a 360px phone may still need more. If device tuning says so, add a **floor** expressed in dp (converted through the current canvas scale) and take the larger of the two — never replace the payload's value, which an author set on purpose. This is a tuning step, and the file is not done until it feels right on hardware.
6. **Forgiveness, not failure.** As web: coverage survives a lift; a lift with nothing covered on the current stroke calls `feedback.retry()` once; there is no wrong ending to a trace, only "not finished yet".
7. **Completion.** Each finished stroke calls `feedback.success(anchor)`; after the last, `onActivityComplete()`. Show the completed glyph as solid ink for a beat before the engine's celebration takes over.
8. **Restart.** A ≥64px "try again" control clears coverage and ink and returns to the first stroke without leaving the step. Tracing is a motor-skill exercise; repeating it is the point.
9. **Multi-stroke glyphs.** Handled by `splitStrokes` + `strokeOrder`: each subpath is its own stroke, completed in order, with a finger lift between them allowed and expected.
10. **Both orientations and tablets.** The canvas grows with the screen but keeps its aspect ratio; on a tablet in landscape it is centred rather than stretched. Re-derive the screen→path transform on layout change — a rotation mid-trace keeps coverage (it lives in path coordinates).
11. **Accessibility.** Mirror web's keyboard path: the canvas is an adjustable element (`accessibilityRole="adjustable"`, `accessibilityActions` `increment`) whose increment advances the frontier by `KEYBOARD_STEP` points; it announces the glyph and "stroke n of m", and "done" at the end. No fake gesture, no skip — the step is completable without one.
12. **Tests** (`components/activities/TraceActivity.test.tsx`; the lifted modules keep web's tests): coverage advances only near the frontier and never for a jump to the end; a lift with nothing covered calls `retry` once and a lift after progress does not; each stroke completion calls `success`, the last calls `onActivityComplete` exactly once; restart clears progress; `strokeOrder` reorders strokes; a payload `tolerance` is honoured; a layout change keeps coverage; the accessibility increment completes the glyph; a path with no strokes renders `ActivityUnavailable`.

## Technical Approach & Suggestions

```
packages/types/src/activity/trace/coverage.ts     # lifted from apps/web/features/activities/trace (+ test)
packages/types/src/activity/trace/geometry.ts     # lifted (+ test); needs svg-path-properties
apps/mobile/components/activities/TraceActivity.tsx
apps/mobile/components/activities/TraceActivity.test.tsx
apps/mobile/components/activities/trace/GlyphCanvas.tsx     # Svg: outline + ink + arrows + start dot
apps/mobile/components/activities/trace/use-trace-state.ts  # port of web's hook: strokes, frame, tolerance, coverage
apps/mobile/components/activities/registry.tsx              # + trace case
```

The state set-up is web's `useTraceState`, with only the pointer→path conversion swapped:

```ts
const strokes = useMemo(
  () => splitStrokes(definition.pathData, definition.strokeOrder)
    .map((d, order) => ({ id: `stroke-${order}`, d, points: samplePath(d, SAMPLES_PER_STROKE) }))
    .filter((stroke) => stroke.points.length > 0),
  [definition],
);
const frame = useMemo(() => glyphFrameOf(strokes.flatMap((s) => s.points)), [strokes]);
const tolerance = useMemo(
  () => Math.max(
    toPathUnits(definition.tolerance ?? DEFAULT_TOLERANCE, frame),
    MIN_TOLERANCE_DP / scale,          // optional floor, only if device tuning needs it
  ),
  [definition.tolerance, frame, scale],
);
```

Coverage updates come from the pan gesture's `onUpdate`. Run the hit-testing on the JS side at most once per frame (web batches through `requestAnimationFrame` and compares identity before touching state), and only set React state when `updateCoverage` returns a new object.

Render the covered portion as a polyline through the covered sample points (web's `coveredPoints`), not a freehand trail — it snaps the ink to the letter, which is what a tracing exercise wants.

## Step-by-Step Plan

1. Lift `trace/coverage.ts` and `trace/geometry.ts` with their tests into `packages/types/src/activity/trace/`, re-point web, run both suites. (~35 min)
2. Install `react-native-svg` (and add it to `transformIgnorePatterns` if needed); build `GlyphCanvas` and confirm a seeded glyph renders at full width on device. (~35 min)
3. Port `use-trace-state.ts`: strokes, frame, tolerance, coverage, the lift rule, stroke completion. (~45 min)
4. Add the pan gesture and the screen→path transform. (~30 min)
5. Add arrows, start dot, restart and the solid-ink completion beat. Test each. (~30 min)
6. Add the accessibility increment action and its announcements. (~20 min)
7. Device tuning pass — **the important one**: trace on a physical small Android phone, a large phone and a tablet, in both orientations, with the payload's default tolerance; add the dp floor only if a 4-year-old's finger cannot complete a letter. Rotate mid-trace and confirm progress survives. (~40 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The trace activity renders from `TraceActivitySchema` data alone, honouring `strokeOrder` and `tolerance` when present.
- [ ] Coverage and geometry are the lifted web modules; no second implementation of the path maths or the matching rule exists.
- [ ] Progress advances strictly forward: a finger placed near the end without tracing does not complete the glyph.
- [ ] Tracing feels achievable on a 360px phone **and** controlled on a tablet — confirmed on hardware; any dp floor is documented with the device it was tuned on.
- [ ] Leaving the path never fails the attempt; `retry` fires only for a lift with nothing covered.
- [ ] Each stroke completion calls `success`; the last hands over to the engine via `onActivityComplete` exactly once.
- [ ] A restart control (≥64px) clears the ink without leaving the step.
- [ ] Rotating the device mid-trace keeps progress.
- [ ] With a screen reader active, the glyph is completable through the adjustable increment action.
- [ ] Rendering stays smooth on a low-end Android device.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Handwriting recognition or scoring stroke quality. The spec asks for tracing, not assessment.
- Freehand drawing that preserves the child's actual line shape. The snapped ink is deliberate: it teaches the letter's form.
- Rendering `guideDots` — web does not use them either; adding them is a design change for both clients.
- Authoring `pathData`, `strokeOrder` or `tolerance` — the admin CMS (`apps/web/features/admin/`), web-only.
- Match and puzzle activities — M18.
- Haptic feedback per stroke: appealing, not in the spec, and it needs its own setting.
