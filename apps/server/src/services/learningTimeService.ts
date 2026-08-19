import type { ChildProfile, Prisma } from "@kidlearn/db";
import type {
  ActivityEventReport,
  ActivityEventResponse,
  HeartbeatResponse,
  LearningTimeRange,
  LearningTimeResponse,
} from "@kidlearn/types";
import { env } from "../lib/env.js";
import { localDateIn, localDayStartUtc } from "../lib/local-date.js";
import { prisma } from "../lib/prisma.js";
import { requireVisibleLessonId } from "./lessonProgressService.js";
import { requireVisibleStoryId } from "./storyService.js";

/**
 * Learning time as a server-derived fact (FR-TIME-06, FR-DASH-02, FR-LSN-07).
 *
 * The client's whole vocabulary here is "I am still here". It sends no timestamp,
 * no duration and no total; the server stamps every `SessionEvent`, throttles how
 * fast beats may arrive, and derives minutes from the rows it wrote. So refreshing
 * the page, closing the tab, clearing storage or editing client state cannot lower
 * a recorded minute — there is nothing client-side for the figure to be stored in.
 *
 * The derivation is deliberately not a stored counter either. A counter has to be
 * incremented by something, and whatever increments it is a thing that can be
 * called twice, or not at all when a tablet's battery dies mid-lesson. Density over
 * an append-only log has neither failure mode: a sitting that ended without warning
 * is measured by where its beats stop.
 */

/**
 * Longer than this between two events and the child had walked away — a new
 * sitting rather than one long one.
 *
 * Three missed beats at the client's 30s cadence. Two would make an ordinary
 * dropped request look like a break; four would credit a minute and a half of an
 * empty room.
 */
export const LEARNING_TIME_GAP_MS = 90_000;

/**
 * What the last event of a sitting is worth on its own.
 *
 * A beat says "I was here for the interval this represents", so the interval after
 * the final one counts — otherwise a child who opened a lesson and answered one
 * question would have learned for zero minutes. It is also why a lone event is a
 * 30-second sitting rather than an instantaneous one.
 */
export const LEARNING_TIME_TAIL_MS = 30_000;

/**
 * Beats closer together than this are dropped.
 *
 * The client's cadence is 30s; the floor is 20s so ordinary jitter, a slow
 * response or a tab regaining focus mid-interval is never mistaken for tampering.
 * Below it, a client posting in a loop would inflate nothing — the row is not
 * written, so the density the minutes come from is unchanged.
 */
export const HEARTBEAT_MIN_INTERVAL_MS = 20_000;

/**
 * Minutes of presence in `[from, to)`, from the timestamps of events inside it.
 *
 * Pure, and it takes timestamps rather than a child id so the rules below are
 * testable as a table. It also never sees an event *type*, which is the point:
 * every kind of event counts, so a `lesson_complete` landing between two beats
 * keeps a sitting alive rather than starting a second one.
 *
 * Input may be unsorted — a Prisma `orderBy` is a promise about a query, not about
 * every future caller — so it is sorted here.
 */
export function computeLearningMinutes(
  timestamps: Date[],
  from: Date,
  to: Date,
): number {
  const inWindow = timestamps
    .map((timestamp) => timestamp.getTime())
    .filter((time) => time >= from.getTime() && time < to.getTime())
    .sort((a, b) => a - b);

  if (inWindow.length === 0) return 0;

  let totalMs = 0;
  let sessionStart = inWindow[0];
  let previous = inWindow[0];

  for (const time of inWindow.slice(1)) {
    if (time - previous > LEARNING_TIME_GAP_MS) {
      totalMs += previous - sessionStart + LEARNING_TIME_TAIL_MS;
      sessionStart = time;
    }
    previous = time;
  }
  totalMs += previous - sessionStart + LEARNING_TIME_TAIL_MS;

  return Math.round(totalMs / 60_000);
}

/**
 * The `[from, to)` a range name means, as UTC instants.
 *
 * Both edges are calendar boundaries in `timeZone`, not "now": `today` ends at the
 * coming local midnight. A window that ended at `now` would report a `to` that
 * moves every time it is asked, and a caller charting the period would have to
 * recompute the real edge in a zone it has no way to know.
 *
 * A sitting that crosses one of these edges is therefore split by whichever
 * window is queried, and each half is credited its own tail. That is a known
 * over-count of one beat interval per crossing, accepted because the alternative —
 * attributing a whole sitting to the day it began — makes a lesson finished at
 * 00:20 vanish from the day a parent watched it happen.
 *
 * Post-MVP: `timeZone` becomes a per-parent column instead of `env.APP_TIMEZONE`,
 * and this signature already takes it as an argument for that reason.
 */
export function learningTimeWindow(
  range: LearningTimeRange,
  now: Date,
  timeZone: string,
): { from: Date; to: Date } {
  const today = localDateIn(timeZone, now);

  if (range === "today") {
    return {
      from: localDayStartUtc(timeZone, today),
      to: localDayStartUtc(timeZone, addLocalDays(today, 1)),
    };
  }

  if (range === "week") {
    // `getUTCDay()` on the date string read as UTC midnight: the string carries no
    // zone of its own, which is what makes this arithmetic independent of both the
    // server's clock and DST (the same reason `previousLocalDate` works this way).
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    // Monday start (FR-DASH-02): Sunday is day 0 and is the *end* of its week, so
    // it walks back six days rather than none.
    const monday = addLocalDays(today, -((weekday + 6) % 7));
    return {
      from: localDayStartUtc(timeZone, monday),
      to: localDayStartUtc(timeZone, addLocalDays(monday, 7)),
    };
  }

  const [year, month] = today.split("-").map(Number);
  const nextMonth =
    month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  return {
    from: localDayStartUtc(timeZone, `${year}-${pad(month)}-01`),
    to: localDayStartUtc(timeZone, `${nextMonth}-01`),
  };
}

/** `days` either side of a `yyyy-MM-dd`, as a `yyyy-MM-dd`. */
function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function pad(month: number): string {
  return String(month).padStart(2, "0");
}

/**
 * FR-DASH-02 — how long this child has learned in one window.
 *
 * Exported for files 28 (limit enforcement), 29 (the dashboard, which asks for all
 * three) and 30 (weekly reports) so none of them re-derives minutes from raw rows.
 * A second implementation of the density rule is a second answer to "how long has
 * my child been on this today", and a limit that disagreed with the dashboard is
 * worse than either number.
 */
export async function getLearningMinutes(
  childId: string,
  range: LearningTimeRange,
): Promise<LearningTimeResponse> {
  const { from, to } = learningTimeWindow(range, new Date(), env.APP_TIMEZONE);

  const events = await prisma.sessionEvent.findMany({
    where: { childId, occurredAt: { gte: from, lt: to } },
    select: { occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  return {
    range,
    minutes: computeLearningMinutes(
      events.map((event) => event.occurredAt),
      from,
      to,
    ),
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

/**
 * Records one heartbeat and answers with the child's total for today.
 *
 * The throttle is the abuse guard: a client beating faster than every 20 seconds
 * has its extra beats dropped, so the density minutes are derived from cannot be
 * packed. It answers `200` with `recorded: false` rather than `429` — a dropped
 * beat is not a client error to handle, the next tick supersedes it, and a student
 * surface must never be handed a failure it would have to reason about.
 *
 * `minutesToday` is returned either way, and is what file 28 checks a daily limit
 * against. A dropped beat still gets an honest total: withholding it would make a
 * throttled client blind to a limit it is about to cross.
 */
export async function recordHeartbeat(
  child: ChildProfile,
): Promise<HeartbeatResponse> {
  const previous = await prisma.sessionEvent.findFirst({
    where: { childId: child.id, type: "heartbeat" },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });

  const isTooSoon =
    previous !== null &&
    Date.now() - previous.occurredAt.getTime() < HEARTBEAT_MIN_INTERVAL_MS;

  if (!isTooSoon) {
    await prisma.sessionEvent.create({
      data: { childId: child.id, type: "heartbeat" },
    });
  }

  const { minutes } = await getLearningMinutes(child.id, "today");
  return { recorded: !isTooSoon, minutesToday: minutes };
}

/**
 * Records one discrete activity event (FR-LSN-07).
 *
 * `refId` is resolved through the same visibility rule the content API serves the
 * row with, and a miss is the same `404` — so an event cannot name a draft lesson,
 * a story from another grade, or a uuid a client invented. Without that, the log
 * these minutes are derived from would accept anything, and a parent's report
 * would count time against content that was never opened.
 *
 * `occurredAt` is the column default. There is no field in the request that could
 * be a timestamp, which is a stronger statement than discarding one (FR-TIME-06).
 */
export async function recordActivityEvent(
  child: ChildProfile,
  report: ActivityEventReport,
): Promise<ActivityEventResponse> {
  const isStoryEvent =
    report.type === "story_start" || report.type === "story_complete";

  const refId = isStoryEvent
    ? await requireVisibleStoryId(child, report.refId)
    : await requireVisibleLessonId(child, report.refId);

  const payload: Prisma.InputJsonObject = { refId };

  const event = await prisma.sessionEvent.create({
    data: { childId: child.id, type: report.type, payload },
  });

  return {
    id: event.id,
    // The column holds Prisma's whole `SessionEventType`; the narrow union the
    // response promises is the value just written, which Zod already restricted
    // to the five surface milestones.
    type: report.type,
    occurredAt: event.occurredAt.toISOString(),
  };
}
