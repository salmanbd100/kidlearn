import type { AIJobType } from "@kidlearn/db";
import { env } from "../../lib/env.js";
import { ApiError } from "../../lib/errors.js";
import { localDateIn, localDayStartUtc } from "../../lib/local-date.js";
import { prisma } from "../../lib/prisma.js";

/**
 * The daily ceiling on generation jobs (file 36).
 *
 * This exists because file 36 turned one click into *n* provider calls. A lesson
 * or a story generation is a single expensive call an admin decided to make; a
 * batch narration on an eight-page bilingual story is sixteen, and a misclick on
 * the wrong story is a bill nobody authorised. The cap is the floor under that.
 *
 * **Counted deployment-wide, not per administrator.** What is being protected is
 * a shared free tier, so a second admin's budget is the same budget.
 *
 * **Counted from `AIGenerationJob` rows rather than from a counter.** There is no
 * separate tally to drift, get out of step with a rollback, or need clearing: the
 * jobs table already records every generation ever attempted, including the failed
 * ones — which cost money too, and so must count against the cap. A counter would
 * also have to survive a process restart on a free tier that sleeps.
 *
 * **The day is the calendar day in `APP_TIMEZONE`**, the same day the reward grant
 * and the streak roll-over use. An admin working at 9am local time is in "today",
 * whatever UTC thinks.
 */

/** What a job costs, roughly. One ceiling per bucket rather than one overall. */
export type CostBucket = "text" | "audio" | "image";

/**
 * Which ceiling each job type is billed against.
 *
 * `satisfies Record<AIJobType, CostBucket>` is the drift guard: a new member of
 * Prisma's `AIJobType` is a compile error here until somebody decides what it
 * costs, rather than a job type that silently escapes every cap.
 */
const BUCKET_BY_TYPE = {
  lesson: "text",
  story: "text",
  quiz: "text",
  audio: "audio",
  image: "image",
} as const satisfies Record<AIJobType, CostBucket>;

const TYPES_BY_BUCKET: Record<CostBucket, AIJobType[]> = {
  text: [],
  audio: [],
  image: [],
};
for (const [type, bucket] of Object.entries(BUCKET_BY_TYPE)) {
  // `Object.entries` widens the key to `string`; the object above is exhaustive
  // over `AIJobType` by the `satisfies` clause, so this is a lost narrowing
  // rather than an unchecked claim.
  TYPES_BY_BUCKET[bucket].push(type as AIJobType);
}

/** Read at call time rather than frozen into a constant, so a test can pin it. */
function capFor(bucket: CostBucket): number {
  switch (bucket) {
    case "text":
      return env.AI_TEXT_JOBS_PER_DAY;
    case "audio":
      return env.AI_AUDIO_JOBS_PER_DAY;
    case "image":
      return env.AI_IMAGE_JOBS_PER_DAY;
  }
}

export function bucketFor(type: AIJobType): CostBucket {
  return BUCKET_BY_TYPE[type];
}

/** The instant the current `APP_TIMEZONE` day began, as UTC. */
export function startOfTodayInAppTz(now: Date = new Date()): Date {
  return localDayStartUtc(env.APP_TIMEZONE, localDateIn(env.APP_TIMEZONE, now));
}

export interface DailyBudget {
  bucket: CostBucket;
  cap: number;
  used: number;
  remaining: number;
}

export async function readDailyBudget(
  type: AIJobType,
  now?: Date,
): Promise<DailyBudget> {
  const bucket = bucketFor(type);
  const cap = capFor(bucket);
  const used = await prisma.aIGenerationJob.count({
    where: {
      type: { in: TYPES_BY_BUCKET[bucket] },
      createdAt: { gte: startOfTodayInAppTz(now) },
    },
  });

  return { bucket, cap, used, remaining: Math.max(cap - used, 0) };
}

/**
 * Refuses the whole request when it would take the bucket past its ceiling.
 *
 * `pending` is how many jobs the caller is *about* to create, which is why a
 * batch endpoint has to compute its missing pairs before calling this. Checking
 * one at a time would let a sixteen-clip batch start, spend eleven clips' worth of
 * quota, and stop halfway with five pages narrated and three not — a partial
 * result that costs money and still has to be finished tomorrow.
 *
 * `details` carries the arithmetic rather than only the verdict, so the CMS can
 * say "40 of 50 used, this needs 16" instead of "try again tomorrow".
 */
export async function assertWithinDailyCap(
  type: AIJobType,
  pending = 1,
): Promise<void> {
  const budget = await readDailyBudget(type);

  if (budget.used + pending > budget.cap) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Daily ${budget.bucket} generation cap (${budget.cap}) reached`,
      { bucket: budget.bucket, cap: budget.cap, used: budget.used, pending },
    );
  }
}
