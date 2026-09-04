import type { ChildProfile, Prisma } from "@kidlearn/db";
import type {
  ActivityEventReport,
  ActivityEventResponse,
  HeartbeatResponse,
  LearningTimeRange,
  LearningTimeResponse,
} from "@kidlearn/types";
import { env } from "../lib/env.js";
import {
  addLocalDays,
  localDateIn,
  localDayStartUtc,
  localWeekBounds,
  mondayOfLocalWeek,
} from "../lib/local-date.js";
import { prisma } from "../lib/prisma.js";
import { requireVisibleLessonId } from "./lessonProgressService.js";
import { requireVisibleStoryId } from "./storyService.js";

/**
 * Learning time as a server-derived fact (FR-TIME-06, FR-DASH-02, FR-LSN-07).
 */

/**
 * Longer than this between two events and the child had walked away — a new
 * sitting rather than one long one.
 */
export const LEARNING_TIME_GAP_MS = 90_000;

/** What the last event of a sitting is worth on its own. */
export const LEARNING_TIME_TAIL_MS = 30_000;

/** Beats closer together than this are dropped. */
export const HEARTBEAT_MIN_INTERVAL_MS = 20_000;

/**
 * Minutes of presence in `[from, to)`, from the timestamps of events inside it.
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

/** The `[from, to)` a range name means, as UTC instants. */
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
    // Monday start (FR-DASH-02), and the bounds themselves from
    // `lib/local-date.ts` so this window and the weekly report (file 30) cannot
    // disagree about which seven days a week is.
    return localWeekBounds(timeZone, mondayOfLocalWeek(today));
  }

  const [year, month] = today.split("-").map(Number);
  const nextMonth =
    month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  return {
    from: localDayStartUtc(timeZone, `${year}-${pad(month)}-01`),
    to: localDayStartUtc(timeZone, `${nextMonth}-01`),
  };
}

function pad(month: number): string {
  return String(month).padStart(2, "0");
}

/** FR-DASH-02 — how long this child has learned in one window. */
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

/** Records one heartbeat and answers with the child's total for today. */
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

/** Records one discrete activity event (FR-LSN-07). */
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
