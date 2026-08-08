# 27 — Server-Side Learning Time Tracking

> **Estimated effort:** 3–4 hours
> **Depends on:** 06, 09, 16
> **Requirement IDs:** FR-TIME-06, FR-DASH-02 (data), FR-LSN-07
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Make learning time a server-derived fact: student surfaces send a lightweight heartbeat every 30 seconds plus discrete activity events, all stored as `SessionEvent` rows; a pure `computeLearningMinutes(events, from, to)` function turns heartbeat density into minutes (any gap > 90s breaks the session); parent-scoped aggregation endpoints expose today/week/month totals for the dashboard (FR-DASH-02), and today's total is exposed to the student session so file 28 can enforce limits. Because time is derived from server-recorded events, refreshing or closing the client can never reset it (FR-TIME-06).

## Context & Current State

- File 06 delivered the `SessionEvent` model: `id`, `childProfileId`, `type` (string), `payload Json?`, `createdAt` (UTC, indexed with `childProfileId`).
- File 09 gives better-auth sessions with `activeChildProfileId`; file 11's child routes established the "parent owns child" guard; file 16's lesson player already calls lesson lifecycle endpoints (start/step/complete) and records `LessonProgress.timeSpent` per lesson (FR-LSN-07) — this file adds the cross-feature wall-clock layer on top, and retrofits event emission into the player.
- File 26's story reader exists with a marked `trackEvent` call site. No heartbeat, event route, or time aggregation exists yet.

## Detailed Requirements

1. **Event ingestion** — `POST /api/events/heartbeat` (no body needed) and `POST /api/events/activity` with body `{ type: "lesson_start" | "step_complete" | "lesson_complete" | "story_start" | "story_complete", refId: string }`. Both require a session with `activeChildProfileId` (401 otherwise) and insert one `SessionEvent` row (`type: "heartbeat"` or the activity type, `payload: { refId }`). Server timestamps only — any client-sent timestamp is ignored (FR-TIME-06).
2. **Heartbeat cadence + abuse guard** — clients send every 30s; the server drops (200, `{ data: { recorded: false } }`) heartbeats arriving < 20s after the child's previous one, so a tampered fast client cannot inflate time.
3. **Heartbeat response carries today's minutes** — `POST /api/events/heartbeat` responds `{ data: { recorded: boolean, minutesToday: number } }`. This is the student session's view of its own total, consumed by file 28 for limit checks without a parent-scoped call.
4. **Pure computation** — `computeLearningMinutes(timestamps: Date[], from: Date, to: Date): number` in `src/services/learning-time.ts`, no I/O. Rules (binding):
   - Consider only timestamps within `[from, to)`; input may be unsorted — sort internally.
   - Consecutive events ≤ 90 000 ms apart belong to one session; a gap > 90s starts a new session.
   - Session duration = (last − first) + **30s tail credit** (the heartbeat interval the last event represents). A lone event is a 30s session.
   - Result = `Math.round(totalSeconds / 60)`; empty input → 0.
   All event types count, not just heartbeats — a `lesson_complete` between heartbeats keeps the session alive.
5. **Day/week/month boundaries** — computed in `env.APP_TIMEZONE` (Zod-parsed in `lib/env.ts`, default `"Asia/Dhaka"`); events are stored UTC and the range edges are converted (use `date-fns-tz`'s `fromZonedTime`). Sessions spanning midnight are split by the query range — the pre-midnight portion counts toward the earlier day (the tail credit lands in the queried range only). Document the post-MVP path: per-parent timezone column. Week = Monday 00:00; month = calendar month.
6. **Aggregation endpoint** — `GET /api/children/:id/learning-time?range=today|week|month` behind `requireParent` + ownership guard (404 for another parent's child, matching file 11): responds `{ data: { range, minutes, from, to } }`. Loads only the needed window of events (`createdAt >= from AND < to`, take advantage of the composite index).
7. **Internal service reuse** — expose `getLearningMinutes(childProfileId, range)` from the service so file 28 (enforcement), file 29 (dashboard, all three ranges in one call), and file 30 (weekly reports) reuse it instead of re-querying.
8. **Client hook** — `useHeartbeat()` in `apps/web`: posts the heartbeat every 30s **only while `document.visibilityState === "visible"`** (pause/resume on `visibilitychange`), sends one immediately on mount/visible, never retries on failure (next tick covers it), and returns the latest `minutesToday`. Mounted in the lesson player and story reader (student learning surfaces) — **not** in parent/admin layouts. Also export `trackEvent(type, refId)` (fire-and-forget `apiFetch`) and wire it into the file 16 lesson player (start/step/complete) and the file 26 reader (story_start on mount, story_complete on finish).
9. **Unit tests** — `computeLearningMinutes` is tested exhaustively: empty, single event, dense run, exact 90s gap (still one session), 91s gap (two sessions), unsorted input, events outside `[from, to)` ignored, midnight boundary split, and a realistic 20-minute fixture. `useHeartbeat` gets RTL tests with fake timers + mocked `visibilityState`.

## Technical Approach & Suggestions

**Server files** (`/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/services/learning-time.ts        # computeLearningMinutes (pure) + getLearningMinutes (Prisma)
src/services/learning-time.test.ts   # pure-function suite (no DB)
src/routes/events.ts                 # /api/events/heartbeat + /api/events/activity
src/routes/learning-time.ts          # GET /api/children/:id/learning-time (mount beside file 11's children router)
src/routes/events.test.ts            # Supertest: auth, throttle, minutesToday
src/lib/env.ts                       # + APP_TIMEZONE (default "Asia/Dhaka"); update .env.example
```

Core algorithm (binding semantics):

```ts
const GAP_MS = 90_000;
const TAIL_MS = 30_000;

export function computeLearningMinutes(timestamps: Date[], from: Date, to: Date): number {
  const ts = timestamps
    .map((d) => d.getTime())
    .filter((t) => t >= from.getTime() && t < to.getTime())
    .sort((a, b) => a - b);
  if (ts.length === 0) return 0;
  let totalMs = 0;
  let sessionStart = ts[0];
  let prev = ts[0];
  for (const t of ts.slice(1)) {
    if (t - prev > GAP_MS) {
      totalMs += prev - sessionStart + TAIL_MS;
      sessionStart = t;
    }
    prev = t;
  }
  totalMs += prev - sessionStart + TAIL_MS;
  return Math.round(totalMs / 60_000);
}
```

Range helper with `date-fns-tz`:

```ts
import { fromZonedTime, toZonedTime } from "date-fns-tz";
export function rangeBounds(range: "today" | "week" | "month", now: Date, tz: string): { from: Date; to: Date } {
  const local = toZonedTime(now, tz);
  // today: startOfDay(local) → +1 day; week: startOfWeek(local, { weekStartsOn: 1 }); month: startOfMonth(local)
  // convert each edge back with fromZonedTime(edge, tz); to = now-exclusive end works as "now" for live ranges
}
```

Activity-event Zod schema: `z.object({ type: z.enum(["lesson_start","step_complete","lesson_complete","story_start","story_complete"]), refId: z.string().min(1) })`. Throttle check: `prisma.sessionEvent.findFirst({ where: { childProfileId, type: "heartbeat" }, orderBy: { createdAt: "desc" } })` then compare — one indexed query, fine at MVP scale.

**Web files** (`/Users/salmanrahman/Documents/kidlearn/apps/web/`): `lib/use-heartbeat.ts` (hook + `trackEvent`), `lib/use-heartbeat.test.tsx`; edits to `components/student/lesson-player/*` (file 16) and `components/student/story-reader/reader.tsx` (file 26) to mount the hook and call `trackEvent`.

```ts
export function useHeartbeat(): { minutesToday: number | null } {
  // useEffect: send() immediately if visible; setInterval(send, 30_000);
  // visibilitychange listener clears/restarts the interval; cleanup on unmount.
  // send(): apiFetch<{ recorded: boolean; minutesToday: number }>("/api/events/heartbeat", { method: "POST", retries: 0 })
}
export function trackEvent(type: ActivityEventType, refId: string): void; // fire-and-forget, errors swallowed + console.warn in dev
```

Anti-tamper rationale to state in code comments and the PR: the client only ever says "I'm here" — the server assigns timestamps, throttles cadence, and derives minutes from stored rows, so refreshing, clearing storage, or editing client state cannot reduce recorded time (FR-TIME-06).

## Step-by-Step Plan

1. Write the failing `computeLearningMinutes` suite: empty, single (→ ~1 min? assert `Math.round(30s/60s)=1`... assert **1** for the lone-event 30s session is wrong — 30s rounds to 1? `Math.round(0.5)=1`; lock that in a test), 90s vs 91s gap, unsorted, out-of-range, midnight split, 20-min realistic fixture. (~30 min)
2. Implement the pure function + `rangeBounds`; add `APP_TIMEZONE` to env schema and `.env.example`. (~25 min)
3. Write failing Supertest specs for `/api/events/*`: 401 without session, heartbeat inserts row + returns `minutesToday`, sub-20s heartbeat returns `recorded: false` and inserts nothing, activity event validates `type`. (~25 min)
4. Implement `routes/events.ts` + `getLearningMinutes` (Prisma window query feeding the pure function); make tests pass. (~25 min)
5. Implement `GET /api/children/:id/learning-time` with ownership guard; Supertest: own child OK for all three ranges, other parent's child → 404, bad `range` → 400. (~25 min)
6. Write failing RTL tests for `useHeartbeat` (fake timers: fires at 0s and 30s; hidden tab stops it; visible resumes) then implement the hook + `trackEvent`. (~30 min)
7. Wire the hook + `trackEvent` calls into the lesson player and story reader; verify in the browser (network tab shows 30s cadence pausing on tab switch). (~20 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update tracker. (~10 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes, including all `computeLearningMinutes` cases (exact-90s gap merges, 91s splits, midnight boundary splits credit across days, empty → 0).
- [ ] `pnpm --filter web test` passes the `useHeartbeat` visibility/timer suite.
- [ ] `curl -X POST .../api/events/heartbeat` with a valid session cookie returns `{"data":{"recorded":true,"minutesToday":N}}`; an immediate second call returns `"recorded":false`.
- [ ] `GET /api/children/:id/learning-time?range=today` returns minutes for the owning parent and a 404 envelope for any other parent's child.
- [ ] After ~2 minutes inside a lesson in the browser, the dashboard endpoint reports ≥2 minutes; a hard refresh does not lower it (FR-TIME-06).
- [ ] Switching to another tab stops heartbeats (network tab); returning resumes them.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- Enforcing limits/windows and the 423 lockout responses — file 28 (it consumes `minutesToday` + `getLearningMinutes`).
- Dashboard UI for learning time (29) and weekly-report aggregation (30) — they call this file's service.
- Per-parent timezone setting (post-MVP; `APP_TIMEZONE` env is the MVP decision).
- Streak updates from activity events — file 24 already owns streaks.
