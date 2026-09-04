import type { ScreenTimeSetting } from "@kidlearn/db";
import type {
  ScreenTimeBlockCode,
  ScreenTimeSettingResponse,
  ScreenTimeStatusResponse,
  ScreenTimeUpdate,
} from "@kidlearn/types";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import {
  dateToTimeOfDay,
  timeOfDayToDate,
  toMinutesOfDay,
} from "../lib/time-of-day.js";
import { getLearningMinutes } from "./learningTimeService.js";

// Parental screen-time control (FR-TIME-01..05).

export type ScreenTimeDecision =
  | { allowed: true }
  | { allowed: false; code: ScreenTimeBlockCode };

export interface ScreenTimeInput {
  /** Server-derived minutes for the local day (file 27). */
  minutesToday: number;
  dailyLimitMinutes: number | null;
  /** Now, as `"HH:MM"` in `env.APP_TIMEZONE`. */
  localTime: string;
  windowStart: string | null;
  windowEnd: string | null;
  /** FR-TIME-03 — a lesson already under way is never interrupted. */
  hasInProgressLesson: boolean;
}

/** Whether this child may start something new. */
export function evaluateScreenTime(input: ScreenTimeInput): ScreenTimeDecision {
  if (input.hasInProgressLesson) return { allowed: true };

  const { windowStart, windowEnd } = input;
  // A zero-length window is treated as no window. It is what a parent gets by
  // dragging both inputs to the same value, it expresses nothing, and the only
  // other reading — "open for zero minutes" — locks a child out of the app all
  // day from a slip they would have no way to diagnose.
  if (windowStart !== null && windowEnd !== null && windowStart !== windowEnd) {
    const now = toMinutesOfDay(input.localTime);
    const start = toMinutesOfDay(windowStart);
    const end = toMinutesOfDay(windowEnd);

    // Minutes-of-day rather than clock arithmetic, which is what keeps the
    // midnight wrap to one comparison: an evening-to-morning window is simply the
    // complement of the daytime one it would otherwise be.
    const isInside =
      start < end ? now >= start && now < end : now >= start || now < end;
    if (!isInside) return { allowed: false, code: "OUTSIDE_WINDOW" };
  }

  // At the limit blocks, not past it: a child whose parent allowed thirty minutes
  // has had thirty minutes.
  if (
    input.dailyLimitMinutes !== null &&
    input.minutesToday >= input.dailyLimitMinutes
  ) {
    return { allowed: false, code: "TIME_LIMIT_REACHED" };
  }

  return { allowed: true };
}

/** Now, as the `"HH:MM"` the window is expressed in. */
export function localTimeOfDay(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: env.APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    // `hour12: false` renders midnight as hour 24 on some ICU builds; `h23` is
    // the cycle that does not. Same reason as `lib/local-date.ts`.
    hourCycle: "h23",
  }).format(instant);
}

/** The stored policy as the API speaks it. A missing row is "no limits". */
export function toScreenTimeSettingResponse(
  setting: ScreenTimeSetting | null,
): ScreenTimeSettingResponse {
  return {
    dailyLimitMinutes: setting?.dailyLimitMinutes ?? null,
    windowStart: setting?.windowStart
      ? dateToTimeOfDay(setting.windowStart)
      : null,
    windowEnd: setting?.windowEnd ? dateToTimeOfDay(setting.windowEnd) : null,
  };
}

export function getScreenTimeSetting(
  childId: string,
): Promise<ScreenTimeSetting | null> {
  return prisma.screenTimeSetting.findUnique({ where: { childId } });
}

/** FR-TIME-01/04/05 — stores one child's whole policy. */
export async function saveScreenTimeSetting(
  childId: string,
  update: ScreenTimeUpdate,
): Promise<ScreenTimeSettingResponse> {
  const data = {
    dailyLimitMinutes: update.dailyLimitMinutes,
    windowStart:
      update.windowStart === null ? null : timeOfDayToDate(update.windowStart),
    windowEnd:
      update.windowEnd === null ? null : timeOfDayToDate(update.windowEnd),
  };

  const saved = await prisma.screenTimeSetting.upsert({
    where: { childId },
    create: { childId, ...data },
    update: data,
  });

  return toScreenTimeSettingResponse(saved);
}

/**
 * "May I start something new?" — the student surface's own read (FR-TIME-02/04).
 */
export async function getScreenTimeStatus(
  childId: string,
): Promise<ScreenTimeStatusResponse> {
  const [setting, learningTime] = await Promise.all([
    getScreenTimeSetting(childId),
    getLearningMinutes(childId, "today"),
  ]);

  const settings = toScreenTimeSettingResponse(setting);
  const decision = evaluateScreenTime({
    minutesToday: learningTime.minutes,
    localTime: localTimeOfDay(),
    hasInProgressLesson: false,
    ...settings,
  });

  return {
    allowed: decision.allowed,
    reason: decision.allowed ? null : decision.code,
    minutesToday: learningTime.minutes,
    ...settings,
  };
}

/** How stale an incomplete lesson may be and still count as "under way". */
export const LESSON_RESUME_GRACE_MS = 30 * 60_000;

/**
 * The middleware's variant: the same decision, for a child who has named the
 * lesson they want (FR-TIME-03).
 */
export async function evaluateStartForChild(
  childId: string,
  lessonId: string | undefined,
): Promise<ScreenTimeDecision & { details: ScreenTimeStatusResponse }> {
  const status = await getScreenTimeStatus(childId);

  // The cheap path: nothing is configured, so no progress lookup is worth a query.
  if (status.allowed) return { allowed: true, details: status };

  const hasInProgressLesson =
    lessonId === undefined
      ? false
      : await isLessonInProgress(childId, lessonId);

  const decision = evaluateScreenTime({
    minutesToday: status.minutesToday,
    dailyLimitMinutes: status.dailyLimitMinutes,
    localTime: localTimeOfDay(),
    windowStart: status.windowStart,
    windowEnd: status.windowEnd,
    hasInProgressLesson,
  });

  return decision.allowed
    ? { allowed: true, details: status }
    : { allowed: false, code: decision.code, details: status };
}

async function isLessonInProgress(
  childId: string,
  lessonId: string,
): Promise<boolean> {
  const progress = await prisma.lessonProgress.findUnique({
    where: { childId_lessonId: { childId, lessonId } },
    select: { completedAt: true, updatedAt: true },
  });

  if (progress === null || progress.completedAt !== null) return false;

  return Date.now() - progress.updatedAt.getTime() <= LESSON_RESUME_GRACE_MS;
}
