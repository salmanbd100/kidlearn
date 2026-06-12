# 06 — Progress, Gamification & Tracking Database Schema

> **Estimated effort:** 3–4 hours
> **Depends on:** 03, 05
> **Requirement IDs:** FR-LSN-06..07, FR-QUIZ-08, FR-GAM-01..08 (data), FR-TIME-01..06 (data), FR-DASH-02..06 (data), FR-AI-08 (data), spec §8
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal
Complete the MVP data layer with everything recorded *about* a child's learning and the platform's operations: per-step lesson progress, per-question quiz responses, the reward ledger, data-driven badges, unlockable characters, streaks, screen-time settings, server-side session events (the source of truth for learning time), weekly reports, and the AI generation audit log. After this file the Prisma schema covers every entity in spec §8 and all later backend files only write queries.

## Context & Current State
- Files 03 and 05 are done: `ChildProfile` (with placeholder `avatarCharacterRef String?`), `AdminUser`, the full curriculum, `Activity`, `Quiz`/`QuizQuestion`, `Story` hierarchies, `MediaAsset`, and the `Language`/`GradeLevel`/`ContentStatus` enums all exist with three applied migrations.
- Nothing references `ChildProfile` yet besides `Parent`; this file adds many child-owned tables — **all of them cascade on child deletion** (FR-PROF-06/NFR-SAFE-05: deleting a profile removes that child's data).
- All models here are written server-side only (Shared Technical Decisions: rewards, streaks, screen time, completion are server-authoritative; the client reports events).

## Detailed Requirements
1. **`LessonProgress` (FR-LSN-06..07):** one row per `(childId, lessonId)` (`@@unique`), `currentStep` enum `LessonStep` (`intro`, `video`, `activity`, `quiz`, `reward`) for resume-from-last-step, `completedAt DateTime?`, `score Int?` (quiz score, 0–100), `timeSpentSec Int @default(0)`.
2. **`QuizResponse` (FR-QUIZ-08):** `childId`, `questionId` FK → QuizQuestion, `answer Json` (raw answer payload, shape depends on question format), `isCorrect Boolean`, `answeredAt DateTime @default(now())`; indexed by `(childId, answeredAt)` for dashboard accuracy queries (FR-DASH-05).
3. **`RewardLedger` (FR-GAM-01..02, 07..08):** append-only — `childId`, `rewardType` enum (`star` | `coin` | `badge`), `amount Int`, `sourceType String` + `sourceId String?` (e.g. `"lesson_completion"` + lessonId) so every grant is traceable, `badgeId` FK nullable (set when `rewardType = badge`), `createdAt`. Balances are `SUM(amount)` aggregates, never stored counters (no purchase path exists — FR-GAM-08 is satisfied by construction: rows are only created by server reward logic, file 23).
4. **`Badge` (FR-GAM-04):** badges are **data, not code** — `slug` unique, `name`, `description`, `ruleType String` (e.g. `"lessons_completed_in_topic"`, `"stories_completed"`, `"streak_days"`), `rule Json` (parameters, e.g. `{ "topicSlug": "alphabet", "count": 26 }`), `iconAssetId` → MediaAsset, `status ContentStatus` (admin-manageable). The badge engine (file 24) interprets `ruleType`+`rule`.
5. **`Character` + `ChildCharacter` (FR-GAM-05):** `Character` has `slug` unique, `name`, `assetId` → MediaAsset, `isDefault Boolean @default(false)`, `unlockRule Json` (criteria, e.g. `{ "coins": 50 }`), `status ContentStatus`. `ChildCharacter` joins child × character with `unlockedAt`, unique per pair. Migrate `ChildProfile.avatarCharacterRef` to a proper `avatarCharacterId` FK → Character (nullable).
6. **`Streak` (FR-GAM-06):** one row per child (`childId @unique`), `current Int @default(0)`, `longest Int @default(0)`, `lastActivityDate DateTime? @db.Date` — date-only so "consecutive days" math is timezone-stable.
7. **`ScreenTimeSetting` (FR-TIME-01, 04..05):** one row per child (`childId @unique`), `dailyLimitMinutes Int?` (null = no limit), `windowStart`/`windowEnd` `DateTime? @db.Time(0)` (null = no window).
8. **`SessionEvent` (FR-TIME-06, FR-DASH-02):** server-recorded — `childId`, `type` enum `SessionEventType` (`heartbeat`, `session_start`, `session_end`, `lesson_start`, `lesson_complete`, `story_start`, `story_complete`), `occurredAt DateTime @default(now())`, `payload Json?`. Indexed `(childId, occurredAt)`. Learning time (today/week/month) is **aggregated from these rows server-side** (file 27) — there is no separate LearningTime table; this is the spec §8 "SessionEvent / LearningTime" entity realized as event-sourcing + aggregation, so limits can't be bypassed client-side.
9. **`WeeklyReport` (FR-DASH-05..06):** `childId`, `weekStart DateTime @db.Date`, unique per `(childId, weekStart)` so generation (file 30) is idempotent, `metrics Json` (active days, learning minutes, new letters/words/numbers, lessons/stories completed, quiz accuracy, badges earned), `note String?` (encouraging note), `createdAt`. Past reports remain queryable forever (FR-DASH-06).
10. **`AIGenerationJob` (FR-AI-08):** `type` enum (`lesson` | `story` | `quiz` | `audio` | `image`), `input Json` (admin parameters + prompt), `rawOutput Json?` (verbatim model output, kept even after rejection for audit), `status` enum (`pending`, `generating`, `awaiting_review`, `approved`, `rejected`, `failed`), `reviewerId` FK → AdminUser nullable, `decision` enum nullable (`approve`, `edit_then_approve`, `reject`), `createdAt`/`updatedAt`/`reviewedAt?`.

## Technical Approach & Suggestions

**Files to modify:** `packages/db/prisma/schema.prisma` (new models + `ChildProfile`/`AdminUser`/`MediaAsset`/`QuizQuestion`/`Lesson` back-relations + avatar FK migration), `packages/db/prisma/seed.ts`.

Schema additions (exact content; back-relations on existing models implied by each `@relation`):

```prisma
enum LessonStep {
  intro
  video
  activity
  quiz
  reward
}

enum RewardType {
  star
  coin
  badge
}

enum SessionEventType {
  heartbeat
  session_start
  session_end
  lesson_start
  lesson_complete
  story_start
  story_complete
}

enum AIJobType {
  lesson
  story
  quiz
  audio
  image
}

enum AIJobStatus {
  pending
  generating
  awaiting_review
  approved
  rejected
  failed
}

enum AIReviewDecision {
  approve
  edit_then_approve
  reject
}

model LessonProgress {
  id           String       @id @default(uuid())
  childId      String
  child        ChildProfile @relation(fields: [childId], references: [id], onDelete: Cascade)
  lessonId     String
  lesson       Lesson       @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  currentStep  LessonStep   @default(intro)
  completedAt  DateTime?
  score        Int?
  timeSpentSec Int          @default(0)
  updatedAt    DateTime     @updatedAt

  @@unique([childId, lessonId])
}

model QuizResponse {
  id         String       @id @default(uuid())
  childId    String
  child      ChildProfile @relation(fields: [childId], references: [id], onDelete: Cascade)
  questionId String
  question   QuizQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  answer     Json
  isCorrect  Boolean
  answeredAt DateTime     @default(now())

  @@index([childId, answeredAt])
}

model Badge {
  id          String        @id @default(uuid())
  slug        String        @unique
  name        String
  description String?
  ruleType    String        // interpreted by the badge engine (file 24)
  rule        Json          // e.g. { "count": 26, "topicSlug": "alphabet" }
  iconAssetId String?
  iconAsset   MediaAsset?   @relation("BadgeIcon", fields: [iconAssetId], references: [id])
  status      ContentStatus @default(draft)
  ledger      RewardLedger[]
}

model RewardLedger {
  id         String       @id @default(uuid())
  childId    String
  child      ChildProfile @relation(fields: [childId], references: [id], onDelete: Cascade)
  rewardType RewardType
  amount     Int          // stars/coins granted; 1 for badge rows
  sourceType String       // "lesson_completion" | "quiz_answer" | "story_completion" | "daily_activity" | ...
  sourceId   String?      // id of the lesson/quiz/story that triggered the grant
  badgeId    String?
  badge      Badge?       @relation(fields: [badgeId], references: [id])
  createdAt  DateTime     @default(now())

  @@index([childId, createdAt])
}

model Character {
  id         String        @id @default(uuid())
  slug       String        @unique
  name       String
  assetId    String?
  asset      MediaAsset?   @relation("CharacterAsset", fields: [assetId], references: [id])
  isDefault  Boolean       @default(false)
  unlockRule Json          // e.g. { "coins": 50 } — interpreted in file 24
  status     ContentStatus @default(draft)
  unlocks    ChildCharacter[]
  avatars    ChildProfile[]
}

model ChildCharacter {
  id          String       @id @default(uuid())
  childId     String
  child       ChildProfile @relation(fields: [childId], references: [id], onDelete: Cascade)
  characterId String
  character   Character    @relation(fields: [characterId], references: [id], onDelete: Cascade)
  unlockedAt  DateTime     @default(now())

  @@unique([childId, characterId])
}

model Streak {
  id               String       @id @default(uuid())
  childId          String       @unique
  child            ChildProfile @relation(fields: [childId], references: [id], onDelete: Cascade)
  current          Int          @default(0)
  longest          Int          @default(0)
  lastActivityDate DateTime?    @db.Date
}

model ScreenTimeSetting {
  id                String       @id @default(uuid())
  childId           String       @unique
  child             ChildProfile @relation(fields: [childId], references: [id], onDelete: Cascade)
  dailyLimitMinutes Int?
  windowStart       DateTime?    @db.Time(0)
  windowEnd         DateTime?    @db.Time(0)
  updatedAt         DateTime     @updatedAt
}

model SessionEvent {
  id         String           @id @default(uuid())
  childId    String
  child      ChildProfile     @relation(fields: [childId], references: [id], onDelete: Cascade)
  type       SessionEventType
  occurredAt DateTime         @default(now())
  payload    Json?

  @@index([childId, occurredAt])
}

model WeeklyReport {
  id        String       @id @default(uuid())
  childId   String
  child     ChildProfile @relation(fields: [childId], references: [id], onDelete: Cascade)
  weekStart DateTime     @db.Date
  metrics   Json
  note      String?
  createdAt DateTime     @default(now())

  @@unique([childId, weekStart])
}

model AIGenerationJob {
  id         String            @id @default(uuid())
  type       AIJobType
  input      Json
  rawOutput  Json?
  status     AIJobStatus       @default(pending)
  reviewerId String?
  reviewer   AdminUser?        @relation(fields: [reviewerId], references: [id])
  decision   AIReviewDecision?
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
  reviewedAt DateTime?

  @@index([status, createdAt])
}
```

**`ChildProfile` avatar upgrade:** replace `avatarCharacterRef String?` with `avatarCharacterId String?` + `avatarCharacter Character? @relation(fields: [avatarCharacterId], references: [id])`, and add the back-relations (`lessonProgress LessonProgress[]`, `quizResponses QuizResponse[]`, `rewards RewardLedger[]`, `characters ChildCharacter[]`, `streak Streak?`, `screenTime ScreenTimeSetting?`, `sessionEvents SessionEvent[]`, `weeklyReports WeeklyReport[]`). Existing back-relations also go on `Lesson` (`progress LessonProgress[]`), `QuizQuestion` (`responses QuizResponse[]`), `AdminUser` (`aiReviews AIGenerationJob[]`), and `MediaAsset` (`badgeIcons Badge[] @relation("BadgeIcon")`, `characterAssets Character[] @relation("CharacterAsset")`). The column rename is destructive-safe in dev (seed data only) — accept Prisma's drop+add.

**Seed extension:** one default character (`slug: "leo-the-lion"`, `isDefault: true`, `status: "published"`, `unlockRule: {}`), the six FR-GAM-04 badges as published rows (`alphabet-hero`, `math-champion`, `reading-star`, `animal-expert`, `streak-starter`, `week-warrior`) with honest `ruleType`/`rule` payloads (e.g. `{ ruleType: "streak_days", rule: { days: 3 } }` for `streak-starter`), and set the seeded child's `avatarCharacterId` to the default character plus a `ChildCharacter` unlock row.

## Step-by-Step Plan
1. Add the seven enums and `LessonProgress` + `QuizResponse`; add back-relations on `ChildProfile`, `Lesson`, `QuizQuestion`; `prisma validate`. (~25 min)
2. Add `Badge` + `RewardLedger` and `Character` + `ChildCharacter`; swap `ChildProfile.avatarCharacterRef` for the `avatarCharacterId` FK; `prisma validate`. (~25 min)
3. Add `Streak`, `ScreenTimeSetting` (note `@db.Date` / `@db.Time(0)` native types), `SessionEvent`, `WeeklyReport`; `prisma validate`. (~20 min)
4. Add `AIGenerationJob` with the `AdminUser` reviewer relation; `prisma validate`. (~15 min)
5. Run `pnpm db:migrate` (name: `progress_gamification_schema`); inspect `migration.sql` — confirm every child-owned table has `ON DELETE CASCADE` to `ChildProfile`, and the `(childId, lessonId)`, `(childId, characterId)`, `(childId, weekStart)` uniques exist. (~20 min)
6. `pnpm db:generate && pnpm --filter @kidlearn/db build`. (~10 min)
7. Extend `prisma/seed.ts` (default character, six badges, child avatar + unlock); run `db:seed` twice for idempotency. (~30 min)
8. Verify cascade end-to-end: in `prisma studio`, delete the seeded child profile and confirm its progress/ledger/streak/unlock rows vanish while `Badge`/`Character` rows survive; restore via `db:seed`. Then `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. (~20 min)

## Acceptance Criteria
- [ ] `pnpm db:migrate` exits 0; Supabase shows all 10 new tables and 7 new enums.
- [ ] `LessonProgress` is unique per `(childId, lessonId)`; `Streak` and `ScreenTimeSetting` unique per child; `WeeklyReport` unique per `(childId, weekStart)`; `ChildCharacter` unique per `(childId, characterId)`.
- [ ] Every child-owned table (`LessonProgress`, `QuizResponse`, `RewardLedger`, `ChildCharacter`, `Streak`, `ScreenTimeSetting`, `SessionEvent`, `WeeklyReport`) cascades on `ChildProfile` deletion — verified by deleting the seeded child.
- [ ] `Badge.rule`, `Character.unlockRule`, `SessionEvent.payload`, `WeeklyReport.metrics`, `AIGenerationJob.input`/`rawOutput`, `QuizResponse.answer` are `jsonb` columns.
- [ ] `ChildProfile.avatarCharacterId` is a real FK to `Character` (the string placeholder is gone).
- [ ] Seed creates the six FR-GAM-04 badges and one default character; `pnpm --filter @kidlearn/db db:seed` exits 0 twice.
- [ ] `Streak.lastActivityDate` is Postgres `date`; `ScreenTimeSetting.windowStart/windowEnd` are `time(0)` (check `migration.sql`).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all exit 0.

## Schema additions in later files (forward references)

These models grow later; the consolidated final shape lives in **`document/database-design.md`**. Tracked here for alignment:

- **`AIGenerationJob.reviewNote String?`** — **file 37** (rejection reason; `rawOutput` is retained even after rejection for FR-AI-08 audit).
- **Job ↔ content linkage is one-directional:** `AIGenerationJob` gets **no** `lessonId`/`storyId`/`quizId` columns. Instead each content row carries `aiJobId` (files 34–35) and the job resolves its outputs via those back-relations. `AIGenerationJob.rawOutput` Json carries `{ attempts, usage, parsed, entities }` (created-row ids + the FK name to set on approval for audio/image jobs) — an opaque payload, not columns.
- **`WeeklyReport` note storage:** `metrics Json` holds the structured `WeeklyReportMetrics` (active days, minutes, new letters/words/numbers, lessons/stories completed, quiz accuracy, badges, plus **`noteKey`** + **`noteParams`** for i18n rendering). The `note String?` column stores only the rendered **English fallback** (file 30). No extra columns.
- **Content-row audit field `updatedBy String?`** is added to `World`/`Subject`/`Topic`/`Lesson` in **file 32** (publishing-workflow audit — who created/transitioned a row).

## Out of Scope
- Reward/streak/badge *logic* (grant rules, milestone evaluation, celebration payloads) — files 23–24.
- Heartbeat endpoint, learning-time aggregation queries, and screen-time enforcement — files 27–28.
- Weekly report generation job and dashboard queries — files 29–30.
- AI job execution, Claude/ElevenLabs/image integrations, and the review queue UI — files 34–37.
- Any API routes or frontend consumption of these tables.
