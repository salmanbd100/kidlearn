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
 *
 * **Server-side and nothing else.** The only input from outside is *that*
 * something was finished; which day that is, whether it extends yesterday and
 * what the streak now reads are all decided here, against a calendar day in the
 * deployment's `APP_TIMEZONE` (files 23 and 27 read the same variable, and they
 * must agree or a child could earn today's rewards twice). A device clock is
 * something a five-year-old can change in Settings.
 *
 * **A qualifying activity at MVP is a lesson completion**, and — when file 26
 * lands — a story completion. Raw heartbeats deliberately do not count: a streak
 * that could be kept by leaving a tablet open would measure the tablet.
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
 *
 * Three cases and no fourth: the same day changes nothing, yesterday extends,
 * and anything else — a gap, or a child's very first activity — starts again at
 * one. `longest` only ever climbs, because it is the record of what a child once
 * did and a broken streak does not un-do it.
 *
 * **`milestone` is a moment, not a state.** It is set on the update that reaches
 * 3 or 7 and on no other, so the flame plays once. A second lesson finished the
 * same day answers `null` (there is no new day, so nothing was reached), and so
 * does day four. The badge that goes with the milestone is a separate mechanism
 * with its own idempotency — `streak_days` rules read `current` and are granted
 * once by the ledger's unique index — precisely so a child who was already on a
 * five-day run when the badge was published still gets it.
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
 *
 * `localToday` is passed in rather than read from the clock here, for the reason
 * `grantLessonCompletion` reads it once: a Serializable retry must not straddle
 * local midnight and score the same activity against two different days.
 *
 * Nothing is written when the child had already been active today — the row
 * necessarily exists in that case, and rewriting it would churn a row per lesson
 * for no change.
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
