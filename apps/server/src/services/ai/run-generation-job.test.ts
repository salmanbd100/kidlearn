/**
 * The generation-job lifecycle (file 34, FR-AI-08).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* One `aiGenerationJob` array. `create` pushes a
 *     row and `update` mutates it in place, so the assertions below read the row
 *     the service actually wrote rather than a value queued in advance.
 *  2. *Assert the query, not just the result.* `statusWrites` records every
 *     `status` the service sent, in order, which is how `pending → generating →
 *     awaiting_review` is provable at all without a database to watch.
 *  3. *`where` clauses are not the whole guard.* Not applicable: no route reads
 *     these rows yet, and nothing here is student-facing.
 *  4. *Name what the stub cannot prove.* The stub's `$transaction` runs the
 *     callback and rethrows, but it cannot roll anything back — so the
 *     "persistence is skipped" cases assert that `persist` was never *called*,
 *     which is the property this service is responsible for. That a thrown
 *     `persist` leaves no rows behind is Postgres's guarantee and needs the real
 *     harness.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

type JobRow = Record<string, unknown> & { id: string; status: string };

const store = vi.hoisted(() => ({
  jobs: [] as JobRow[],
  statusWrites: [] as string[],
}));

vi.mock("../../lib/prisma.js", () => {
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

/** The job's `rawOutput`, narrowed at the JSONB boundary the stub writes it to. */
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
    // A key the schema strips is exactly what a reviewer needs to see when a
    // generation looks wrong — `.strict()` would have rejected it, so this proves
    // the stored attempt is the raw tool arguments rather than the parse output.
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

    // The retry exists to correct a *schema* mistake by showing the model its
    // issues. A rejected key or an overloaded API is not something a second
    // identical request fixes.
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
    // The generation itself succeeded and was paid for; losing it because the
    // write failed would make the failure unreadable.
    expect(rawOutput().parsed).toEqual(VALID);
  });

  it("fails the job when the model returns no tool call at all", async () => {
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
    // A refusal is a decision, not a mistake: the same prompt earns it again, and
    // "failed schema validation" would send a reviewer to look at the schema.
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
    // A second identical request is cut off in the same place. Naming the ceiling
    // is what makes the job diagnosable (FR-AI-08).
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
        stopReason: "tool_use",
      })
      .mockResolvedValueOnce({
        raw: VALID,
        usage: USAGE,
        stopReason: "tool_use",
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
    expect(attempts().map((one) => one.stopReason)).toEqual([
      "tool_use",
      "tool_use",
    ]);
  });
});
