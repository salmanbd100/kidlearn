import { STREAK_MILESTONE_DAYS, type StreakMilestone } from "@kidlearn/types";
import type { prisma } from "../../config/prisma.js";
import {
  localDateIn,
  localDateToUtcMidnight,
  previousLocalDate,
} from "../../shared/utils/local-date.js";

export interface StreakUpdate {
  current: number;
  longest: number;
  isNewDay: boolean;
  /** Set only on the update that *reaches* 3 or 7 — see `computeStreakUpdate`. */
  milestone: StreakMilestone;
}

export interface StreakState {
  current: number;
  longest: number;
  lastActivityDate: string | null;
}

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

/** `Streak.current` resets only on the next activity, so a streak that broke on Wednesday would still show Monday's `current = 5` on Friday; a streak is live only if the last active day was today or yesterday. */
export function liveStreakLength(
  streak: { current: number; lastActivityDate: Date | null } | null,
  timeZone: string,
  now: Date = new Date(),
): number {
  if (streak === null || streak.lastActivityDate === null) return 0;

  const today = localDateIn(timeZone, now);
  const last = streak.lastActivityDate.toISOString().slice(0, 10);

  return last === today || last === previousLocalDate(today)
    ? streak.current
    : 0;
}

/** `3` or `7` exactly, never "past three". */
function milestoneAt(current: number): StreakMilestone {
  return STREAK_MILESTONE_DAYS.find((day) => day === current) ?? null;
}

/** Lets a transaction callback and the plain client be interchangeable. */
type StreakWriter = {
  streak: {
    findUnique: typeof prisma.streak.findUnique;
    upsert: typeof prisma.streak.upsert;
  };
};

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
      // `UTC`, not `APP_TIMEZONE`: the bare `@db.Date` column comes back as midnight UTC, so a negative-offset zone would report the previous day.
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
