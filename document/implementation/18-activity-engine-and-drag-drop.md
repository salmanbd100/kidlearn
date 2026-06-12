# 18 — Activity Engine & Drag-and-Drop Activity

> **Estimated effort:** 3–4 hours
> **Depends on:** 07, 16
> **Requirement IDs:** FR-ACT-01, FR-ACT-05, FR-ACT-06, NFR-SCALE-02
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the generic, JSON-driven `ActivityEngine` that powers the practice step of every lesson: it parses the lesson's activity `JSONB` payload through `@kidlearn/types`, dispatches to a per-type renderer, and owns the shared concerns every activity needs — instruction audio autoplay, the success/retry feedback layer (no fail state, ever), and completion reporting back to the lesson step engine. Ship the first concrete renderer, `DragDropActivity`, built on `@dnd-kit/core` with touch-first ergonomics for ages 3–6.

## Context & Current State

File 07 is done: `@kidlearn/types` exports `parseActivityDefinition` / `safeParseActivityDefinition`, the `ActivityDefinition` discriminated union (`drag_drop | trace | match | puzzle`), and valid fixtures. File 16 is done: the lesson player shell renders an `ActivityStep` placeholder that receives the lesson's activity data and an `onComplete` callback, and `useAudio()` (from file 13) plays a URL with play/stop/onEnded. `@dnd-kit/core` is not yet installed in `apps/web` — add it here. No activity rendering code exists yet; `TraceActivity` (19) and `MatchActivity`/`PuzzleActivity` (20) will register into the engine built here.

## Detailed Requirements

1. **FR-ACT-06 / NFR-SCALE-02:** `ActivityEngine` accepts the raw `unknown` JSONB payload, validates it with `safeParseActivityDefinition`, and renders the matching renderer from a type→component registry. An invalid payload renders a friendly mascot "oops" screen with a spoken retry prompt and a "skip" path that still calls `onComplete` (a broken payload must never trap a child) — and logs the `ZodError` to the console for developers.
2. **Shared instruction audio:** on mount, the engine autoplays `definition.instructionAudio[locale]` via `useAudio()`, with a large replay button (mascot speaker icon, ≥64px touch target) to hear it again (NFR-A11Y-01).
3. **FR-ACT-05 — feedback layer, shared by all renderers:** success = cheerful sound + confetti burst animation over the touched element; wrong attempt = gentle encouraging audio + a wiggle animation on the dragged item. Infinite retries; there is no fail state, no attempt counter shown to the child, no red ✗ iconography.
4. **Completion reporting:** when a renderer signals it is done, the engine plays a short full-screen celebration (~1.5s) and then calls the `onComplete()` it received from `ActivityStep` (the step engine from 16 advances to the quiz step).
5. **FR-ACT-01 — DragDropActivity:** draggable item cards and large drop-zone targets rendered from `definition.items` / `definition.targets`; the child drags an item onto a target. Correct drop → item locks into the target (no longer draggable) + success feedback. Wrong drop → snap back to the tray + retry feedback. Activity completes when every mapping in `correctMappings` is placed.
6. **Touch-first:** pointer + touch sensors with activation constraints so taps don't start accidental drags; item cards and drop zones are large (see design.md sizes, minimum 64×64px); layout works in portrait (tray below targets) and landscape (tray beside targets) via Tailwind responsive/orientation classes.
7. **Pure logic extracted:** `evaluateDrop(definition, itemId, targetId): boolean` lives in a plain `.ts` module with unit tests — renderers contain no correctness logic inline.
8. **Unit tests:** engine parse/dispatch (valid fixture renders the right renderer, garbage renders the oops screen), `evaluateDrop` (correct pair, wrong pair, unknown ids → false), and drag-drop completion state (all placed → `onComplete` fires once).

## Technical Approach & Suggestions

Install in `apps/web`: `pnpm --filter web add @dnd-kit/core` (and `canvas-confetti` + `@types/canvas-confetti` for the confetti burst).

Files to create (all under `/Users/salmanrahman/Documents/kidlearn/apps/web/`):

```
components/activities/ActivityEngine.tsx        # parse + dispatch + shared chrome
components/activities/registry.ts               # type → renderer map
components/activities/FeedbackLayer.tsx         # confetti / wiggle / audio cues
components/activities/useActivityFeedback.ts    # hook the renderers call
components/activities/DragDropActivity.tsx      # FR-ACT-01 renderer
components/activities/evaluate.ts               # evaluateDrop (pure)
components/activities/evaluate.test.ts
components/activities/ActivityEngine.test.tsx
components/activities/DragDropActivity.test.tsx
```

Modify: `components/lesson/ActivityStep.tsx` (the file-16 placeholder) to render `<ActivityEngine definition={lesson.activity.definition} locale={locale} onComplete={onComplete} />`.

Core contracts:

```tsx
// ActivityEngine.tsx
export interface ActivityEngineProps {
  definition: unknown;            // raw JSONB from the lesson API
  locale: Locale;                 // child's preferred language
  onComplete: () => void;         // step engine advances on this
}

// Every renderer receives the SAME props shape (registry.ts):
export interface ActivityRendererProps<T extends ActivityDefinition = ActivityDefinition> {
  definition: T;
  locale: Locale;
  feedback: ActivityFeedback;     // from useActivityFeedback()
  onActivityComplete: () => void; // renderer → engine; engine celebrates then calls onComplete
}

export const ACTIVITY_RENDERERS: {
  [K in ActivityDefinition["type"]]: ComponentType<ActivityRendererProps<Extract<ActivityDefinition, { type: K }>>>;
} = {
  drag_drop: DragDropActivity,
  trace: ComingSoonActivity,   // replaced in file 19
  match: ComingSoonActivity,   // replaced in file 20
  puzzle: ComingSoonActivity,  // replaced in file 20
};
```

`ComingSoonActivity` simply renders a mascot card with a big "Done!" button calling `onActivityComplete` so files 19/20 can land independently without blocking lesson playthroughs in dev.

```ts
// useActivityFeedback.ts
export interface ActivityFeedback {
  success: (anchor?: { x: number; y: number }) => void; // cheer sfx + confetti at point
  retry: () => void;                                    // encouraging audio; caller applies wiggle class
}
```

`FeedbackLayer` mounts a fixed, pointer-events-none overlay; `success` fires `canvas-confetti` at the anchor and plays a random cheer from a small pool (`/audio/feedback/cheer-{1..3}.mp3`); `retry` plays a random encouragement (`/audio/feedback/retry-{locale}-{1..3}.mp3`). Wiggle is a Tailwind keyframe class (`animate-wiggle`, defined in `globals.css` `@theme`) applied for 400ms via state.

```ts
// evaluate.ts — pure, no React
export function evaluateDrop(
  definition: DragDropActivity,
  itemId: string,
  targetId: string,
): boolean {
  return definition.correctMappings.some(
    (m) => m.itemId === itemId && m.targetId === targetId,
  );
}
```

`DragDropActivity` sketch: state is `placed: Record<string, string>` (itemId → targetId). Wrap in `DndContext` with:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } }),
);

function handleDragEnd({ active, over }: DragEndEvent) {
  if (!over) return; // dnd-kit snaps back automatically (we never persist transforms)
  if (evaluateDrop(definition, String(active.id), String(over.id))) {
    feedback.success(overCenter(over));
    setPlaced((p) => ({ ...p, [active.id]: String(over.id) }));
  } else {
    feedback.retry();
    setWiggling(String(active.id)); // 400ms wiggle on the tray card
  }
}
```

Each item card uses `useDraggable({ id, disabled: id in placed })`; each target uses `useDroppable({ id })` and renders the locked item inside itself once placed. Completion effect: `useEffect` — when `Object.keys(placed).length === definition.correctMappings.length`, call `onActivityComplete()` exactly once (guard with a ref). Layout: `flex flex-col landscape:flex-row gap-6`, targets as a wrapping grid of `min-h-28 min-w-28` rounded cards, tray items `h-24 w-24` with image + label in `label[locale]`.

Testing notes: jsdom has no real drag events — test `evaluateDrop` and the placement reducer directly, and test `DragDropActivity` by invoking `handleDragEnd` through dnd-kit's `onDragEnd` prop extraction or by exporting a `usePlacementState` hook and testing it with `renderHook`. Prefer the hook extraction: `usePlacementState(definition, feedback, onActivityComplete)` returning `{ placed, handleDragEnd }`.

## Step-by-Step Plan

1. Install `@dnd-kit/core` and `canvas-confetti` in `apps/web`; write failing tests for `evaluateDrop` (correct mapping true; swapped pair false; unknown item false). (~15 min)
2. Implement `evaluate.ts` → green. (~15 min)
3. Write failing `ActivityEngine.test.tsx`: valid `validDragDrop` fixture renders a drag-drop testid; `{ type: "nope" }` renders the oops screen and its skip button calls `onComplete`. (~20 min)
4. Implement `ActivityEngine.tsx` + `registry.ts` + `ComingSoonActivity`, including instruction-audio autoplay via `useAudio` (mock it in tests) and replay button. (~30 min)
5. Implement `FeedbackLayer.tsx` + `useActivityFeedback.ts` (confetti, cheer/retry audio pools, wiggle keyframes in `globals.css`). (~25 min)
6. Write failing tests for `usePlacementState`: correct drop adds to `placed` and calls `feedback.success`; wrong drop calls `feedback.retry` and leaves `placed` unchanged; final placement calls `onActivityComplete` once. (~20 min)
7. Implement `DragDropActivity.tsx` with the dnd-kit setup, locked-in-place rendering, and portrait/landscape layout → green. (~30 min)
8. Wire `ActivityStep.tsx` to the engine; manually run a lesson in `pnpm dev` on a phone-sized viewport (portrait + landscape); run `pnpm lint && pnpm typecheck && pnpm --filter web test`; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter web test` passes, including `evaluate.test.ts`, `ActivityEngine.test.tsx`, and `DragDropActivity.test.tsx`.
- [ ] `ActivityEngine` given the `validDragDrop` fixture renders `DragDropActivity`; given malformed JSON it renders the oops screen (no crash) and skip still calls `onComplete`.
- [ ] Instruction audio plays automatically on mount in the child's locale and can be replayed from a ≥64px button.
- [ ] A wrong drop snaps the item back, wiggles it, and plays encouraging audio; the child can retry indefinitely — no fail state, no error iconography (FR-ACT-05).
- [ ] A correct drop locks the item in the target with confetti + cheer; placing all mappings triggers the celebration then `onComplete` exactly once.
- [ ] Works with touch (DevTools device emulation) and mouse, in both portrait and landscape.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of Scope

- Trace renderer (file 19); match and puzzle renderers (file 20) — they only get registry stubs here.
- Quiz engine and quiz drag formats (21–22) — the quiz reuses dnd-kit setup but is a separate engine.
- Persisting activity completion server-side (the step engine from 16 already saves step progress; rewards land in 23).
- Authoring/validating activity payloads in the admin CMS (33) or AI pipeline (34–35).
