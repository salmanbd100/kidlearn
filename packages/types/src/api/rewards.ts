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
 * The badges a completion just unlocked.
 *
 * Always empty today: badge rules arrive in file 24, which widens this schema
 * and fills the array. It is in the contract now, and typed as an array of
 * nothing rather than left out, so a client can render the whole celebration
 * against a shape that will not change under it — and so the day badges exist,
 * this schema *has* to be widened deliberately rather than quietly starting to
 * carry objects nobody documented.
 */
// `.max(0)` is redundant against an item type of `never` and is here for the
// generated document, where `maxItems: 0` reads as "always empty" and the
// converted `never` (`items: { not: {} }`) does not.
export const NewBadgesSchema = z.array(z.never()).max(0);

/**
 * The answer to `POST /api/progress/lessons/{id}/complete`.
 *
 * **`starsEarned` and `coinsEarned` are what this call granted, not what the
 * child has** — that is `totals`. Replaying a finished lesson grants nothing and
 * answers with two zeros and unchanged totals, which is correct and is also why
 * the celebration must not treat zero as a failure: it means "you already did
 * this one", and a four-year-old is owed the same fireworks either way.
 */
export const LessonCompletionSchema = z
  .object({
    starsEarned: z.number().int().nonnegative(),
    coinsEarned: z.number().int().nonnegative(),
    newBadges: NewBadgesSchema,
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
 * reads. The gallery that does read them is file 24's.
 */
export const RewardSummarySchema = RewardTotalsSchema.extend({
  badgeCount: z.number().int().nonnegative(),
}).strict();

export type RewardSummaryResponse = z.infer<typeof RewardSummarySchema>;

export const RewardSummaryResponseSchema = ok(RewardSummarySchema);
