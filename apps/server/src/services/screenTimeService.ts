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

/**
 * Parental screen-time control (FR-TIME-01..05).
 *
 * The rule is enforced **server-side, at the moment a child asks to start
 * something new**, and nowhere else. A limit the client applied would be a limit a
 * child could lift by refreshing, and the minutes it is compared against are
 * already server-derived (file 27) — so having the decision anywhere but here
 * would put a trustworthy number behind an untrustworthy gate.
 *
 * The decision itself is a pure function with no I/O, tested as a table. Two
 * callers reach it: the status read the student surface polls, and the middleware
 * in front of the two content-start endpoints. They must not be able to disagree —
 * a child told "you may start" by one and refused by the other is the worst
 * possible version of this feature — so there is one implementation and the
 * callers differ only in what they can observe.
 */

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

/**
 * Whether this child may start something new.
 *
 * Order is part of the contract, not an implementation detail. The exemption
 * outranks both rules; the window then outranks the limit, because the window is
 * the block that can tell a child *when to come back* and "see you at 8 o'clock"
 * is something a five-year-old can act on where "come back tomorrow" is not.
 */
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

/**
 * FR-TIME-01/04/05 — stores one child's whole policy.
 *
 * An upsert on the unique `childId` rather than a create-then-update: there is at
 * most one policy per child by construction, and the first save from a parent who
 * has never opened this screen must not be a different code path from the second.
 */
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
 *
 * `hasInProgressLesson` is `false` here and cannot be anything else: the question
 * this endpoint answers is about starting, and the exemption is about a specific
 * lesson the caller has not named. The middleware, which *has* a lesson id, is
 * where the exemption is decided.
 *
 * The settings travel with the verdict because a lock screen has to say when to
 * come back, and `windowStart` is the only value that can answer that.
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

/**
 * How stale an incomplete lesson may be and still count as "under way".
 *
 * The exemption exists for the child who is *in* a lesson right now — the one who
 * would otherwise lose the quiz they just answered — so it has to be bounded by
 * something. Without a bound, one abandoned lesson is a permanent hole in both
 * rules: a row is written on the first step and only ever cleared by finishing, so
 * a lesson half-started on Monday would still be served at 3am on Wednesday, past
 * the cap and outside the window, for as long as the child never completed it.
 *
 * Thirty minutes, against `updatedAt`, which a step report restamps. Generous
 * enough for the gaps that are really one sitting — a five-minute video step, a
 * refresh, a child called away to the table mid-lesson — and short enough that
 * yesterday's abandoned lesson is a new start, which is what it is.
 */
export const LESSON_RESUME_GRACE_MS = 30 * 60_000;

/**
 * The middleware's variant: the same decision, for a child who has named the
 * lesson they want (FR-TIME-03).
 *
 * `hasInProgressLesson` is an incomplete `LessonProgress` row *touched within
 * `LESSON_RESUME_GRACE_MS`*, so a finished lesson being replayed is a new start
 * and so is one abandoned days ago — which is the whole distinction the exemption
 * rests on. Nothing is exempt for a story: the reader holds every page
 * client-side once it has them, so mid-story reading is never interrupted by this
 * gate and there is no half-finished state to protect.
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
