# 28 — Screen Time Limits & Access Windows

> **Estimated effort:** 3–4 hours
> **Depends on:** 14, 27
> **Requirement IDs:** FR-TIME-01, FR-TIME-02, FR-TIME-03, FR-TIME-04, FR-TIME-05
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Let parents set a per-child daily learning limit and an access time window from a PIN-gated settings screen (FR-TIME-01/04/05), and enforce both **server-side** at the moment a child tries to *start* new content: lesson/story start endpoints compare today's server-computed minutes (file 27) against the limit and the current `APP_TIMEZONE` time against the window, returning a typed `423 Locked` envelope when blocked. A lesson already in progress is always allowed to finish — only starting new content is gated (FR-TIME-03). The student client turns the two block reasons into friendly mascot screens: "time's up for today!" and "see you at 8:00!" (FR-TIME-02/04).

## Context & Current State

- File 06 delivered `ScreenTimeSetting` (`childId @unique`, `dailyLimitMinutes Int?`, `windowStart`/`windowEnd` `DateTime? @db.Time(0)` — null means "off"). No rows exist yet and nothing reads the table.
- File 27 is done: `getLearningMinutes(childProfileId, "today")` returns server-derived minutes in `env.APP_TIMEZONE` (default `"Asia/Dhaka"`), and every heartbeat response already carries `minutesToday`.
- File 14 gives the PIN-gated `(parent)` surface, `children-api.ts`, `ChildProfileForm` patterns, and the server's `requireParent` + PIN-grant (`requirePinVerified`) middleware from file 10. File 11 established the owner-only child guard (404 for another parent's child).
- File 16's lesson flow: opening `/lesson/[id]` fetches `GET /api/content/lessons/:id`, then posts step reports to `POST /api/progress/lessons/:id/step`. File 26's reader fetches `GET /api/content/stories/:id` on open. These fetches are the natural "start" gates.
- File 08's envelope/`ApiError` pattern is the route standard; `ErrorCode` is a closed union that must be extended here.

## Detailed Requirements

1. **Settings API (FR-TIME-01, FR-TIME-04, FR-TIME-05)** — `GET /api/children/:id/screen-time` and `PATCH /api/children/:id/screen-time`, both behind `requireParent` + `requirePinVerified` + the file-11 ownership guard (404 otherwise). `PATCH` **upserts** `ScreenTimeSetting` on `childId`. Body (Zod, in `packages/types`): `dailyLimitMinutes` must be `null | 15 | 30 | 45 | 60 | 90`; `windowStart`/`windowEnd` are `"HH:MM"` strings or `null`, and must be both set or both null (400 `VALIDATION_FAILED` otherwise). `GET` returns the row or all-null defaults — the form never special-cases "no row yet".
2. **Pure decision function** — `evaluateScreenTime(input)` in `src/services/screen-time.ts`, no I/O, fully unit-tested. Rules (binding):
   - `hasInProgressLesson: true` → `{ allowed: true }` unconditionally (FR-TIME-03 exemption).
   - Window check runs first: if a window is set and local `"HH:MM"` is outside it → `{ allowed: false, code: "OUTSIDE_WINDOW" }`. A window with `start > end` wraps midnight (e.g. `20:00`–`07:00` allows 21:30). `start === end` is treated as "always open" (degenerate, but must not lock a child out).
   - Then the limit: if `dailyLimitMinutes` is set and `minutesToday >= dailyLimitMinutes` → `{ allowed: false, code: "TIME_LIMIT_REACHED" }` (at-limit blocks).
   - No settings row / all-null → always allowed.
3. **Enforcement at start endpoints (FR-TIME-02, FR-TIME-03, FR-TIME-04)** — an `enforceScreenTime(kind)` Express middleware applied to:
   - `GET /api/content/lessons/:id` (file 12/16's lesson-start fetch), with the exemption: if an incomplete `LessonProgress` row (`completedAt: null`) exists for `(childId, lessonId)`, skip the check — resuming/finishing the active lesson is never blocked, even across a refresh.
   - `GET /api/content/stories/:id` (file 25's story-start fetch), no exemption — the reader already holds all pages client-side, so mid-story reading is never interrupted by this gate.
   - **Never** applied to `POST /api/progress/lessons/:id/step`, `POST /api/progress/stories/:id/complete`, or `/api/events/*` — step, completion, and tracking endpoints stay open so the active lesson can finish and time keeps being recorded (FR-TIME-03, FR-TIME-06).
   - Blocked requests respond `423` with `{ "error": { "code": "TIME_LIMIT_REACHED" | "OUTSIDE_WINDOW", "message": ..., "details": { "minutesToday", "dailyLimitMinutes", "windowStart", "windowEnd" } } }`.
4. **Status endpoint for the client** — `GET /api/screen-time/status` (requires a session with `activeChildProfileId`, 401 otherwise; no PIN — it's a student-surface read): `{ data: { allowed, reason: "TIME_LIMIT_REACHED" | "OUTSIDE_WINDOW" | null, minutesToday, dailyLimitMinutes, windowStart, windowEnd } }`. The student home calls it on load and on every lesson/story tile tap before navigating (FR-TIME-02 UX — block *before* the child gets excited about a lesson).
5. **Parent UI (FR-TIME-01, FR-TIME-04, FR-TIME-05)** — `/parent/children/[id]/screen-time` inside the PIN-gated `(parent)` group, linked from each child card on `/parent/children`: a daily-limit picker rendered as a segmented control (`Off / 15 / 30 / 45 / 60 / 90` minutes) and an access-window section with a toggle plus two native `<input type="time">` pickers. Saving PATCHes and shows a confirmation toast; all strings in EN + BN.
6. **Student lock screens (FR-TIME-02, FR-TIME-04)** — two full-bleed kid-theme screens with the mascot: `TimeUpScreen` ("Time's up for today! See you tomorrow 🌙", spoken via `useAudio` when narration assets exist) and `OutsideWindowScreen` ("See you at {time}!", interpolating the localized `windowStart`). Both offer a single `BigButton` back to the profile-select screen. Rendered by the student home when status says blocked, and by the lesson/story pages whenever any `apiFetch` returns a 423.
7. **Tests** — exhaustive unit tests for `evaluateScreenTime` (see plan step 1); Supertest for the settings routes (ownership, validation, upsert-twice) and for the 423 behaviour on both gated endpoints including the in-progress exemption.

## Technical Approach & Suggestions

**Server files** (`/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/services/screen-time.ts          # evaluateScreenTime (pure) + getScreenTimeStatus(childId) (I/O)
src/services/screen-time.test.ts     # pure-function suite (no DB)
src/middleware/enforce-screen-time.ts
src/routes/screen-time.ts            # GET/PATCH /api/children/:id/screen-time + GET /api/screen-time/status
src/routes/screen-time.test.ts
src/lib/errors.ts                    # extend ErrorCode with "TIME_LIMIT_REACHED" | "OUTSIDE_WINDOW"
src/routes/content-lessons.ts        # modify: insert enforceScreenTime("lesson") on GET /:id
src/routes/content-stories.ts        # modify: insert enforceScreenTime("story") on GET /:id
packages/types/src/screen-time.ts    # screenTimeUpdateSchema + ScreenTimeStatus type
```

The pure decision (binding semantics — minutes-of-day comparison keeps the wrap logic trivial):

```ts
export type ScreenTimeDecision =
  | { allowed: true }
  | { allowed: false; code: "TIME_LIMIT_REACHED" | "OUTSIDE_WINDOW" };

export function evaluateScreenTime(input: {
  minutesToday: number;
  dailyLimitMinutes: number | null;
  localTime: string;            // "HH:MM" in env.APP_TIMEZONE (file 27 decision)
  windowStart: string | null;   // "HH:MM"
  windowEnd: string | null;
  hasInProgressLesson: boolean; // FR-TIME-03
}): ScreenTimeDecision {
  if (input.hasInProgressLesson) return { allowed: true };
  if (input.windowStart && input.windowEnd && input.windowStart !== input.windowEnd) {
    const [now, start, end] = [input.localTime, input.windowStart, input.windowEnd].map(toMinutes);
    const inside = start < end ? now >= start && now < end : now >= start || now < end; // wraps midnight
    if (!inside) return { allowed: false, code: "OUTSIDE_WINDOW" };
  }
  if (input.dailyLimitMinutes !== null && input.minutesToday >= input.dailyLimitMinutes) {
    return { allowed: false, code: "TIME_LIMIT_REACHED" };
  }
  return { allowed: true };
}
```

`getScreenTimeStatus(childId)` loads the `ScreenTimeSetting` row, calls file 27's `getLearningMinutes(childId, "today")`, derives `localTime` via `toZonedTime(new Date(), env.APP_TIMEZONE)` formatted `"HH:MM"`, and runs the pure function with `hasInProgressLesson: false` (the status call is always "may I start something new?"). The middleware variant additionally runs `prisma.lessonProgress.findUnique({ where: { childId_lessonId: { childId, lessonId } } })` and passes `hasInProgressLesson: !!row && row.completedAt === null` — note a *completed* lesson being replayed counts as a new start and is gated.

Zod schema (`packages/types/src/screen-time.ts`):

```ts
export const screenTimeUpdateSchema = z.object({
  dailyLimitMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).nullable(),
  windowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  windowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
}).strict().refine((v) => (v.windowStart === null) === (v.windowEnd === null), {
  message: "windowStart and windowEnd must be set together",
});
```

`PATCH` maps `"HH:MM"` ⇄ the `@db.Time(0)` columns (Prisma represents them as `Date`; store as `new Date(\`1970-01-01T${hhmm}:00Z\`)` and format back with `toISOString().slice(11, 16)` — keep both conversions in one `lib/time-of-day.ts` helper so the round trip is tested once). Upsert: `prisma.screenTimeSetting.upsert({ where: { childId }, create: {...}, update: {...} })`.

**Web files** (`/Users/salmanrahman/Documents/kidlearn/apps/web/`): `app/(parent)/parent/children/[id]/screen-time/page.tsx`, `components/parent/screen-time-form.tsx` (+ test), `components/student/time-up-screen.tsx`, `components/student/outside-window-screen.tsx`, `lib/screen-time-api.ts` (`getStatus()`, `updateScreenTime()`, plus `isScreenTimeBlock(result)` — a type guard consumers use on any `ApiResult` whose error code is one of the two block codes), edits to the file-15 student home (status check on load + on tile tap) and the lesson/story pages (render the matching screen on a 423 result), and new keys in `locales/{en,bn}/parent.json` + `locales/{en,bn}/student.json`. Format "see you at 8:00!" with `new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" })` so Bangla renders correctly.

## Step-by-Step Plan

1. Write the failing `evaluateScreenTime` unit suite: no settings → allowed; under (29/30) → allowed; at (30/30) and over (31/30) → `TIME_LIMIT_REACHED`; inside/outside a normal window; a midnight-wrapping window (20:00–07:00 at 21:30 ✅, at 12:00 ❌); window boundary semantics (start inclusive, end exclusive); `OUTSIDE_WINDOW` wins when both would block; `hasInProgressLesson` overrides everything; `start === end` → open. (~30 min)
2. Implement the pure function + `toMinutes` + the `lib/time-of-day.ts` HH:MM ⇄ Time(0) helpers; extend `ErrorCode` with the two new codes. Green. (~20 min)
3. Add `screenTimeUpdateSchema` to `packages/types` with schema unit tests (valid combos, 17 → invalid, window half-set → invalid). (~15 min)
4. Write failing Supertest specs for the settings routes: PATCH creates then updates one row (upsert), GET returns defaults with no row, other parent's child → 404, no PIN grant → 401, bad body → 400. Implement `routes/screen-time.ts`. (~30 min)
5. Implement `getScreenTimeStatus` + `GET /api/screen-time/status` (401 without `activeChildProfileId`); Supertest with seeded heartbeats: under limit → `allowed: true`, fake-timer/seeded over-limit → `reason: "TIME_LIMIT_REACHED"`. (~25 min)
6. Implement `enforceScreenTime` middleware and mount it on the two content detail routes; Supertest: over-limit child gets 423 + correct code on lesson GET, an incomplete `LessonProgress` row exempts the same lesson (FR-TIME-03) while a *different* lesson still 423s, story GET 423s outside the window, step/complete endpoints still 200 while blocked. (~30 min)
7. Build the parent form (segmented limit picker, window toggle + time inputs) with an RTL test (renders current settings; submit sends the schema-shaped payload); add the child-card link. (~30 min)
8. Build `TimeUpScreen` / `OutsideWindowScreen` and wire the student home status check + 423 handling in lesson/story pages; RTL test that a `TIME_LIMIT_REACHED` status renders the time-up screen and `OUTSIDE_WINDOW` shows the formatted `windowStart`. (~25 min)
9. Manual pass: set a 15-min limit, learn past it (or seed events), confirm the mascot screen on home + lesson tap while an in-progress lesson still finishes; set a window excluding "now" and see "see you at …" in EN and BN. Then `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes, including every `evaluateScreenTime` case (under/at/over limit, inside/outside window, midnight wrap, precedence, in-progress exemption, no-settings default).
- [ ] `pnpm --filter web test` passes the screen-time form and lock-screen suites.
- [ ] `PATCH /api/children/:id/screen-time` called twice results in exactly one `ScreenTimeSetting` row; `GET` round-trips `"HH:MM"` values unchanged.
- [ ] With minutes ≥ limit, `GET /api/content/lessons/:id` for a *new* lesson returns `423 {"error":{"code":"TIME_LIMIT_REACHED",...}}`, while the same request for a lesson with an incomplete `LessonProgress` row returns 200, and `POST /api/progress/lessons/:id/step` keeps working until `completedAt` is set (FR-TIME-03).
- [ ] Outside the configured window, story and lesson starts return `423 OUTSIDE_WINDOW`; inside it they succeed (FR-TIME-04).
- [ ] In the browser, a blocked child sees the mascot time-up screen on the home load and on lesson tap — never a raw error (FR-TIME-02); the window screen shows the localized start time.
- [ ] Settings routes return 404 for another parent's child and 401 without the PIN grant (FR-TIME-05 behind the gate).
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.

## Out of Scope

- Learning-minute computation, heartbeats, and `APP_TIMEZONE` plumbing — delivered by file 27; this file only consumes `getLearningMinutes`.
- Parent dashboard display of time spent (file 29) and weekly-report aggregation (file 30).
- Per-parent timezone setting (post-MVP, per file 27's decision) and "warn at 5 minutes left" pre-emptive nudges (post-MVP polish).
- Admin-side defaults or platform-wide limits — screen time is strictly per-child, parent-owned.
