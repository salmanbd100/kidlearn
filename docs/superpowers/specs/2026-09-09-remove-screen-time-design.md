# Remove parental screen-time controls

**Date:** 2026-09-09
**Status:** approved, not yet implemented

## Goal

Remove parental screen-time control in full — the daily minute limit, the
access window, the `423` gate on starting content, the kid-facing lock screen,
the parent settings page, the `ScreenTimeSetting` table and the documented
requirements FR-TIME-01..05 — so that nothing in the app bounds how long or
when a child uses it.

The motive is the same as for the parental PIN, retired on this branch the same
day: a gate that spans a table, three endpoints, two middleware mounts, a React
hook that re-checks before every navigation, a mascot lock screen and a
requirement mirrored across five documents and thirteen mobile milestones, in
exchange for a feature no one is asking for yet.

## Accepted trade-off

A parent has no in-app means of saying *how long* or *when*. The daily-journey
design intent — 30–60 minutes, adopted from `key-description` as §9 resolution
5 — becomes purely advisory. Nothing enforces it, and a child on a shared
family tablet can open the app at any hour and stay in it.

One thing softens that, and it is retained deliberately: **learning time is
still measured server-side** (FR-TIME-06). The heartbeat engine, the daily and
weekly minute aggregates, the parent dashboard's time-spent panel and the
weekly report all stay exactly as they are. A parent can still *see* how long a
child has been in the app; they can no longer *bound* it.

Nothing replaces the gate. A softer variant — a nudge, a suggested wind-down,
a parent-visible warning — was considered and rejected for the same reason the
gate is going: it reintroduces the concept in a form that still needs a policy
store, a server decision and a kid-facing screen.

## Non-goals

Each of these is one grep away from looking in scope, and each stays:

- **FR-TIME-06 and `document/implementation/27-learning-time-tracking.md`.**
  `learningTimeService.ts`, `POST /api/events/heartbeat`, `SessionEvent`,
  `GET /api/children/:id/learning-time` and `minutesToday` are untouched. They
  serve FR-DASH-02, the weekly reports and admin DAU/WAU, none of which depend
  on the gate.
- `apps/server/src/lib/local-date.ts` — screen time never imported it. Learning
  time, rewards, streaks, weekly reports and the AI rate guard all do.
- `APP_TIMEZONE` — documented as owned by files 23 and 27, read by six services.
- `SegmentedField.tsx` — shared with `ChildProfileForm`.
- `packages/ui` — contains nothing screen-time-specific; unchanged.
- Historical migration SQL, and the prose of `document/implementation/**` below
  the banners this change adds.

## Sequencing

Six commits on `remove-parent-pin-gate`, mirroring the PIN teardown
(`e7ab282` → `c11f5b6`). Unlike the PIN, the layers here separate cleanly: the
gate can stop being enforced before the endpoints are deleted, because the
`423` was the only thing the student surface depended on.

1. `docs(spec):` this document, alone.
2. `refactor(server):` stop enforcing the gate — unmount `enforceScreenTime`
   from the lesson and story detail routes, delete the middleware and the two
   `423` response docs.
3. `refactor:` remove the endpoints, the UI and the shared types.
4. `refactor(db):` drop the `ScreenTimeSetting` table.
5. `docs:` retire FR-TIME-01..05 and record what the removal costs.
6. `docs:` re-point the maintained references.

Commits 2–4 each leave `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
green on their own.

## 1. Database

One forward migration. The 23 existing migrations are committed and must not be
edited.

`packages/db/prisma/migrations/20260909100000_remove_screen_time/migration.sql`
drops the table. It is irreversible: parent-set limits and windows are dropped,
not archived. Nothing reads them once commit 3 has landed, so no data migration
precedes it.

In `schema.prisma`, `model ScreenTimeSetting` and the
`screenTime ScreenTimeSetting?` relation field on `ChildProfile` both go.
`packages/db/src/schema.test.ts` asserts one streak *and* one screen-time
setting per child; that test narrows to the streak.

## 2. Server

Deleted outright:

- `services/screenTimeService.ts` + `.test.ts`
- `middleware/enforce-screen-time.ts`
- `routes/screen-time.ts` + `.test.ts`
- `schemas/screen-time.ts`
- `openapi/paths/screen-time.ts`
- `lib/time-of-day.ts` + `.test.ts` — it exists only to bridge `"HH:MM"` ↔
  `@db.Time(0)`, and `ScreenTimeSetting` held the only `Time` columns.

Unpicked in place: the `/screen-time` mount in `routes/index.ts`; the `GET` and
`PATCH /:id/screen-time` handlers in `routes/children.ts` (its
`getLearningMinutes` import stays — that serves `/:id/learning-time`); the
`enforceScreenTime` mounts in `routes/content.ts` and `routes/stories.ts`.

Three suites mock `prisma.screenTimeSetting.findUnique` only because the gate
sat in front of the route under test — `routes/content.test.ts`,
`routes/stories.test.ts`, `middleware/admin-lesson-preview.test.ts`. Those lose
the mock, not the suite.

## 3. Shared types

`packages/types/src/screen-time.ts` (+ `.test.ts`) and
`packages/types/src/api/screen-time.ts` are deleted, with their barrel
re-exports in `src/index.ts` and `src/api/index.ts`. `TimeOfDaySchema` and
`TIME_OF_DAY_PATTERN` live in the first of those and have no other consumer, so
they go with it.

`api/errors.ts` loses `TIME_LIMIT_REACHED` and `OUTSIDE_WINDOW` from
`ERROR_CODES`. `CONSENT_REQUIRED` and `RATE_LIMITED` stay.

## 4. OpenAPI

Every item here is asserted by a test, so none is optional:

- `paths/index.ts` — the `SCREEN_TIME_ROUTES` spread.
- `paths/children.ts` — the `GET` and `PATCH` screen-time operations, and the
  prose mentions in the learning-time, dashboard and delete operations.
- `paths/content.ts`, `paths/stories.ts` — the `423 Locked` responses.
- `components.ts` — four schema registrations, the `ScreenTimeBody` request
  body, the `"Screen Time"` tag **and its entry in `TAG_GROUPS`**, plus the
  FR-TIME prose in the Dashboard, Progress and Learning Time tag descriptions.
  `document.test.ts` fails both on an orphaned tag and on a tag no group names.
- `examples.ts` — `SCREEN_TIME_STATUS_EXAMPLE`.
- `coverage.test.ts` — the `screenTimeRouter` row. This test walks the live
  Express routers; it fails if the router goes and the row stays.

## 5. Web

Deleted outright: the `parent/children/[id]/screen-time/` route directory,
`components/parent/ScreenTimeForm.tsx`, `components/student/ScreenTimeLock.tsx`
(both with their tests), `lib/screen-time-api.ts` and
`lib/use-screen-time-gate.ts`.

Unpicked in place:

- `HomeScreen.tsx` — the gate hook, the branch that replaced the whole home
  screen with the lock, and the two `guardStart` wrappers, which become bare
  `router.push` calls.
- `ChildCard.tsx` / `ChildrenScreen.tsx` — the `screenTimeHref` prop and the
  clock icon-button that was the feature's only entry point.
- `LessonPlayer.tsx`, `StoryReader.tsx` — the `isScreenTimeBlock` branch, so a
  start failure falls through to the ordinary error path.
- `lib/parent-errors.ts` — `screenTimeErrorKey`.
- `lib/use-heartbeat.test.tsx` — the assertion that heartbeats are never
  screen-time gated is now vacuous; the `minutesToday` tests stay.

`apps/web/AGENTS.md` is read before any Next.js edit — this is Next 16.

## 6. i18n

The `screenTime` block leaves `locales/{en,bn}/parent.json` and
`locales/{en,bn}/student.json`. The shared `parent.errors.*` keys stay.

## 7. Documentation

Following the convention `f412af2` and `c11f5b6` established on this branch.

**Retired, struck through, never deleted.** In
`project-requirement-details.md` §5.12, FR-TIME-01..05 each have ID, text and
scope cell wrapped in `~~`, with an undeleted bold note in the same cell giving
the ISO date, a one-clause reason, what is true now and a pointer to §9.
FR-TIME-06 is **not** struck, and the section is retitled so its heading is
honest about what remains.

**§9 resolution 5 records the reversal.** The original sentence is retensed to
the past, then `**Reversed 2026-09-09:**` with the concrete scale, then a
paragraph headed *"The cost is on the record."* naming what gets worse, naming
learning-time measurement as the mitigation that is deliberately retained, and
closing: re-introducing a time bound is a product decision, not a bug fix; if it
returns it should be designed against this note rather than restored from git
history.

**Sibling requirements and prose are edited silently** — the vision statement,
Pillar C, the shared technical decisions, the §8 entity list and the MVP scope
list each drop the clause, with no strikethrough.

**Implementation specs get a `> [!WARNING]` banner and are otherwise
untouched.** Files 28 (lapses entirely), 27 (banner says the *opposite* — the
file is still current, only its consumer is gone) and 06 (the model only). Each
banner names what was removed and when, inventories the symbols that no longer
exist, points at §9 resolution 5, names in bold what survives, and closes with
**"Nothing below this note has been edited."**

**Mobile gets one banner at `M00-progress-tracker.md`**, naming every affected
milestone and warning that a milestone followed literally will not build. The
thirteen `M*.md` files are not rewritten.

**Live design rules are rewritten, because they are instructions rather than
record**: `user-journey-manual.md` §4.9 and §5.6, `database-design.md`'s ER
diagram, index and cascade tables plus a new migration row, and
`mobile-app-plan.md` §9's foreground re-check rule.

**Maintained references are corrected with no banner** — the
server-authoritative rule in `standards/backend.md`, the code-review skill and
`CLAUDE.md` keep the rule and drop the example; `standards/general.md`'s
`useScreenTime` sample hook name is swapped, keeping the row.

**Historical records are left untouched, and the commit message says so.**
Anything recording a real past defect stays as written; editing it would
falsify the record.

## 8. Tests

No new tests. The suites that exist divide three ways:

- **Deleted with the code they cover** — `screenTimeService.test.ts`,
  `routes/screen-time.test.ts`, `packages/types/src/screen-time.test.ts`,
  `ScreenTimeForm.test.tsx`, `ScreenTimeLock.test.tsx`, `time-of-day.test.ts`.
- **Narrowed** — the three server suites that mock the setting row,
  `ChildCard.test.tsx`, `LessonPlayer.test.tsx`, `StoryReader.test.tsx`,
  `use-heartbeat.test.tsx`, `packages/db/src/schema.test.ts`.
- **Guardrails that must be kept green rather than edited around** —
  `openapi/coverage.test.ts` and `openapi/document.test.ts`. If either fails
  after this change, the document is wrong, not the test.

## 9. Verification

`pnpm build && pnpm typecheck && pnpm lint && pnpm test` from the repo root,
`build` first because `typecheck` and `test` depend on `^build`.

Then, with `pnpm dev` running:

1. `http://localhost:4000/docs` — no "Screen Time" tag, no `423` on the
   lesson-detail or story-detail operations, and the sidebar group that held the
   tag still renders.
2. `GET /api/screen-time/status` → 404.
3. Student home — the story tile and a world card navigate immediately, with no
   gate round-trip in the network panel.
4. Parent children list — no clock icon;
   `/parent/children/<id>/screen-time` → 404.
5. `pnpm db:studio` — no `ScreenTimeSetting` table.
6. The parent dashboard still shows time spent learning, and
   `POST /api/events/heartbeat` still returns `minutesToday`. FR-TIME-06 is
   untouched.
