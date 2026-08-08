# 26 — Story Reader (Page-by-Page, Narrated)

> **Estimated effort:** 3–4 hours
> **Depends on:** 23, 25
> **Requirement IDs:** FR-STORY-02, FR-STORY-03, FR-STORY-06, FR-STORY-07
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the full-screen narrated story reader at `/stories/[id]`: one illustrated page at a time with auto-playing per-page narration, large text with a forward-compatible highlight design, big-arrow + swipe navigation with an auto-advance toggle, a per-page replay button, orientation-aware layout, and a finish screen that shows the story's moral (FR-STORY-03) and grants a small reward exactly once per story per child via `POST /api/progress/stories/:id/complete` — while replays stay unlimited and free (FR-STORY-06).

## Context & Current State

- File 25 is done: `GET /api/content/stories/:id` returns localized pages `{ pageNumber, illustrationUrl, text, narrationUrl }` plus the localized `moral`; the library screen links to `/stories/[id]`; completion is read from `RewardLedger` `sourceType="story"`.
- File 23 is done: `apps/server/src/services/rewards-service.ts` exposes a grant function that writes `RewardLedger` rows (stars/coins with `sourceType`/`sourceId`) and returns the granted amounts for the celebration UI; the celebration screen component exists for lessons.
- File 13 gives `useAudio()` (single channel, `play(url)` returns a promise, `stop()`, `isPlaying`) — extend it here with an `onEnded` callback option if file 17's video/narration work has not already added one.
- File 27 is not done yet: story `story_start` / `story_complete` SessionEvents are specified there; this file leaves a clearly-marked call site (a no-op `trackEvent` import already exists if file 16 stubbed it — otherwise add the stub).

## Detailed Requirements

1. **Full-screen reader** — `app/(student)/stories/[id]/page.tsx` renders edge-to-edge (`min-h-dvh`, no student chrome except a small mascot "home" escape button), one page at a time (FR-STORY-02). Loading skeleton while fetching; cold-start mascot loader via `apiFetch`'s `onColdStart`.
2. **Narration auto-play** — entering a page plays that page's `narrationUrl` through `useAudio()`; navigating away interrupts it. Replay button (speaker icon, ≥64px) restarts the current page's narration (FR-STORY-02).
3. **Text display + highlight-ready payload** — page text renders large (≥24px kid theme). The narration payload is designed to optionally carry timing metadata later: client type `{ url: string; timings?: { unit: "word" | "sentence"; spans: Array<{ start: number; end: number; tMs: number }> } }` (character offsets + start time). When `timings` exists, wrap spans and highlight the active one against `audio.currentTime`; when absent (all MVP content), render plain text — same component, no branching pages. The API already returns `narrationUrl` only; add the optional `narrationTimings` JSON column read-through in the detail endpoint (nullable, no migration needed if file 05 used a JSONB asset map — otherwise a single additive migration).
4. **Navigation** — big next/back arrow `BigButton`s (≥64px, bottom corners) and horizontal swipe (pointer events, 50px threshold). Back is hidden on page 1; next on the last page goes to the finish screen.
5. **Auto-advance toggle** — a small toggle (book icon, default **on**) advances to the next page ~1.5s after narration `ended`; manual navigation always wins and cancels the pending advance. With the toggle off, the child pages manually.
6. **Finish screen** — after the last page: celebration layout showing the story's `moral` line large with its narration audio auto-played (FR-STORY-03), the reward earned, and two `BigButton`s: "Read again" (resets to page 1, no new reward) and "More stories" (back to `/stories`).
7. **Completion endpoint** — `POST /api/progress/stories/:id/complete` (session with `activeChildProfileId` required): validates the story is published + grade-visible (reuse file 25's service guard), then grants **once per story per child**: if a `RewardLedger` row with (`childProfileId`, `sourceType: "story"`, `sourceId`) exists, return `{ data: { alreadyCompleted: true, granted: null } }` and grant nothing; otherwise call the rewards service to grant **1 star + 5 coins** (small reward, FR-STORY-07) inside a transaction and return `{ data: { alreadyCompleted: false, granted: { stars: 1, coins: 5 } } }`. Replays are free and unlimited (FR-STORY-06) — the endpoint stays callable, just never double-grants. Add a unique index on (`childProfileId`, `sourceType`, `sourceId`) if file 23 didn't, so concurrent calls can't race.
8. **Orientation handling** — landscape: illustration left, text + controls right (`grid-cols-2`); portrait: illustration top (~55% height), text below. Pure CSS via aspect/orientation media queries — no JS resize listeners.
9. **Reader state machine tests** — the reader logic is a pure reducer, unit-tested: page advance/retreat bounds, narration-complete fires auto-advance only when enabled, manual nav cancels pending auto-advance, reaching finish fires completion exactly once even across "Read again" cycles.

## Technical Approach & Suggestions

**Server** (`/Users/salmanrahman/Documents/kidlearn/apps/server/`): `src/routes/progress-stories.ts` (mounted at `/api/progress/stories`), `src/services/story-progress-service.ts`, `src/routes/progress-stories.test.ts`.

```ts
// story-progress-service.ts
export async function completeStory(childProfileId: string, storyId: string) {
  await assertStoryVisibleToChild(childProfileId, storyId); // throws ApiError.notFound — same guard as GET detail
  const existing = await prisma.rewardLedger.findFirst({
    where: { childProfileId, sourceType: "story", sourceId: storyId },
    select: { id: true },
  });
  if (existing) return { alreadyCompleted: true, granted: null };
  const granted = await grantReward({ childProfileId, sourceType: "story", sourceId: storyId, stars: 1, coins: 5 }); // file 23 service, transactional
  return { alreadyCompleted: false, granted };
}
```

**Web** (`/Users/salmanrahman/Documents/kidlearn/apps/web/`):

```
app/(student)/stories/[id]/page.tsx        # fetch + mount client reader
components/student/story-reader/reader.tsx          # "use client": wires reducer + audio + swipe
components/student/story-reader/reader-machine.ts   # pure reducer (tested)
components/student/story-reader/story-page-view.tsx # illustration + NarratedText, orientation grid
components/student/story-reader/narrated-text.tsx   # plain now; span-highlight when timings present
components/student/story-reader/finish-screen.tsx   # moral + reward + read-again / more-stories
components/student/story-reader/reader-machine.test.ts
```

Reducer contract (binding — keep it pure, all timers/audio live in `reader.tsx` effects):

```ts
type ReaderState = {
  pageIndex: number;
  pageCount: number;
  autoAdvance: boolean;
  phase: "reading" | "finished";
  completionRequested: boolean; // true once FINISH dispatched the first time — never resets on READ_AGAIN
};
type ReaderEvent =
  | { type: "NEXT" } | { type: "BACK" }
  | { type: "NARRATION_ENDED" }            // → NEXT if autoAdvance && not last page; → FINISH on last page only via NEXT
  | { type: "TOGGLE_AUTO_ADVANCE" }
  | { type: "FINISH" }                      // NEXT on last page dispatches this
  | { type: "READ_AGAIN" };                 // phase→reading, pageIndex→0, completionRequested stays true
export function readerReducer(s: ReaderState, e: ReaderEvent): ReaderState;
```

`reader.tsx` effects: on `pageIndex` change → `play(page.narrationUrl)`; the audio `ended` handler dispatches `NARRATION_ENDED` after a 1500ms timeout stored in a ref (cleared on any manual NEXT/BACK); on `phase === "finished" && !prevCompletionRequested` → `apiFetch("/api/progress/stories/${id}/complete", { method: "POST" })`, render `FinishScreen` with `granted` (or the "great reading!" no-reward variant when `alreadyCompleted`). Swipe: `onPointerDown/Up` deltaX ≥ 50px → NEXT/BACK. Orientation:

```css
/* portrait default: stacked */
@media (orientation: landscape) { .reader-grid { grid-template-columns: 1fr 1fr; } }
```

If `useAudio()` lacks an ended hook, extend it as `play(url, { onEnded })` in `components/audio-provider.tsx` (additive, keep file 13's signature working).

## Step-by-Step Plan

1. Write failing unit tests for `readerReducer`: NEXT/BACK clamping, NARRATION_ENDED auto-advance only when enabled, last-page NARRATION_ENDED does not auto-FINISH, FINISH sets `completionRequested` once, READ_AGAIN resets page but not `completionRequested`. (~25 min)
2. Implement `reader-machine.ts` until green. (~20 min)
3. Write failing Supertest specs for `POST /api/progress/stories/:id/complete`: first call grants 1 star + 5 coins (ledger rows + response), second call `alreadyCompleted: true` with no new ledger rows, draft/wrong-grade story → 404, no session → 401. (~25 min)
4. Implement `story-progress-service.ts` + route using the file 23 grant function; add the unique index migration if missing; make tests pass. (~25 min)
5. Extend `useAudio` with `onEnded` (RTL test: callback fires on the mock element's `ended` event) if not already present from file 17. (~15 min)
6. Build `NarratedText` (plain rendering + the timings-driven span path behind the optional prop, RTL test for both) and `StoryPageView` with the orientation grid. (~30 min)
7. Build `reader.tsx` + `finish-screen.tsx` + the `[id]` page: wire reducer, audio effects, swipe, replay button, auto-advance toggle, completion call, i18n keys (en + bn) for toggle/replay/finish strings. (~40 min)
8. Manual pass: read a seeded story end-to-end on 360px portrait and tablet landscape — narration chains, finish grants once, "Read again" replays free; run `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter web test` passes: full `readerReducer` suite (advance, bounds, auto-advance gating, single completion across READ_AGAIN) and NarratedText plain/timed rendering.
- [ ] `pnpm --filter server test` passes: completion grants 1 star + 5 coins exactly once; repeat call returns `alreadyCompleted: true` and writes nothing; 404 for non-visible stories; 401 unauthenticated.
- [ ] Reading a seeded story in the browser: each page's narration auto-plays, replay button replays, arrows + swipe navigate, auto-advance moves on ~1.5s after narration when toggled on.
- [ ] Finish screen shows the moral line and plays its narration; library afterwards shows the story's checkmark (file 25 flag).
- [ ] Rotating the device swaps stacked ⇄ side-by-side layout with no JS errors.
- [ ] "Read again" restarts at page 1 and the server receives no second grant (verify via ledger row count).
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- `story_start`/`story_complete` SessionEvents and heartbeats while reading — file 27 (it will add the `useHeartbeat()` mount + `trackEvent` calls into this reader).
- Screen-time gating of story starts — file 28 wraps the start path; this reader only needs to surface a 423 error state then.
- Real narration timing metadata production (AI pipeline, file 36) — this file only ships the render path.
- Badge milestones like "Reading Star: 10 stories" — file 24's milestone engine consumes the ledger rows written here.
- Dashboard/report surfacing of stories read — files 29–30.
