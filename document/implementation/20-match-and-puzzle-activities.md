# 20 — Match Objects & Puzzle Activities

> **Estimated effort:** 3–4 hours
> **Depends on:** 18
> **Requirement IDs:** FR-ACT-03, FR-ACT-04, FR-ACT-05
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Ship the last two activity renderers. `MatchActivity` (FR-ACT-03) lets the child pair items from two sets — number 3 ↔ three apples — using tap-tap pairing (tap one item from each set), which is far more reliable for 3–6-year-old fingers than line drawing; an SVG line draws between matched pairs as visual confirmation. `PuzzleActivity` (FR-ACT-04) cuts an image into a grid of pieces the child drags from a tray into target slots, reusing the dnd-kit setup from file 18. Both register into the `ActivityEngine` type switch, completing all four FR-ACT activity types.

## Context & Current State

File 18 is done: `ActivityEngine`, `ACTIVITY_RENDERERS` registry (with `match` and `puzzle` still pointing at `ComingSoonActivity`), `useActivityFeedback()` (`success`/`retry`), the `animate-wiggle` keyframe, dnd-kit installed with tuned `PointerSensor`/`TouchSensor`, and the `evaluateDrop` pattern of pure helpers + hook-extracted state. From file 07, the `match` payload has `leftSet[]`, `rightSet[]`, `pairs[]` (`{leftId, rightId}`); the `puzzle` payload has `image: AssetRef`, `grid: {rows, cols}` (2–4 each), and `slots[]` (`{index, row, col}`). If pre-placed pieces are wanted for easier Nursery puzzles, add an optional `prePlaced?: number[]` (slot indices) to the puzzle schema now — additive and version-safe.

## Detailed Requirements

1. **FR-ACT-03 — MatchActivity, tap-tap pairing:** the two sets render as two columns (portrait) or two rows (landscape) of large cards. Tapping a card selects it (scale-up + ring highlight + its audio if present); tapping a card from the *other* set attempts the pair. Tapping a second card from the *same* set moves the selection. Tapping the selected card deselects.
2. **Match feedback (FR-ACT-05):** correct pair → both cards lock with a shared color highlight (cycle through 6 pastel pair-colors), an SVG line draws between their centers, and `feedback.success` fires. Wrong pair → both cards shake (`animate-wiggle`), `feedback.retry` plays, selection clears; infinite retries, no fail state. Activity completes when all `pairs` are matched.
3. **FR-ACT-04 — PuzzleActivity:** the target board renders the full image at low opacity (ghost preview) divided into `rows × cols` slot cells; pieces live in a scrollable tray below (portrait) / beside (landscape). Each piece shows its crop of the image via CSS `background-position` — no image slicing on the server.
4. **Puzzle interaction:** drag a piece from the tray onto a slot (dnd-kit `useDraggable`/`useDroppable`, sensors from 18). Correct slot → piece snaps in at full opacity and locks; wrong slot → snap back + wiggle + retry audio. Slots listed in `prePlaced` start filled and locked. Completed image plays a brief "whole picture" shine + `feedback.success`, then the renderer signals `onActivityComplete()`.
5. **Pure helpers with unit tests:** `evaluatePair(definition, aId, bId)` — order-agnostic (the child may tap right column first) — and `evaluatePiecePlacement(definition, pieceId, slotId)` in `components/activities/evaluate.ts` next to `evaluateDrop`.
6. **Pairing state extracted as a hook** (`usePairing`) returning selection + matched state, because file 22's `MatchPairQuestion` will reuse it verbatim — keep it free of activity-only concerns (it takes callbacks, not the feedback object).
7. **Both renderers registered** in `ACTIVITY_RENDERERS`, removing the `ComingSoonActivity` stubs for `match` and `puzzle`; engine-level concerns (instruction audio, celebration, completion) stay in the engine — renderers only signal.
8. **Touch targets:** match cards ≥ 96×96px, puzzle pieces sized so a 3×3 grid piece is ≥ 72px on a 360px-wide phone in portrait (board takes full width).

## Technical Approach & Suggestions

Files to create (under `/Users/salmanrahman/Documents/kidlearn/apps/web/`):

```
components/activities/MatchActivity.tsx
components/activities/PuzzleActivity.tsx
components/activities/usePairing.ts          # shared with file 22's MatchPairQuestion
components/activities/MatchActivity.test.tsx
components/activities/PuzzleActivity.test.tsx
```

Modify:

```
components/activities/evaluate.ts            # + evaluatePair, evaluatePiecePlacement
components/activities/evaluate.test.ts       # + tests for both
components/activities/registry.ts            # match: MatchActivity, puzzle: PuzzleActivity
```

Pure helpers (exact):

```ts
// evaluate.ts
export function evaluatePair(
  definition: Pick<MatchActivity, "pairs">,
  aId: string,
  bId: string,
): boolean {
  return definition.pairs.some(
    (p) => (p.leftId === aId && p.rightId === bId) || (p.leftId === bId && p.rightId === aId),
  );
}

export function evaluatePiecePlacement(
  definition: Pick<PuzzleActivity, "slots">,
  pieceId: string,  // piece ids are `piece-${slot.index}`
  slotId: string,   // slot ids are `slot-${slot.index}`
): boolean {
  return pieceId === `piece-${slotId.replace("slot-", "")}` &&
    definition.slots.some((s) => `slot-${s.index}` === slotId);
}
```

`usePairing` — generic so the quiz format (file 22) reuses it:

```ts
export interface PairingCallbacks {
  isCorrectPair: (aId: string, bId: string) => boolean;
  onCorrect: (aId: string, bId: string) => void;   // MatchActivity: feedback.success + line draw
  onWrong: (aId: string, bId: string) => void;     // MatchActivity: feedback.retry + wiggle both
  onAllMatched: () => void;
  totalPairs: number;
}
export interface PairingState {
  selected: { side: "left" | "right"; id: string } | null;
  matched: Map<string, string>;                    // leftId → rightId (locked)
  tap: (side: "left" | "right", id: string) => void;
  pairColor: (id: string) => string | undefined;   // pastel class for locked cards/lines
}
export function usePairing(cb: PairingCallbacks): PairingState;
```

`tap` logic: ignore taps on matched ids; same id → deselect; same side → reselect; opposite side → `isCorrectPair` ? record match (+ color index) and `onCorrect`, when `matched.size === totalPairs` call `onAllMatched` : `onWrong` and clear selection.

Match connection lines: the renderer keeps `cardRefs: Map<string, HTMLElement>`; an absolutely-positioned `<svg className="pointer-events-none absolute inset-0">` overlays the columns container and draws one `<line>` per matched pair between card center points (recompute on match and on `ResizeObserver` of the container — orientation changes reflow correctly).

Puzzle piece crop (3×3 example, piece for `row,col`):

```tsx
<div
  className="touch-none rounded-lg shadow-md"
  style={{
    width: pieceSize, height: pieceSize,
    backgroundImage: `url(${definition.image.url})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${(col / (cols - 1)) * 100}% ${(row / (rows - 1)) * 100}%`,
  }}
/>
```

Puzzle state mirrors file 18's pattern: `usePuzzleState(definition, feedback, onActivityComplete)` returning `{ filled: Set<number>, handleDragEnd }` (initialize `filled` from `prePlaced ?? []`); board is a CSS grid (`grid-template-columns: repeat(cols, 1fr)`, `aspect-ratio` from the image), each empty cell a `useDroppable` slot, each filled cell the cropped image at full opacity.

Testing: `evaluate.test.ts` covers order-agnostic pairs, wrong pairs, piece↔slot index match/mismatch. `MatchActivity.test.tsx` drives `usePairing` via `renderHook` (correct pair locks, wrong pair clears selection + fires `onWrong`, last pair fires `onAllMatched` once) plus a render test that tapping two correct cards adds the locked highlight. `PuzzleActivity.test.tsx` tests `usePuzzleState` (correct placement fills, wrong leaves tray untouched, `prePlaced` honored, completion fires once).

## Step-by-Step Plan

1. Write failing tests for `evaluatePair` (both orders, wrong pair, unknown ids) and `evaluatePiecePlacement` (matching index true, mismatched false, unknown slot false); implement both → green. (~20 min)
2. Write failing `renderHook` tests for `usePairing` (select/deselect/reselect, correct lock + color, wrong clears, `onAllMatched` once). (~25 min)
3. Implement `usePairing.ts` → green. (~20 min)
4. Build `MatchActivity.tsx`: two card columns from `leftSet`/`rightSet` with `label[locale]` + images, selection ring, wiggle-on-wrong, locked pastel highlights, SVG line overlay with `ResizeObserver`. (~35 min)
5. Write failing tests for `usePuzzleState` (correct fill, wrong snap-back path, prePlaced, completion-once); implement the hook. (~25 min)
6. Build `PuzzleActivity.tsx`: ghost-image board grid of droppable slots, tray of cropped draggable pieces, portrait/landscape layout (`flex-col landscape:flex-row`). (~35 min)
7. Register both in `registry.ts` (delete the two stubs); play a match lesson and a puzzle lesson in `pnpm dev` with touch emulation, portrait + landscape. (~20 min)
8. Run `pnpm lint && pnpm typecheck && pnpm --filter web test`; update the tracker. (~10 min)

## Acceptance Criteria

- [ ] `pnpm --filter web test` passes including the new `evaluate` cases, `MatchActivity.test.tsx`, and `PuzzleActivity.test.tsx`.
- [ ] Tap-tap pairing works tapping either column first; wrong pairs shake + play encouraging audio and never block retries (FR-ACT-05).
- [ ] Matched pairs lock with a shared pastel highlight and a connecting line that survives an orientation change.
- [ ] Puzzle pieces drag from tray to board; only the correct slot accepts a piece (snap + lock), wrong drops snap back with wiggle; `prePlaced` slots start filled.
- [ ] Completing all pairs / all slots triggers the engine celebration and a single `onComplete`.
- [ ] All four activity types now render through `ActivityEngine` from their JSON fixtures — no `ComingSoonActivity` remains in the registry.
- [ ] Match cards ≥ 96px square; 3×3 puzzle pieces ≥ 72px on a 360px portrait viewport.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of Scope

- The quiz `match_pair` format (file 22 — it reuses `usePairing` built here, but lives in the quiz engine).
- Optional line-*drawing* input for matching (tap-tap is the shipped interaction; drawn-line input is a post-MVP enhancement).
- Irregular jigsaw-shaped piece outlines (MVP uses square grid crops).
- Activity content authoring/preview in the CMS (33) and AI-generated puzzles (34–35); rewards (23).
