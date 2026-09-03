/**
 * The daily generation cap (file 36).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* One `jobs` array standing in for the table, and
 *     the stubbed `count` applies the real `where` clause to it. A queued number
 *     would make every assertion here a restatement of the number queued.
 *  2. *Assert the query, not just the result.* The two claims this file makes are
 *     both about the `where` clause — that a bucket counts only its own job types,
 *     and that the window starts at local midnight rather than UTC midnight — so
 *     the stub filters on `type.in` and `createdAt.gte` exactly as Postgres would
 *     and the tests read the count back.
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here
 *     reads content.
 *  4. *Name what the stub cannot prove.* Nothing rests on the database's own
 *     behaviour — no constraint, no cascade, no isolation. The count is a plain
 *     scan and the arithmetic on top of it is this module's.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../lib/env.js";
import { ApiError } from "../../lib/errors.js";

type Job = { type: string; createdAt: Date };

const store = vi.hoisted(() => ({ jobs: [] as Job[] }));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    aIGenerationJob: {
      count: async ({
        where,
      }: {
        where: { type: { in: string[] }; createdAt: { gte: Date } };
      }) =>
        store.jobs.filter(
          (job) =>
            where.type.in.includes(job.type) &&
            job.createdAt.getTime() >= where.createdAt.gte.getTime(),
        ).length,
    },
  },
}));

const { assertWithinDailyCap, readDailyBudget, startOfTodayInAppTz } =
  await import("./rate-guard.js");

/** `Asia/Dhaka` is UTC+6 and observes no DST, so local midnight is 18:00 UTC. */
const TIMEZONE_OFFSET_HOURS = 6;

function add(type: string, count: number, createdAt = new Date()): void {
  for (let index = 0; index < count; index += 1) {
    store.jobs.push({ type, createdAt });
  }
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
    // The cap is a ceiling on jobs created, not on jobs already there: the 50th
    // text job of the day is allowed and the 51st is not.
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
    // The CMS shows the admin how much budget is left, so a refusal that carried
    // only a message would make "generate 16 clips" indistinguishable from
    // "nothing left at all".
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
    // Sixteen clips with three left in the budget is not thirteen clips of
    // progress — it is a story narrated on five pages and silent on three, which
    // still has to be finished tomorrow and has already been paid for.
    add("audio", env.AI_AUDIO_JOBS_PER_DAY - 3);

    await expect(assertWithinDailyCap("audio", 16)).rejects.toBeInstanceOf(
      ApiError,
    );
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
    // 20:00 UTC is 02:00 the next day in Asia/Dhaka. A window starting at UTC
    // midnight would still be counting the previous local day, so a job created
    // at 02:00 local would be charged to a budget that had already reset.
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
