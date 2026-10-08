# M16 — Activity Engine & Drag-Drop Activity

> **Estimated effort:** 3–4 hours
> **Depends on:** M13
> **Requirement IDs:** FR-ACT-01, FR-ACT-05, FR-ACT-06, NFR-SCALE-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the generic, JSON-driven activity engine — the piece that makes new activity types *data* rather than code — and the first renderer on top of it: drag-and-drop, rebuilt natively on `react-native-gesture-handler` + Reanimated in place of `@dnd-kit`. This is the largest single porting job in the plan, so it comes first among the activities and sets the pattern the other three follow.

## Context & Current State

- `apps/web/features/activities/ActivityEngine.tsx` is the reference, and the architecture this file must reproduce is:
  - **It is handed `unknown` and validates it there.** The payload is JSONB written by a CMS author or an AI pipeline; the engine trusts nothing and parses at the boundary with **`readActivityDefinition`** — the read path, which migrates to the current `schemaVersion` and drops unknown keys so a field from a newer deploy cannot take the step down. (`safeParseActivityDefinition` is the strict *write-path* check; its docstring says never to use it on a stored payload.) A malformed payload renders `ActivityUnavailable` with the `oops` clip and is logged with `console.error` — it is a content incident and that is its only trace.
  - **The concerns that belong to every activity live in the engine, not the renderers:** speaking the instruction on arrival, offering it again, the feedback channel (`use-activity-feedback.ts`: a random cheer plus a burst on `success`, a random per-locale encouragement on `retry`), and the celebration between "finished" and the step's `onComplete`. A renderer implements one game and nothing else.
  - `CELEBRATION_MS = 1500`, tappable-through.
  - `apps/web/features/lesson/steps/ActivityStep.tsx` renders `ActivityUnavailable` (`activity.empty`) with a skip when `lesson.activity` is `null` — a normal authoring state.
- `packages/types/src/activity/schemas.ts` owns the contract. `ActivityDefinitionSchema` is a discriminated union over `drag_drop | trace | match | puzzle`, all `schemaVersion: 1`, all carrying `instructionAudio: LocalizedAudioSchema`. `DragDropActivitySchema` specifically: `items` (2–6), `targets` (2–6), `correctMappings` (`{ itemId, targetId }`), with `superRefine` guaranteeing no duplicate ids, no unknown ids, no item mapped twice, and **every item has exactly one correct target**, because "every draggable must have somewhere correct to go, or the child can never finish". Because the union is discriminated, an unknown `type` fails the parse — there is no "unknown type" branch after it.
- `apps/web/features/activities/` also has `registry.tsx` (`renderActivity`, a `switch` on `definition.type`), `evaluate.ts` (grading, pure), `FeedbackLayer.tsx`, `use-activity-feedback.ts`, `use-placement-state.ts`, `ActivityUnavailable.tsx`. The cross-feature interaction hooks moved to **`apps/web/shared/hooks/`**: `use-activity-sensors.ts` (dnd-kit pointer + touch sensors only), `use-tap-to-place.ts` (tap an item, tap a target — also the keyboard and VoiceOver path; dnd-kit's `KeyboardSensor` is deliberately not mounted), `use-wiggle.ts` (`WIGGLE_MS = 400`, `NOT_QUITE_MS = 1200`), `use-pairing.ts`, `use-focus-when-dropped.ts`; `pair-colours.ts` and `StatusMark.tsx` live in `apps/web/shared/components/kid/`. The quiz's `DragAnswerQuestion` reuses the same sensors and tap-to-place.
- **`evaluate.ts` is platform-free** (`evaluateDrop`, `isActivityComplete`, `groupItemsByTarget`, `evaluatePair`, the puzzle id helpers, `evaluatePiecePlacement`, `isPuzzleComplete`) — **lift it, do not port it** (D6): `packages/types/src/activity/evaluate.ts`, beside the quiz's `evaluateAnswer`.
- Activities post nothing to the server. The activity step's report and `step_complete` event are the shell's (M13); any milestone posted to `/api/events/activity` counts against the per-child `CLIENT_EVENTS_PER_MINUTE = 30`, so never post per drop.
- M13 gives the step contract; the activity step is one of its five. M14 gives narration and feedback sounds. M05 gives reduced motion and touch-target constants.
- design.md §7: ≥64px targets — a draggable item and a drop target must both clear that comfortably, so plan for ~96px on a 360px-wide phone with 2–3 targets per row.

## Detailed Requirements

1. **`components/activities/ActivityEngine.tsx`** — same responsibilities as the web engine, same prop shape (`{ definition: unknown; locale: Locale; onComplete: () => void }`):
   - parse with `readActivityDefinition`; on failure log it, render `ActivityUnavailable` (with the `oops` clip) and give the child a way to move on (the step must not be a dead end);
   - speak `instructionAudio` (resolved with M14's `resolveNarration`) on mount, with a ≥64px replay speaker;
   - own the feedback channel (`success` / `retry` sounds and the visual layer);
   - hold the celebration for `CELEBRATION_MS`, tappable-through, then call `onComplete()`.
   `ActivityStep` renders `ActivityUnavailable` with a skip when `lesson.activity` is `null`.
2. **Registry.** `components/activities/registry.tsx` — a `switch` on `definition.type` returning the renderer, as web's `renderActivity`. Adding an activity type is a schema variant, one file and one `case` — no change to the engine (NFR-SCALE-02). A type this binary does not know fails `readActivityDefinition` and lands on `ActivityUnavailable`, so a future content version degrades rather than crashing an old app.
3. **Renderer contract.** `components/activities/activity-props.ts` mirrors web's `ActivityRendererProps`: `{ definition, locale, feedback: { success(anchor?), retry() }, onActivityComplete() }`. A renderer renders the game only — it calls `feedback.success`/`feedback.retry` and, when done, `onActivityComplete`; it does not play instruction audio, does not celebrate, and does not call the step's `onComplete`. This is what makes M17 and M18 independent files.
4. **Grading is pure and shared.** Lift `apps/web/features/activities/evaluate.ts` (and `evaluate.test.ts`) to `packages/types/src/activity/evaluate.ts`, export it from the package, and re-point web's renderers at it in the same change (D6). Add cases against `packages/types/src/__fixtures__/activities.ts`. One grader, two clients — there is nothing to drift.
5. **Drag-drop renderer** (`components/activities/DragDropActivity.tsx`) on `react-native-gesture-handler`'s `Gesture.Pan()` + Reanimated:
   - each item is draggable with a lift effect (scale + shadow) on gesture begin;
   - drop targets highlight when the dragged item is over them (hit-testing by measured layout, not by guesswork);
   - a correct drop snaps into place, locks, calls `feedback.success(anchor)`, and marks the item done (`use-placement-state.ts`'s model);
   - an incorrect drop springs the item back to its origin, wiggles it (`WIGGLE_MS`, with the static "not quite" mark held for `NOT_QUITE_MS`), and calls `feedback.retry()` — **never** blocks or scolds (design.md §10);
   - when every item is placed correctly (`isActivityComplete`), `onActivityComplete()`.
6. **Gesture correctness on the UI thread.** Position updates run in the worklet; only the *decision* (which target was hit, was it correct) crosses to JS via `runOnJS`. Reading React state inside a worklet is the classic Reanimated mistake and produces stale hit-testing.
7. **Layout measurement.** Target positions come from `onLayout` (or Reanimated's `measure`) stored in a shared value, re-measured on orientation change. Do not compute drop zones from assumed pixel positions — they differ on every device.
8. **Reduced motion.** Springs become instant transitions; the lift effect becomes an opacity change. The game remains fully playable — reduced motion must never remove the feedback that tells a child what happened.
9. **Both orientations, small screens.** 2–6 items and 2–6 targets must fit a 360px-wide phone with ≥64px targets: wrap into rows, shrink spacing before size, and switch to a side-by-side items/targets layout in landscape. Never a horizontal scroll inside a drag surface — dragging and scrolling compete for the same gesture.
10. **Accessibility — tap-to-place for everyone.** Port web's `use-tap-to-place.ts`: tap an item to select it, tap a target to place it. On web this is always on and is also the keyboard/VoiceOver path; do the same natively — always available alongside the drag, and the only path a screen-reader user needs (items and targets are buttons with labels and selected/placed state). Same grader, same feedback, no gesture required.
11. **Tests** (`components/activities/ActivityEngine.test.tsx`, `DragDropActivity.test.tsx`; the lifted grader keeps its tests in `packages/types`): a malformed definition and an unknown `type` both render `ActivityUnavailable` and can still be exited; a `null` activity renders the empty state with a skip; the instruction plays once on mount and again on the speaker; `onComplete` fires after the celebration and can be tapped through; a correct placement locks and calls `success`, a wrong one returns the item and calls `retry`; completing all items calls `onActivityComplete`; a tap-tap sequence grades identically to a drag.

## Technical Approach & Suggestions

```
apps/mobile/components/activities/ActivityEngine.tsx
apps/mobile/components/activities/ActivityEngine.test.tsx
apps/mobile/components/activities/registry.tsx
apps/mobile/components/activities/activity-props.ts
apps/mobile/components/activities/ActivityUnavailable.tsx
apps/mobile/components/activities/FeedbackLayer.tsx
apps/mobile/components/activities/DragDropActivity.tsx
apps/mobile/components/activities/DragDropActivity.test.tsx
apps/mobile/components/activities/use-drop-targets.ts     # measured layout registry
apps/mobile/components/activities/use-activity-feedback.ts
apps/mobile/lib/use-tap-to-place.ts                       # port of apps/web/shared/hooks/use-tap-to-place.ts
apps/mobile/lib/use-wiggle.ts                             # port of apps/web/shared/hooks/use-wiggle.ts (Reanimated)
packages/types/src/activity/evaluate.ts                   # lifted from apps/web/features/activities/evaluate.ts (+ test)
apps/mobile/components/lesson/steps/ActivityStep.tsx      # replaces M13's placeholder
```

Parse at the boundary, exactly as the web engine does:

```tsx
const parsed = useMemo(() => readActivityDefinition(definition), [definition]);

if (!parsed.success) {
  // A stored payload goes through the read path (migrate + lenient), never the
  // strict write-path check. A bad one is a content incident, not a crash.
  console.error("[kidlearn] activity payload failed validation", parsed.error.issues);
  return <ActivityUnavailable onSkip={onComplete} />;
}
```

Drop-target measurement kept in one place, so both the gesture and the a11y fallback read the same geometry:

```ts
// apps/mobile/components/activities/use-drop-targets.ts
export function useDropTargets() {
  const layouts = useSharedValue<Record<string, LayoutRectangle>>({});

  const register = useCallback((id: string) => (event: LayoutChangeEvent) => {
    layouts.value = { ...layouts.value, [id]: event.nativeEvent.layout };
  }, [layouts]);

  // Runs on the UI thread during the drag — must not read React state.
  const hitTest = useCallback((x: number, y: number): string | undefined => {
    "worklet";
    for (const [id, r] of Object.entries(layouts.value)) {
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return id;
    }
    return undefined;
  }, [layouts]);

  return { register, hitTest, layouts };
}
```

The gesture, with only the decision crossing threads:

```tsx
const pan = Gesture.Pan()
  .onBegin(() => { scale.value = withSpring(1.1); })
  .onUpdate((e) => { tx.value = e.translationX; ty.value = e.translationY; })
  .onEnd((e) => {
    const targetId = hitTest(e.absoluteX, e.absoluteY);
    runOnJS(resolveDrop)(item.id, targetId);      // grading happens in JS
    scale.value = withSpring(1);
  });
```

`resolveDrop` calls the lifted `evaluateDrop` from `@kidlearn/types`, then either locks the item (correct) or springs `tx`/`ty` back to zero (incorrect). Keeping the grader pure is what lets tap-to-place reuse it with no gesture at all.

Wrap the drag surface in `GestureHandlerRootView` (already at the app root from M05) and avoid nesting the drag area inside a vertical `ScrollView` — if the content genuinely does not fit, reduce spacing and item size to the 64px floor rather than introducing a scroll that steals the pan.

## Step-by-Step Plan

1. Lift `evaluate.ts` and its tests to `packages/types/src/activity/evaluate.ts`, re-point `apps/web`, add fixture cases; run `pnpm --filter @kidlearn/types test` and `pnpm --filter web test`. (~35 min)
2. Build `ActivityUnavailable`, `FeedbackLayer`, `use-activity-feedback` and the `activity-props.ts` contract. (~25 min)
3. Build `ActivityEngine` with `readActivityDefinition`, instruction audio, feedback and the celebration hold; write its tests (malformed, unknown type, `null` activity, instruction once, celebration tappable-through). (~45 min)
4. Build `use-drop-targets.ts` with layout registration and worklet hit-testing. (~30 min)
5. Build `DragDropActivity`: draggable items, lift, highlight, snap-lock on correct, spring-back and wiggle on wrong, `onActivityComplete` when complete. Test each branch with fireEvent-driven gestures. (~60 min)
6. Port `use-tap-to-place` and `use-wiggle`, add the reduced-motion branch; test that tap-tap grades identically. (~35 min)
7. Replace M13's activity placeholder with `ActivityStep` wiring the engine into the step contract. (~15 min)
8. Device pass: a **physical low-end Android phone** is the real test here — drag six items, check for dropped frames, check hit-testing after rotating the device, and check the whole activity fits at 360px with ≥64px targets. (~40 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The engine parses `definition` with `readActivityDefinition` and renders `ActivityUnavailable` (with a way forward) for malformed payloads, unknown types and a `null` activity — no crash, no dead end.
- [ ] Adding an activity type requires one new file plus one registry `case`, with no change to `ActivityEngine`.
- [ ] `evaluate.ts` lives in `packages/types` and both clients import it; the web suite still passes.
- [ ] The instruction is spoken once on arrival and replayable from a ≥64px speaker.
- [ ] Correct drops snap and lock; wrong drops spring back with a try-again sound and no scolding; completing all items advances after the tappable-through celebration.
- [ ] Dragging is smooth on a physical low-end Android device with six items — position updates stay on the UI thread.
- [ ] Hit-testing is correct after a device rotation (targets are re-measured, not assumed).
- [ ] Tapping an item then a target places it, with identical grading and feedback, and is the complete path with a screen reader active.
- [ ] No activity posts to the server; recording is the shell's.
- [ ] Reduced motion removes the springs but keeps every piece of feedback intact.
- [ ] Six items and six targets fit a 360px-wide screen with all targets ≥64px, in both orientations, with no horizontal scroll inside the drag surface.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Tracing — M17. Match and puzzle — M18. They are registry entries against the contract this file defines.
- Quiz drag-answer — M20. It looks similar and is a different schema with a different grader; do not try to share the renderer.
- Authoring or editing activity payloads — the admin CMS (`apps/web/features/admin/`), which is web-only.
- New activity types beyond the four in `ActivityDefinitionSchema`.
- Haptics. Tempting for drop feedback, and a separate decision: it needs a mute-equivalent setting and it is not in the spec.
