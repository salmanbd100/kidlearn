# M16 — Activity Engine & Drag-Drop Activity

> **Estimated effort:** 3–4 hours
> **Depends on:** M13
> **Requirement IDs:** FR-ACT-01, FR-ACT-05, FR-ACT-06, NFR-SCALE-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the generic, JSON-driven activity engine — the piece that makes new activity types *data* rather than code — and the first renderer on top of it: drag-and-drop, rebuilt natively on `react-native-gesture-handler` + Reanimated in place of `@dnd-kit`. This is the largest single porting job in the plan, so it comes first among the activities and sets the pattern the other three follow.

## Context & Current State

- `apps/web/components/activities/ActivityEngine.tsx` is the reference, and its module docstring states the architecture this file must reproduce:
  - **"It is handed `unknown` and validates it here."** The payload is JSONB written by a CMS author or an AI pipeline; the renderer trusts nothing and parses at the boundary with `safeParseActivityDefinition`. A malformed payload renders `ActivityUnavailable`, not a crash mid-lesson.
  - **"The concerns that belong to every activity live here, not in the renderers":** speaking the instruction on arrival, offering it again, the feedback channel, and the celebration between "finished" and the step engine's `onComplete`. A renderer implements one game and nothing else.
  - `CELEBRATION_MS = 1500`, tappable-through.
- `packages/types/src/activity/schemas.ts` owns the contract. `ActivityDefinitionSchema` is a discriminated union over `drag_drop | trace | match | puzzle`, all `schemaVersion: 1`, all carrying `instructionAudio: LocalizedAudioSchema`. `DragDropActivitySchema` specifically: `items` (2–6), `targets` (2–6), `correctMappings` (`{ itemId, targetId }`), with `superRefine` guaranteeing no duplicate ids, no unknown ids, no item mapped twice, and — importantly for the renderer — **every item has exactly one correct target**, because "every draggable must have somewhere correct to go, or the child can never finish".
- `parseActivityDefinition` / `safeParseActivityDefinition` are exported from `packages/types` — use them; never `JSON.parse` a definition by hand.
- `apps/web/components/activities/` also has the pieces worth porting conceptually: `registry.tsx` (type → renderer), `evaluate.ts` (grading, pure), `FeedbackLayer.tsx`, `use-activity-feedback.ts`, `use-placement-state.ts`, `use-pairing.ts`, `pair-colours.ts`, `ActivityUnavailable.tsx`. **`evaluate.ts` is platform-free** — read it and reuse its logic verbatim rather than writing a second grader.
- M13 gives the step contract; the activity step is one of its five. M14 gives narration and feedback sounds. M05 gives reduced motion and touch-target constants.
- design.md §7: ≥64px targets — a draggable item and a drop target must both clear that comfortably, so plan for ~96px on a 360px-wide phone with 2–3 targets per row.

## Detailed Requirements

1. **`components/activities/ActivityEngine.tsx`** — same responsibilities as the web engine, same prop shape (`{ definition: unknown; locale: Locale; onComplete: () => void }`):
   - parse with `safeParseActivityDefinition`; on failure render `ActivityUnavailable` and give the child a way to move on (the step must not be a dead end);
   - speak `instructionAudio` on mount via M14, with a ≥64px replay speaker;
   - own the feedback channel (correct / try-again sounds and the visual layer);
   - hold the celebration for `CELEBRATION_MS`, tappable-through, then call `onComplete()`.
2. **Registry.** `components/activities/registry.tsx` mapping `definition.type` → renderer component. Adding an activity type is adding one file and one registry entry — no change to the engine (NFR-SCALE-02). An unknown type renders `ActivityUnavailable`, because a future content version must degrade rather than crash an old app.
3. **Renderer contract.** `components/activities/activity-props.ts`: every renderer receives `{ definition, onFinished, onWrongAttempt }` and renders the game only. It does not play instruction audio, does not celebrate, and does not call `onComplete` — those belong to the engine. This is what makes M17 and M18 independent files.
4. **Grading is pure and shared.** `lib/activity-evaluate.ts` ported from `apps/web/components/activities/evaluate.ts`, unit-tested against the fixtures already in `packages/types/src/__fixtures__/activities.ts`. Same rules, same edge cases. If the web version and this one ever disagree, that is a bug in one of them — which is why the fixtures are the shared reference.
5. **Drag-drop renderer** (`components/activities/DragDropActivity.tsx`) on `react-native-gesture-handler`'s `Gesture.Pan()` + Reanimated:
   - each item is draggable with a lift effect (scale + shadow) on gesture begin;
   - drop targets highlight when the dragged item is over them (hit-testing by measured layout, not by guesswork);
   - a correct drop snaps into place, locks, plays the correct sound, and marks the item done;
   - an incorrect drop springs the item back to its origin, plays the try-again sound, and calls `onWrongAttempt` — **never** blocks or scolds (design.md §10);
   - when every item is placed correctly, `onFinished()`.
6. **Gesture correctness on the UI thread.** Position updates run in the worklet; only the *decision* (which target was hit, was it correct) crosses to JS via `runOnJS`. Reading React state inside a worklet is the classic Reanimated mistake and produces stale hit-testing.
7. **Layout measurement.** Target positions come from `onLayout` (or Reanimated's `measure`) stored in a shared value, re-measured on orientation change. Do not compute drop zones from assumed pixel positions — they differ on every device.
8. **Reduced motion.** Springs become instant transitions; the lift effect becomes an opacity change. The game remains fully playable — reduced motion must never remove the feedback that tells a child what happened.
9. **Both orientations, small screens.** 2–6 items and 2–6 targets must fit a 360px-wide phone with ≥64px targets: wrap into rows, shrink spacing before size, and switch to a side-by-side items/targets layout in landscape. Never a horizontal scroll inside a drag surface — dragging and scrolling compete for the same gesture.
10. **Accessibility.** Drag-and-drop is inherently hard for a screen reader. Provide a non-gesture fallback: with a screen reader active (`AccessibilityInfo.isScreenReaderEnabled`), each item and target becomes a button, and the child (or the adult helping) taps an item then taps a target. Same grading, same feedback, no gesture required. This is the accessible equivalent the web app gets from `@dnd-kit`'s keyboard sensor.
11. **Tests** (`lib/activity-evaluate.test.ts`, `components/activities/ActivityEngine.test.tsx`, `DragDropActivity.test.tsx`): the grader matches the web app's results on the shared fixtures; a malformed definition renders `ActivityUnavailable` and can still be exited; an unknown type does the same; the instruction plays once on mount and again on the speaker; `onComplete` fires after the celebration and can be tapped through; a correct placement locks and a wrong one returns the item; completing all items calls `onFinished`; the screen-reader fallback grades a tap-tap sequence identically.

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
apps/mobile/lib/activity-evaluate.ts                      # port of the web evaluate.ts
apps/mobile/lib/activity-evaluate.test.ts
apps/mobile/components/lesson/steps/ActivityStep.tsx      # replaces M13's placeholder
```

Parse at the boundary, exactly as the web engine does:

```tsx
const parsed = useMemo(() => safeParseActivityDefinition(definition), [definition]);

if (!parsed.success) {
  // JSONB authored elsewhere; the server's validation is a different process.
  // A bad payload is a friendly dead-end-avoider, not a crash mid-lesson.
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

`resolveDrop` calls the pure grader from `lib/activity-evaluate.ts`, then either locks the item (correct) or springs `tx`/`ty` back to zero (incorrect). Keeping the grader pure is what lets the a11y fallback reuse it with no gesture at all.

Wrap the drag surface in `GestureHandlerRootView` (already at the app root from M05) and avoid nesting the drag area inside a vertical `ScrollView` — if the content genuinely does not fit, reduce spacing and item size to the 64px floor rather than introducing a scroll that steals the pan.

## Step-by-Step Plan

1. Port `evaluate.ts` to `lib/activity-evaluate.ts` and get its tests passing against `packages/types/src/__fixtures__/activities.ts`. (~35 min)
2. Build `ActivityUnavailable`, `FeedbackLayer` and the `activity-props.ts` contract. (~25 min)
3. Build `ActivityEngine` with parsing, instruction audio, feedback and the celebration hold; write its tests (malformed, unknown type, instruction once, celebration tappable-through). (~45 min)
4. Build `use-drop-targets.ts` with layout registration and worklet hit-testing. (~30 min)
5. Build `DragDropActivity`: draggable items, lift, highlight, snap-lock on correct, spring-back on wrong, `onFinished` when complete. Test each branch with fireEvent-driven gestures. (~60 min)
6. Add the reduced-motion branch and the screen-reader tap-tap fallback; test that the fallback grades identically. (~35 min)
7. Replace M13's activity placeholder with `ActivityStep` wiring the engine into the step contract. (~15 min)
8. Device pass: a **physical low-end Android phone** is the real test here — drag six items, check for dropped frames, check hit-testing after rotating the device, and check the whole activity fits at 360px with ≥64px targets. (~40 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The engine parses `definition` with `safeParseActivityDefinition` and renders `ActivityUnavailable` (with a way forward) for malformed payloads and unknown types — no crash, no dead end.
- [ ] Adding an activity type requires one new file plus one registry entry, with no change to `ActivityEngine`.
- [ ] `lib/activity-evaluate.ts` produces the same verdicts as the web app's `evaluate.ts` on the shared fixtures.
- [ ] The instruction is spoken once on arrival and replayable from a ≥64px speaker.
- [ ] Correct drops snap and lock; wrong drops spring back with a try-again sound and no scolding; completing all items advances after the tappable-through celebration.
- [ ] Dragging is smooth on a physical low-end Android device with six items — position updates stay on the UI thread.
- [ ] Hit-testing is correct after a device rotation (targets are re-measured, not assumed).
- [ ] With a screen reader active, the activity is completable by tapping an item then a target, with identical grading and feedback.
- [ ] Reduced motion removes the springs but keeps every piece of feedback intact.
- [ ] Six items and six targets fit a 360px-wide screen with all targets ≥64px, in both orientations, with no horizontal scroll inside the drag surface.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Tracing — M17. Match and puzzle — M18. They are registry entries against the contract this file defines.
- Quiz drag-answer — M20. It looks similar and is a different schema with a different grader; do not try to share the renderer.
- Authoring or editing activity payloads — the admin CMS (web file 33), which is web-only.
- New activity types beyond the four in `ActivityDefinitionSchema`.
- Haptics. Tempting for drop feedback, and a separate decision: it needs a mute-equivalent setting and it is not in the spec.
