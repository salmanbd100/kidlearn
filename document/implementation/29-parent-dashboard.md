# 29 — Parent Dashboard: Progress & Activity

> **Estimated effort:** 3–4 hours
> **Depends on:** 14, 23, 27
> **Requirement IDs:** FR-DASH-01, FR-DASH-02, FR-DASH-03, FR-DASH-04
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the parent dashboard at `/parent` (the PIN-gated landing screen after onboarding): tabs to switch between the parent's children, and per child a summary backed by one `GET /api/children/:id/dashboard` call — learning minutes today/week/month (file 27's service, FR-DASH-02), per-subject completion percentages with strongest/weakest highlights (FR-DASH-03), and a recent-activity feed of the last 20 lessons completed, stories read, and badges earned (FR-DASH-04). The UI is stat cards, pure-CSS progress bars, and an icon timeline with relative dates — no chart library at MVP — with warm empty states for brand-new children.

## Context & Current State

- File 14 is done: the `(parent)` group has the PIN gate (`PinGate` + server-side 15-min grant), `useSession`, `children-api.ts` (typed child list), and the parent theme. `/parent` itself currently has no page — onboarding lands on `/parent/children`.
- File 27 is done: `getLearningMinutes(childProfileId, range)` returns server-derived minutes for `today | week | month` in `env.APP_TIMEZONE`.
- File 23 is done: every lesson completion, story completion, and badge grant writes `RewardLedger` rows (`rewardType`, `sourceType`, `sourceId`, `createdAt`; `badgeId` set on badge rows). File 16 writes `LessonProgress` (`completedAt`, `score`); file 26 writes story-completion ledger rows (`sourceType: "story"`).
- Files 04–06 give the schema: `Subject → Topic → Lesson` (lessons carry `gradeLevels` and `status`), `LessonProgress` unique per `(childId, lessonId)`, `RewardLedger` indexed `(childId, createdAt)`.
- Server conventions from files 08/11: `{ data } / { error }` envelope, `requireParent` + `requirePinVerified`, ownership guard returning 404 for another parent's child.

## Detailed Requirements

1. **Dashboard endpoint (FR-DASH-01)** — `GET /api/children/:id/dashboard` behind `requireParent` + `requirePinVerified` + the file-11 ownership guard (404 for a child the parent doesn't own). One call returns everything the screen needs:
   ```json
   {
     "data": {
       "learningMinutes": { "today": 12, "week": 95, "month": 310 },
       "subjects": [
         { "subjectId": "…", "slug": "language", "name": { "en": "Language", "bn": "ভাষা" },
           "completed": 9, "total": 26, "percent": 35 }
       ],
       "strongestSubjectId": "…",
       "weakestSubjectId": "…",
       "recentActivity": [
         { "type": "lesson_completed", "refId": "…", "title": { "en": "…", "bn": "…" }, "occurredAt": "…" },
         { "type": "story_completed",  "refId": "…", "title": { "en": "…", "bn": "…" }, "occurredAt": "…" },
         { "type": "badge_earned",     "refId": "…", "title": { "en": "…", "bn": "…" }, "occurredAt": "…" }
       ]
     }
   }
   ```
2. **Learning minutes (FR-DASH-02)** — the three ranges come from file 27's `getLearningMinutes` via `Promise.all`; no re-implementation, no direct `SessionEvent` queries in this file.
3. **Subject progress (FR-DASH-03)** — per subject: `completed` = the child's `LessonProgress` rows with `completedAt` set whose lesson is `published` and tagged with the child's grade; `total` = all published lessons for that grade in the subject; `percent = Math.round(100 * completed / total)`; subjects with `total === 0` are omitted. `strongestSubjectId` / `weakestSubjectId` are the highest/lowest `percent` (ties broken by subject `order`); both are `null` when fewer than two subjects have `total > 0` or when every percent is 0 (a brand-new child has no "weak area").
4. **Recent activity (FR-DASH-04)** — the union of (a) `LessonProgress` with `completedAt` (→ `lesson_completed`, lesson title), (b) `RewardLedger` rows with `sourceType: "story"` (→ `story_completed`, story title via `sourceId`), and (c) `RewardLedger` rows with `rewardType: "badge"` (→ `badge_earned`, badge name) — merged, sorted by timestamp descending, truncated to 20.
5. **Dashboard UI (FR-DASH-01..04)** — `/parent` page: child switcher tabs (avatar + name; the first child selected by default, selection kept in the URL as `?child=<id>` so refresh/back work); three stat cards (Today / This week / This month, minutes formatted as "1h 35m" past 60); a subject-progress card with one labelled pure-CSS bar per subject (`<div style={{ width: \`${percent}%\` }}>` on a track div — no chart library) plus "Strongest"/"Needs practice" chips; an activity timeline with a type icon, localized title, and a relative date (`Intl.RelativeTimeFormat` on `i18n.language`, absolute date tooltip).
6. **Empty states** — a child with no activity gets a friendly illustration + "No adventures yet — {name}'s progress will appear here!" in the activity card, "No learning time yet" zero-state stat cards, and the progress card without highlight chips. A parent with zero children is redirected to `/parent/children` (file 14's flow guarantees one exists post-onboarding, but guard anyway).
7. **Tests** — Supertest: scoping (own child 200, other parent's child 404, no PIN grant 401), correct percentages and activity merge on fixture data; RTL component test for the summary rendering (stat values, bar widths, highlight chips, empty state).

## Technical Approach & Suggestions

**Server files** (`/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/services/dashboard-service.ts        # getDashboardSummary(childId) + pure computeSubjectProgress / mergeActivity
src/services/dashboard-service.test.ts   # pure helpers on in-memory fixtures
src/routes/dashboard.ts                  # GET /api/children/:id/dashboard (mount beside file 11/27 children routes)
src/routes/dashboard.test.ts             # Supertest: scoping + fixture math
```

Subject totals via Prisma `groupBy` on `topicId` (Lesson has no direct `subjectId`; topics map to subjects):

```ts
const child = await prisma.childProfile.findUniqueOrThrow({ where: { id: childId } });
const [totalsByTopic, topics, completed] = await Promise.all([
  prisma.lesson.groupBy({
    by: ["topicId"],
    where: { status: "published", gradeLevels: { has: child.gradeLevel } },
    _count: { _all: true },
  }),
  prisma.topic.findMany({ select: { id: true, subjectId: true, subject: { select: { slug: true, name: true, order: true } } } }),
  prisma.lessonProgress.findMany({
    where: { childId, completedAt: { not: null }, lesson: { status: "published", gradeLevels: { has: child.gradeLevel } } },
    select: { lesson: { select: { topic: { select: { subjectId: true } } } } },
  }),
]);
// pure: computeSubjectProgress(totalsByTopic, topics, completed) → subjects[] + strongest/weakest ids
```

Activity merge (two indexed queries, merged in JS — no SQL union needed at MVP scale):

```ts
const [lessonRows, ledgerRows] = await Promise.all([
  prisma.lessonProgress.findMany({
    where: { childId, completedAt: { not: null } },
    orderBy: { completedAt: "desc" }, take: 20,
    select: { lessonId: true, completedAt: true, lesson: { select: { title: true } } },
  }),
  prisma.rewardLedger.findMany({
    where: { childId, OR: [{ rewardType: "badge" }, { sourceType: "story" }] },
    orderBy: { createdAt: "desc" }, take: 20,
    select: { sourceType: true, sourceId: true, rewardType: true, createdAt: true, badge: { select: { name: true } } },
  }),
]);
// resolve story titles in one batch: prisma.story.findMany({ where: { id: { in: storyIds } }, select: { id, title } })
// pure: mergeActivity(lessonRows, ledgerRows, storyTitles).slice(0, 20)
```

Keep `computeSubjectProgress` and `mergeActivity` pure (plain arrays in, plain objects out) so the math is unit-testable without a database; `getDashboardSummary` is just queries + `Promise.all([today, week, month].map(r => getLearningMinutes(childId, r)))` + the pure helpers.

**Web files** (`/Users/salmanrahman/Documents/kidlearn/apps/web/`):

```
app/(parent)/parent/page.tsx                  # dashboard route (inside PinGate from file 14)
components/parent/child-switcher.tsx          # tabs; controlled by ?child= search param
components/parent/dashboard-summary.tsx       # composes the three cards from one DashboardData prop
components/parent/stat-card.tsx
components/parent/subject-progress-card.tsx   # CSS bars + strongest/weakest chips
components/parent/activity-timeline.tsx       # icons (📘 lesson / 📖 story / 🏅 badge as lucide icons) + relative dates
components/parent/dashboard-summary.test.tsx
lib/dashboard-api.ts                          # getDashboard(childId): ApiResult<DashboardData>
locales/{en,bn}/parent.json                   # + dashboard namespace keys
```

`DashboardData` is typed in `packages/types/src/dashboard.ts` (shared by route + client). Localized titles render via `title[i18n.language] ?? title.en`. Relative dates: a tiny `formatRelative(date, locale)` helper using `Intl.RelativeTimeFormat` with day/hour/minute granularity — unit-test it once instead of testing dates inside the component. `DashboardSummary` is a pure presentational component receiving `DashboardData` so the RTL test feeds fixtures directly; the page owns fetching + the cold-start mascot loader via `apiFetch`'s `onColdStart`.

## Step-by-Step Plan

1. Define `DashboardData` (+ zod schema) in `packages/types/src/dashboard.ts`; add `lib/dashboard-api.ts`. (~15 min)
2. Write failing unit tests for `computeSubjectProgress`: percentages round correctly, zero-total subjects omitted, strongest/weakest picked with order tie-break, both `null` for all-zero percents and for a single subject. (~25 min)
3. Write failing unit tests for `mergeActivity`: interleaves the three types by timestamp desc, truncates to 20, story titles resolved, badge rows use badge name. Implement both pure helpers. (~25 min)
4. Write failing Supertest specs for `GET /api/children/:id/dashboard`: 401 without session/PIN grant, 404 for another parent's child, fixture child returns expected minutes (seeded heartbeats), subject percents, and merged activity. (~25 min)
5. Implement `dashboard-service.ts` queries + `routes/dashboard.ts`; green. (~30 min)
6. Build `ChildSwitcher` (URL-param controlled) and `StatCard`; RTL test: switching tabs updates `?child=` and refetches. (~25 min)
7. Build `SubjectProgressCard` (CSS bars, chips) and `ActivityTimeline` (+ `formatRelative` helper with unit test); compose `DashboardSummary` with the fixture-driven RTL test covering populated and empty states. (~35 min)
8. Assemble `/parent` page (fetch, loading skeleton, empty-child redirect); manual pass at 360px and 768px in EN + BN with a seeded active child and a brand-new child; `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update tracker. (~25 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: dashboard scoping (own 200 / other parent 404 / no PIN 401) and fixture math (percent rounding, omission of empty subjects, activity merge order + cap at 20).
- [ ] `pnpm --filter web test` passes: `dashboard-summary` (stats, bar widths via inline style, strongest/weakest chips, empty state), `child-switcher`, `formatRelative`.
- [ ] `GET /api/children/:id/dashboard` answers with the exact envelope shape above in one request — the page makes no other data calls besides the child list.
- [ ] Minutes shown equal file 27's `GET /api/children/:id/learning-time` values for the same ranges (spot-check today after a 2-minute browser session).
- [ ] Completing a lesson, finishing a story, and earning a badge each appear in the feed with the right icon and a relative date, newest first (FR-DASH-04).
- [ ] A brand-new child shows friendly empty states everywhere — no `NaN%`, no empty highlight chips (FR-DASH-03 highlight suppressed at all-zero).
- [ ] Tabs switch children without losing the PIN grant; deep-linking `/parent?child=<id>` selects that child.
- [ ] All strings render in EN and BN; `pnpm lint` and `pnpm typecheck` pass at the repo root.

## Out of Scope

- Weekly report generation, the report card UI, and past-report history — file 30 (it reuses this file's child switcher and `requirePinVerified` route pattern).
- Screen-time *settings* UI (file 28) — the child cards on `/parent/children` already link there; the dashboard only displays minutes.
- Account-deletion/settings screens (the file-10 endpoint gets its UI alongside parent settings polish in file 30's reports page or later).
- Charts/graph libraries, per-topic drill-downs, and quiz-level analytics — Phase 2 detailed analytics (FR-CMS-07 note).
- Admin platform-wide analytics — file 31.
