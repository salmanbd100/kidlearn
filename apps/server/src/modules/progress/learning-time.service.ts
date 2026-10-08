import type { ChildProfile, Prisma } from "@kidlearn/db";
import type {
  ActivityEventReport,
  ActivityEventResponse,
  HeartbeatResponse,
  LearningTimeRange,
  LearningTimeResponse,
} from "@kidlearn/types";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import {
  addLocalDays,
  localDateIn,
  localDayStartUtc,
  localWeekBounds,
  mondayOfLocalWeek,
} from "../../shared/utils/local-date.js";
import { requireVisibleStoryId } from "../content/story.service.js";
import {
  evaluateStartForChild,
  screenTimeBlockedError,
} from "../screen-time/screen-time.service.js";
import { requireVisibleLessonId } from "./lesson-progress.service.js";
import {
  assertWithinClientEventBudget,
  recordBeatUnlessRecent,
} from "./session-event.service.js";

/** Longer than this between two events and the child had walked away: a new sitting. */
export const LEARNING_TIME_GAP_MS = 90_000;

/** What the last event of a sitting is worth on its own. */
export const LEARNING_TIME_TAIL_MS = 30_000;

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
    // Monday start (FR-DASH-02); bounds from `shared/utils/local-date.ts` so this and the weekly report agree on which seven days a week is.
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

export async function getLearningMinutes(
  childId: string,
  range: LearningTimeRange,
): Promise<LearningTimeResponse> {
  const [result] = await getLearningMinutesForRanges(childId, [range]);
  return result;
}

/** Fetches the events covering all windows once and sums each in memory, so today/week/month together do not scan today's beats three times. */
export async function getLearningMinutesForRanges(
  childId: string,
  ranges: readonly LearningTimeRange[],
): Promise<LearningTimeResponse[]> {
  const now = new Date();
  const windows = ranges.map((range) => ({
    range,
    ...learningTimeWindow(range, now, env.APP_TIMEZONE),
  }));
  if (windows.length === 0) return [];

  // The covering span, not the month alone: a week that began last month starts before it.
  const from = new Date(Math.min(...windows.map((w) => w.from.getTime())));
  const to = new Date(Math.max(...windows.map((w) => w.to.getTime())));

  const events = await prisma.sessionEvent.findMany({
    where: { childId, occurredAt: { gte: from, lt: to } },
    select: { occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  const timestamps = events.map((event) => event.occurredAt);

  return windows.map((window) => ({
    range: window.range,
    minutes: computeLearningMinutes(timestamps, window.from, window.to),
    from: window.from.toISOString(),
    to: window.to.toISOString(),
  }));
}

export async function recordHeartbeat(
  child: ChildProfile,
): Promise<HeartbeatResponse> {
  const recorded = await recordBeatUnlessRecent(child.id);
  const { minutes } = await getLearningMinutes(child.id, "today");
  return { recorded, minutesToday: minutes };
}

export async function recordActivityEvent(
  child: ChildProfile,
  report: ActivityEventReport,
): Promise<ActivityEventResponse> {
  const isStoryEvent =
    report.type === "story_start" || report.type === "story_complete";

  const refId = isStoryEvent
    ? await requireVisibleStoryId(child, report.refId)
    : await requireVisibleLessonId(child, report.refId);

  // A `story_start` is the evidence a story completion is paid against, and a recent one exempts that completion from the
  // screen-time gate; recording one while the gate is shut would manufacture that exemption.
  if (report.type === "story_start") {
    const decision = await evaluateStartForChild(child.id, undefined);
    if (!decision.allowed) throw screenTimeBlockedError(decision);
  }

  await assertWithinClientEventBudget(child.id);

  const payload: Prisma.InputJsonObject = { refId };

  const event = await prisma.sessionEvent.create({
    data: { childId: child.id, type: report.type, payload },
  });

  return {
    id: event.id,
    // The column holds the whole `SessionEventType`; the narrow union promised is the value just written,
    // which Zod restricted to the five milestones.
    type: report.type,
    occurredAt: event.occurredAt.toISOString(),
  };
}
