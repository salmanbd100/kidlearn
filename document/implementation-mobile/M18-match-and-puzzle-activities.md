# M18 — Match & Puzzle Activities

> **Estimated effort:** 3–4 hours
> **Depends on:** M16
> **Requirement IDs:** FR-ACT-03, FR-ACT-04, FR-ACT-05, FR-ACT-06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Complete the four activity types: **match** (pair objects with their partners — a tap-tap game, not a drag) and **puzzle** (place picture pieces into their slots — a drag game reusing M16's gesture machinery). Both are registry entries against the M16 renderer contract, so neither touches the engine.

## Context & Current State

- `MatchActivitySchema` and `PuzzleActivitySchema` (`packages/types/src/activity/schemas.ts`), both `schemaVersion: 1` with `instructionAudio`, and both refined so a valid payload is always completable — the same guarantee `DragDropActivitySchema` carries ("every draggable must have somewhere correct to go, or the child can never finish"). Read the two schemas and their `superRefine` blocks before writing either renderer; the invariants they guarantee are invariants the renderer may rely on and must not re-check.
- `PuzzleSlot` and the puzzle piece types are exported from `packages/types`, as are `MatchActivity` / `PuzzleActivity`.
- M16 gives: the renderer contract (`{ definition, onFinished, onWrongAttempt }`), the registry, `use-drop-targets.ts` (measured layout + worklet hit-testing), `lib/activity-evaluate.ts` (pure grading), `FeedbackLayer`, and the engine that owns instruction audio and celebration.
- `apps/web/components/activities/MatchActivity.tsx`, `PuzzleActivity.tsx`, `use-pairing.ts`, `use-puzzle-state.ts`, `pair-colours.ts` and `use-wiggle.ts` are the references. `use-pairing.ts` and `use-puzzle-state.ts` are close to platform-free state machines — port their logic rather than re-deriving it.
- design.md §2.3: never encode meaning in colour alone. `pair-colours.ts` on the web assigns a colour per matched pair; on mobile the same information must also carry a shape or icon, because a colour-blind child matching by colour is being tested on something else.
- design.md §7: ≥64px targets. A 4×4 puzzle on a 360px phone leaves ~80px per piece — workable, but it means the maximum grid size the schema allows must be checked against the smallest supported screen during the device pass.

## Detailed Requirements

### Match activity

1. **Renderer** `components/activities/MatchActivity.tsx`, registered under `match`. **Tap-to-select, tap-to-pair** — deliberately not a drag. Two taps are easier than a drag for a 3-year-old, it is naturally accessible, and it matches the web app's interaction.
2. **Selection state.** First tap selects (visible lift/outline plus an icon marker); second tap on a partner either pairs (correct sound, both lock, a shared pair marker) or rejects (try-again sound, wiggle both, clear the selection). A second tap on the *same* item deselects. Port the state machine from `apps/web/components/activities/use-pairing.ts`.
3. **Pair marking without colour alone.** Each matched pair gets a colour **and** a distinct shape/icon badge, both drawn from a fixed ordered list so the same pair index always looks the same. Port `pair-colours.ts` and extend it with the shape dimension.
4. **Completion** when every pair is matched → `onFinished()`.
5. **Layout.** Two columns on a phone in portrait (items left, partners right) with generous row spacing; a single flowing grid in landscape if the schema's item count allows. No scroll inside the play area if it can be avoided; if it cannot, a vertical scroll is acceptable here because there is no pan gesture competing with it.

### Puzzle activity

6. **Renderer** `components/activities/PuzzleActivity.tsx`, registered under `puzzle`. Drag pieces into slots, reusing M16's `use-drop-targets` and gesture pattern — this is the payoff for having built that machinery generically.
7. **Piece tray and board.** Pieces start in a tray (a wrapped row, not a scroll), the board shows the slot outlines with a faint image ghost. A piece dropped on its correct slot snaps, locks and plays the correct sound; a wrong drop springs back with try-again. Port the state machine from `apps/web/components/activities/use-puzzle-state.ts`.
8. **Snapping tolerance.** A drop counts if the piece's centre is within the slot's bounds **or** within a small margin around them — a finger-sized allowance, expressed in dp like M17's tolerance. Pieces should feel magnetic, not fussy.
9. **Completion** when every slot is filled correctly → reveal the completed picture briefly, then `onFinished()`.
10. **Image handling.** Pieces are images (Cloudinary URLs) rendered with `expo-image`; prefetch all of them before the activity becomes interactive so a piece cannot appear blank mid-drag. Show the engine's loading state until they are ready.

### Shared

11. **Reduced motion.** Wiggles become an outline flash; snaps become instant. The feedback stays, the movement goes.
12. **Accessibility.** Match is already tap-based and works with a screen reader given proper labels (`"apple, unmatched"` / `"apple, matched with red"`). Puzzle reuses M16's screen-reader fallback: tap a piece, tap a slot, same grading — so build it by reusing the same code path, not a second implementation.
13. **Both orientations, smallest screen.** The maximum item/slot counts the schemas allow must fit a 360px-wide phone with ≥64px targets in portrait. If the largest allowed puzzle cannot, reduce piece size to the floor and document the limit — do not ship an activity a child cannot tap.
14. **Tests** (`MatchActivity.test.tsx`, `PuzzleActivity.test.tsx`, plus pure state-machine tests): match — first tap selects, same-item tap deselects, correct pair locks both, wrong pair wiggles and clears, all pairs matched calls `onFinished`, pair badges differ by shape as well as colour; puzzle — correct drop snaps and locks, wrong drop returns the piece, all slots filled calls `onFinished`, images prefetch before interaction, the screen-reader tap-tap path grades identically.

## Technical Approach & Suggestions

```
apps/mobile/components/activities/MatchActivity.tsx
apps/mobile/components/activities/MatchActivity.test.tsx
apps/mobile/components/activities/PuzzleActivity.tsx
apps/mobile/components/activities/PuzzleActivity.test.tsx
apps/mobile/components/activities/use-pairing.ts          # ported state machine
apps/mobile/components/activities/use-pairing.test.ts
apps/mobile/components/activities/use-puzzle-state.ts     # ported state machine
apps/mobile/components/activities/use-puzzle-state.test.ts
apps/mobile/components/activities/pair-markers.ts         # colour + shape per pair index
apps/mobile/components/activities/use-wiggle.ts           # Reanimated wiggle, reduced-motion aware
apps/mobile/components/activities/registry.tsx            # + match, puzzle
```

Pair markers carry two channels, not one:

```ts
// apps/mobile/components/activities/pair-markers.ts
/**
 * A matched pair is identified by colour *and* shape. Colour alone fails
 * design.md §2.3 and, in a matching game, would test colour vision rather than
 * the concept being taught.
 */
const MARKERS = [
  { colour: "#36B3F5", shape: "circle" },
  { colour: "#FFC93C", shape: "star" },
  { colour: "#34D399", shape: "square" },
  { colour: "#8B5CF6", shape: "triangle" },
  { colour: "#FF6B6B", shape: "heart" },
  { colour: "#2B2A4A", shape: "diamond" },
] as const;

export function markerForPair(index: number) {
  return MARKERS[index % MARKERS.length];
}
```

The pairing machine, kept pure so its tests need no renderer:

```ts
export type PairingState = {
  selectedId: string | null;
  matched: Record<string, number>;   // itemId -> pair index
  attempts: number;
};

export function tapItem(state: PairingState, id: string, isPartner: (a: string, b: string) => boolean): PairingState {
  if (state.matched[id] !== undefined) return state;            // already done
  if (state.selectedId === null) return { ...state, selectedId: id };
  if (state.selectedId === id) return { ...state, selectedId: null };  // deselect

  if (isPartner(state.selectedId, id)) {
    const pairIndex = Object.keys(state.matched).length / 2;
    return {
      selectedId: null,
      matched: { ...state.matched, [state.selectedId]: pairIndex, [id]: pairIndex },
      attempts: state.attempts + 1,
    };
  }
  return { ...state, selectedId: null, attempts: state.attempts + 1 };
}
```

`isPartner` comes from `lib/activity-evaluate.ts` reading the definition's own mapping — the renderer never encodes which items match.

For the puzzle, the magnetic drop:

```ts
const SNAP_MARGIN_DP = 24;

function slotFor(centre: { x: number; y: number }): string | undefined {
  "worklet";
  const margin = SNAP_MARGIN_DP;
  for (const [id, r] of Object.entries(layouts.value)) {
    if (centre.x >= r.x - margin && centre.x <= r.x + r.width + margin &&
        centre.y >= r.y - margin && centre.y <= r.y + r.height + margin) return id;
  }
  return undefined;
}
```

Prefetch before interaction, so a blank piece is impossible:

```tsx
const [imagesReady, setImagesReady] = useState(false);
useEffect(() => {
  void Image.prefetch(definition.pieces.map((p) => p.imageUrl)).then(() => setImagesReady(true));
}, [definition]);
if (!imagesReady) return <ActivityLoading />;
```

## Step-by-Step Plan

1. Read both schemas and both web renderers; note the invariants the `superRefine` blocks guarantee. (~20 min)
2. Port `use-pairing.ts` with its tests (select, deselect, correct, wrong, completion). (~35 min)
3. Build `pair-markers.ts` (colour + shape) and `use-wiggle.ts` (reduced-motion aware). (~25 min)
4. Build `MatchActivity` with two-column portrait layout, selection visuals, pair badges and a11y labels; test the interaction branches. (~45 min)
5. Port `use-puzzle-state.ts` with its tests. (~30 min)
6. Build `PuzzleActivity` on M16's `use-drop-targets`: tray, board, magnetic drop, snap-lock, spring-back, completed reveal. (~50 min)
7. Add image prefetch gating and the screen-reader tap-tap path (reusing M16's code path, not a copy). (~25 min)
8. Register both types; walk a seeded lesson containing each on a **physical low-end Android phone**, in both orientations, checking target sizes at the schemas' maximum counts. (~35 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] Both activities are registry entries only — `ActivityEngine` is unchanged by this file.
- [ ] Match is tap-to-select / tap-to-pair, with same-item deselect, wiggle-and-clear on a wrong pair, and lock on a correct one.
- [ ] Matched pairs are distinguished by colour **and** shape; the game is completable by a colour-blind child.
- [ ] Puzzle pieces drag with M16's gesture machinery, snap magnetically within a finger-sized margin, lock when correct and spring back when not.
- [ ] Puzzle images are prefetched before the activity becomes interactive; no piece ever renders blank.
- [ ] Completing either activity calls `onFinished` once and hands the celebration to the engine.
- [ ] Which items pair, and which piece belongs in which slot, comes from the definition via `lib/activity-evaluate.ts` — never encoded in a renderer.
- [ ] The maximum item and slot counts the schemas allow fit a 360px-wide phone with ≥64px targets in portrait, in both activities.
- [ ] Reduced motion removes wiggles and snap animations while keeping all feedback.
- [ ] With a screen reader active, both activities are completable and announce match/placement state.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The quiz's match-pair and drag-answer formats — M20. Similar interactions, different schemas and graders; sharing the renderers would couple two contracts that are versioned separately.
- New activity types beyond the four in `ActivityDefinitionSchema`.
- Puzzle piece rotation, jigsaw-shaped edges, or difficulty scaling. Not in the schema.
- Authoring puzzle images or slot geometry — the CMS (web file 33).
- Haptics on snap. Same reasoning as M16 and M17.
