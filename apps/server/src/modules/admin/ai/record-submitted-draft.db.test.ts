import type { AdminUser, Prisma } from "@kidlearn/db";
import { validDragAnswer, validMatchPair, validMcq } from "@kidlearn/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../config/prisma.js";
import {
  type Curriculum,
  createAdmin,
  createCurriculum,
} from "../../../shared/testing/factories.js";
import {
  buildLessonContext,
  persistQuiz,
  prepareQuiz,
} from "./generators/quiz.js";
import { readDailyBudget } from "./rate-guard.js";
import {
  type RecordSubmittedDraftOptions,
  recordSubmittedDraft,
} from "./record-submitted-draft.js";
import { buildQuizGenerationOutputSchema } from "./schemas/quiz.js";

// `env` is frozen at import, so the cap is pinned before it is read.
const CAP = vi.hoisted(() => {
  process.env.MCP_DRAFTS_PER_DAY = "2";
  return 2;
});

let admin: AdminUser;
let curriculum: Curriculum;

beforeEach(async () => {
  admin = await createAdmin();
  curriculum = await createCurriculum("draft");
});

function options(
  overrides: Partial<RecordSubmittedDraftOptions<{ title: string }>> = {},
): RecordSubmittedDraftOptions<{ title: string }> {
  return {
    type: "lesson",
    input: { topicId: curriculum.topic.id },
    submitted: { title: "Raw from the client" },
    parsed: { title: "Parsed" },
    requestedById: admin.id,
    client: { name: "claude-code", version: "2.1.0" },
    persist: async (parsed, jobId, tx) => {
      const lesson = await tx.lesson.create({
        data: {
          topicId: curriculum.topic.id,
          worldId: curriculum.world.id,
          slug: `mcp-${jobId}`,
          title: parsed.title,
          gradeLevels: ["KG1"],
          aiJobId: jobId,
        },
        select: { id: true },
      });
      return { lessonId: lesson.id };
    },
    ...overrides,
  };
}

describe("a valid submission", () => {
  it("writes one awaiting_review job attributed to the admin, with its content rows", async () => {
    const result = await recordSubmittedDraft(options());

    const job = await prisma.aIGenerationJob.findUniqueOrThrow({
      where: { id: result.jobId },
      include: { lessons: true },
    });
    expect(result).toEqual({
      jobId: job.id,
      status: "awaiting_review",
      isDuplicate: false,
    });
    expect(job).toMatchObject({
      source: "mcp",
      status: "awaiting_review",
      requestedById: admin.id,
      client: { name: "claude-code", version: "2.1.0" },
    });
    expect(job.lessons).toHaveLength(1);
    expect(job.lessons[0]).toMatchObject({ status: "draft", title: "Parsed" });
    expect(job.rawOutput).toEqual({
      submitted: { title: "Raw from the client" },
      parsed: { title: "Parsed" },
      entities: { lessonId: job.lessons[0].id },
    });
  });

  it("records the parsed lesson where the quiz brief reads it, so a later quiz knows what was taught", async () => {
    const parsed = {
      learningObjectives: ["Count to three"],
      narrationScript: { en: "One, two, three apples." },
    };
    const result = await recordSubmittedDraft({
      ...options(),
      parsed,
      persist: async () => ({}),
    });

    const context = await buildLessonContext({
      aiJobId: result.jobId,
      title: "Count",
      translations: [],
    });
    expect(context).toContain("Count to three");
    expect(context).toContain("One, two, three apples.");
  });
});

describe("a quiz written while another writer adds the lesson's quiz", () => {
  it("appends to the quiz that now exists instead of orphaning it", async () => {
    const prepared = await prepareQuiz({
      lessonId: curriculum.lesson.id,
      languages: ["en", "bn"],
      count: 3,
    });
    expect(prepared.existingQuizId).toBeUndefined();
    const meanwhile = await prisma.quiz.create({
      data: { lesson: { connect: { id: curriculum.lesson.id } } },
    });
    const questions = buildQuizGenerationOutputSchema(3).parse({
      questions: [validMcq, validMatchPair, validDragAnswer],
    });

    await recordSubmittedDraft({
      ...options(),
      type: "quiz",
      parsed: questions,
      persist: (value, jobId, tx) =>
        persistQuiz({ prepared, parsed: value, jobId, tx }),
    });

    const lesson = await prisma.lesson.findUniqueOrThrow({
      where: { id: curriculum.lesson.id },
      select: { quizId: true },
    });
    expect(lesson.quizId).toBe(meanwhile.id);
    expect(await prisma.quiz.count()).toBe(1);
    expect(
      await prisma.quizQuestion.count({ where: { quizId: meanwhile.id } }),
    ).toBe(3);
  });
});

describe("a persist failure", () => {
  it("rolls back the job row with the content, leaving nothing in the queue", async () => {
    await expect(
      recordSubmittedDraft(
        options({
          persist: async (_parsed, jobId, tx) => {
            await tx.quiz.create({ data: { title: "orphan", aiJobId: jobId } });
            throw new Error("persist failed half-way");
          },
        }),
      ),
    ).rejects.toThrow("persist failed half-way");

    expect(await prisma.aIGenerationJob.count()).toBe(0);
    expect(await prisma.quiz.count()).toBe(0);
  });
});

describe("clientRequestId", () => {
  it("returns the first job for a retried call and writes nothing new", async () => {
    const first = await recordSubmittedDraft(
      options({ clientRequestId: "retry-me" }),
    );
    const second = await recordSubmittedDraft(
      options({ clientRequestId: "retry-me" }),
    );

    expect(second).toEqual({
      jobId: first.jobId,
      status: "awaiting_review",
      isDuplicate: true,
    });
    expect(await prisma.aIGenerationJob.count()).toBe(1);
    expect(await prisma.lesson.count({ where: { aiJobId: first.jobId } })).toBe(
      1,
    );
  });

  it("collapses concurrent retries of one call onto one job", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        recordSubmittedDraft(options({ clientRequestId: "raced" })),
      ),
    );

    expect(new Set(results.map((one) => one.jobId)).size).toBe(1);
    expect(await prisma.aIGenerationJob.count()).toBe(1);
  });

  it("refuses one key reused for a different kind of content, rather than answering with the other job", async () => {
    await recordSubmittedDraft(options({ clientRequestId: "counting-1" }));

    await expect(
      recordSubmittedDraft(
        options({ type: "quiz", clientRequestId: "counting-1" }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.aIGenerationJob.count()).toBe(1);
  });

  it("is scoped to the admin, so two admins may reuse one key", async () => {
    const other = await createAdmin();
    const mine = await recordSubmittedDraft(options({ clientRequestId: "k" }));
    const theirs = await recordSubmittedDraft(
      options({ clientRequestId: "k", requestedById: other.id }),
    );

    expect(theirs.jobId).not.toBe(mine.jobId);
  });
});

describe("the per-admin daily cap", () => {
  it("refuses the draft past MCP_DRAFTS_PER_DAY and writes nothing", async () => {
    await seedMcpJobs(admin.id, CAP);

    await expect(recordSubmittedDraft(options())).rejects.toMatchObject({
      statusCode: 429,
      code: "RATE_LIMITED",
    });
    expect(await prisma.aIGenerationJob.count()).toBe(CAP);
  });

  it("holds under concurrent submissions", async () => {
    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => recordSubmittedDraft(options())),
    );

    expect(settled.filter((one) => one.status === "fulfilled")).toHaveLength(
      CAP,
    );
    // Refused by the cap, not by serialisation retries running out (a P2034 would reach the client as a 500).
    for (const one of settled) {
      if (one.status === "rejected") {
        expect(one.reason).toMatchObject({
          statusCode: 429,
          code: "RATE_LIMITED",
        });
      }
    }
    expect(await prisma.aIGenerationJob.count()).toBe(CAP);
  });

  it("does not count another admin's drafts", async () => {
    const other = await createAdmin();
    await seedMcpJobs(other.id, CAP);

    await expect(recordSubmittedDraft(options())).resolves.toMatchObject({
      status: "awaiting_review",
    });
  });

  it("does not spend the Gemini text budget", async () => {
    await seedMcpJobs(admin.id, 5);

    const budget = await readDailyBudget("lesson");
    expect(budget.used).toBe(0);
  });
});

async function seedMcpJobs(requestedById: string, count: number) {
  const data: Prisma.AIGenerationJobCreateManyInput[] = Array.from(
    { length: count },
    () => ({
      type: "lesson",
      source: "mcp",
      status: "awaiting_review",
      input: {},
      requestedById,
    }),
  );
  await prisma.aIGenerationJob.createMany({ data });
}
