# 04 — Curriculum & World Database Schema

> **Estimated effort:** 3–4 hours
> **Depends on:** 02, 03
> **Requirement IDs:** FR-CURR-01..04, FR-WORLD-01..05, spec §7.3.4, §8
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal
Model the curriculum backbone in Prisma: the publishing-workflow `ContentStatus` enum, data-driven `World` theming, the `Subject → Topic → Lesson` hierarchy with ordering and grade-level tags, a `MediaAsset` model with explicit (non-polymorphic) FKs, and per-language lesson content via a `LessonTranslation` table. After this file the entire curriculum — including new grades, worlds, and languages — can grow as rows, not code (FR-CURR-03, FR-WORLD-05, NFR-SCALE-01).

## Context & Current State
- Files 02–03 are done: `packages/db` connects to Supabase; the `auth_profile_schema` migration created `Parent`, `AdminUser`, `ChildProfile` and the `GradeLevel` (`NURSERY`/`KG1`/`KG2`) and `Language` (`en`/`bn`) enums — **reuse both enums here; do not redefine grade or locale concepts**.
- No content models exist yet. Activities, quizzes, and stories arrive in file 05; this file leaves `Lesson.activityId`/`quizId` as plain nullable columns for file 05 to upgrade into relations.
- Seed script (`prisma/seed.ts`) exists and is idempotent — extend it, don't replace it.

## Detailed Requirements
1. **`ContentStatus` enum** with values `draft`, `in_review`, `approved`, `rejected`, `published`, `archived` (spec §7.3.4 publishing rule + FR-CURR-04 archiving). Every content model in this and later files carries `status ContentStatus @default(draft)`. Student-facing queries filter `status = published` — always, at the query layer (file 12).
2. **`World` (FR-WORLD-01..05):** `slug` unique (`jungle`, `ocean`, `space`), `name`, `palette Json` (theme tokens: colors, gradients), and `mascotAssetId` FK → MediaAsset. Theming is pure data so new worlds need no code (FR-WORLD-05).
3. **`Subject` (FR-CURR-01):** slug, name, `sortOrder Int`, `gradeLevels GradeLevel[]` tags, status. Four seeded subjects: Language, Mathematics, Science, Social Skills.
4. **`Topic`:** belongs to Subject, with slug (unique per subject), name, `sortOrder`, `gradeLevels GradeLevel[]`, status.
5. **`Lesson`:** belongs to Topic **and** to a World (`worldId` required — FR-WORLD-01: every lesson is set inside a world), with slug (unique per topic), title, `sortOrder`, `gradeLevels GradeLevel[]`, status, and nullable `activityId`/`quizId` forward references (filled by file 05).
6. **Grade tags as enum arrays (FR-CURR-02..03):** `gradeLevels GradeLevel[]` on Subject/Topic/Lesson (Postgres native enum arrays via Prisma). Chosen over a join table: simpler queries (`gradeLevels: { has: child.gradeLevel }`), no extra joins, and new grades are still just new enum values + data.
7. **`MediaAsset` (spec §8):** `url`, `kind` enum (`video` | `audio` | `image`), `language Language?` (null = language-neutral, e.g. illustrations). Linkage uses **explicit optional FKs from the owning side** (e.g. `World.mascotAssetId`, `LessonTranslation.videoAssetId`) rather than polymorphic `entityType`+`entityId` — this keeps referential integrity and full type safety in Prisma.
8. **Per-language lesson content (FR-I18N pattern, FR-LSN-01..02 data):** a `LessonTranslation` child table keyed by `(lessonId, language)` holding `introScript` (the step-1 spoken greeting text), `introAudioAssetId` (its narration), and `videoAssetId` (the step-2 video for that language). The same translation-table pattern recurs for stories in file 05.
9. **Ordering (FR-CURR-04):** `sortOrder Int` on Subject, Topic, Lesson with a composite unique (`@@unique([parentFk, sortOrder])` is deliberately **not** used — reordering would collide mid-transaction; instead index `sortOrder` and let the admin API (file 32) renumber).
10. Migration applies cleanly and the seed creates: 2 worlds (jungle, ocean), 4 subjects, 1 topic ("Alphabet" under Language), and 1 draft lesson with an `en` translation.

## Technical Approach & Suggestions

**Files to modify:** `packages/db/prisma/schema.prisma`, `packages/db/prisma/seed.ts`.
**Files created by CLI:** `prisma/migrations/<ts>_curriculum_world_schema/`.

Schema additions (exact content):

```prisma
enum ContentStatus {
  draft
  in_review
  approved
  rejected
  published
  archived
}

enum MediaKind {
  video
  audio
  image
}

model MediaAsset {
  id        String    @id @default(uuid())
  url       String
  kind      MediaKind
  language  Language? // null = language-neutral asset
  createdAt DateTime  @default(now())

  worldMascots      World[]             @relation("WorldMascot")
  lessonIntroAudios LessonTranslation[] @relation("LessonIntroAudio")
  lessonVideos      LessonTranslation[] @relation("LessonVideo")
}

model World {
  id            String        @id @default(uuid())
  slug          String        @unique // "jungle" | "ocean" | "space"
  name          String
  palette       Json          // { "primary": "#...", "bg": "#...", ... } — data-driven theming (FR-WORLD-05)
  mascotAssetId String?
  mascotAsset   MediaAsset?   @relation("WorldMascot", fields: [mascotAssetId], references: [id])
  status        ContentStatus @default(draft)
  lessons       Lesson[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

model Subject {
  id          String        @id @default(uuid())
  slug        String        @unique
  name        String
  sortOrder   Int           @default(0)
  gradeLevels GradeLevel[]
  status      ContentStatus @default(draft)
  topics      Topic[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([sortOrder])
}

model Topic {
  id          String        @id @default(uuid())
  subjectId   String
  subject     Subject       @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  slug        String
  name        String
  sortOrder   Int           @default(0)
  gradeLevels GradeLevel[]
  status      ContentStatus @default(draft)
  lessons     Lesson[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@unique([subjectId, slug])
  @@index([subjectId, sortOrder])
}

model Lesson {
  id           String        @id @default(uuid())
  topicId      String
  topic        Topic         @relation(fields: [topicId], references: [id], onDelete: Cascade)
  worldId      String
  world        World         @relation(fields: [worldId], references: [id])
  slug         String
  title        String
  sortOrder    Int           @default(0)
  gradeLevels  GradeLevel[]
  status       ContentStatus @default(draft)
  // Forward references — upgraded to real relations in file 05:
  activityId   String?
  quizId       String?
  translations LessonTranslation[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@unique([topicId, slug])
  @@index([topicId, sortOrder])
  @@index([worldId])
}

model LessonTranslation {
  id                String      @id @default(uuid())
  lessonId          String
  lesson            Lesson      @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  language          Language
  introScript       String      // FR-LSN-01 spoken greeting text (source for TTS)
  introAudioAssetId String?
  introAudioAsset   MediaAsset? @relation("LessonIntroAudio", fields: [introAudioAssetId], references: [id])
  videoAssetId      String?
  videoAsset        MediaAsset? @relation("LessonVideo", fields: [videoAssetId], references: [id])

  @@unique([lessonId, language])
}
```

Design notes worth keeping in the schema comments:
- `World` is `onDelete` **restrict** (Prisma default for required relations) — you cannot delete a world that still hosts lessons; archive it instead (`status: archived`).
- A "published" lesson is only servable in a language if a `LessonTranslation` row exists for it — file 12's read API must join translations by the child's `preferredLanguage` and fall back to `en`.
- New grades (Grade 1+) = add a value to `GradeLevel` (one-line additive migration) + tag content rows — no code changes (FR-CURR-03).

**Seed extension** (append to `main()` in `prisma/seed.ts`, all `upsert` by slug):

```ts
const jungle = await prisma.world.upsert({
  where: { slug: "jungle" },
  update: {},
  create: {
    slug: "jungle", name: "Jungle World", status: "published",
    palette: { primary: "#2E7D32", secondary: "#FDD835", bg: "#E8F5E9" },
  },
});
// ocean analogous; then subjects:
const language = await prisma.subject.upsert({
  where: { slug: "language" },
  update: {},
  create: { slug: "language", name: "Language", sortOrder: 1, gradeLevels: ["NURSERY", "KG1"], status: "published" },
});
// mathematics/science/social-skills analogous (sortOrder 2–4);
// topic "alphabet" under language; one draft lesson "letter-a" in jungle with an en translation.
```

## Step-by-Step Plan
1. Add `ContentStatus`, `MediaKind`, and the `MediaAsset` model to `schema.prisma`; `prisma validate` passes. (~20 min)
2. Add `World`, then `Subject` and `Topic` with grade-level arrays and cascades; `prisma validate`. (~25 min)
3. Add `Lesson` (with required `worldId`, nullable `activityId`/`quizId`) and `LessonTranslation` with its named MediaAsset relations and `@@unique([lessonId, language])`. (~25 min)
4. Run `pnpm db:migrate` (name: `curriculum_world_schema`); inspect `migration.sql` — confirm enum array columns (`"GradeLevel"[]`), cascades on Topic/Lesson/LessonTranslation, and restrict on `Lesson.worldId`. (~20 min)
5. Run `pnpm db:generate && pnpm --filter @kidlearn/db build`; confirm new types export from `@kidlearn/db`. (~10 min)
6. Extend `prisma/seed.ts` with worlds, subjects, the alphabet topic, and one draft lesson + `en` translation, all idempotent. (~30 min)
7. Run `pnpm --filter @kidlearn/db db:seed` twice (idempotency) and verify the hierarchy in `prisma studio`, including the lesson's world link and translation row. (~15 min)
8. Sanity-query in `prisma studio` or a scratch script: filter lessons with `gradeLevels: { has: "NURSERY" }, status: "published"` — the published/grade filtering pattern file 12 will use. Then `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. (~20 min)

## Acceptance Criteria
- [ ] `pnpm db:migrate` exits 0; Supabase shows `World`, `Subject`, `Topic`, `Lesson`, `LessonTranslation`, `MediaAsset` tables plus `ContentStatus` and `MediaKind` enums.
- [ ] `gradeLevels` columns are Postgres `"GradeLevel"[]` arrays on Subject, Topic, and Lesson.
- [ ] `LessonTranslation` has a unique index on `(lessonId, language)`; deleting a Lesson cascades to its translations; deleting a Subject cascades through Topic to Lesson.
- [ ] Deleting a World with lessons fails (restrict), confirming archive-not-delete.
- [ ] `pnpm --filter @kidlearn/db db:seed` exits 0 twice; seeded data shows 2 worlds, 4 subjects, 1 topic, 1 lesson with an `en` translation.
- [ ] Every new content model carries `status ContentStatus @default(draft)`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all exit 0.

## Schema additions in later files (forward references)

These models grow later; the consolidated final shape lives in **`document/database-design.md`**. Tracked here for alignment:

- **`Lesson.aiJobId String?`** (+ relation to `AIGenerationJob`) and **`MediaAsset.aiJobId String?`** — **file 34** (every AI-generated row links back to its generation job).
- **`Lesson.conceptsIntroduced String[] @default([])`** — **file 30** (prefixed tokens `letter:A` / `word:apple` / `number:7` for weekly-report aggregation).
- **`CharacterSheet`** model `{ id, slug @unique, name, worldId String?, world World? @relation, description, createdAt, updatedAt }` — **file 36** (stable visual descriptions for AI image character consistency, FR-AI-09). It is the only new model that references `World` after this file.

## Out of Scope
- `Activity`, `Quiz`, `Story` models and upgrading `Lesson.activityId`/`quizId` into real relations — file 05.
- Progress, rewards, characters — file 06.
- Published-only read API with grade/language filtering — file 12.
- Admin CRUD/reordering UI and publish workflow transitions — file 32.
- Actual media uploads (Cloudinary) — file 33; world palette consumption in the frontend theme — file 13.
