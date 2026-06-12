# 12 — Curriculum Content Read API

> **Estimated effort:** 3–4 hours
> **Depends on:** 04, 05, 08
> **Requirement IDs:** FR-PROF-03, FR-CURR-01, FR-CURR-02, FR-WORLD-01..03, FR-WORLD-05, spec §7.3.4
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the student-facing content read API: worlds, subjects, topics, lessons, and full lesson detail — every endpoint filtered to `status = published` AND the active child's `gradeLevel`, with localized fields resolved to the child's `preferredLanguage` (fallback `en`). The published-only rule lives in exactly one reusable Prisma helper, `publishedForChild(child)` (spec §7.3.4: student queries only ever see `published`), and a seed script provides enough real content (1 world, 1 subject, 1 topic, 2 lessons with activity + quiz JSON) that frontend files 15–22 have something to render.

## Context & Current State

Files 04–05 are done: Prisma has `World` (name, palette JSON, mascot asset ref — FR-WORLD-05 data-driven theming), `Subject`, `Topic`, `Lesson` (world tag, `gradeLevels` array, ordered step content: intro script per locale, video asset refs per locale, activity ref, quiz ref), `MediaAsset`, `Activity` (type + JSONB `definition`), `Quiz`/`QuizQuestion` (JSONB definitions), `Story`/`StoryPage` — all content models carry the `ContentStatus` enum (`draft | in_review | approved | rejected | published | archived`). File 08 is done (app structure, `validate`, envelope, Prisma wiring). File 07's `@kidlearn/types` fixtures exist and seed data reuses them. Auth note: this file depends on 08, not 09 — design the routes to read the active child via a small indirection (`getActiveChild(req)`) so they work behind `requireParent` + session when 09/11 land; for tests, mock the child directly.

## Detailed Requirements

1. **Active-child resolution:** middleware `requireActiveChild` — runs after `requireParent` (file 09); reads `req.session.activeChildProfileId`; absent → 403 `FORBIDDEN` "No active child profile"; loads the `ChildProfile` (must belong to `req.parent`, else treat as absent) and attaches `req.child`. All `/api/content/*` routes use it: grade and language come **only** from the server-side child record, never from query params a client could tamper with (FR-PROF-03).
2. **Single-source published+grade filter (§7.3.4):** `publishedForChild(child)` in `src/lib/published-for-child.ts` returning the Prisma `where` fragment `{ status: "published", gradeLevels: { has: child.gradeLevel } }`. Every content query composes this helper — no route hand-writes `status:` or `gradeLevels:` conditions. (FR-CURR-02: only age-appropriate content is ever visible.)
3. **Localization resolution:** helper `pickLocale<T>(map: Record<string, T> | null, lang: "en" | "bn"): T | null` returning `map[lang] ?? map["en"] ?? null`. Responses return **resolved single-locale values** (e.g. `title: "Letters"`, `videoUrl: <bn url or en fallback>`) plus `locale` actually used, not the full per-locale maps — the child client never needs the other language (FR-PROF-03). Exception: activity/quiz JSON payloads are returned **whole** (they're schema-shaped with embedded `LocalizedText`; the engines from files 18–22 do their own locale picking via `@kidlearn/types`).
4. **GET `/api/content/worlds`** (FR-WORLD-01..03, FR-WORLD-05): published worlds with `{ id, name (localized), palette, mascot }` — palette + mascot drive data-driven theming on the frontend. Worlds are filtered `status = published` only (worlds aren't grade-tagged; lessons are).
5. **GET `/api/content/subjects`** (FR-CURR-01): published subjects that have ≥1 published lesson for the child's grade (so empty subjects don't render dead tiles): `{ id, name, slug, iconAsset, worldId }`.
6. **GET `/api/content/subjects/:id/topics`**: published topics of that subject having ≥1 matching lesson, ordered by `sortOrder`: `{ id, name, sortOrder }`. Unknown/unpublished subject id → 404.
7. **GET `/api/content/topics/:id/lessons`**: matching lessons ordered by `sortOrder`: `{ id, title, worldId, thumbnailUrl, durationEstimateSec, progress: null }` — `progress` is an explicitly-null placeholder field so file 16 can join `LessonProgress` per child without changing the response contract.
8. **GET `/api/content/lessons/:id`** (full lesson for the player): `{ id, title, worldId, world: { palette, mascot }, introScript (localized), videoUrl (locale-resolved from per-language video assets), activity: { id, type, definition }, quiz: { id, questions: [{ id, type, definition }] } }`. The activity/quiz `definition` JSONB is passed through after a `safeParse` against `@kidlearn/types` — a row failing validation is logged and the request returns 500 `INTERNAL` (corrupt published content is a server bug, not a client error). Draft/in_review/approved/rejected/archived lesson id, or wrong grade → **404** (not 403 — don't reveal existence).
9. **Seed script (`packages/db/prisma/seed.ts`):** idempotent (upsert by stable slugs/ids); creates: 1 world ("Jungle World", green palette JSON, mascot ref), 1 subject ("Language"), 1 topic ("Alphabet — A"), 2 published lessons for `nursery` + `kg1` with `introScript` in en+bn, placeholder video URLs per locale, one drag_drop activity and a 3-question quiz (mcq + picture_select + mcq) built from `@kidlearn/types` valid fixtures, **plus** 1 extra lesson left in `draft` and 1 in `in_review` — the leak-proof tests use them. Wire `prisma.seed` config so `pnpm --filter @kidlearn/db db:seed` runs it.
10. **Leak-proof tests:** prove draft/in_review/approved/rejected/archived content never appears in any list or detail endpoint; prove a `kg2` lesson is invisible to a `nursery` child; prove `bn`-preferring child gets bn fields and falls back to en when bn is missing.

## Technical Approach & Suggestions

Files:

```
apps/server/src/lib/published-for-child.ts
apps/server/src/lib/locale.ts                  # pickLocale
apps/server/src/middleware/require-active-child.ts
apps/server/src/routes/content.ts
apps/server/src/services/content.ts            # query + serialization logic
apps/server/src/routes/content.test.ts
packages/db/prisma/seed.ts
packages/db/package.json                       # + "db:seed" script, prisma.seed config
```

`src/lib/published-for-child.ts` — the one place the rule lives:

```ts
import type { ChildProfile, Prisma } from "@kidlearn/db";

/** Spec §7.3.4: student-facing queries ONLY see published content for the child's grade.
 *  Compose this into every content `where`. Do not inline these conditions anywhere else. */
export function publishedForChild(child: ChildProfile): Prisma.LessonWhereInput {
  return { status: "published", gradeLevels: { has: child.gradeLevel } };
}

export const publishedOnly = { status: "published" } as const; // worlds/subjects/topics (not grade-tagged)
```

(If files 04's grade tagging is a relation table rather than a Postgres enum array, swap `has` for `some: { gradeLevel: child.gradeLevel }` — keep the helper signature identical.)

`src/lib/locale.ts`:

```ts
export type Lang = "en" | "bn";

export function pickLocale<T>(map: Partial<Record<Lang, T>> | null | undefined, lang: Lang) {
  const value = map?.[lang] ?? map?.en ?? null;
  return { value, locale: (map?.[lang] ? lang : "en") as Lang };
}
```

`src/middleware/require-active-child.ts`:

```ts
export async function requireActiveChild(req: Request, _res: Response, next: NextFunction) {
  const childId = req.session?.activeChildProfileId;
  if (!childId) return next(ApiError.forbidden("No active child profile"));
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: req.parent!.id },
  });
  if (!child) return next(ApiError.forbidden("No active child profile"));
  req.child = child;
  next();
}
```

Subjects-with-content query sketch (`services/content.ts`):

```ts
export async function listSubjectsForChild(child: ChildProfile) {
  const subjects = await prisma.subject.findMany({
    where: {
      ...publishedOnly,
      topics: { some: { ...publishedOnly, lessons: { some: publishedForChild(child) } } },
    },
    orderBy: { sortOrder: "asc" },
  });
  return subjects.map((s) => {
    const name = pickLocale(s.name as Record<Lang, string>, child.preferredLanguage);
    return { id: s.id, slug: s.slug, name: name.value, locale: name.locale, iconAsset: s.iconAsset, worldId: s.worldId };
  });
}
```

Lesson detail: `prisma.lesson.findFirst({ where: { id, ...publishedForChild(child) }, include: { world: true, activity: true, quiz: { include: { questions: { orderBy: { sortOrder: "asc" } } } } } })`; null → `ApiError.notFound("Lesson not found")`. Validate payloads:

```ts
const parsed = safeParseActivityDefinition(lesson.activity.definition);
if (!parsed.success) {
  req.log.error({ activityId: lesson.activity.id, issues: parsed.error.issues }, "corrupt published activity");
  throw new ApiError(500, "INTERNAL", "Content unavailable");
}
```

Seed script skeleton (`packages/db/prisma/seed.ts`):

```ts
import { PrismaClient } from "@prisma/client";
import { validDragDrop, validMcq, validPictureSelect } from "@kidlearn/types";

const prisma = new PrismaClient();

async function main() {
  const jungle = await prisma.world.upsert({
    where: { slug: "jungle" },
    update: {},
    create: {
      slug: "jungle", status: "published",
      name: { en: "Jungle World", bn: "জঙ্গল জগৎ" },
      palette: { primary: "#2E7D32", secondary: "#A5D6A7", background: "#F1F8E9" },
      mascot: { kind: "image", url: "https://placehold.co/mascot-jungle.png" },
    },
  });
  // ... subject "language", topic "alphabet-a", lessons "lesson-letter-a" (published,
  // gradeLevels [nursery, kg1], introScript {en, bn}, videoAssets {en, bn}),
  // "lesson-letter-a-practice" (published), "lesson-letter-b" (status: draft),
  // "lesson-letter-c" (status: in_review) — each published lesson wired to an Activity
  // (definition: validDragDrop) and a Quiz with 3 QuizQuestions (validMcq, validPictureSelect, validMcq).
}

main().finally(() => prisma.$disconnect());
```

Router: `app.use("/api/content", requireParent, requireActiveChild, contentRouter)` (with 09 mocked in tests until it merges — same `authedAgentFor` helper pattern as file 11, plus a `withActiveChild(childFixture)` session mock).

## Step-by-Step Plan

1. Implement `publishedForChild` + `pickLocale` with pure unit tests (fallback when `bn` missing; `has` grade match shape). (~20 min)
2. Write the seed script reusing `@kidlearn/types` fixtures (published ×2, draft ×1, in_review ×1); add `db:seed` script + Prisma seed config; run it against the dev database. (~35 min)
3. TDD `requireActiveChild`: no session value → 403; child of another parent → 403; happy path attaches `req.child`. (~20 min)
4. TDD `GET /api/content/worlds` (palette + mascot present; an unpublished world hidden) and `GET /api/content/subjects` (subject with only-draft lessons excluded). (~25 min)
5. TDD `GET /api/content/subjects/:id/topics` (ordering, 404 on unknown subject) and `GET /api/content/topics/:id/lessons` (lesson list shape incl. `progress: null`; draft lesson absent). (~25 min)
6. TDD `GET /api/content/lessons/:id`: full shape with activity + quiz definitions parsing via `@kidlearn/types`; draft id → 404; corrupt-definition row (insert one in-test) → 500 with no payload leak. (~30 min)
7. TDD the cross-cutting leak tests: `nursery` child cannot see/list/fetch the kg2-only lesson (add one in test setup); `bn` child gets bn `title`/`introScript`/video URL, and en fallback when bn text removed. (~25 min)
8. Run `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter @kidlearn/db db:seed` (idempotency: run seed twice, row counts stable); update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes, including: every endpoint returns zero draft/in_review/approved/rejected/archived items; a wrong-grade lesson detail returns 404; locale fallback works.
- [ ] `grep -rn "status:" apps/server/src/routes apps/server/src/services` shows no inline `"published"` literals in content code paths — only `published-for-child.ts` defines them.
- [ ] `pnpm --filter @kidlearn/db db:seed` is idempotent (second run changes nothing) and yields: 1 published world, 1 subject, 1 topic, 2 published + 2 non-published lessons, 1 activity, 1 quiz with 3 questions — all activity/quiz JSON passing `@kidlearn/types` parsers.
- [ ] `GET /api/content/worlds` returns `palette` and `mascot` suitable for data-driven theming (FR-WORLD-05).
- [ ] `GET /api/content/lessons/:id` returns intro script, locale-resolved `videoUrl`, full activity definition, and 3 quiz question definitions in one response.
- [ ] Grade and language are never read from query/body/headers on any content route — only from the server-side child record (asserted: a `?gradeLevel=kg2` query param on requests changes nothing).
- [ ] Lesson list items carry `progress: null` (contract reserved for file 16).
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of Scope

- Per-child `LessonProgress` joins and resume state (file 16); writing any progress/quiz responses (16, 22).
- Story read endpoints and the story library (file 25).
- Frontend rendering: world-themed home (15), lesson player (16–17), activity/quiz engines (18–22).
- Admin write/CRUD endpoints, publishing workflow transitions, and content previews (files 32–33); AI-generated content (34–37).
- The 20-story + full MVP content catalog — the seed here is developer scaffolding only; real content arrives via the CMS and AI pipeline.
