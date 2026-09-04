import { STREAK_MILESTONE_DAYS, type StreakMilestone } from "@kidlearn/types";
import {
  localDateIn,
  localDateToUtcMidnight,
  previousLocalDate,
} from "../lib/local-date.js";
import type { prisma } from "../lib/prisma.js";

/**
 * Learning streaks (FR-GAM-06) — consecutive local days with at least one
 * qualifying activity.
 */

/** What one activity did to the streak. */
export interface StreakUpdate {
  current: number;
  longest: number;
  /** `false` when the child had already been active today. */
  isNewDay: boolean;
  /** Set only on the update that *reaches* 3 or 7 — see `computeStreakUpdate`. */
  milestone: StreakMilestone;
}

/** The stored row, with its date already rendered as a local `yyyy-MM-dd`. */
export interface StreakState {
  current: number;
  longest: number;
  lastActivityDate: string | null;
}

/**
 * The whole of the streak rule, I/O-free so the day boundaries are testable
 * without a database or a clock.
 */
export function computeStreakUpdate(
  previous: StreakState,
  today: string,
  yesterday: string,
): StreakUpdate {
  if (previous.lastActivityDate === today) {
    return {
      current: previous.current,
      longest: previous.longest,
      isNewDay: false,
      milestone: null,
    };
  }

  const current =
    previous.lastActivityDate === yesterday ? previous.current + 1 : 1;

  return {
    current,
    longest: Math.max(previous.longest, current),
    isNewDay: true,
    milestone: milestoneAt(current),
  };
}

/** `3` or `7` exactly, never "past three". */
function milestoneAt(current: number): StreakMilestone {
  return STREAK_MILESTONE_DAYS.find((day) => day === current) ?? null;
}

/** The slice of the client this needs, so a transaction callback and the plain
 *  client are interchangeable. */
type StreakWriter = {
  streak: {
    findUnique: typeof prisma.streak.findUnique;
    upsert: typeof prisma.streak.upsert;
  };
};

/**
 * Records that this child was active on `localToday`, and answers what that did.
 */
export async function updateStreakForActivity(
  tx: StreakWriter,
  childId: string,
  localToday: string,
): Promise<StreakUpdate> {
  const existing = await tx.streak.findUnique({ where: { childId } });

  const update = computeStreakUpdate(
    {
      current: existing?.current ?? 0,
      longest: existing?.longest ?? 0,
      // `UTC`, not `APP_TIMEZONE`: the column is a bare `@db.Date` that Prisma
      // hands back as midnight UTC, so reading it in a negative-offset zone
      // would report the previous day and break every streak nightly.
      lastActivityDate:
        existing?.lastActivityDate == null
          ? null
          : localDateIn("UTC", existing.lastActivityDate),
    },
    localToday,
    previousLocalDate(localToday),
  );

  if (!update.isNewDay) return update;

  const row = {
    current: update.current,
    longest: update.longest,
    lastActivityDate: localDateToUtcMidnight(localToday),
  };
  await tx.streak.upsert({
    where: { childId },
    create: { childId, ...row },
    update: row,
  });

  return update;
}
