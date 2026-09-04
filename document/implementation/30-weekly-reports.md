# 30 — Weekly Reports

> **Estimated effort:** 3–4 hours
> **Depends on:** 29
> **Requirement IDs:** FR-DASH-05, FR-DASH-06
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Generate a per-child weekly report (FR-DASH-05) as a `generateWeeklyReport(childId, weekStart)` service that aggregates total active days, learning minutes, new letters/words/numbers encountered (from completed lessons' `conceptsIntroduced` metadata), lessons + stories completed, first-attempt quiz accuracy, and badges earned that week, plus a **deterministic templated** encouraging note — persisted idempotently into `WeeklyReport` (`childId+weekStart` unique). On the free tier the trigger is twofold: lazy generation on the first reports view after a week ends, and an idempotent `POST /api/admin/jobs/weekly-reports` endpoint a scheduler can hit (file 38 puts that cron on the deployment host itself, calling `https://api.kidlearn.net`). Parents browse a report card for the latest week and a list of all past weeks (FR-DASH-06).

## Context & Current State

- File 29 is done: the `/parent` dashboard exists with the `ChildSwitcher` (URL-param controlled), `requireParent` + `requirePinVerified` + ownership route pattern, and `packages/types/src/dashboard.ts` conventions.
- File 06 delivered `WeeklyReport` (`weekStart DateTime @db.Date`, `@@unique([childId, weekStart])`, `metrics Json`, `note String?`) — generation here is idempotent by construction.
- File 27 gives `computeLearningMinutes(timestamps, from, to)` (pure, arbitrary windows) and the `APP_TIMEZONE` decision (week = **Monday 00:00** local); file 16/26/23 write `LessonProgress.completedAt`, story `RewardLedger` rows, `QuizResponse` rows (`isCorrect`, `answeredAt`), and badge ledger rows.
- `Lesson` has **no concept metadata yet** — this file adds `conceptsIntroduced String[]` (additive migration).
- File 08's env pattern (`lib/env.ts`) and error envelope apply; file 31 is *not* a dependency — the cron endpoint authenticates with a shared secret, not an admin session (see requirement 6).

## Detailed Requirements

1. **`Lesson.conceptsIntroduced`** — add `conceptsIntroduced String[] @default([])` to the Prisma `Lesson` model. Values are prefixed tokens: `"letter:A"`, `"word:apple"`, `"number:7"` (prefix set is exactly `letter | word | number`; unknown prefixes are ignored by the aggregator, never fatal). Seed the existing demo lessons with honest tokens (e.g. the "Letter A" lesson → `["letter:A", "word:apple", "word:ant"]`). The admin lesson form picks this field up in file 32's editor — out of scope here beyond the column + seeds.
2. **Metrics aggregation (FR-DASH-05)** — for the week `[weekStart, weekStart + 7d)` in `env.APP_TIMEZONE`:
   - `activeDays` — count of distinct local calendar days with ≥1 `SessionEvent`.
   - `learningMinutes` — file 27's `computeLearningMinutes` over the week's event timestamps.
   - `newLetters` / `newWords` / `newNumbers` — distinct tokens per prefix, unioned across lessons whose **first completion** (`LessonProgress.completedAt`) falls inside the week ("new" = first encountered this week).
   - `lessonsCompleted` — `LessonProgress.completedAt` in the week; `storiesCompleted` — `RewardLedger` rows `sourceType: "story"` in the week (the once-per-story grant from file 26 makes this a true distinct count).
   - `quizAccuracy` — per question answered in the week take the child's **first attempt** (earliest `answeredAt`); accuracy = `Math.round(100 * correctFirstAttempts / totalFirstAttempts)`; `null` when no responses (never `NaN`/0-by-default).
   - `badgesEarned` — badge ledger rows in the week, as `[{ slug, name }]`.
3. **Encouraging note — deterministic template, no LLM** — `selectNote(metrics)` walks an **ordered** rule list and returns the first match as `{ noteKey, noteParams }` (stored inside `metrics`; the `note` column stores the rendered English fallback). Rule order (binding): `quietWeek` (activeDays === 0) → `perfectWeek` (activeDays === 7) → `quizStar` (quizAccuracy ≥ 90 with ≥10 first attempts) → `strongWeek` (activeDays ≥ 5) → `bookworm` (storiesCompleted ≥ 5) → `steadyProgress` (lessonsCompleted ≥ 1) → `gentleNudge` (fallback). The client renders `t(\`reports.notes.${noteKey}\`, noteParams)` so notes localize to EN/BN. Note in code comments + doc: a post-MVP option is generating this note via the Claude API behind the same `selectNote` interface — the storage shape already supports swapping the producer.
4. **Idempotent persistence** — `generateWeeklyReport(childId, weekStart)` validates `weekStart` is a Monday in `APP_TIMEZONE` (throw `ApiError` 400 otherwise), computes metrics, and `prisma.weeklyReport.upsert`s on `childId_weekStart`. Re-running replaces metrics for the same week (safe for late-arriving events) — it never duplicates rows (FR-DASH-06: history stays clean).
5. **Lazy trigger (free-tier default)** — `GET /api/children/:id/reports` (parent + PIN + ownership): before listing, if the most recent **completed** week (the Monday–Sunday block ending before the current week) has no row, generate it inline, then return all reports ordered `weekStart desc`. One week of catch-up per request is enough at MVP — document that older gaps are filled by the cron endpoint.
6. **Cron trigger** — `POST /api/admin/jobs/weekly-reports` guarded by `Authorization: Bearer ${env.CRON_SECRET}` (new required env var, added to `lib/env.ts` and the server's template file; 401 on mismatch — deliberately *not* an admin session, so a headless scheduler can call it). It iterates every `ChildProfile`, generates the last completed week for each (skipping `upsert` no-ops is unnecessary — upsert is idempotent), and responds `{ data: { childrenProcessed, weekStart } }`. Document the setup: a cron entry on the deployment host hitting `https://api.kidlearn.net/api/admin/jobs/weekly-reports` every Monday 02:00 Asia/Dhaka with the bearer header (file 38 requirement 12). Keep the timeout generous — nothing is waiting on this job.
7. **Parent UI (FR-DASH-05..06)** — `/parent/reports` (PIN-gated, reuses file 29's `ChildSwitcher`): the newest report rendered as a **report card** (week range header, stat grid: active days, minutes, lessons, stories, accuracy, new letters/words/numbers counts with the tokens listed underneath, badge chips, and the localized encouraging note in a highlighted mascot speech bubble), plus a "Past weeks" list — one row per earlier report (week range + minutes + lessons) expanding/navigating to the same card view. Empty state for a child with no completed weeks yet.
8. **Tests** — unit tests for the aggregation math on fixture data (especially accuracy first-attempt logic and active-days timezone behaviour), `selectNote` rule order, and Supertest for both endpoints (lazy generation, idempotency, scoping, cron secret).

## Technical Approach & Suggestions

**Server files** (`/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/services/weekly-report.ts            # computeWeeklyMetrics (pure) + selectNote (pure) + generateWeeklyReport (I/O)
src/services/weekly-report.test.ts       # fixture suite — no DB
src/routes/reports.ts                    # GET /api/children/:id/reports (+ /:weekStart detail if listed lazily-only)
src/routes/jobs.ts                       # POST /api/admin/jobs/weekly-reports (CRON_SECRET guard)
src/routes/reports.test.ts
src/lib/env.ts                           # + CRON_SECRET: z.string().min(16); update .env.example
packages/db/prisma/schema.prisma         # + Lesson.conceptsIntroduced String[] @default([]); migration + seed update
packages/types/src/reports.ts            # WeeklyReportMetrics type + noteKey union
```

Pure core — all I/O stays in `generateWeeklyReport`:

```ts
export type WeeklyReportMetrics = {
  activeDays: number; learningMinutes: number;
  newLetters: string[]; newWords: string[]; newNumbers: string[];
  lessonsCompleted: number; storiesCompleted: number;
  quizAccuracy: number | null;
  badgesEarned: { slug: string; name: string }[];
  noteKey: NoteKey; noteParams: Record<string, string | number>;
};

export function computeWeeklyMetrics(input: {
  eventTimestamps: Date[];                                        // SessionEvent.occurredAt in week
  completedLessons: { completedAt: Date; conceptsIntroduced: string[] }[];
  storyCompletions: Date[];
  quizResponses: { questionId: string; isCorrect: boolean; answeredAt: Date }[];
  badges: { slug: string; name: string; earnedAt: Date }[];
  weekStart: Date; weekEnd: Date; timeZone: string;
}): WeeklyReportMetrics;
```

Key implementations: `activeDays` formats each timestamp with `toZonedTime(ts, timeZone)` → `yyyy-MM-dd` into a `Set`; `learningMinutes` delegates to file 27's `computeLearningMinutes(eventTimestamps, weekStart, weekEnd)`; first-attempt accuracy sorts responses by `answeredAt` and keeps the first per `questionId` in a `Map`; concept tokens split on the first `:` and dedupe per prefix into sorted arrays. `weekBounds(weekStart)` reuses file 27's `rangeBounds` Monday logic (`fromZonedTime` both edges).

`generateWeeklyReport` loads exactly the week's rows (all queries `gte: from, lt: to` on the indexed columns — `SessionEvent (childId, occurredAt)`, `LessonProgress.completedAt`, `QuizResponse (childId, answeredAt)`, `RewardLedger (childId, createdAt)`), runs the pure pair, then:

```ts
await prisma.weeklyReport.upsert({
  where: { childId_weekStart: { childId, weekStart } },
  create: { childId, weekStart, metrics, note: renderEnglishNote(metrics) },
  update: { metrics, note: renderEnglishNote(metrics) },
});
```

Lazy check in `routes/reports.ts`: `lastCompletedWeekStart(now)` = Monday of the previous week in `APP_TIMEZONE`; if `findUnique` misses, call `generateWeeklyReport` before the `findMany({ orderBy: { weekStart: "desc" } })`.

**Web files** (`/Users/salmanrahman/Documents/kidlearn/apps/web/`): `app/(parent)/parent/reports/page.tsx`, `components/parent/report-card.tsx` (presentational, fixture-testable), `components/parent/report-history-list.tsx`, `lib/reports-api.ts`, new `reports.*` keys in `locales/{en,bn}/parent.json` including all seven `reports.notes.*` templates in both languages. Week range header via `Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" })` over `weekStart`..`weekStart+6d`.

## Step-by-Step Plan

1. Add `conceptsIntroduced` to the Prisma schema, run the migration (`weekly_report_concepts`), update seeds with real tokens; `pnpm db:generate`. (~20 min)
2. Write the failing `computeWeeklyMetrics` fixture suite: empty week (all zeros, `quizAccuracy: null`); a realistic week fixture asserting every field; **accuracy**: question answered wrong-then-right counts as one incorrect first attempt (3 questions, first attempts 2✓/1✗ → 67); **activeDays**: an event at 23:30 and one at 00:30 Asia/Dhaka local on consecutive dates → 2 days, both UTC-encoded; concept dedupe across two lessons sharing `"letter:A"`; unknown prefix ignored. (~35 min)
3. Write failing `selectNote` tests locking the rule order (a 7-active-day, 95%-accuracy week → `perfectWeek`, not `quizStar`; empty week → `quietWeek`; bare minimum → `gentleNudge`). Implement both pure functions; green. (~30 min)
4. Implement `generateWeeklyReport` (queries + upsert + Monday validation) and add `CRON_SECRET` to env + `.env.example`. (~25 min)
5. Write failing Supertest specs for `GET /api/children/:id/reports`: first call after a seeded week creates the row and returns it; second call creates nothing new (assert row count); other parent's child → 404; no PIN → 401. Implement `routes/reports.ts`; green. (~30 min)
6. Implement `POST /api/admin/jobs/weekly-reports` + Supertest: wrong/missing bearer → 401, valid call processes all seeded children idempotently (run twice, same row count). (~20 min)
7. Build `ReportCard` + `ReportHistoryList` with an RTL fixture test (stats render, note key localizes with params, badge chips, empty state), then the `/parent/reports` page wired to the `ChildSwitcher`. (~35 min)
8. Manual pass (seeded child with last-week events): open `/parent/reports`, see the generated card in EN + BN, check the history list; `curl -H "Authorization: Bearer $CRON_SECRET" -X POST .../api/admin/jobs/weekly-reports`; then `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: the full `computeWeeklyMetrics` fixture suite (first-attempt accuracy, timezone-correct active days, concept dedupe, null accuracy on empty weeks), `selectNote` ordering, lazy-generation idempotency, scoping, and cron-secret auth.
- [ ] `pnpm --filter web test` passes the `report-card` fixture suite including the localized note and empty state.
- [ ] `WeeklyReport` rows are unique per `(childId, weekStart)` no matter how many times the list endpoint or job runs (verify row count after repeated calls).
- [ ] `POST /api/admin/jobs/weekly-reports` without the bearer secret returns `401`; with it, returns `{ data: { childrenProcessed, weekStart } }` and is safe to re-run.
- [ ] A non-Monday `weekStart` passed to `generateWeeklyReport` throws a 400 `ApiError` (unit-tested).
- [ ] `/parent/reports` shows the latest report card (all FR-DASH-05 fields: active days, minutes, new letters/words/numbers, lessons, stories, accuracy, badges, encouraging note) and every past week remains listed (FR-DASH-06).
- [ ] The note renders from `noteKey` + params in both EN and BN — the stored English `note` string is only a fallback.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- AI-generated (Claude) encouraging notes — post-MVP; the `selectNote` seam and stored `noteKey` shape already allow the swap without schema changes.
- Emailing/pushing reports to parents and PDF export — post-MVP (spec lists PDF worksheets as potentially late MVP/Phase 2).
- The admin lesson editor field for `conceptsIntroduced` (file 32/33 own lesson editing) — this file ships only the column + seeds.
- A real queue/scheduler (BullMQ etc.) — the free tier explicitly uses lazy generation + external cron; revisit when off free hosting.
- Platform-wide analytics rollups — file 31.
