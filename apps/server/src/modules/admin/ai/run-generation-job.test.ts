/**
 * Stubs `config/prisma.js` under the recorded exception in `general.md §5`; the four bounds:
 *  1. Stub state: one `aiGenerationJob` array; `create` pushes and `update` mutates, so assertions read the written row.
 *  2. `statusWrites` records every `status` sent, in order, which proves `pending → generating → awaiting_review`.
 *  3. Not applicable: no route reads these rows and nothing here is student-facing.
 *  4. The stub's `$transaction` cannot roll back, so "persistence is skipped" cases assert `persist` was never called;
 *     that a thrown `persist` leaves no rows is Postgres's guarantee.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

type JobRow = Record<string, unknown> & { id: string; status: string };

const store = vi.hoisted(() => ({
  jobs: [] as JobRow[],
  statusWrites: [] as string[],
}));

vi.mock("../../../config/prisma.js", () => {
  const client = {
    aIGenerationJob: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: JobRow = {
          id: `job-${store.jobs.length + 1}`,
          status: "pending",
          rawOutput: null,
          ...data,
        };
        store.jobs.push(row);
        store.statusWrites.push(String(row.status));
        return row;
      },
      count: async () => store.jobs.length,
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: { in: string[] }; updatedAt: { lt: Date } };
        data: Record<string, unknown>;
      }) => {
        const stale = store.jobs.filter(
          (row) =>
            where.status.in.includes(row.status) &&
            row.updatedAt instanceof Date &&
            row.updatedAt < where.updatedAt.lt,
        );
        for (const row of stale) Object.assign(row, data);
        return { count: stale.length };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.jobs.find((one) => one.id === where.id);
        if (!row) throw new Error(`no such job ${where.id}`);
        Object.assign(row, data);
        if (typeof data.status === "string")
          store.statusWrites.push(data.status);
        return row;
      },
    },
    // The stub cannot roll back — see bound 4 in this file's header.
    $transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> =>
      run(client),
  };

  return { prisma: client };
});

const { runGenerationJob } = await import("./run-generation-job.js");

const Schema = z.object({ title: z.string().min(1) }).strict();

const VALID = { title: "The letter A" };
const INVALID = { title: "" };

const USAGE = { inputTokens: 1200, outputTokens: 800 };

function job(): JobRow {
  const row = store.jobs[0];
  if (!row) throw new Error("no job was created");
  return row;
}

function rawOutput(): Record<string, unknown> {
  return job().rawOutput as Record<string, unknown>;
}

function attempts(): Array<Record<string, unknown>> {
  return rawOutput().attempts as Array<Record<string, unknown>>;
}

beforeEach(() => {
  store.jobs = [];
  store.statusWrites = [];
});

describe("the daily cap, checked where the row is created", () => {
  it("refuses with 429 and writes no row when the day's budget is already spent", async () => {
    // Parallel requests all pass the request-level check; this transaction-level check is the one that holds.
    const cap = Number(process.env.AI_TEXT_JOBS_PER_DAY ?? 3);
    store.jobs = Array.from({ length: cap }, (_, index) => ({
      id: `spent-${index}`,
      status: "awaiting_review",
    }));
    const generate = vi.fn();

    await expect(
      runGenerationJob({
        type: "lesson",
        input: {},
        generate,
        schema: Schema,
        persist: async () => ({}),
      }),
    ).rejects.toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });

    expect(store.jobs).toHaveLength(cap);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("a job a crash left behind", () => {
  it("is failed before the next run, so its pair can be generated again", async () => {
    // Stranded by a dead process; this runner is the only writer of `generating`.
    store.jobs = [
      {
        id: "stranded",
        status: "generating",
        updatedAt: new Date(Date.now() - 60 * 60_000),
      },
    ];

    await runGenerationJob({
      type: "lesson",
      input: {},
      generate: async () => ({ raw: VALID, usage: USAGE }),
      schema: Schema,
      persist: async () => ({}),
    });

    expect(store.jobs[0]).toMatchObject({ id: "stranded", status: "failed" });
  });

  it("is left alone while it could still be running", async () => {
    store.jobs = [{ id: "live", status: "generating", updatedAt: new Date() }];

    await runGenerationJob({
      type: "lesson",
      input: {},
      generate: async () => ({ raw: VALID, usage: USAGE }),
      schema: Schema,
      persist: async () => ({}),
    });

    expect(store.jobs[0]).toMatchObject({ id: "live", status: "generating" });
  });
});

describe("the happy path", () => {
  it("moves the job through pending, generating and awaiting_review in that order", async () => {
    const result = await runGenerationJob({
      type: "lesson",
      input: { lessonFocus: "the letter A" },
      generate: async () => ({ raw: VALID, usage: USAGE }),
      schema: Schema,
      persist: async () => ({ lessonId: "lesson-1" }),
    });

    expect(result).toEqual({ jobId: "job-1", status: "awaiting_review" });
    expect(store.statusWrites).toEqual([
      "pending",
      "generating",
      "awaiting_review",
    ]);
  });

  it("stores the admin's parameters verbatim as the job input", async () => {
    await runGenerationJob({
      type: "lesson",
      input: { lessonFocus: "the letter A", languages: ["en", "bn"] },
      generate: async () => ({ raw: VALID, usage: USAGE }),
      schema: Schema,
      persist: async () => ({}),
    });

    expect(job().input).toEqual({
      lessonFocus: "the letter A",
      languages: ["en", "bn"],
    });
    expect(job().type).toBe("lesson");
  });

  it("records token usage and the entities the persist step created", async () => {
    await runGenerationJob({
      type: "lesson",
      input: {},
      generate: async () => ({ raw: VALID, usage: USAGE }),
      schema: Schema,
      persist: async () => ({ lessonId: "lesson-1", quizId: "quiz-1" }),
    });

    expect(rawOutput().usage).toEqual({
      inputTokens: 1200,
      outputTokens: 800,
      attempts: 1,
    });
    expect(rawOutput().entities).toEqual({
      lessonId: "lesson-1",
      quizId: "quiz-1",
    });
    expect(rawOutput().parsed).toEqual(VALID);
  });

  it("keeps the model's answer verbatim, not the parsed value", async () => {
    // Proves the stored attempt is the model's raw JSON, not the parse output (`.strict()` would have rejected the key).
    await runGenerationJob({
      type: "lesson",
      input: {},
      generate: async () => ({
        raw: { ...VALID, modelNote: "extra" },
        usage: USAGE,
      }),
      schema: z.object({ title: z.string().min(1) }),
      persist: async () => ({}),
    });

    expect(attempts()).toHaveLength(1);
    expect(attempts()[0].raw).toEqual({ ...VALID, modelNote: "extra" });
  });

  it("passes the job id to persist so every row it writes can carry it", async () => {
    let receivedJobId: string | undefined;

    await runGenerationJob({
      type: "lesson",
      input: {},
      generate: async () => ({ raw: VALID, usage: USAGE }),
      schema: Schema,
      persist: async (_parsed, jobId) => {
        receivedJobId = jobId;
        return {};
      },
    });

    expect(receivedJobId).toBe("job-1");
  });
});

describe("the retry", () => {
  it("retries exactly once, feeding the Zod issues back, and succeeds", async () => {
    const generate = vi
      .fn<
        (
          ...args: [feedback?: string]
        ) => Promise<{ raw: unknown; usage: typeof USAGE }>
      >()
      .mockResolvedValueOnce({ raw: INVALID, usage: USAGE })
      .mockResolvedValueOnce({ raw: VALID, usage: USAGE });

    const result = await runGenerationJob({
      type: "lesson",
      input: {},
      generate,
      schema: Schema,
      persist: async () => ({}),
    });

    expect(result.status).toBe("awaiting_review");
    expect(generate).toHaveBeenCalledTimes(2);

    expect(generate.mock.calls[0][0]).toBeUndefined();
    const feedback = generate.mock.calls[1][0];
    expect(feedback).toContain("failed schema validation");
    expect(feedback).toContain("title");
  });

  it("keeps both attempts and sums the tokens both of them cost", async () => {
    const generate = vi
      .fn<
        (
          ...args: [feedback?: string]
        ) => Promise<{ raw: unknown; usage: typeof USAGE }>
      >()
      .mockResolvedValueOnce({ raw: INVALID, usage: USAGE })
      .mockResolvedValueOnce({
        raw: VALID,
        usage: { inputTokens: 1500, outputTokens: 400 },
      });

    await runGenerationJob({
      type: "lesson",
      input: {},
      generate,
      schema: Schema,
      persist: async () => ({}),
    });

    expect(attempts()).toHaveLength(2);
    expect(attempts()[0]).toMatchObject({ attempt: 1, raw: INVALID });
    expect(attempts()[1]).toMatchObject({ attempt: 2, raw: VALID });
    // A failed attempt is billed too, so the total has to include it (FR-AI-08).
    expect(rawOutput().usage).toEqual({
      inputTokens: 2700,
      outputTokens: 1200,
      attempts: 2,
    });
  });

  it("names the failing field in the stored attempt", async () => {
    const generate = vi
      .fn<
        (
          ...args: [feedback?: string]
        ) => Promise<{ raw: unknown; usage: typeof USAGE }>
      >()
      .mockResolvedValueOnce({ raw: INVALID, usage: USAGE })
      .mockResolvedValueOnce({ raw: VALID, usage: USAGE });

    await runGenerationJob({
      type: "lesson",
      input: {},
      generate,
      schema: Schema,
      persist: async () => ({}),
    });

    expect(String(attempts()[0].issues)).toContain("title");
    expect(attempts()[1].issues).toBeUndefined();
  });
});

describe("failure", () => {
  it("fails the job after a second invalid response and never persists", async () => {
    const persist = vi.fn(async () => ({}));
    const generate = vi.fn(async () => ({ raw: INVALID, usage: USAGE }));

    const result = await runGenerationJob({
      type: "lesson",
      input: {},
      generate,
      schema: Schema,
      persist,
    });

    expect(result.status).toBe("failed");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(persist).not.toHaveBeenCalled();
    expect(store.statusWrites).toEqual(["pending", "generating", "failed"]);
    expect(attempts()).toHaveLength(2);
    expect(rawOutput().error).toContain("schema validation");
  });

  it("fails the job when the provider errors, keeping the message", async () => {
    const persist = vi.fn(async () => ({}));

    const result = await runGenerationJob({
      type: "lesson",
      input: {},
      generate: async () => {
        throw new Error("529 overloaded_error");
      },
      schema: Schema,
      persist,
    });

    expect(result.status).toBe("failed");
    expect(persist).not.toHaveBeenCalled();
    expect(rawOutput().error).toContain("529 overloaded_error");
  });

  it("does not retry a provider error", async () => {
    const generate = vi.fn(async () => {
      throw new Error("401 authentication_error");
    });

    await runGenerationJob({
      type: "lesson",
      input: {},
      generate,
      schema: Schema,
      persist: async () => ({}),
    });

    // The retry corrects schema mistakes; a rejected key or overloaded API is not fixed by an identical request.
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("fails the job when persistence throws, and says so", async () => {
    const result = await runGenerationJob({
      type: "lesson",
      input: {},
      generate: async () => ({ raw: VALID, usage: USAGE }),
      schema: Schema,
      persist: async () => {
        throw new Error("topic no longer exists");
      },
    });

    expect(result.status).toBe("failed");
    expect(store.statusWrites).toEqual(["pending", "generating", "failed"]);
    expect(rawOutput().error).toContain("topic no longer exists");
    // The generation was paid for; losing it to a write failure would make the failure unreadable.
    expect(rawOutput().parsed).toEqual(VALID);
  });

  it("fails the job when the model returns no JSON at all", async () => {
    const result = await runGenerationJob({
      type: "lesson",
      input: {},
      generate: async () => ({ raw: null, usage: USAGE }),
      schema: Schema,
      persist: async () => ({}),
    });

    expect(result.status).toBe("failed");
    expect(attempts()).toHaveLength(2);
  });
});

describe("the stops that are not schema failures", () => {
  it("does not retry a refusal, and says the model declined", async () => {
    // A refusal is a decision, not a schema mistake, so it must not read as "failed schema validation".
    const generate = vi.fn().mockResolvedValue({
      raw: null,
      usage: USAGE,
      stopReason: "refusal",
      refusal: "general_harms: the prompt asked for something unsafe",
    });

    const result = await runGenerationJob({
      type: "lesson",
      input: {},
      generate,
      schema: Schema,
      persist: async () => ({}),
    });

    expect(result.status).toBe("failed");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(rawOutput().error).toContain("declined");
    expect(rawOutput().error).toContain("general_harms");
    expect(attempts()[0].stopReason).toBe("refusal");
  });

  it("does not retry an answer cut off at the token ceiling", async () => {
    // Naming the ceiling makes the job diagnosable (FR-AI-08).
    const generate = vi.fn().mockResolvedValue({
      raw: INVALID,
      usage: USAGE,
      stopReason: "max_tokens",
    });

    const result = await runGenerationJob({
      type: "lesson",
      input: {},
      generate,
      schema: Schema,
      persist: async () => ({}),
    });

    expect(result.status).toBe("failed");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(rawOutput().error).toContain("cut off");
    expect(rawOutput().error).toContain("max_tokens");
  });

  it("still retries a validation miss the model stopped normally on", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        raw: INVALID,
        usage: USAGE,
        stopReason: "stop",
      })
      .mockResolvedValueOnce({
        raw: VALID,
        usage: USAGE,
        stopReason: "stop",
      });

    const result = await runGenerationJob({
      type: "lesson",
      input: {},
      generate,
      schema: Schema,
      persist: async () => ({}),
    });

    expect(result.status).toBe("awaiting_review");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(attempts().map((one) => one.stopReason)).toEqual(["stop", "stop"]);
  });
});
