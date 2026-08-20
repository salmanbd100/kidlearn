# M17 — Trace Activity

> **Estimated effort:** 3–4 hours
> **Depends on:** M16
> **Requirement IDs:** FR-ACT-02, FR-ACT-05, FR-ACT-06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Port letter and number tracing to native: the glyph outline and guide dots rendered with `react-native-svg`, the child's finger tracked by a pan gesture, progress judged against the same SVG path maths the web app uses — because `svg-path-properties` is pure JavaScript and crosses to React Native unchanged. Only the rendering and the touch capture are new.

## Context & Current State

- `TraceActivitySchema` (`packages/types/src/activity/schemas.ts`) carries: `schemaVersion: 1`, `type: "trace"`, `instructionAudio`, `glyph` (the character being traced — "A", "৩", …), `pathData` (the SVG path the finger follows) and `guideDots` (waypoints the renderer snaps to, **in trace order**).
- `apps/web/components/activities/TraceActivity.tsx` and `apps/web/components/activities/trace/` are the reference. `svg-path-properties` is already a dependency of `apps/web` and is **platform-free** — the same package computes point-at-length and total length on native. Read the web implementation's tolerance and progress rules and reuse them; a letter that is easy to trace in the browser and hard on a phone is a bug, not a platform difference.
- M16 gives the renderer contract (`{ definition, onFinished, onWrongAttempt }`), the engine that speaks the instruction and celebrates, the pure grader module, and the registry this file adds an entry to.
- `react-native-svg` is needed for the glyph outline, the guide dots and the child's drawn stroke. It must be added to the M01 `transformIgnorePatterns` list if it is not already covered.
- design.md §7: ≥64px targets. A tracing surface is not a button, but the **guide dots** are effectively targets and must be generously sized (≥48px hit area even if drawn smaller), and the glyph must be large — a full-width canvas on a phone.
- Reduced motion (M05) applies to the completion animation, not to the stroke following the finger, which is direct manipulation rather than decoration.

## Detailed Requirements

1. **Renderer** `components/activities/TraceActivity.tsx`, registered in M16's registry under `trace`. Implements the game only: the engine still owns instruction audio, feedback sounds and the celebration.
2. **Canvas layout.** A square-ish `Svg` sized to the available width (with safe-area and shell padding accounted for), with an internal `viewBox` matching the coordinate space `pathData` was authored in. Scale the path by transforming the SVG's `viewBox`, **never** by rewriting the path string — the maths depends on the original coordinates.
3. **Three layers, drawn in order:** the glyph outline (a wide, pale stroke of `pathData` — the "road"), the guide dots (numbered/ordered waypoints), and the child's stroke (the line their finger leaves). Add a subtle start marker on the first guide dot so a pre-reader knows where to begin.
4. **Progress model.** Use `svg-path-properties` to precompute the path's total length and a sampled list of points. The child's finger position is matched to the **next expected** point within a tolerance; matching advances progress. Because `guideDots` are ordered, progress is strictly forward: a child who jumps to the end has not traced the letter.
5. **Tolerance, chosen for fingers.** The web app's tolerance was set for a mouse and a large screen. On a phone, a fingertip covers a much larger area, so the tolerance must be expressed in **screen** units (dp) and converted into path coordinates using the current scale, not hardcoded in path units. Start from the web value converted at the phone scale, then confirm on a real device with a real child-sized touch — this is a tuning step, and the file is not done until it feels right on hardware.
6. **Forgiveness, not failure.** Leaving the path does not fail the attempt: the stroke stops extending, `onWrongAttempt` is called (rate-limited so it cannot fire dozens of times per second), and the child can return to where they were. There is no "wrong" ending to a trace, only "not finished yet" — which is why this activity has no incorrect-completion state.
7. **Completion.** When progress reaches the configured threshold (the web app's rule — do not invent a different one) `onFinished()` is called. Show the completed glyph filled in solidly for a beat before the engine's celebration takes over.
8. **Restart.** A ≥64px "try again" control clears the child's stroke and resets progress without leaving the step. Tracing is a motor-skill exercise; repeating it is the point.
9. **Multi-stroke glyphs.** A single `pathData` may describe a letter needing more than one stroke (e.g. a crossed "t" or several Bangla glyphs) via subpaths. If the path has multiple subpaths, treat each as a segment completed in order, with the finger lifting between them allowed and expected. A finger lift **within** a subpath pauses rather than resets.
10. **Both orientations and tablets.** The canvas grows with the screen but keeps its aspect ratio; on a tablet in landscape it is centred rather than stretched. Re-derive the scale on layout change and re-run the tolerance conversion — a rotation mid-trace must not break the hit-testing (preserve progress, do not reset).
11. **Accessibility.** Tracing is a fine-motor exercise and has no meaningful screen-reader equivalent. With a screen reader active, announce what the glyph is, describe the exercise, and offer a **skip** so the lesson is not blocked — the honest accommodation here is a way past it, not a fake alternative. Document that choice in a comment.
12. **Tests** (`components/activities/TraceActivity.test.tsx`, `lib/trace-progress.test.ts`): the progress helper advances only for points near the next expected point and never for a jump to the end; leaving the path rate-limits `onWrongAttempt`; reaching the threshold calls `onFinished` exactly once; restart clears progress; a multi-subpath definition requires all segments; a layout change recomputes scale without losing progress; with a screen reader on, the skip control is present.

## Technical Approach & Suggestions

```
apps/mobile/components/activities/TraceActivity.tsx
apps/mobile/components/activities/TraceActivity.test.tsx
apps/mobile/components/activities/trace/GlyphCanvas.tsx     # Svg: outline + dots + child stroke
apps/mobile/components/activities/trace/GuideDots.tsx
apps/mobile/lib/trace-progress.ts                            # pure: sampling, matching, thresholds
apps/mobile/lib/trace-progress.test.ts
apps/mobile/components/activities/registry.tsx               # + trace entry
```

Keep all the maths in a pure module — it is the part worth testing and the part shared in spirit with the web app:

```ts
// apps/mobile/lib/trace-progress.ts
import { svgPathProperties } from "svg-path-properties";

export type TraceModel = {
  totalLength: number;
  /** Sampled points in trace order, in path coordinates. */
  points: { x: number; y: number; at: number }[];
};

export function buildTraceModel(pathData: string, sampleCount = 200): TraceModel {
  const props = new svgPathProperties(pathData);
  const totalLength = props.getTotalLength();
  const points = Array.from({ length: sampleCount }, (_, i) => {
    const at = (i / (sampleCount - 1)) * totalLength;
    const { x, y } = props.getPointAtLength(at);
    return { x, y, at };
  });
  return { totalLength, points };
}

/**
 * Strictly forward matching: `guideDots` are ordered, so a finger that appears
 * near the end without having travelled has not traced the glyph.
 */
export function advanceProgress(
  model: TraceModel,
  reachedIndex: number,
  finger: { x: number; y: number },
  tolerance: number,
): number {
  for (let i = reachedIndex + 1; i < model.points.length; i += 1) {
    const p = model.points[i];
    if (Math.hypot(p.x - finger.x, p.y - finger.y) > tolerance) break;
    reachedIndex = i;
  }
  return reachedIndex;
}
```

Tolerance conversion — the single most important line for how this feels on a phone:

```ts
// A fingertip is ~9mm. Express the allowance in dp, then convert into the path's
// coordinate space using the current canvas scale, or the same activity is
// forgiving on a tablet and impossible on a small phone.
const TOLERANCE_DP = 28;
const tolerance = TOLERANCE_DP / scale;   // scale = canvasWidth / viewBoxWidth
```

Rendering the child's stroke as a progressively revealed copy of the guide path (rather than a freehand polyline of finger points) is both cheaper and prettier — it snaps the drawing to the letter, which is what a tracing exercise wants:

```tsx
<Path d={pathData} stroke={tokens.muted} strokeWidth={36} strokeLinecap="round" fill="none" />
<Path
  d={pathData}
  stroke={tokens.primary}
  strokeWidth={24}
  strokeLinecap="round"
  fill="none"
  strokeDasharray={[model.totalLength, model.totalLength]}
  strokeDashoffset={model.totalLength - reachedLength}
/>
```

Drive `strokeDashoffset` from a Reanimated shared value so the reveal happens on the UI thread; the JS side only updates `reachedIndex`, and only when it changes.

Rate-limit the off-path signal so the engine's "try again" sound cannot machine-gun:

```ts
const lastWrongAt = useRef(0);
function signalOffPath() {
  const now = performance.now();
  if (now - lastWrongAt.current < 1200) return;
  lastWrongAt.current = now;
  onWrongAttempt();
}
```

## Step-by-Step Plan

1. Read `apps/web/components/activities/TraceActivity.tsx` and `trace/` in full; note the tolerance and completion-threshold values to carry over. (~20 min)
2. Write `lib/trace-progress.ts` with tests first: sampling, forward-only advance, jump-to-end rejected, threshold. (~45 min)
3. Install `react-native-svg` (and add it to `transformIgnorePatterns` if needed); build `GlyphCanvas` with the three layers and confirm a seeded glyph renders at full width on device. (~35 min)
4. Add the pan gesture, the dp→path tolerance conversion, and the Reanimated `strokeDashoffset` reveal. (~40 min)
5. Add `GuideDots` with the start marker and ordered waypoints. (~25 min)
6. Add off-path handling with rate limiting, the restart control, and completion with the solid-fill beat. Test each. (~35 min)
7. Add multi-subpath segment handling and its test. (~30 min)
8. Add the screen-reader announcement plus skip, with the comment explaining why a real alternative is not offered. (~20 min)
9. Device tuning pass — **the important one**: trace on a physical small Android phone, a large phone and a tablet, in both orientations, and adjust `TOLERANCE_DP` until a 4-year-old's finger can complete a letter without frustration and without it completing itself. Rotate mid-trace and confirm progress survives. (~40 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The trace activity renders from `TraceActivitySchema` data alone — glyph, path and guide dots all come from the payload.
- [ ] `svg-path-properties` is reused unchanged; no second implementation of path maths exists.
- [ ] Progress advances strictly forward: a finger placed near the end without tracing does not complete the glyph.
- [ ] Tolerance is expressed in dp and converted through the current canvas scale, and tracing feels achievable on a 360px phone **and** controlled on a tablet — confirmed on hardware.
- [ ] Leaving the path never fails the attempt; the try-again signal is rate-limited to at most one per ~1.2s.
- [ ] Completion fires once at the threshold, shows the filled glyph, then hands over to the engine's celebration.
- [ ] A restart control (≥64px) clears the stroke without leaving the step.
- [ ] A multi-subpath glyph requires every segment, allows a finger lift between segments, and pauses rather than resets on a lift within a segment.
- [ ] Rotating the device mid-trace recomputes the scale and keeps progress.
- [ ] With a screen reader active, the exercise is announced and a skip is available.
- [ ] The stroke reveal runs on the UI thread and stays smooth on a low-end Android device.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Handwriting recognition or scoring stroke quality. The spec asks for tracing, not assessment.
- Freehand drawing that preserves the child's actual line shape. The snapped reveal is deliberate: it teaches the letter's form.
- Authoring `pathData` or `guideDots` — the CMS (web file 33).
- Match and puzzle activities — M18.
- Haptic feedback on reaching each guide dot: appealing, not in the spec, and it needs its own setting.
