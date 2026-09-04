import type { AIJobType } from "@kidlearn/db";
import { env } from "../../lib/env.js";
import { ApiError } from "../../lib/errors.js";
import { localDateIn, localDayStartUtc } from "../../lib/local-date.js";
import { prisma } from "../../lib/prisma.js";

// The daily ceiling on generation jobs (file 36).

/** What a job costs, roughly. One ceiling per bucket rather than one overall. */
export type CostBucket = "text" | "audio" | "image";

/** Which ceiling each job type is billed against. */
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

/** Refuses the whole request when it would take the bucket past its ceiling. */
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
