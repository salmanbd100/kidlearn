# M18 — Match & Puzzle Activities

> **Estimated effort:** 3–4 hours
> **Depends on:** M16
> **Requirement IDs:** FR-ACT-03, FR-ACT-04, FR-ACT-05, FR-ACT-06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Complete the four activity types: **match** (pair objects with their partners — a tap-tap game, not a drag) and **puzzle** (place cropped pieces of one picture into their slots — a drag game reusing M16's gesture machinery, with M16's tap-to-place alongside). Both are registry entries against the M16 renderer contract, so neither touches the engine.

## Context & Current State

- `packages/types/src/activity/schemas.ts`, both `schemaVersion: 1` with `instructionAudio`, both refined so a valid payload is always completable. Read the `superRefine` blocks before writing either renderer; the invariants they guarantee are invariants the renderer may rely on and must not re-check.
  - `MatchActivitySchema`: `leftSet` (2–6 `ActivityItem`s), `rightSet` (2–6), `pairs` (`{ leftId, rightId }`), with no duplicate ids and every pairing valid.
  - `PuzzleActivitySchema`: **one** `image` (`ImageAssetRef` — `{ kind: "image", url, alt? }`), `grid: { rows, cols }` (each 2–4), `slots` (`{ index, row, col }`, exactly `rows × cols`, unique cells and indexes), and optional `prePlaced` (slot indexes that start filled; never all of them). Pieces are crops of `image` by grid cell — there are no per-piece image URLs.
- `PuzzleSlot`, `MatchActivity` and `PuzzleActivity` are exported from `packages/types`.
- M16 gives: the renderer contract (`{ definition, locale, feedback: { success, retry }, onActivityComplete }`), the registry, `use-drop-targets.ts` (measured layout + worklet hit-testing), the lifted grader in `@kidlearn/types` (`evaluatePair`, `puzzlePieceId`, `puzzleSlotId`, `evaluatePiecePlacement`, `isPuzzleComplete`), the ported `use-tap-to-place` and `use-wiggle`, `FeedbackLayer`, and the engine that owns instruction audio and celebration.
- Web references: `apps/web/features/activities/MatchActivity.tsx`, `PuzzleActivity.tsx` and `use-puzzle-state.ts`; the shared hooks `apps/web/shared/hooks/use-pairing.ts` and `use-wiggle.ts`; `apps/web/shared/components/kid/pair-colours.ts` and `StatusMark.tsx`. `use-pairing.ts` and `use-puzzle-state.ts` are small state hooks — port their logic rather than re-deriving it.
- Web's match draws a **connecting line** between a matched pair and a `StatusMark` tick on both cards; the pair colour (`pair-1..6` in `apps/web/app/globals.css` → brand `grape`, `mint`, `coral`, `sky`, `blossom`, `sunshine`) is decoration. design.md §2.3: never encode meaning in colour alone — the line and tick say "matched". Mobile adds a shape per pair index so pairs stay distinguishable from each other without colour too.
- Web's puzzle uses dnd-kit with `use-activity-sensors` **and** `use-tap-to-place`; a wrong placement wiggles the piece and calls `retry`; completion plays a shine (`SHINE_MS = 400`, skippable) before `onActivityComplete`.
- design.md §7: ≥64px targets. A 4×4 puzzle on a 360px phone leaves ~80px per piece — workable, but the maximum grid must be checked against the smallest supported screen during the device pass.

## Detailed Requirements

### Match activity

1. **Renderer** `components/activities/MatchActivity.tsx`, registered under `match`. **Tap-to-select, tap-to-pair** — deliberately not a drag, as on web. Two taps are easier than a drag for a 3-year-old and are naturally accessible.
2. **Selection state.** Port `use-pairing.ts`: selection is `{ side, id }`; tapping the selected card again deselects it; a tap on another card on the same side moves the selection; a tap on the other side either pairs (`feedback.success`, both lock, a pair index in insertion order) or rejects (`feedback.retry`, wiggle both, clear the selection). Tapping a locked card does nothing.
3. **Pair marking without colour alone.** Each matched pair gets the connecting line and tick (as web) plus a colour **and** a distinct shape badge, both indexed by pair order from a fixed list so the same pair index always looks the same. Colours come from `@kidlearn/tokens`' `brand` palette in web's order, never raw hex.
4. **Completion** when every pair is matched → `onActivityComplete()`.
5. **Layout.** Two columns upright, two rows sideways (web's rule: the pair line runs across the short axis). No scroll inside the play area if it can be avoided; if it cannot, a vertical scroll is acceptable here because there is no pan gesture competing with it.

### Puzzle activity

6. **Renderer** `components/activities/PuzzleActivity.tsx`, registered under `puzzle`. Drag pieces into slots on M16's `use-drop-targets` and gesture pattern, with tap-to-place alongside.
7. **Piece tray and board.** The board is a `rows × cols` grid showing slot outlines over a faint full image; `prePlaced` slots start filled and locked. Each piece is a crop of `image.url` for its cell (an `expo-image` inside an overflow-hidden cell, offset by `col`/`row` — the native equivalent of web's `cropStyle` background position). Pieces start in a tray (a wrapped row, not a scroll). A correct drop snaps, locks and calls `success`; a wrong drop springs back, wiggles and calls `retry`. Port `use-puzzle-state.ts`.
8. **Snapping tolerance.** A drop counts if the piece's centre is within the slot's bounds **or** within a small dp margin around them. Pieces should feel magnetic, not fussy.
9. **Completion** when every slot is filled (`isPuzzleComplete`) → the shine (`SHINE_MS`, tappable-through, skipped under reduced motion), then `onActivityComplete()`.
10. **Image handling.** There is one image: prefetch `image.url` with `expo-image` before the board becomes interactive so no piece is ever blank mid-drag, and show the engine's loading state until it is ready. The board's accessibility label is `image.alt?.[locale]`, falling back to a generic "puzzle" string as web does.

### Shared

11. **Reduced motion.** Wiggles become the static "not quite" mark (`NOT_QUITE_MS`); snaps become instant. The feedback stays, the movement goes.
12. **Accessibility.** Match is tap-based and works with a screen reader given proper labels (`"apple, not matched"` / `"apple, matched with red"`). Puzzle uses the same tap-to-place code path as M16, not a second implementation.
13. **Both orientations, smallest screen.** Six pairs and a 4×4 puzzle must fit a 360px-wide phone with ≥64px targets in portrait. If the largest puzzle cannot, reduce piece size to the floor and document the limit — do not ship an activity a child cannot tap.
14. **Tests** (`MatchActivity.test.tsx`, `PuzzleActivity.test.tsx`, plus the ported hooks' tests): match — first tap selects, the same card deselects, a same-side tap moves the selection, correct pair locks both and calls `success`, wrong pair wiggles, calls `retry` and clears, all pairs matched calls `onActivityComplete`, pair badges differ by shape as well as colour; puzzle — `prePlaced` slots start locked, correct drop snaps and locks, wrong drop returns the piece, all slots filled plays the shine then calls `onActivityComplete`, the image prefetches before interaction, tap-to-place grades identically.

## Technical Approach & Suggestions

```
apps/mobile/components/activities/MatchActivity.tsx
apps/mobile/components/activities/MatchActivity.test.tsx
apps/mobile/components/activities/PuzzleActivity.tsx
apps/mobile/components/activities/PuzzleActivity.test.tsx
apps/mobile/lib/use-pairing.ts                            # port of apps/web/shared/hooks/use-pairing.ts
apps/mobile/lib/use-pairing.test.ts
apps/mobile/components/activities/use-puzzle-state.ts     # port of apps/web/features/activities/use-puzzle-state.ts
apps/mobile/components/activities/use-puzzle-state.test.ts
apps/mobile/components/kid/pair-markers.ts                # colour + shape per pair index
apps/mobile/components/activities/registry.tsx            # + match, puzzle
```

Pair markers carry two channels, and the colours are tokens, not hex:

```ts
// apps/mobile/components/kid/pair-markers.ts
import { brand } from "@kidlearn/tokens";

/**
 * Web's pair order (globals.css pair-1..6), plus a shape so pairs differ
 * without colour — the line and tick already say "matched" (design.md §2.3).
 */
const MARKERS = [
  { colour: brand.grape, shape: "circle" },
  { colour: brand.mint, shape: "star" },
  { colour: brand.coral, shape: "square" },
  { colour: brand.sky, shape: "triangle" },
  { colour: brand.blossom, shape: "heart" },
  { colour: brand.sunshine, shape: "diamond" },
] as const;

export function markerForPair(index: number) {
  return MARKERS[index % MARKERS.length];
}
```

`use-pairing`'s `isCorrectPair` is the lifted `evaluatePair(definition, leftId, rightId)` — the renderer never encodes which items match. Matched pairs live in an insertion-ordered `Map<leftId, rightId>`, so a card's pair index never shifts as later pairs match.

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

Prefetch the one image before interaction, so a blank piece is impossible:

```tsx
const [imageReady, setImageReady] = useState(false);
useEffect(() => {
  void Image.prefetch(definition.image.url).then(() => setImageReady(true));
}, [definition.image.url]);
if (!imageReady) return <ActivityLoading />;
```

## Step-by-Step Plan

1. Read both schemas and both web renderers; note the invariants the `superRefine` blocks guarantee. (~20 min)
2. Port `use-pairing.ts` with its tests (select, move selection, correct, wrong, completion). (~35 min)
3. Build `pair-markers.ts` (token colour + shape). (~15 min)
4. Build `MatchActivity` with the two-column layout, connecting lines, ticks, pair badges and a11y labels; test the interaction branches. (~45 min)
5. Port `use-puzzle-state.ts` with its tests, including `prePlaced`. (~30 min)
6. Build `PuzzleActivity` on M16's `use-drop-targets`: cropped pieces, tray, board, magnetic drop, snap-lock, spring-back, shine. (~50 min)
7. Add image prefetch gating and tap-to-place (M16's code path, not a copy). (~25 min)
8. Register both types; walk a seeded lesson containing each on a **physical low-end Android phone**, in both orientations, checking target sizes at the schemas' maximum counts. (~35 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] Both activities are registry entries only — `ActivityEngine` is unchanged by this file.
- [ ] Match is tap-to-select / tap-to-pair, with wiggle-and-clear on a wrong pair and lock on a correct one.
- [ ] Matched pairs are marked by a line and tick, and distinguished from each other by colour **and** shape; the game is completable by a colour-blind child. Colours come from tokens.
- [ ] Puzzle pieces are crops of the one `image`, drag with M16's gesture machinery (and place by tap), snap magnetically within a finger-sized margin, lock when correct and spring back when not; `prePlaced` slots start locked.
- [ ] The puzzle image is prefetched before the activity becomes interactive; no piece ever renders blank.
- [ ] Completing either activity calls `onActivityComplete` once and hands the celebration to the engine.
- [ ] Which items pair, and which piece belongs in which slot, comes from the lifted grader — never encoded in a renderer.
- [ ] Six pairs and a 4×4 puzzle fit a 360px-wide phone with ≥64px targets in portrait.
- [ ] Reduced motion removes wiggles, snaps and the shine while keeping all feedback.
- [ ] With a screen reader active, both activities are completable and announce match/placement state.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The quiz's match-pair and drag-answer formats — M20. Similar interactions, different schemas and graders; sharing the renderers would couple two contracts that are versioned separately.
- New activity types beyond the four in `ActivityDefinitionSchema`.
- Puzzle piece rotation, jigsaw-shaped edges, or difficulty scaling beyond `prePlaced`. Not in the schema.
- Authoring puzzle images or grids — the admin CMS (`apps/web/features/admin/`), web-only.
- Haptics on snap. Same reasoning as M16 and M17.
