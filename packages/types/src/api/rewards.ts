import { z } from "zod";
import { ok } from "./envelope.js";

// What a child has earned (FR-GAM-01, FR-GAM-02, FR-GAM-06..08).

/** A balance, which is a `SUM(amount)` over the ledger and never a counter. */
export const RewardTotalsSchema = z
  .object({
    stars: z.number().int().nonnegative(),
    coins: z.number().int().nonnegative(),
  })
  .strict();

export type RewardTotalsResponse = z.infer<typeof RewardTotalsSchema>;

/** One badge a completion just unlocked (FR-GAM-04). */
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
 */
export const CompletionStreakSchema = z
  .object({
    current: z.number().int().nonnegative(),
    milestone: StreakMilestoneSchema,
  })
  .strict();

export type CompletionStreakResponse = z.infer<typeof CompletionStreakSchema>;

/** The answer to `POST /api/progress/lessons/{id}/complete`. */
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

/** The answer to `POST /api/progress/stories/{id}/complete` (FR-STORY-07). */
export const StoryCompletionSchema = z
  .object({
    alreadyCompleted: z.boolean(),
    /** `{ stars: 1, coins: 5 }` on the first finish, `null` on every replay. */
    granted: RewardTotalsSchema.nullable(),
  })
  .strict();

export type StoryCompletionResponse = z.infer<typeof StoryCompletionSchema>;

export const StoryCompletionResponseSchema = ok(StoryCompletionSchema);

/**
 * The running totals behind the reward strip on the child's home screen
 * (FR-GAM-06).
 */
export const RewardSummarySchema = RewardTotalsSchema.extend({
  badgeCount: z.number().int().nonnegative(),
  currentStreak: z.number().int().nonnegative(),
}).strict();

export type RewardSummaryResponse = z.infer<typeof RewardSummarySchema>;

export const RewardSummaryResponseSchema = ok(RewardSummarySchema);
