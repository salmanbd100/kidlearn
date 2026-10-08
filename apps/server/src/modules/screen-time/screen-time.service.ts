import type { ScreenTimeSetting } from "@kidlearn/db";
import type {
  ScreenTimeBlockCode,
  ScreenTimeSettingResponse,
  ScreenTimeStatusResponse,
  ScreenTimeUpdate,
} from "@kidlearn/types";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import {
  dateToTimeOfDay,
  timeOfDayToDate,
  toMinutesOfDay,
} from "../../shared/utils/time-of-day.js";
import { getLearningMinutes } from "../progress/learning-time.service.js";

export type ScreenTimeDecision =
  | { allowed: true }
  | { allowed: false; code: ScreenTimeBlockCode };

export interface ScreenTimeInput {
  /** Server-derived minutes for the local day. */
  minutesToday: number;
  dailyLimitMinutes: number | null;
  localTime: string;
  windowStart: string | null;
  windowEnd: string | null;
  /** FR-TIME-03 — a lesson already under way is never interrupted. */
  hasInProgressLesson: boolean;
}

export function evaluateScreenTime(input: ScreenTimeInput): ScreenTimeDecision {
  if (input.hasInProgressLesson) return { allowed: true };

  const { windowStart, windowEnd } = input;
  // A zero-length window is treated as no window: "open for zero minutes" would lock the child out all day from a slip a parent cannot diagnose.
  if (windowStart !== null && windowEnd !== null && windowStart !== windowEnd) {
    const now = toMinutesOfDay(input.localTime);
    const start = toMinutesOfDay(windowStart);
    const end = toMinutesOfDay(windowEnd);

    // Minutes-of-day keeps the midnight wrap to one comparison: an evening-to-morning window is the complement of the daytime one.
    const isInside =
      start < end ? now >= start && now < end : now >= start || now < end;
    if (!isInside) return { allowed: false, code: "OUTSIDE_WINDOW" };
  }

  // At the limit blocks, not past it: thirty allowed minutes means thirty minutes had.
  if (
    input.dailyLimitMinutes !== null &&
    input.minutesToday >= input.dailyLimitMinutes
  ) {
    return { allowed: false, code: "TIME_LIMIT_REACHED" };
  }

  return { allowed: true };
}

export function localTimeOfDay(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: env.APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    // `hour12: false` renders midnight as hour 24 on some ICU builds; `h23` is
    // the cycle that does not. Same reason as `shared/utils/local-date.ts`.
    hourCycle: "h23",
  }).format(instant);
}

/** A missing row is "no limits". */
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

export const LESSON_RESUME_GRACE_MS = 30 * 60_000;

/** Caps how long after first open a lesson counts as "under way": `updatedAt` moves on every step report, so a client re-reporting a step would hold the grace open for ever. */
export const LESSON_RESUME_CEILING_MS = 3 * 60 * 60_000;

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
    select: { completedAt: true, updatedAt: true, startedAt: true },
  });

  if (progress === null || progress.completedAt !== null) return false;

  const now = Date.now();
  return (
    now - progress.updatedAt.getTime() <= LESSON_RESUME_GRACE_MS &&
    now - progress.startedAt.getTime() <= LESSON_RESUME_CEILING_MS
  );
}

export function screenTimeBlockedError(
  decision: Extract<
    Awaited<ReturnType<typeof evaluateStartForChild>>,
    { allowed: false }
  >,
): ApiError {
  return new ApiError(
    423,
    decision.code,
    decision.code === "TIME_LIMIT_REACHED"
      ? "Today's learning time is used up"
      : "Outside the allowed access window",
    // The client cannot recompute any of this (no settings, no trustworthy clock) and the window screen must name the hour to come back at.
    {
      minutesToday: decision.details.minutesToday,
      dailyLimitMinutes: decision.details.dailyLimitMinutes,
      windowStart: decision.details.windowStart,
      windowEnd: decision.details.windowEnd,
    },
  );
}
