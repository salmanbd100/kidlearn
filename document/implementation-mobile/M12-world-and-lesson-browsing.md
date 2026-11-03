# M12 — World & Lesson Browsing

> **Estimated effort:** 2–3 hours
> **Depends on:** M11
> **Requirement IDs:** FR-CURR-01, FR-CURR-02, FR-WORLD-04, FR-WORLD-05, FR-PROF-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Let a child walk into a world and pick a lesson: the world screen showing its topics and their lessons as tiles, and the tap that starts a lesson.

## Context & Current State

- The read API is complete and already filters for the child. All of these sit behind `requireParent` + `requireActiveChild` (mounted in `apps/server/src/modules/index.ts`) and none is consent-gated; without an active child they answer `403 FORBIDDEN` "No active child profile":
  - `GET /api/content/worlds` — the list (M11 consumes it).
  - `GET /api/content/worlds/:id/lessons` — `WorldLessonsResponseSchema`: `{ topics: WorldTopicLessonsSchema[] }`, each topic (`id`, `slug`, `name`, …) carrying its `lessons: LessonListItem[]`. This is the world screen's single call.
  - `GET /api/content/subjects`, `…/subjects/:id/topics` and `…/topics/:id/lessons` exist for the subject-first path, but **web has no screen on them** — they are not used here.
  - `GET /api/content/lessons/:id` — `LessonDetailResponseSchema`: `{ lesson: LessonDetail }`.
  - `GET /api/content/stories` and `/stories/:id` — M22.
- Filtering is the server's job: `content.service` returns only `status = "published"` rows, with names and titles already resolved to the child's `preferredLanguage`. The client must not re-filter, and must not assume a lesson is missing because of a bug — an empty topic is a legitimate content state.
- `LessonListItem.progress` is a reserved `null` and so are `thumbnailUrl`, `durationEstimateSec` and `nameAudioUrl`: **the list carries no completion state**, and web's `LessonTile` shows plain picture tiles (a `Sparkles` stand-in icon plus the title) with no completed/locked state. Per-lesson progress is `GET /api/progress/lessons/:id` and is the player's resume point (M13), not a list concern. Do not fire one progress call per lesson.
- `packages/types` gives `WorldTopicLessonsResponse`, `LessonListItemResponse` (`id`, `slug`, `title`, `worldId`, `sortOrder` + the reserved nulls), `TopicSummaryResponse`, and `LessonDetailResponse`.
- Web counterparts: `apps/web/app/(student)/world/[worldId]/WorldScreen.tsx`, and `apps/web/features/content/{content-api,LessonTile}.tsx` (the web player fetches the lesson itself; mobile fetches on tap and hands the payload on).
- M11 gives `lib/content-api.ts`, `lib/world-theme.ts` (over the shared `worldGradientColours`) and the waypoint visual language. M04 gives `useApi` and the network states. M10 gives the `ParentCorner` lock on this screen.
- design.md §6: no horizontal scroll except intentional carousels; both orientations; thumb-zone placement. §7: ≥64px targets, ≥20px text.

## Detailed Requirements

1. **Extend `lib/content-api.ts`** with `getWorldLessons(worldId)` and `getLesson(id)`. `getLesson`'s `ApiResult` failure must preserve `code` (M04 already does) for the caller to branch on. `getLesson` opts into M04's `parseWith` with the `{ lesson: LessonDetailSchema }` payload — the lesson carries versioned activity/quiz JSONB, the boundary M04 parses at.
2. **World screen** (`app/(student)/world/[worldId].tsx`) — one `getWorldLessons` call. Renders the world's colours from `palette` (M11's `worldGradientColours`), then each topic as a labelled section with its lessons as large `IconTile`s in a vertical flow. A tile carries a stand-in icon (the API has no thumbnail yet) and the title; the title is always visible.
3. **No invented state.** The list carries no completion or lock data, so tiles have neither. Sequential gating and completion markers are product/server decisions; if wanted, add the requirement to `document/project-requirement-details.md` and a list-level field to the API first.
4. **Starting a lesson.** Tapping a tile calls `getLesson(id)`:
   - `ok` → stash the detail in `lib/lesson-cache.ts` and navigate to `/(student)/lesson/[id]` (M13), so the player does not re-request it.
   - `404 NOT_FOUND` → refresh the world data; the content was unpublished while the child looked at it.
   - `403 FORBIDDEN` → nothing local; M04's `onForbidden` re-reads the session and the guard returns the child to the picker.
   - `429 RATE_LIMITED` → no retry; the M04 listener's toast, and the tile stays tappable.
   - network/cold start → `KidRetry` / `ColdStartNotice`.
5. **Scroll and layout.** Vertical scroll only (design.md §6); landscape lays tiles in a wrapped row rather than shrinking them below target size.
6. **Empty content.** A world with no published lessons → a warm `EmptyState` ("More adventures soon!") — the normal state of a fresh database.
7. **Prefetch politely.** Do **not** prefetch `getLesson` — its payload carries the lesson's activity and quiz JSONB, and the child opens one lesson of many.
8. **Narration keys** for topic labels, ready for M14.
9. **Tests** (`app/(student)/world/[worldId].test.tsx`, `lib/content-api.test.ts`): renders one tile per lesson grouped under its topic; tapping a tile with a 200 stashes the detail and navigates; a 404 refetches the world; an empty world renders the empty state.

## Technical Approach & Suggestions

```
apps/mobile/lib/content-api.ts                      # extended
apps/mobile/lib/content-api.test.ts
apps/mobile/lib/lesson-cache.ts                    # one-entry handoff to the player (M13)
apps/mobile/app/(student)/world/[worldId].tsx
apps/mobile/app/(student)/world/[worldId].test.tsx
apps/mobile/components/student/LessonTile.tsx
apps/mobile/components/student/TopicSection.tsx
```

Branch on the error code, never the message:

```tsx
async function openLesson(lessonId: string) {
  const result = await getLesson(lessonId);

  if (result.ok) {
    stashLesson(lessonId, result.data.lesson);
    router.push({ pathname: "/(student)/lesson/[id]", params: { id: lessonId } });
    return;
  }

  if (result.error.code === "NOT_FOUND") {
    void refetch();
    return;
  }
  setRetry(result.error);
}
```

Pass the fetched detail forward so the player does not double-fetch. `expo-router` params are strings, so hold the payload in a small module-level cache keyed by lesson id rather than serialising it into the URL:

```ts
// apps/mobile/lib/lesson-cache.ts — a handoff, not a cache layer.
// One entry, cleared when the player mounts. Do not grow this into a data store.
let pending: { id: string; detail: LessonDetailResponse } | undefined;
export function stashLesson(id: string, detail: LessonDetailResponse) { pending = { id, detail }; }
export function takeLesson(id: string): LessonDetailResponse | undefined {
  if (pending?.id !== id) return undefined;
  const { detail } = pending;
  pending = undefined;
  return detail;
}
```

Use `SectionList` (or a `FlatList` per topic) rather than `.map()`: it is the RN idiom for a list that can grow.

## Step-by-Step Plan

1. Extend `lib/content-api.ts` with the two calls and their tests (mocked `apiFetch`), checking that `getLesson`'s failure retains `status` and `code`. (~25 min)
2. Build `LessonTile` and `TopicSection`, with tests for target size and press. (~35 min)
3. Build the world screen with a single `getWorldLessons` call, the world palette background, and all four network states. (~40 min)
4. Add `openLesson` with the 200 / 404 / network branches and the `lesson-cache` handoff; test each branch. (~35 min)
5. Device pass with seeded content: portrait and landscape, a world with one lesson and a world with none. (~30 min)
6. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; open the PR and confirm `gates` with `gh pr checks`; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The world screen renders topics and lessons from **one** `GET /api/content/worlds/:id/lessons` call — no per-lesson progress requests.
- [ ] The client applies no publish, grade or language filtering of its own; whatever the server returns is what renders.
- [ ] Tapping a lesson navigates to the player and hands over the already-fetched detail without a second request.
- [ ] A `404` refetches the world rather than showing an error.
- [ ] The screen scrolls vertically only; every tile is ≥64px with text ≥20px.
- [ ] A world with no lessons renders a warm, intentional empty state in EN and BN.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass, and `gates` is green.

## Out of Scope

- The lesson player itself — M13.
- Story browsing — M22.
- Completion markers, locked lessons or a progress path. The API supplies no such data (see Context); inventing it client-side would diverge from web.
- A subject → topic → lesson route. The API supports it; web has no screen for it.
- Search or filtering. Not in the spec, and reading is not a skill this audience has.
- Offline content caching — out of scope for the whole plan (`document/mobile-app-plan.md` §3.2).
