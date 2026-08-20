# M22 — Story Library

> **Estimated effort:** 3–4 hours
> **Depends on:** M12
> **Requirement IDs:** FR-STORY-01, FR-STORY-04, FR-STORY-05, FR-STORY-08
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Give the child a bookshelf: the story library screen listing published stories for their grade and language, world-themed covers, a read/unread marker, and the tap that opens a story — including the `423` lock the server may answer with, because starting a story is content-start and therefore screen-time gated.

## Context & Current State

- Stories are nested **inside** the content router (`contentRouter.use("/stories", storiesRouter)`) so they inherit `requireParent` + `requireActiveChild` rather than repeating the guards. The endpoints are:
  - `GET /api/content/stories` → `StoryListResponse` (`StorySummarySchema[]`): id, localised `title`, cover media, the world it belongs to, reading state.
  - `GET /api/content/stories/:id` → `StoryDetailResponse` (`StoryPageSchema[]`, narration and timings) — **screen-time gated**, same as lesson detail.
  - `POST /api/progress/stories/:id/complete` → `StoryCompletionResponse` (M23 uses it).
- A story "is set in a world and carries that world's row" — the comment in `apps/web/lib/worlds.ts` explains that the accent colour comes from `palette` for exactly this reason, and that the story library was the second consumer of that helper. Mobile's `lib/world-theme.ts` (M11) is already that shared helper; reuse it, do not special-case covers.
- Server-side filtering: published only, matching the child's grade and language. The client filters nothing.
- M12 established the pattern this file follows: one list call, tap → detail call → branch on `ok` / `423` / `404`, `lib/lesson-cache.ts`-style handoff. Reuse the pattern and add a story equivalent.
- M04 gives `useApi` and the network states; M05 gives `EmptyState`; M11 gives `localizedLabel` and `worldGradient`; M14 gives narration for the screen's own copy.
- design.md §6: no horizontal scroll except intentional carousels — a shelf carousel per world is a legitimate use; a whole-screen horizontal scroll is not.

## Detailed Requirements

1. **Extend `lib/content-api.ts`** with `listStories()` and `getStory(id)`. `getStory` can return `423`, so its failure must retain `status` for branching (M04 already preserves it).
2. **Library screen** (`app/(student)/stories/index.tsx`) — a shelf per world (world name as a section header, tinted by `worldGradient`) with covers in a horizontal carousel inside each shelf, or a single grid when there are few stories. Covers ≥120px, localised title ≥20px beneath, read stories marked with a **tick plus a subtle overlay** (never colour alone).
3. **Entry points.** Reachable from the student home (M11 adds the tile) and from a world screen (M12's world view gains a "stories" entry when that world has any). Both ≥64px.
4. **Opening a story.** Tap → `getStory(id)`:
   - `ok` → hand the detail to the reader route via a `lib/story-cache.ts` handoff (same one-entry pattern as M12's lesson cache) and navigate to `/(student)/stories/[id]`;
   - `423` → the screen-time lock (placeholder here, full version in M25) — the child must not reach the reader;
   - `404` → refresh the list;
   - network/cold start → `KidRetry` / `ColdStartNotice`.
5. **Cover prefetch.** Prefetch the visible covers on mount with `expo-image`, and the *first page image* of the most recently opened story so re-opening feels instant. Do not prefetch `getStory` itself — it is gated.
6. **Read/unread state comes from the payload.** Whatever `StorySummarySchema` reports is what renders. Do not track read state locally; a second source of truth would disagree with the parent's dashboard.
7. **Empty and thin states.** No published stories for the child's grade → a warm `EmptyState` ("New stories soon!"). This is the expected MVP state until content exists, so it must look deliberate.
8. **Narration.** The screen's own heading gets a voice-over via M14's `useScreenNarration`; each cover's accessibility label is the localised title plus its read state.
9. **List performance.** `FlatList` per shelf with `initialNumToRender` tuned and `getItemLayout` where the cover size is fixed — a library of 60 stories on a low-end Android is exactly where an unoptimised list stutters.
10. **Tests** (`app/(student)/stories/index.test.tsx`, `lib/content-api.test.ts` additions): stories are grouped by world with the world's accent; a read story shows the tick and overlay; tapping with a 200 navigates and hands over the detail; a `423` shows the lock and does not navigate; a `404` refetches; the empty state renders with no stories; covers prefetch on mount.

## Technical Approach & Suggestions

```
apps/mobile/lib/content-api.ts                    # + listStories, getStory
apps/mobile/lib/story-cache.ts                    # one-entry handoff, mirroring lesson-cache
apps/mobile/app/(student)/stories/index.tsx
apps/mobile/app/(student)/stories/index.test.tsx
apps/mobile/components/student/StoryCover.tsx
apps/mobile/components/student/WorldShelf.tsx
```

Group by world using the story's own world reference, so a new world needs no code change:

```tsx
const shelves = useMemo(() => {
  const byWorld = new Map<string, { world: StorySummaryResponse["world"]; stories: StorySummaryResponse[] }>();
  for (const story of stories) {
    const key = story.world?.id ?? "unsorted";
    const shelf = byWorld.get(key) ?? { world: story.world, stories: [] };
    shelf.stories.push(story);
    byWorld.set(key, shelf);
  }
  return [...byWorld.values()];
}, [stories]);
```

The cover, with read state double-encoded:

```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel={read
    ? t("student:storyReadLabel", { title })
    : t("student:storyLabel", { title })}
  onPress={() => onOpen(story.id)}
  style={{ width: COVER_W, minHeight: COVER_H + 44 }}
>
  <Image source={story.coverUrl} style={{ width: COVER_W, height: COVER_H, borderRadius: 20 }} contentFit="cover" transition={150} />
  {read ? (
    <>
      <View className="absolute inset-0 rounded-[20px] bg-background/25" />
      <TickBadge className="absolute right-2 top-2" />
    </>
  ) : null}
  <Text variant="body" numberOfLines={2}>{title}</Text>
</Pressable>
```

The handoff, deliberately minimal — the same warning as M12's lesson cache applies:

```ts
// apps/mobile/lib/story-cache.ts
// A handoff between two screens, not a cache layer. One entry, cleared on read.
let pending: { id: string; detail: StoryDetailResponse } | undefined;
export function stashStory(id: string, detail: StoryDetailResponse) { pending = { id, detail }; }
export function takeStory(id: string): StoryDetailResponse | undefined {
  if (pending?.id !== id) return undefined;
  const { detail } = pending;
  pending = undefined;
  return detail;
}
```

Keep the 423 branch identical in shape to M12's `openLesson` — same status checks, same placeholder component — so M25 can replace both with one real lock screen in a single change.

## Step-by-Step Plan

1. Add `listStories` and `getStory` to `lib/content-api.ts` with tests, confirming `getStory`'s failure keeps `status`. (~25 min)
2. Build `StoryCover` with the read/unread double encoding and its test. (~30 min)
3. Build `WorldShelf` (header tinted from `worldGradient`, horizontal `FlatList`) and the library screen with grouping. (~45 min)
4. Add the four network states and the empty state. (~25 min)
5. Add `lib/story-cache.ts` and the `openStory` branching (200 / 423 / 404 / network) with tests. (~30 min)
6. Add the home-screen tile and the world-screen entry, both ≥64px. (~20 min)
7. Add cover prefetch and list tuning; measure scrolling with ~60 seeded stories on a **low-end Android device**. (~30 min)
8. Device pass: both orientations, both languages, a blocked child (zero daily limit) to see the 423 path, and TalkBack labels. (~30 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The library renders published stories for the child's grade and language from one `GET /api/content/stories` call, with no client-side filtering.
- [ ] Stories are grouped by world and tinted from the world's `palette` via the shared `worldGradient` helper — adding a world requires no mobile change.
- [ ] Read stories are marked by a tick **and** an overlay, never colour alone, using the state from the payload rather than local tracking.
- [ ] Tapping a story navigates to the reader with the detail already in hand — no second request.
- [ ] A `423` shows the lock and does not open the reader, verified on device with a zero daily limit.
- [ ] A `404` refreshes the list rather than erroring.
- [ ] Covers ≥120px with titles ≥20px; every entry point ≥64px.
- [ ] With ~60 stories, shelf scrolling is smooth on a low-end Android device.
- [ ] The no-stories state is warm and intentional in EN and BN.
- [ ] TalkBack announces each cover's title and read state.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The reader itself and story completion — M23.
- The full screen-time lock screen — M25 (this file ships the branch and reuses M12's placeholder).
- Favourites, bookmarks or "continue reading". Not in the spec; reading position is a reader concern (M23) and per-page resume is not a requirement.
- Search or filters. The audience cannot read well enough for a search box to help.
- Offline story downloads — out of scope for the plan (§3.2).
