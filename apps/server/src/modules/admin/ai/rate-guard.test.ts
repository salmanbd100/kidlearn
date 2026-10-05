/**
 * Stubs `config/prisma.js` under the recorded exception in `general.md §5`:
 *  1. State, not answers: one `jobs` array; the stubbed `count` applies the real `where` clause to it.
 *  2. Assert the query: both claims are about the `where` clause (a bucket counts only its own job types; the
 *     window starts at local, not UTC, midnight), so the stub filters on `type.in` and `createdAt.gte` as Postgres would.
 *  3. `include` gates: not applicable, nothing here reads content.
 *  4. Not provable: nothing rests on database behaviour; the count is a plain scan.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { ApiError } from "../../../shared/errors/errors.js";

type Job = {
  type: string;
  createdAt: Date;
  status: string;
  rawOutput: { usage?: { attempts?: number } } | null;
};

const store = vi.hoisted(() => ({ jobs: [] as Job[] }));

type CountWhere = {
  type: { in: string[] };
  createdAt: { gte: Date };
  NOT: {
    status: string;
    rawOutput: { path: string[]; equals: number };
  };
};

vi.mock("../../../config/prisma.js", () => ({
  prisma: {
    aIGenerationJob: {
      count: async ({ where }: { where: CountWhere }) =>
        store.jobs.filter(
          (job) =>
            where.type.in.includes(job.type) &&
            job.createdAt.getTime() >= where.createdAt.gte.getTime() &&
            !excludedBy(where.NOT, job),
        ).length,
    },
  },
}));

// Postgres's reading of `NOT`: a row is excluded only when every term matches; a JSON path into a null column
// matches nothing, so an in-flight job is never excluded.
function excludedBy(not: CountWhere["NOT"], job: Job): boolean {
  if (job.status !== not.status) return false;
  const value = not.rawOutput.path.reduce<unknown>(
    (node, key) =>
      typeof node === "object" && node !== null
        ? (node as Record<string, unknown>)[key]
        : undefined,
    job.rawOutput,
  );
  return value === not.rawOutput.equals;
}

const { assertWithinDailyCap, readDailyBudget, startOfTodayInAppTz } =
  await import("./rate-guard.js");

/** `Asia/Dhaka` is UTC+6 and observes no DST, so local midnight is 18:00 UTC. */
const TIMEZONE_OFFSET_HOURS = 6;

function add(type: string, count: number, createdAt = new Date()): void {
  for (let index = 0; index < count; index += 1) {
    store.jobs.push({
      type,
      createdAt,
      status: "awaiting_review",
      rawOutput: { usage: { attempts: 1 } },
    });
  }
}

function addJob(type: string, job: Omit<Job, "type" | "createdAt">): void {
  store.jobs.push({ type, createdAt: new Date(), ...job });
}

beforeEach(() => {
  store.jobs = [];
});

describe("the daily cap", () => {
  it("passes a request that fits inside the remaining budget", async () => {
    add("lesson", env.AI_TEXT_JOBS_PER_DAY - 1);

    await expect(assertWithinDailyCap("lesson")).resolves.toBeUndefined();
  });

  it("passes the request that lands exactly on the cap", async () => {
    // The cap is a ceiling on jobs created: the 50th text job of the day is allowed, the 51st is not.
    add("lesson", env.AI_TEXT_JOBS_PER_DAY - 1);

    await expect(assertWithinDailyCap("lesson", 1)).resolves.toBeUndefined();
  });

  it("throws a 429 RATE_LIMITED once the cap is reached", async () => {
    add("lesson", env.AI_TEXT_JOBS_PER_DAY);

    const error = await assertWithinDailyCap("lesson").catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(429);
    expect((error as ApiError).code).toBe("RATE_LIMITED");
  });

  it("reports the arithmetic in details, not just the verdict", async () => {
    // The CMS shows the remaining budget, so a refusal with only a message would blur "generate 16 clips" with "nothing left".
    add("audio", env.AI_AUDIO_JOBS_PER_DAY - 2);

    const error = (await assertWithinDailyCap("audio", 5).catch(
      (thrown: unknown) => thrown,
    )) as ApiError;

    expect(error.details).toEqual({
      bucket: "audio",
      cap: env.AI_AUDIO_JOBS_PER_DAY,
      used: env.AI_AUDIO_JOBS_PER_DAY - 2,
      pending: 5,
    });
  });

  it("refuses a batch that would only partly fit rather than starting it", async () => {
    // A partly fitting batch leaves a story narrated on some pages and silent on others, already paid for.
    add("audio", env.AI_AUDIO_JOBS_PER_DAY - 3);

    await expect(assertWithinDailyCap("audio", 16)).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe("what a job has to have cost to count", () => {
  it("does not bill a job that failed before it ever called the model", async () => {
    // An unreachable model or bad key fails every job instantly at no cost; counting those would spend the budget on nothing and lock the admin out of retrying.
    addJob("lesson", {
      status: "failed",
      rawOutput: { usage: { attempts: 0 } },
    });

    await expect(readDailyBudget("lesson")).resolves.toMatchObject({
      used: 0,
      remaining: env.AI_TEXT_JOBS_PER_DAY,
    });
  });

  it("bills a job that failed after calling, because those calls were billed", async () => {
    addJob("lesson", {
      status: "failed",
      rawOutput: { usage: { attempts: 2 } },
    });

    await expect(readDailyBudget("lesson")).resolves.toMatchObject({ used: 1 });
  });

  it("bills a job still in flight, which is about to spend", async () => {
    // `rawOutput` is null until the job finishes, so there is no usage to read; unfinished is not free.
    addJob("lesson", { status: "generating", rawOutput: null });

    await expect(readDailyBudget("lesson")).resolves.toMatchObject({ used: 1 });
  });

  it("bills a job that succeeded", async () => {
    addJob("lesson", {
      status: "awaiting_review",
      rawOutput: { usage: { attempts: 1 } },
    });

    await expect(readDailyBudget("lesson")).resolves.toMatchObject({ used: 1 });
  });

  it("lets a day of free failures leave the budget untouched", async () => {
    for (let index = 0; index < env.AI_TEXT_JOBS_PER_DAY * 3; index += 1) {
      addJob("lesson", {
        status: "failed",
        rawOutput: { usage: { attempts: 0 } },
      });
    }

    await expect(assertWithinDailyCap("lesson")).resolves.toBeUndefined();
  });
});

describe("the three buckets", () => {
  it("bills lesson, story and quiz jobs against one shared text ceiling", async () => {
    add("lesson", 2);
    add("story", 3);
    add("quiz", 4);

    await expect(readDailyBudget("story")).resolves.toMatchObject({
      bucket: "text",
      used: 9,
    });
  });

  it("does not let a day of audio work eat into the text budget", async () => {
    add("audio", env.AI_AUDIO_JOBS_PER_DAY);
    add("image", env.AI_IMAGE_JOBS_PER_DAY);

    await expect(readDailyBudget("lesson")).resolves.toMatchObject({
      bucket: "text",
      used: 0,
    });
    await expect(assertWithinDailyCap("lesson")).resolves.toBeUndefined();
  });

  it("counts image jobs only against the image ceiling", async () => {
    add("image", 7);

    await expect(readDailyBudget("image")).resolves.toMatchObject({
      bucket: "image",
      used: 7,
      remaining: env.AI_IMAGE_JOBS_PER_DAY - 7,
    });
    await expect(readDailyBudget("audio")).resolves.toMatchObject({ used: 0 });
  });
});

describe("where the day starts", () => {
  it("counts from local midnight, so an evening job is not tomorrow's", async () => {
    // 20:00 UTC is 02:00 the next day in Asia/Dhaka: a window starting at UTC midnight would charge it to a budget that had already reset.
    const localMidnight = startOfTodayInAppTz(
      new Date("2026-09-03T20:00:00.000Z"),
    );

    expect(localMidnight.toISOString()).toBe("2026-09-03T18:00:00.000Z");
  });

  it("excludes a job created before local midnight", async () => {
    const now = new Date("2026-09-03T20:00:00.000Z");
    const beforeLocalMidnight = new Date("2026-09-03T17:59:00.000Z");
    add("lesson", 5, beforeLocalMidnight);

    await expect(readDailyBudget("lesson", now)).resolves.toMatchObject({
      used: 0,
    });
  });

  it("includes a job created after local midnight", async () => {
    const now = new Date("2026-09-03T20:00:00.000Z");
    add("lesson", 5, new Date("2026-09-03T18:01:00.000Z"));

    await expect(readDailyBudget("lesson", now)).resolves.toMatchObject({
      used: 5,
    });
  });

  it("puts local midnight six hours behind UTC midnight for Asia/Dhaka", () => {
    const instant = new Date("2026-09-03T09:00:00.000Z");
    const utcMidnight = new Date("2026-09-03T00:00:00.000Z");

    expect(
      (utcMidnight.getTime() - startOfTodayInAppTz(instant).getTime()) /
        3_600_000,
    ).toBe(TIMEZONE_OFFSET_HOURS);
  });
});
