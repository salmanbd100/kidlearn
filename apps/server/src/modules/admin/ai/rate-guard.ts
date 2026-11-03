import type { AIJobType } from "@kidlearn/db";
import { env } from "../../../config/env.js";
import { prisma } from "../../../config/prisma.js";
import { ApiError } from "../../../shared/errors/errors.js";
import {
  localDateIn,
  localDayStartUtc,
} from "../../../shared/utils/local-date.js";

export type CostBucket = "text" | "audio" | "image";

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
  // Object.entries widens the key to string; BUCKET_BY_TYPE is exhaustive over AIJobType via `satisfies`.
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

export function startOfTodayInAppTz(now: Date = new Date()): Date {
  return localDayStartUtc(env.APP_TIMEZONE, localDateIn(env.APP_TIMEZONE, now));
}

export interface DailyBudget {
  bucket: CostBucket;
  cap: number;
  used: number;
  remaining: number;
}

type BudgetReader = Pick<typeof prisma, "aIGenerationJob">;

export async function readDailyBudget(
  type: AIJobType,
  now?: Date,
  client: BudgetReader = prisma,
): Promise<DailyBudget> {
  const bucket = bucketFor(type);
  const cap = capFor(bucket);
  const used = await client.aIGenerationJob.count({
    where: {
      type: { in: TYPES_BY_BUCKET[bucket] },
      // MCP drafts are written on the admin's own subscription and have their own cap (`assertWithinMcpDraftCap`).
      source: "gemini",
      createdAt: { gte: startOfTodayInAppTz(now) },
      // A job that failed before its first call spent nothing; counting it would let an outage
      // burn the day's budget and lock the admin out of retrying. Failures after a call were billed.
      NOT: {
        status: "failed",
        rawOutput: { path: ["usage", "attempts"], equals: 0 },
      },
    },
  });

  return { bucket, cap, used, remaining: Math.max(cap - used, 0) };
}

export async function assertWithinDailyCap(
  type: AIJobType,
  pending = 1,
  client: BudgetReader = prisma,
): Promise<void> {
  const budget = await readDailyBudget(type, undefined, client);

  if (budget.used + pending > budget.cap) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Daily ${budget.bucket} generation cap (${budget.cap}) reached`,
      { bucket: budget.bucket, cap: budget.cap, used: budget.used, pending },
    );
  }
}

type McpBudgetReader = Pick<typeof prisma, "aIGenerationJob">;

export interface McpDraftBudget {
  cap: number;
  used: number;
  remaining: number;
}

export async function readMcpDraftBudget(
  adminId: string,
  client: McpBudgetReader = prisma,
  now?: Date,
): Promise<McpDraftBudget> {
  const cap = env.MCP_DRAFTS_PER_DAY;
  const used = await client.aIGenerationJob.count({
    where: {
      source: "mcp",
      requestedById: adminId,
      createdAt: { gte: startOfTodayInAppTz(now) },
    },
  });
  return { cap, used, remaining: Math.max(cap - used, 0) };
}

/** Per admin, unlike the Gemini buckets: what it protects is the reviewers' queue, and one admin's assistant can fill it. */
export async function assertWithinMcpDraftCap(
  adminId: string,
  client: McpBudgetReader = prisma,
): Promise<void> {
  const budget = await readMcpDraftBudget(adminId, client);
  if (budget.used >= budget.cap) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Daily MCP draft cap (${budget.cap}) reached`,
      { bucket: "mcp", cap: budget.cap, used: budget.used, pending: 1 },
    );
  }
}
