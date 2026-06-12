# 25 — Story Library API & Browsing UI

> **Estimated effort:** 3–4 hours
> **Depends on:** 05, 08, 13
> **Requirement IDs:** FR-STORY-01, FR-STORY-04, FR-STORY-05, FR-STORY-08
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Ship the read side of the Story Library: two published-only, grade-filtered, locale-aware content endpoints (`GET /api/content/stories` and `GET /api/content/stories/:id`), a student-facing story library screen reachable from the main menu at any time (separate from lessons, FR-STORY-01) showing a cover-grid of large world-accented story cards with read-aloud titles and completed-story checkmarks, plus the seeding mechanism for the 20-story starter library (FR-STORY-08) with two handcrafted development stories.

## Context & Current State

- File 05 delivered the Prisma models: `Story` (slug, `world`, `gradeLevels`, `status: ContentStatus`, per-locale title/moral maps, cover `MediaAsset` ref) and `StoryPage` (ordered `pageNumber`, illustration ref, per-locale text map, per-locale narration-audio refs). File 12 (done — files are implemented serially) established the published-only query helpers and the `/api/content/*` router pattern with grade/locale filtering for lessons.
- File 08 gives the layered Express app: `validate()`, `ApiError`, the `{ data }` / `{ error }` envelope; file 09–11 added better-auth sessions, `requireParent`, and `activeChildProfileId` in the session (the student surface always acts as the active child).
- File 13 gives the web shell: `(student)` route group with `data-theme="kid"`, i18next en/bn, `apiFetch`, `useAudio()`, `BigButton`/`IconTile`; file 15 built the student home/main menu the library tile hooks into.
- File 23 gives `RewardLedger` with `sourceType`/`sourceId` columns — story completion grants (written by file 26) land there as `sourceType: "story"`.
- Nothing story-related exists in routes or UI yet.

## Detailed Requirements

1. **List endpoint** — `GET /api/content/stories` returns only `status = PUBLISHED` stories whose `gradeLevels` include the active child's grade (FR-PROF-03 pattern from file 12). Requires an authenticated session with `activeChildProfileId`; 401 otherwise. (FR-STORY-08 read side)
2. **Localization** — list items carry `title` resolved for the child's preferred locale with fallback to `en` when the locale entry is missing (FR-STORY-05); response includes `locale` actually used so the client can read the title aloud in the right language.
3. **Completion flags** — each list item has `completed: boolean`, derived from `RewardLedger` rows with `sourceType = "story"`, `sourceId = story.id`, `childProfileId = activeChildProfileId`. One query (`findMany` + `Set`), not N+1. **Decision: no separate `StoryProgress` table** — the ledger entry written exactly once per story per child (file 26) is the completion record.
4. **Detail endpoint** — `GET /api/content/stories/:id` returns the story (localized title + moral) and its pages ordered by `pageNumber`, each with `illustrationUrl`, localized `text`, and `narrationUrl` (locale-resolved with `en` fallback per field). 404 envelope for unknown, unpublished, or grade-mismatched stories — drafts must be indistinguishable from nonexistent.
5. **Library screen** — `app/(student)/stories/page.tsx`: a responsive cover-grid (2 columns portrait phone, 3–4 on tablet/landscape) of large tappable story cards; reachable from the student home main menu via a permanent "Stories" `IconTile` — not nested under any lesson flow (FR-STORY-01).
6. **World theming** — each card carries a world accent (border/glow color + small world mascot icon) driven by `story.world` (`jungle | ocean | space`) using existing theme tokens (FR-STORY-04). Data-driven: a `WORLD_ACCENTS` map, no per-world components.
7. **Tap behaviour** — first tap on a card plays the story title narration (or speaks the title text via the title-audio ref when present) through `useAudio()` and visually marks the card selected; second tap on the same card navigates to `/stories/[id]` (the reader, file 26). Tapping a different card switches selection and reads that title. Pattern matches the lesson-tile behaviour from file 15.
8. **Completed checkmark** — cards with `completed: true` show a star/checkmark badge overlay; completed stories remain fully openable (replays are free, FR-STORY-06 — enforced in file 26).
9. **Seeding mechanism** — a `seedStories()` script in `packages/db` that upserts stories + pages from typed fixture objects (idempotent on `slug`), run via `pnpm --filter @kidlearn/db seed:stories`. Ship **two handcrafted sample stories** (one jungle, one ocean; en + bn text; narration URLs may point at placeholder MP3s under the media host) published for development. Document that the remaining 18 of the 20-story starter library (FR-STORY-08) are produced by the AI pipeline (files 35–37) and flow through the same upsert shape — this file owns only the mechanism.
10. **API tests (Supertest)** — drafts/in-review stories excluded; grade filter (KG-1 child does not see a Nursery-only story); locale fallback (`bn` request on a story missing `bn` text returns `en` values with `locale: "en"` markers); completion flag flips after inserting a ledger fixture; 404 for unpublished id.

## Technical Approach & Suggestions

**Server files** (`/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/routes/content-stories.ts        # both endpoints, mounted at /api/content/stories
src/services/story-service.ts        # listStoriesForChild(), getStoryForChild()
src/lib/locale.ts                    # resolveLocalized() helper (if file 12 didn't already export one — reuse if it did)
src/routes/content-stories.test.ts   # Supertest suite with seeded fixtures
```

Locale resolution helper (shared with file 26):

```ts
// src/lib/locale.ts
export type LocaleMap = Partial<Record<"en" | "bn", string>>;
export function resolveLocalized(map: LocaleMap, locale: "en" | "bn"): { value: string; locale: "en" | "bn" } {
  if (map[locale]) return { value: map[locale]!, locale };
  return { value: map.en ?? "", locale: "en" }; // en is the authoring baseline (FR-STORY-05)
}
```

Response contracts (Zod in route file; mirror types in `packages/types/src/api/stories.ts`):

```ts
const StorySummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  titleAudioUrl: z.string().nullable(),     // narration of the title for tap-to-hear
  locale: z.enum(["en", "bn"]),             // locale actually served
  world: z.enum(["jungle", "ocean", "space"]),
  coverImageUrl: z.string(),
  pageCount: z.number().int(),
  completed: z.boolean(),
});
// GET /api/content/stories        → { data: { stories: StorySummary[] } }
// GET /api/content/stories/:id    → { data: { id, title, moral, world, locale, pages: [{ pageNumber, illustrationUrl, text, narrationUrl }] } }
```

Service sketch:

```ts
export async function listStoriesForChild(child: { id: string; gradeLevel: GradeLevel; locale: "en" | "bn" }) {
  const [stories, ledger] = await Promise.all([
    prisma.story.findMany({
      where: { status: "PUBLISHED", gradeLevels: { has: child.gradeLevel } },
      include: { _count: { select: { pages: true } } },
      orderBy: [{ world: "asc" }, { createdAt: "asc" }],
    }),
    prisma.rewardLedger.findMany({
      where: { childProfileId: child.id, sourceType: "story" },
      select: { sourceId: true },
    }),
  ]);
  const done = new Set(ledger.map((r) => r.sourceId));
  return stories.map((s) => toSummary(s, child.locale, done.has(s.id)));
}
```

**Web files** (`/Users/salmanrahman/Documents/kidlearn/apps/web/`):

```
app/(student)/stories/page.tsx       # library screen (server component shell + client grid)
components/student/story-grid.tsx    # "use client": selection state, double-tap-to-open
components/student/story-card.tsx    # cover, world accent, checkmark badge, title ≥20px
lib/worlds.ts                        # WORLD_ACCENTS: Record<World, { ring: string; icon: string }> (reuse file 15's if present)
components/student/story-card.test.tsx
locales/{en,bn}/common.json          # + "stories": { "title": "Story Time", "empty": "..." } keys
```

`StoryGrid` interaction (binding):

```tsx
function onCardTap(story: StorySummary) {
  if (selectedId === story.id) return router.push(`/stories/${story.id}`); // second tap opens reader (file 26)
  setSelectedId(story.id);
  if (story.titleAudioUrl) play(story.titleAudioUrl); // useAudio() — interrupts previous title
}
```

Cards are `IconTile`-sized or larger (≥96px cover, whole card is the hit target), checkmark badge is `aria-label={t("stories.completed")}`. Add the "Stories" entry to the student home menu in `app/(student)/home/page.tsx` (modify, don't restructure).

**Seed files** (`/Users/salmanrahman/Documents/kidlearn/packages/db/`): `seed/stories.ts` (fixtures: `the-sharing-monkey` jungle/Nursery+KG-1, moral = sharing; `dot-counts-the-fish` ocean/KG-1, moral = curiosity — each 5–6 pages, en + bn text), `seed/seed-stories.ts` (upsert by slug: `prisma.story.upsert` then delete+recreate pages inside a transaction so re-runs converge), `package.json` script `"seed:stories": "tsx seed/seed-stories.ts"`.

## Step-by-Step Plan

1. Write failing Supertest specs: published-only, grade filter, locale fallback, completion flag, 404-for-draft — seeding fixtures directly with `prisma` in `beforeEach`. (~30 min)
2. Implement `resolveLocalized` (or import file 12's equivalent) with a small unit test for the `bn → en` fallback. (~15 min)
3. Implement `story-service.ts` + `routes/content-stories.ts`, mount under `/api/content`, make the suite pass. (~30 min)
4. Build the seed fixtures + `seed:stories` upsert script; run it twice against the dev DB and confirm idempotence (row counts stable). (~30 min)
5. Add the `WORLD_ACCENTS` map (or extend file 15's) and write the failing RTL test for `StoryCard`: accent class per world, checkmark when `completed`, title rendered ≥20px. (~20 min)
6. Implement `StoryCard` + `StoryGrid` with the tap-once-hear / tap-twice-open behaviour; RTL test asserts `play` called on first tap and `router.push` only on second. (~30 min)
7. Create `app/(student)/stories/page.tsx` fetching via `apiFetch`, with loading skeleton and an empty state ("New stories are coming soon!" + mascot); add the Stories tile to the student home menu with i18n keys in en + bn. (~25 min)
8. Verify on 360px portrait and 768px landscape; run `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: draft story absent from list; Nursery-only story hidden from a KG-1 child; `bn` request on en-only story serves `en` values; `completed` true only with a `sourceType="story"` ledger row; unpublished id → 404 envelope.
- [ ] `pnpm --filter web test` passes: StoryCard world accent + checkmark, StoryGrid first-tap plays title audio, second tap navigates.
- [ ] `pnpm --filter @kidlearn/db seed:stories` runs twice without error and leaves exactly 2 stories with their pages.
- [ ] With the dev stack up, the student home shows a Stories tile; `/stories` renders the 2 seeded covers in a grid at 360px (2-col) and 768px (≥3-col).
- [ ] Tapping a card audibly plays its title before navigation; the same card's second tap opens `/stories/[id]` (404 page acceptable until file 26).
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.

## Out of Scope

- The reader itself, narration playback per page, and completion rewards — file 26.
- The remaining 18 starter stories, real narration audio, and illustrations — AI pipeline (files 35–37) feeding the same seed/upsert shape.
- Admin story CRUD/review (32, 37); story search/filtering UI (post-MVP).
- Learning-time events for story reading (file 27 defines the events; file 26 emits them).
