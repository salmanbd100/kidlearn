import { z } from "zod";
import { ok } from "./envelope.js";

/**
 * What a child has earned (FR-GAM-01, FR-GAM-02, FR-GAM-06..08).
 *
 * Every number here is the server's, computed from the append-only
 * `RewardLedger` — the client reports that a lesson finished and is told what
 * that was worth. There is no request shape in this file, and that absence is
 * the contract: **no endpoint accepts a reward amount or a reward type**
 * (FR-GAM-08). Rewards are earned; there is no purchase path to describe.
 */

/** A balance, which is a `SUM(amount)` over the ledger and never a counter. */
export const RewardTotalsSchema = z
  .object({
    stars: z.number().int().nonnegative(),
    coins: z.number().int().nonnegative(),
  })
  .strict();

export type RewardTotalsResponse = z.infer<typeof RewardTotalsSchema>;

/**
 * One badge a completion just unlocked (FR-GAM-04).
 *
 * `iconUrl` is `null` until the badge artwork lands, exactly as `imageUrl` is on
 * a character: the celebration draws a placeholder keyed on `slug` meanwhile, so
 * the art is a data change rather than a schema change.
 */
export const NewBadgeSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    iconUrl: z.string().nullable(),
  })
  .strict();

export type NewBadgeResponse = z.infer<typeof NewBadgeSchema>;

/** One avatar character a completion just unlocked (FR-GAM-05). */
export const NewCharacterSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
  })
  .strict();

export type NewCharacterResponse = z.infer<typeof NewCharacterSchema>;

/**
 * The two consecutive-day counts that get their own celebration (FR-GAM-06).
 *
 * A closed set rather than "every multiple of n": the day a streak first reaches
 * three and the day it first reaches seven are the two the product promises a
 * party for, and a client can therefore branch on the literal.
 */
export const STREAK_MILESTONE_DAYS = [3, 7] as const;

/**
 * `3` or `7` on the update that *reaches* that length, `null` on every other
 * update — including later days of the same streak, and including a second
 * completion on the milestone day itself. A milestone is a moment, not a state.
 */
export const StreakMilestoneSchema = z
  .union([z.literal(3), z.literal(7)])
  .nullable();

export type StreakMilestone = z.infer<typeof StreakMilestoneSchema>;

/**
 * The streak as the celebration needs it: how long it now is, and whether this
 * completion is the one that earned the flame.
 *
 * `longest` is deliberately absent. It is a parent-report figure (files 29–30),
 * and a child's celebration comparing today against their best week would be a
 * way of telling a four-year-old they used to do better.
 */
export const CompletionStreakSchema = z
  .object({
    current: z.number().int().nonnegative(),
    milestone: StreakMilestoneSchema,
  })
  .strict();

export type CompletionStreakResponse = z.infer<typeof CompletionStreakSchema>;

/**
 * The answer to `POST /api/progress/lessons/{id}/complete`.
 *
 * **`starsEarned` and `coinsEarned` are what this call granted, not what the
 * child has** — that is `totals`. Replaying a finished lesson grants nothing and
 * answers with two zeros and unchanged totals, which is correct and is also why
 * the celebration must not treat zero as a failure: it means "you already did
 * this one", and a four-year-old is owed the same fireworks either way.
 *
 * `newBadges` and `newCharacters` follow the same rule and for the same reason:
 * they carry what *this* call unlocked, so a replay sends two empty arrays
 * rather than re-announcing a badge the child was given last week.
 */
export const LessonCompletionSchema = z
  .object({
    starsEarned: z.number().int().nonnegative(),
    coinsEarned: z.number().int().nonnegative(),
    newBadges: z.array(NewBadgeSchema),
    newCharacters: z.array(NewCharacterSchema),
    streak: CompletionStreakSchema,
    totals: RewardTotalsSchema,
  })
  .strict();

export type LessonCompletionResponse = z.infer<typeof LessonCompletionSchema>;

export const LessonCompletionResponseSchema = ok(LessonCompletionSchema);

/**
 * The running totals behind the reward strip on the child's home screen
 * (FR-GAM-06).
 *
 * `badgeCount` rather than the badges themselves: the strip shows a number, and
 * a list of badge rows on every home-screen render would be a payload nobody
 * reads.
 *
 * `currentStreak` is the live `Streak.current`, computed server-side against a
 * calendar day in the deployment's `APP_TIMEZONE`. The strip renders it and
 * nothing else — there is no client-side day arithmetic anywhere, because a
 * device clock is something a child can change.
 */
export const RewardSummarySchema = RewardTotalsSchema.extend({
  badgeCount: z.number().int().nonnegative(),
  currentStreak: z.number().int().nonnegative(),
}).strict();

export type RewardSummaryResponse = z.infer<typeof RewardSummarySchema>;

export const RewardSummaryResponseSchema = ok(RewardSummarySchema);
