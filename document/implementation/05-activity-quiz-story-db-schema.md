# 05 — Activity, Quiz & Story Database Schema

> **Estimated effort:** 3–4 hours
> **Depends on:** 04
> **Requirement IDs:** FR-ACT-06, FR-QUIZ-07, FR-QUIZ-08 (data), FR-STORY-01..08 (data), spec §8
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal
Model the three JSON-driven content engines' storage: `Activity` (versioned JSONB definition per FR-ACT-06), `Quiz`/`QuizQuestion` (versioned JSONB per FR-QUIZ-07, ordered questions, per-language audio), and `Story`/`StoryPage`/`StoryPageTranslation` (page-ordered, illustrated, per-language text + narration per FR-STORY-02/05). Upgrade `Lesson.activityId`/`quizId` from plain columns into real relations. After this file the data layer can hold every piece of MVP student content.

## Context & Current State
- File 04 is done: `ContentStatus`, `MediaKind`, `MediaAsset` (explicit-FK pattern), `World`, `Subject → Topic → Lesson`, and `LessonTranslation` exist. `Lesson.activityId` and `Lesson.quizId` are **plain nullable `String?` columns with no relations** — this file converts them.
- `GradeLevel` and `Language` enums exist (file 03). Seed creates worlds/subjects/one draft lesson.
- The JSON payload *shapes* (what goes inside `definition`) are owned by `packages/types` Zod schemas (file 07) — the DB stores them as opaque, versioned `Json` columns and never interprets them (spec §7.3.1/§7.3.2: content as data, shared schemas).

## Detailed Requirements
1. **`ActivityType` enum:** `drag_drop`, `trace`, `match`, `puzzle` (FR-ACT-01..04).
2. **`Activity` (FR-ACT-06):** `type ActivityType`, `definition Json` (the full versioned payload: assets, targets, correct mappings), `schemaVersion Int @default(1)` so the renderer can branch on payload shape as schemas evolve additively (NFR-SCALE-02), `status ContentStatus`, timestamps. Per-language instruction audio via `ActivityTranslation` (`activityId`, `language`, `promptAudioAssetId` → MediaAsset, unique per `(activityId, language)`).
3. **`QuizQuestionFormat` enum:** `mcq`, `match_pair`, `drag_answer`, `picture_select` (FR-QUIZ-01..04).
4. **`Quiz`:** container with `title String?`, `status`, timestamps; **`QuizQuestion`:** `quizId` FK (cascade), `format`, `definition Json`, `schemaVersion Int @default(1)`, `sortOrder Int` with `@@unique([quizId, sortOrder])` (questions are a fixed 3–5 sequence per FR-LSN-04, so collision-free ordering is safe here, unlike admin-reorderable lessons). Per-language question audio (FR-QUIZ-05) via `QuizQuestionTranslation` (`questionId`, `language`, `audioAssetId` → MediaAsset, unique per `(questionId, language)`).
5. **`QuizResponse` is NOT created here** — per-question response storage (FR-QUIZ-08) lands with the other progress models in file 06; this file only ensures `QuizQuestion.id` is stable for it to reference.
6. **`Story` (FR-STORY-01..08):** `slug` unique, `title`, `theme String` (moral/learning theme per FR-STORY-03, e.g. `"sharing"`), `worldId` FK → World (FR-STORY-04, restrict like lessons), `gradeLevels GradeLevel[]`, `coverAssetId` → MediaAsset, `status ContentStatus`.
7. **`StoryPage`:** `storyId` FK (cascade), `sortOrder Int` with `@@unique([storyId, sortOrder])`, `illustrationAssetId` → MediaAsset (FR-STORY-02). Per-language content via **`StoryPageTranslation`** keyed by `(storyPageId, language)`: `text String` + `narrationAudioAssetId` → MediaAsset (FR-STORY-02/05 — every story available in all supported languages, text + narration).
8. **Lesson wiring (FR-LSN-03..04):** `Lesson.activityId`/`quizId` become real optional relations to `Activity`/`Quiz` (kept nullable — a lesson is authorable before its activity/quiz exists; publish-time completeness is an API-layer rule in file 32).
9. All three content roots (`Activity`, `Quiz`, `Story`) carry `status ContentStatus @default(draft)` — same publish gate as the curriculum (spec §7.3.4).
10. Migration applies cleanly; seed gains one published story (2 pages, `en` + `bn` translations), one drag-drop activity, and one 3-question quiz wired into the existing seeded lesson.

## Technical Approach & Suggestions

**Files to modify:** `packages/db/prisma/schema.prisma` (new models + `Lesson` relation upgrade + `MediaAsset` back-relations), `packages/db/prisma/seed.ts`.
**Files created by CLI:** `prisma/migrations/<ts>_activity_quiz_story_schema/`.

Schema additions (exact content):

```prisma
enum ActivityType {
  drag_drop
  trace
  match
  puzzle
}

enum QuizQuestionFormat {
  mcq
  match_pair
  drag_answer
  picture_select
}

model Activity {
  id            String        @id @default(uuid())
  type          ActivityType
  definition    Json          // versioned payload validated against packages/types (file 07)
  schemaVersion Int           @default(1)
  status        ContentStatus @default(draft)
  translations  ActivityTranslation[]
  lessons       Lesson[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

model ActivityTranslation {
  id                 String      @id @default(uuid())
  activityId         String
  activity           Activity    @relation(fields: [activityId], references: [id], onDelete: Cascade)
  language           Language
  promptAudioAssetId String?
  promptAudioAsset   MediaAsset? @relation("ActivityPromptAudio", fields: [promptAudioAssetId], references: [id])

  @@unique([activityId, language])
}

model Quiz {
  id        String        @id @default(uuid())
  title     String?
  status    ContentStatus @default(draft)
  questions QuizQuestion[]
  lessons   Lesson[]
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
}

model QuizQuestion {
  id            String             @id @default(uuid())
  quizId        String
  quiz          Quiz               @relation(fields: [quizId], references: [id], onDelete: Cascade)
  format        QuizQuestionFormat
  definition    Json
  schemaVersion Int                @default(1)
  sortOrder     Int
  translations  QuizQuestionTranslation[]

  @@unique([quizId, sortOrder])
}

model QuizQuestionTranslation {
  id           String       @id @default(uuid())
  questionId   String
  question     QuizQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  language     Language
  audioAssetId String?
  audioAsset   MediaAsset?  @relation("QuizQuestionAudio", fields: [audioAssetId], references: [id])

  @@unique([questionId, language])
}

model Story {
  id           String        @id @default(uuid())
  slug         String        @unique
  title        String
  theme        String        // FR-STORY-03: "sharing", "kindness", "curiosity", ...
  worldId      String
  world        World         @relation(fields: [worldId], references: [id])
  gradeLevels  GradeLevel[]
  coverAssetId String?
  coverAsset   MediaAsset?   @relation("StoryCover", fields: [coverAssetId], references: [id])
  status       ContentStatus @default(draft)
  pages        StoryPage[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model StoryPage {
  id                  String      @id @default(uuid())
  storyId             String
  story               Story       @relation(fields: [storyId], references: [id], onDelete: Cascade)
  sortOrder           Int
  illustrationAssetId String?
  illustrationAsset   MediaAsset? @relation("StoryPageIllustration", fields: [illustrationAssetId], references: [id])
  translations        StoryPageTranslation[]

  @@unique([storyId, sortOrder])
}

model StoryPageTranslation {
  id                    String      @id @default(uuid())
  storyPageId           String
  storyPage             StoryPage   @relation(fields: [storyPageId], references: [id], onDelete: Cascade)
  language              Language
  text                  String
  narrationAudioAssetId String?
  narrationAudioAsset   MediaAsset? @relation("StoryPageNarration", fields: [narrationAudioAssetId], references: [id])

  @@unique([storyPageId, language])
}
```

**Edits to existing models:**

```prisma
// Lesson — replace the bare columns with relations (column names unchanged → additive migration):
  activityId String?
  activity   Activity? @relation(fields: [activityId], references: [id])
  quizId     String?
  quiz       Quiz?     @relation(fields: [quizId], references: [id])

// World — add back-relation:
  stories Story[]

// MediaAsset — add the new named back-relations:
  activityPromptAudios   ActivityTranslation[]     @relation("ActivityPromptAudio")
  quizQuestionAudios     QuizQuestionTranslation[] @relation("QuizQuestionAudio")
  storyCovers            Story[]                   @relation("StoryCover")
  storyPageIllustrations StoryPage[]               @relation("StoryPageIllustration")
  storyPageNarrations    StoryPageTranslation[]    @relation("StoryPageNarration")
```

**Seed extension** (idempotent upserts): a drag-drop activity with a real-shaped `definition` (e.g. `{ "version": 1, "prompt": "Match the letter!", "items": [{ "id": "apple", "imageUrl": "...", "target": "A" }], "targets": [{ "id": "A", "label": "A" }] }`), a quiz with 3 `mcq`/`picture_select` questions (`sortOrder` 1–3), both wired onto the seeded `letter-a` lesson via `update`; one published story `"the-sharing-monkey"` (theme `sharing`, jungle world, 2 pages, each with `en` and `bn` `StoryPageTranslation` rows). FR-STORY-08's 20-story library is content production, not schema — out of scope here.

## Step-by-Step Plan
1. Add `ActivityType` + `Activity` + `ActivityTranslation` (with `MediaAsset` back-relation); `prisma validate`. (~20 min)
2. Add `QuizQuestionFormat` + `Quiz` + `QuizQuestion` + `QuizQuestionTranslation` with the `@@unique([quizId, sortOrder])` constraint; `prisma validate`. (~20 min)
3. Add `Story` + `StoryPage` + `StoryPageTranslation` and the `World.stories` back-relation; `prisma validate`. (~20 min)
4. Upgrade `Lesson.activityId`/`quizId` into optional relations (keep column names so the migration only adds FK constraints); `prisma validate`. (~15 min)
5. Run `pnpm db:migrate` (name: `activity_quiz_story_schema`); inspect `migration.sql` — confirm FK constraints on `Lesson.activityId`/`quizId`, cascades on all child tables, and the three `@@unique` composites. (~20 min)
6. `pnpm db:generate && pnpm --filter @kidlearn/db build`; confirm new model types export from `@kidlearn/db`. (~10 min)
7. Extend `prisma/seed.ts` with the activity, quiz (3 ordered questions), story (2 pages × 2 languages), and lesson wiring; run `db:seed` twice to prove idempotency. (~40 min)
8. Verify in `prisma studio`: lesson → activity/quiz links resolve; story pages ordered; each page has `en` + `bn` translations. Then `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. (~20 min)

## Acceptance Criteria
- [ ] `pnpm db:migrate` exits 0; Supabase shows `Activity`, `ActivityTranslation`, `Quiz`, `QuizQuestion`, `QuizQuestionTranslation`, `Story`, `StoryPage`, `StoryPageTranslation` plus `ActivityType` and `QuizQuestionFormat` enums.
- [ ] `Lesson.activityId` and `Lesson.quizId` now carry FK constraints to `Activity`/`Quiz` (visible in `migration.sql`), still nullable.
- [ ] Unique composites exist: `(activityId, language)`, `(quizId, sortOrder)`, `(questionId, language)`, `(storyId, sortOrder)`, `(storyPageId, language)`.
- [ ] Deleting a Quiz cascades to its questions and their translations; deleting a Story cascades to pages and page translations; deleting a World with stories fails (restrict).
- [ ] `Activity.definition` and `QuizQuestion.definition` are `jsonb` columns with sibling `schemaVersion` ints.
- [ ] `pnpm --filter @kidlearn/db db:seed` exits 0 twice; the seeded lesson resolves `activity` and `quiz`, and the seeded story has 2 pages each with `en` + `bn` translations.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all exit 0.

## Schema additions in later files (forward references)

These models grow later; the consolidated final shape lives in **`document/database-design.md`**. Tracked here for alignment:

- **`aiJobId String?`** (+ relation to `AIGenerationJob`) added to **`Activity`**, **`Quiz`**, **`QuizQuestion`**, and **`Story`** — **file 34** (links AI-generated rows to their generation job; the AI-publish guard `assertAiPublishable` in file 37 reads it).
- **`StoryTranslation`** (`storyId`, `language`, `title`, `moral?`, `titleAudioAssetId?`, UK `(storyId, language)`, cascade on `Story`) — **file 25**. `Story.title` and `Story.theme` stay as they are and keep their meaning: the admin label, and the authoring label for the moral. This is the child-facing pair beside them, resolved `preferredLanguage → en` like every other translation (FR-STORY-05).
- **`StoryPage.illustrationPrompt String?`** — **file 35** (the prompt the AI image generator in file 36 consumes; no public URL until a generated illustration is approved).
- **Quiz `definition` convention:** AI-generated picture questions use the literal placeholder URL `pending://image` for option images until an admin attaches a real asset; approval is blocked (409) while any `pending://` placeholder remains (file 37). This is a payload convention, not a column.

## Out of Scope
- Zod schemas defining what lives inside `definition` payloads — file 07 (`packages/types`).
- `QuizResponse`, `LessonProgress`, rewards, and all tracking models — file 06.
- Read APIs (published-only, grade/language filtered) — files 12, 25.
- Activity/quiz frontend engines — files 18–22; story reader — file 26.
- Producing the 20-story MVP library and real media assets — content work via files 33–37.
