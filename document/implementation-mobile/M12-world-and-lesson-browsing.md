# M12 — World & Lesson Browsing

> **Estimated effort:** 3–4 hours
> **Depends on:** M11
> **Requirement IDs:** FR-CURR-01, FR-CURR-02, FR-WORLD-04, FR-WORLD-05, FR-PROF-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Let a child walk into a world and pick a lesson: the world screen showing its topics and lessons as a progress path, per-lesson completion state, and the tap that starts a lesson — including the 423 lock the server may answer with. Also the subject-based browse route the parent-facing dashboard's language reuses.

## Context & Current State

- The read API is complete and already filters for the child. All of these sit behind `requireParent` + `requireActiveChild`:
  - `GET /api/content/worlds` — the list (M11 consumes it).
  - `GET /api/content/worlds/:id/lessons` — `WorldTopicLessonsResponse`: the world plus its topics, each with its lessons. This is the world screen's single call.
  - `GET /api/content/subjects` and `GET /api/content/subjects/:id/topics` and `GET /api/content/topics/:id/lessons` — the subject-first path.
  - `GET /api/content/lessons/:id` — the lesson detail, **screen-time gated** (`enforceScreenTime("lesson")`).
- Filtering is the server's job: `contentService` returns only `status = "published"` rows matching the child's `gradeLevel` and language. The client must not re-filter, and must not assume a lesson is missing because of a bug — an empty topic is a legitimate content state.
- **`GET /api/content/lessons/:id` can answer `423 Locked`** when a screen-time limit or window blocks *starting* content. The middleware's own comment explains the choice of 423 over 403: "the client branches on the code for two different mascot screens". This file must handle it — M25 makes the lock screen beautiful, but the code path exists from here.
- `GET /api/progress/lessons/:id` returns `LessonProgressResponse` (per-lesson step and completion). Completion state for a list of lessons comes from the lesson list payload where present; do not fire one progress call per lesson.
- `packages/types` gives `WorldTopicLessonsResponse`, `LessonListItemResponse`, `TopicSummaryResponse`, `SubjectSummaryResponse`, `LessonDetailResponse`.
- M11 gives `lib/content-api.ts`, `lib/world-theme.ts`, `lib/localized-label.ts` and the waypoint visual language. M04 gives `useApi` and the network states.
- design.md §6: no horizontal scroll except intentional carousels; both orientations; thumb-zone placement. §7: ≥64px targets, ≥20px text.

## Detailed Requirements

1. **Extend `lib/content-api.ts`** with `getWorldLessons(worldId)`, `listSubjects()`, `listTopics(subjectId)`, `listTopicLessons(topicId)` and `getLesson(id)`. `getLesson` is the one that can 423, so its `ApiResult` failure must preserve `status` (M04 already does) for the caller to branch on.
2. **World screen** (`app/(student)/world/[worldId].tsx`) — one `getWorldLessons` call. Renders the world's colours from `palette` (M11's `worldGradient`), then each topic as a labelled section with its lessons as a **path of nodes** rather than a plain list: a vertical sequence of large circular tiles with a connecting line, the classic "learning map". Nodes carry: lesson icon/cover, localised title, and a state — `completed` (check + star count earned), `available`, or `locked`.
3. **Lesson state, from data.** `completed` comes from the lesson list item's completion field; `locked` covers a lesson the server marked unavailable. If the payload carries no ordering-based locking, do **not** invent it client-side — sequential gating is a content decision, and inventing it here would diverge from the web app.
4. **Starting a lesson.** Tapping an available node calls `getLesson(id)`:
   - `ok` → navigate to `/(student)/lesson/[id]` (M13) passing the already-fetched detail so the player does not re-request it.
   - `423` → render the screen-time lock (a placeholder mascot screen in this file; M25 replaces it with the full version reading `windowStart` and the block reason).
   - `404` → refresh the world data; the content was unpublished while the child looked at it.
   - network/cold start → `KidRetry` / `ColdStartNotice`.
5. **Subject browse route** (`app/(student)/subjects/index.tsx` and `app/(student)/subjects/[id].tsx`) — the flatter path: subjects grid → topics → lessons, reusing the same node components. Keep it, because FR-CURR-01/02 describe the curriculum as subject→topic→lesson and the world map is a themed view over the same data; a child who cannot find a world's entrance still has a route.
6. **Scroll and layout.** The path scrolls **vertically** (never horizontally — design.md §6), auto-scrolling on mount to the first incomplete node so a returning child sees where they are. Landscape moves the topic label to the side rather than shrinking nodes.
7. **Empty and thin content.** A world with no published lessons for the child's grade → a warm `EmptyState` ("More adventures soon!"). This is the realistic MVP state until the content pipeline lands, so it must look intentional rather than broken.
8. **Prefetch politely.** Prefetch the next incomplete lesson's cover image; do **not** prefetch `getLesson`, which is gated and would burn a 423 and possibly a screen-time evaluation.
9. **Narration keys** for topic labels and the node states, ready for M14.
10. **Tests** (`app/(student)/world/[worldId].test.tsx`, `lib/content-api.test.ts`): renders one node per lesson grouped under its topic; a completed lesson shows its check and star count; a locked node is not pressable; tapping an available node with a 200 navigates to the lesson route; a 423 renders the lock screen and does **not** navigate; a 404 refetches the world; an empty world renders the empty state; auto-scroll targets the first incomplete node.

## Technical Approach & Suggestions

```
apps/mobile/lib/content-api.ts                      # extended
apps/mobile/lib/content-api.test.ts
apps/mobile/app/(student)/world/[worldId].tsx
apps/mobile/app/(student)/world/[worldId].test.tsx
apps/mobile/app/(student)/subjects/index.tsx
apps/mobile/app/(student)/subjects/[id].tsx
apps/mobile/components/student/LessonNode.tsx
apps/mobile/components/student/LessonPath.tsx        # nodes + connecting line + auto-scroll
apps/mobile/components/student/TopicSection.tsx
apps/mobile/components/student/ScreenTimeLockPlaceholder.tsx
```

Branch on the status code, not the message — the two mascot screens the middleware's comment refers to:

```tsx
async function openLesson(lessonId: string) {
  const result = await getLesson(lessonId);

  if (result.ok) {
    router.push({ pathname: "/(student)/lesson/[id]", params: { id: lessonId } });
    return;
  }

  // 423 is the screen-time gate; 403 would be the PIN gate, which cannot happen
  // on a student surface. Never branch on error.message.
  if (result.error.status === 423) {
    setLock(result.error);
    return;
  }
  if (result.error.status === 404) {
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

The path's connecting line is simpler than it looks — absolutely positioned `View`s between node centres, or a single `react-native-svg` `Path` if the design calls for a curve. Start with straight segments; a curved path is a polish item for M28, not a blocker.

Auto-scroll on mount, once, and only when the child is not already at the top:

```tsx
const firstIncomplete = lessons.findIndex((l) => !l.completedAt);
useEffect(() => {
  if (firstIncomplete > 1) listRef.current?.scrollToIndex({ index: firstIncomplete, viewPosition: 0.4, animated: !reducedMotion });
}, [firstIncomplete, reducedMotion]);
```

Use `FlatList` for the node path (design.md aside: it is the RN idiom, and a world with 40 lessons on a low-end Android is exactly where `.map()` starts dropping frames).

## Step-by-Step Plan

1. Extend `lib/content-api.ts` with the five calls and their tests (mocked `apiFetch`), checking that `getLesson`'s failure retains `status`. (~30 min)
2. Build `LessonNode` with its three states and tests (completed check + stars, locked not pressable, ≥64px). (~35 min)
3. Build `LessonPath` (nodes + connectors + auto-scroll) and `TopicSection`. (~40 min)
4. Build the world screen with a single `getWorldLessons` call, the world palette background, and all four network states. (~35 min)
5. Add `openLesson` with the 200 / 423 / 404 / network branches, the `ScreenTimeLockPlaceholder`, and the `lesson-cache` handoff; test each branch. (~35 min)
6. Build the subject browse route reusing the node components. (~30 min)
7. Device pass with seeded content: portrait and landscape, a world with one lesson and a world with none, and a deliberately blocked child (set a zero daily limit in the parent area) to see the 423 path fire. (~30 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The world screen renders topics and lessons from **one** `GET /api/content/worlds/:id/lessons` call — no per-lesson progress requests.
- [ ] The client applies no publish, grade or language filtering of its own; whatever the server returns is what renders.
- [ ] Tapping an available lesson navigates to the player and hands over the already-fetched detail without a second request.
- [ ] A `423` from `GET /api/content/lessons/:id` renders a lock screen and does not navigate — verified on device by setting a zero daily limit for the child.
- [ ] A `404` refetches the world rather than showing an error.
- [ ] Completed lessons show a check and the stars earned; locked lessons cannot be pressed and are marked non-colour-only.
- [ ] The path scrolls vertically only, and auto-scrolls to the first incomplete lesson (respecting reduced motion).
- [ ] A world with no lessons for the child's grade renders a warm, intentional empty state in EN and BN.
- [ ] The subject → topic → lesson route reaches the same lessons as the world map.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The lesson player itself — M13.
- The full screen-time lock screen with reason and window copy — M25 (this file ships the branch and a placeholder).
- Story browsing — M22.
- Sequential lesson gating invented on the client. If the product wants "finish lesson 1 to unlock lesson 2", it is a spec change and a server field, not a mobile heuristic.
- Search or filtering. Not in the spec, and reading is not a skill this audience has.
- Offline content caching — out of scope for the whole plan (`document/mobile-app-plan.md` §3.2).
