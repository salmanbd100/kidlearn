import type { AdminUser } from "@kidlearn/db";
import {
  BatchGenerationRefSchema,
  McpDraftListSchema,
  McpDraftStatusSchema,
  McpDraftSubmittedSchema,
} from "@kidlearn/types";
import type { Client } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app.js";
import { auth } from "../../config/auth.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import {
  type Curriculum,
  createCurriculum,
  createParent,
  createSignedInAdmin,
} from "../../shared/testing/factories.js";
import { connectMcp, type McpEra } from "../../shared/testing/mcp-client.js";
import {
  mcpLessonArgs,
  mcpQuizArgs,
  mcpStoryArgs,
} from "../../shared/testing/mcp-fixtures.js";
import request from "../../shared/testing/request.js";
import { createAccessToken } from "../admin/access-tokens/access-tokens.service.js";
import { resolveMcpPrincipal } from "./mcp.auth.js";
import { INTERNAL_TOOL_ERROR } from "./tools/schema.js";

// `env` is frozen at import. Low enough to reach in one test, above what any other test sends for its own admin.
const RATE_LIMIT = vi.hoisted(() => {
  process.env.MCP_RATE_LIMIT_PER_MINUTE = "40";
  return 40;
});

// Providers only: the media tools must reach their database writes without a network call.
vi.mock("../admin/ai/google-tts.js", () => ({
  generateNarration: async () => Buffer.from("audio"),
}));
vi.mock("../admin/ai/gemini.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin/ai/gemini.js")>()),
  generateIllustration: async () => Buffer.from("image"),
}));
vi.mock("../admin/media/media.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin/media/media.service.js")>()),
  uploadBuffer: async () => "https://res.cloudinary.com/test/upload.png",
}));

const TOOLS = [
  "get_authoring_guide",
  "list_curriculum",
  "get_lesson",
  "list_characters",
  "get_quiz_format_schema",
  "get_draft_status",
  "list_my_drafts",
  "submit_lesson_draft",
  "submit_story_draft",
  "submit_quiz_questions",
  "request_narration",
  "request_illustrations",
];

let admin: AdminUser;
let secret: string;
let curriculum: Curriculum;
let session: { client: Client; close: () => Promise<void> } | undefined;

beforeEach(async () => {
  admin = await createSignedInAdmin({ name: "Ayesha" });
  ({ secret } = await createAccessToken(admin.id, {
    name: "Claude Code",
    expiresInDays: 7,
  }));
  curriculum = await createCurriculum("draft");
});

afterEach(async () => {
  await session?.close();
  session = undefined;
  vi.restoreAllMocks();
});

async function connect(era: McpEra = "legacy"): Promise<Client> {
  session = await connectMcp(app, secret, era);
  return session.client;
}

function lessonArgs(overrides: Record<string, unknown> = {}) {
  return mcpLessonArgs(curriculum, overrides);
}

function storyArgs(overrides: Record<string, unknown> = {}) {
  return mcpStoryArgs(curriculum, overrides);
}

function quizArgs(overrides: Record<string, unknown> = {}) {
  return mcpQuizArgs(curriculum, overrides);
}

function structured(result: Awaited<ReturnType<Client["callTool"]>>) {
  expect(result.isError ?? false).toBe(false);
  // `structuredContent` is the tool's own object; each test reads the fields it asserts on.
  return result.structuredContent as Record<string, unknown>;
}

function errorText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  expect(result.isError).toBe(true);
  // The SDK types `content` loosely across protocol versions; a tool error here is always one text block.
  return (result.content as Array<{ text: string }>)[0].text;
}

describe.each<McpEra>(["legacy", "modern"])(
  "over the %s protocol era",
  (era) => {
    it("lists exactly the twelve tools, each described and with an object input schema", async () => {
      const client = await connect(era);

      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOLS].sort());
      for (const tool of tools) {
        expect(tool.description?.length ?? 0).toBeGreaterThan(20);
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    it("writes a valid lesson as one awaiting_review job with draft rows, attributed to the admin and client", async () => {
      const client = await connect(era);

      const result = await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs(),
      });

      const submitted = McpDraftSubmittedSchema.parse(structured(result));
      const job = await prisma.aIGenerationJob.findUniqueOrThrow({
        where: { id: submitted.jobId },
        include: { lessons: true, quizzes: true, quizQuestions: true },
      });
      expect(job).toMatchObject({
        type: "lesson",
        source: "mcp",
        status: "awaiting_review",
        requestedById: admin.id,
      });
      expect(job.client).toMatchObject({ name: expect.any(String) });
      expect(job.lessons).toHaveLength(1);
      expect(job.lessons[0].status).toBe("draft");
      expect(job.quizzes[0].status).toBe("draft");
      expect(job.quizQuestions).toHaveLength(3);
      expect(submitted.reviewUrl).toMatch(
        new RegExp(`/admin/ai-queue/${job.id}$`),
      );
    });
  },
);

describe("the client's self-description", () => {
  it("is taken from the 2026-07-28 request envelope", async () => {
    const client = await connect("modern");

    const result = await client.callTool({
      name: "submit_lesson_draft",
      arguments: lessonArgs(),
    });

    const job = await prisma.aIGenerationJob.findUniqueOrThrow({
      where: { id: String(structured(result).jobId) },
    });
    expect(job.client).toEqual({ name: "kidlearn-test", version: "0.0.1" });
  });
});

describe("an invalid submission", () => {
  it("answers isError with path-level issues and writes nothing", async () => {
    const client = await connect();
    const args = lessonArgs();

    const result = await client.callTool({
      name: "submit_lesson_draft",
      arguments: {
        ...args,
        lesson: { ...args.lesson, introScript: { en: "Hello!" } },
      },
    });

    expect(errorText(result)).toContain("introScript.bn");
    expect(await prisma.aIGenerationJob.count()).toBe(0);
    expect(
      await prisma.lesson.count({ where: { aiJobId: { not: null } } }),
    ).toBe(0);
  });

  it("answers isError for an unknown topic, as the REST path answers 404", async () => {
    const client = await connect();

    const result = await client.callTool({
      name: "submit_lesson_draft",
      arguments: lessonArgs({
        topicId: "00000000-0000-4000-8000-000000000000",
      }),
    });

    expect(errorText(result)).toContain("No such topic");
  });
});

describe("clientRequestId", () => {
  it("returns the same job when a call is retried", async () => {
    const client = await connect();
    const args = lessonArgs({ clientRequestId: "lesson-apples-1" });

    const first = await client.callTool({
      name: "submit_lesson_draft",
      arguments: args,
    });
    const second = await client.callTool({
      name: "submit_lesson_draft",
      arguments: args,
    });

    expect(structured(second).jobId).toBe(structured(first).jobId);
    expect(structured(second).isDuplicate).toBe(true);
    expect(await prisma.aIGenerationJob.count()).toBe(1);
  });

  it("still returns the first job when its quiz was published before the retry arrived", async () => {
    const client = await connect();
    const args = quizArgs({ clientRequestId: "quiz-apples-1" });
    const first = structured(
      await client.callTool({ name: "submit_quiz_questions", arguments: args }),
    );
    await prisma.quiz.updateMany({ data: { status: "published" } });

    const retry = structured(
      await client.callTool({ name: "submit_quiz_questions", arguments: args }),
    );

    expect(retry).toMatchObject({ jobId: first.jobId, isDuplicate: true });
  });

  it("refuses an id already used for another kind of content", async () => {
    const client = await connect();
    structured(
      await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs({ clientRequestId: "counting-1" }),
      }),
    );

    const quiz = await client.callTool({
      name: "submit_quiz_questions",
      arguments: quizArgs({ clientRequestId: "counting-1" }),
    });

    expect(errorText(quiz)).toContain(
      "already names one of your lesson drafts",
    );
    expect(await prisma.aIGenerationJob.count()).toBe(1);
  });
});

describe("stories and quizzes", () => {
  it("writes a story with its pages", async () => {
    const client = await connect();

    const result = await client.callTool({
      name: "submit_story_draft",
      arguments: storyArgs(),
    });

    const job = await prisma.aIGenerationJob.findUniqueOrThrow({
      where: { id: String(structured(result).jobId) },
      include: { stories: { include: { pages: true } } },
    });
    expect(job.stories[0].status).toBe("draft");
    expect(job.stories[0].pages).toHaveLength(6);
  });

  it("refuses a story outside the page bounds before touching the database", async () => {
    const client = await connect();
    const args = storyArgs();

    const result = await client.callTool({
      name: "submit_story_draft",
      arguments: {
        ...args,
        story: { ...args.story, pages: args.story.pages.slice(0, 2) },
      },
    });

    expect(errorText(result)).toContain("6 to 8 pages");
  });

  it("appends questions to a lesson's draft quiz", async () => {
    const client = await connect();

    const result = await client.callTool({
      name: "submit_quiz_questions",
      arguments: quizArgs(),
    });

    const lesson = await prisma.lesson.findUniqueOrThrow({
      where: { id: curriculum.lesson.id },
      include: { quiz: { include: { questions: true } } },
    });
    expect(structured(result).status).toBe("awaiting_review");
    expect(lesson.quiz?.status).toBe("draft");
    expect(lesson.quiz?.questions).toHaveLength(3);
  });

  it("refuses questions for a published quiz, where a question would be live at once", async () => {
    const quiz = await prisma.quiz.create({
      data: {
        status: "published",
        lesson: { connect: { id: curriculum.lesson.id } },
      },
    });
    const client = await connect();

    const result = await client.callTool({
      name: "submit_quiz_questions",
      arguments: quizArgs(),
    });

    expect(errorText(result)).toContain("Unpublish");
    expect(
      await prisma.quizQuestion.count({ where: { quizId: quiz.id } }),
    ).toBe(0);
  });
});

describe("the review loop", () => {
  it("hands the reviewer's reason back for a rejected draft", async () => {
    const client = await connect();
    const submitted = structured(
      await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs(),
      }),
    );
    await prisma.aIGenerationJob.update({
      where: { id: String(submitted.jobId) },
      data: { status: "rejected", reviewNote: "The Bangla title is too long." },
    });

    const status = McpDraftStatusSchema.parse(
      structured(
        await client.callTool({
          name: "get_draft_status",
          arguments: { jobId: submitted.jobId },
        }),
      ),
    );

    expect(status).toMatchObject({
      status: "rejected",
      rejectionReason: "The Bangla title is too long.",
    });
  });

  it("does not show one admin's draft to another", async () => {
    const other = await createSignedInAdmin();
    const job = await prisma.aIGenerationJob.create({
      data: {
        type: "lesson",
        source: "mcp",
        status: "awaiting_review",
        input: {},
        requestedById: other.id,
      },
    });
    const client = await connect();

    const status = await client.callTool({
      name: "get_draft_status",
      arguments: { jobId: job.id },
    });
    const list = await client.callTool({
      name: "list_my_drafts",
      arguments: {},
    });

    expect(errorText(status)).toBe("No such draft");
    expect(structured(list).drafts).toEqual([]);
  });
});

describe("the human gate (FR-AI-07)", () => {
  it("leaves every row a draft and every job awaiting review, whatever the tools are asked to do", async () => {
    const client = await connect();
    const lesson = structured(
      await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs(),
      }),
    );
    const story = structured(
      await client.callTool({
        name: "submit_story_draft",
        arguments: storyArgs(),
      }),
    );
    structured(
      await client.callTool({
        name: "submit_quiz_questions",
        arguments: quizArgs(),
      }),
    );
    const storyRow = await prisma.story.findFirstOrThrow({
      where: { aiJobId: String(story.jobId) },
    });
    const narration = structured(
      await client.callTool({
        name: "request_narration",
        arguments: { jobId: lesson.jobId },
      }),
    );
    const pictures = structured(
      await client.callTool({
        name: "request_illustrations",
        arguments: { storyId: storyRow.id },
      }),
    );
    expect(narration.jobIds).not.toEqual([]);
    expect(pictures.jobIds).not.toEqual([]);

    // A client asking for a live row by name is refused, not obeyed: the content schemas are strict.
    const args = lessonArgs();
    const asksToPublish = await Promise.all([
      client.callTool({
        name: "submit_lesson_draft",
        arguments: { ...args, lesson: { ...args.lesson, status: "published" } },
      }),
      client.callTool({
        name: "submit_lesson_draft",
        arguments: { ...args, status: "published" },
      }),
      client.callTool({
        name: "submit_story_draft",
        arguments: {
          ...storyArgs(),
          story: { ...storyArgs().story, status: "approved" },
        },
      }),
      client.callTool({
        name: "submit_quiz_questions",
        arguments: quizArgs({
          questions: [{ ...quizArgs().questions[0], status: "published" }],
        }),
      }),
    ]);
    for (const result of asksToPublish) expect(result.isError).toBe(true);

    // Every row, not only the ones a job stamped: a tool must not flip the curriculum's own lesson or quiz either.
    const published = await Promise.all([
      prisma.lesson.count({ where: { status: { not: "draft" } } }),
      prisma.quiz.count({ where: { status: { not: "draft" } } }),
      prisma.story.count({ where: { status: { not: "draft" } } }),
      prisma.aIGenerationJob.count({
        where: { status: { not: "awaiting_review" } },
      }),
    ]);
    expect(published).toEqual([0, 0, 0, 0]);
  });
});

describe("media requested over MCP", () => {
  it("records narration for the caller's own draft, attributed to them", async () => {
    const client = await connect();
    const lesson = structured(
      await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs(),
      }),
    );

    const batch = BatchGenerationRefSchema.parse(
      structured(
        await client.callTool({
          name: "request_narration",
          arguments: { jobId: lesson.jobId },
        }),
      ),
    );

    const jobs = await prisma.aIGenerationJob.findMany({
      where: { id: { in: batch.jobIds } },
    });
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(job).toMatchObject({ type: "audio", requestedById: admin.id });
    }
  });

  it("treats another admin's job as no such draft", async () => {
    const other = await createSignedInAdmin();
    const theirs = await prisma.aIGenerationJob.create({
      data: {
        type: "lesson",
        source: "mcp",
        status: "awaiting_review",
        input: {},
        requestedById: other.id,
      },
    });
    const client = await connect();

    const result = await client.callTool({
      name: "request_narration",
      arguments: { jobId: theirs.id },
    });

    expect(errorText(result)).toBe("No such draft");
    expect(
      await prisma.aIGenerationJob.count({ where: { type: "audio" } }),
    ).toBe(0);
  });

  it("refuses narration for a draft that is no longer awaiting review", async () => {
    const client = await connect();
    const lesson = structured(
      await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs(),
      }),
    );
    await prisma.aIGenerationJob.update({
      where: { id: String(lesson.jobId) },
      data: { status: "rejected" },
    });

    const result = await client.callTool({
      name: "request_narration",
      arguments: { jobId: lesson.jobId },
    });

    expect(errorText(result)).toContain("rejected");
    expect(
      await prisma.aIGenerationJob.count({ where: { type: "audio" } }),
    ).toBe(0);
  });

  it("narrates only the questions a quiz draft added, not the ones already in the quiz", async () => {
    const client = await connect();
    structured(
      await client.callTool({
        name: "submit_quiz_questions",
        arguments: quizArgs(),
      }),
    );
    const second = structured(
      await client.callTool({
        name: "submit_quiz_questions",
        arguments: quizArgs(),
      }),
    );
    const own = await prisma.quizQuestion.findMany({
      where: { aiJobId: String(second.jobId) },
      select: { id: true },
    });

    const batch = BatchGenerationRefSchema.parse(
      structured(
        await client.callTool({
          name: "request_narration",
          arguments: { jobId: second.jobId },
        }),
      ),
    );

    const targets = await prisma.aIGenerationJob.findMany({
      where: { id: { in: batch.jobIds } },
      select: { input: true },
    });
    expect(targets.length).toBeGreaterThan(0);
    const ownIds = new Set(own.map((question) => question.id));
    for (const { input } of targets) {
      // JSONB: written by `runNarrationJob`, which always records `targetId`.
      expect(ownIds.has((input as { targetId: string }).targetId)).toBe(true);
    }
  });

  it("checks the audio cap once for the lesson and its quiz, so neither is billed when both do not fit", async () => {
    const client = await connect();
    const lesson = structured(
      await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs(),
      }),
    );
    // Room for the two intro clips (en, bn) but not the six quiz-question clips after them.
    await prisma.aIGenerationJob.createMany({
      data: Array.from({ length: env.AI_AUDIO_JOBS_PER_DAY - 3 }, () => ({
        type: "audio" as const,
        status: "approved" as const,
        input: {},
      })),
    });

    const result = await client.callTool({
      name: "request_narration",
      arguments: { jobId: lesson.jobId },
    });

    expect(errorText(result)).toContain("cap");
    expect(
      await prisma.aIGenerationJob.count({
        where: { type: "audio", requestedById: admin.id },
      }),
    ).toBe(0);
  });

  it("says so when a draft created nothing that can be narrated", async () => {
    const empty = await prisma.aIGenerationJob.create({
      data: {
        type: "lesson",
        source: "mcp",
        status: "awaiting_review",
        input: {},
        rawOutput: { entities: {} },
        requestedById: admin.id,
      },
    });
    const client = await connect();

    const result = await client.callTool({
      name: "request_narration",
      arguments: { jobId: empty.id },
    });

    expect(errorText(result)).toContain("nothing that can be narrated");
  });

  it("draws pictures for the caller's own story draft, attributed to them", async () => {
    const client = await connect();
    const story = structured(
      await client.callTool({
        name: "submit_story_draft",
        arguments: storyArgs(),
      }),
    );
    const storyRow = await prisma.story.findFirstOrThrow({
      where: { aiJobId: String(story.jobId) },
    });

    const batch = BatchGenerationRefSchema.parse(
      structured(
        await client.callTool({
          name: "request_illustrations",
          arguments: { storyId: storyRow.id },
        }),
      ),
    );

    const jobs = await prisma.aIGenerationJob.findMany({
      where: { id: { in: batch.jobIds } },
    });
    expect(jobs).toHaveLength(6);
    for (const job of jobs) {
      expect(job).toMatchObject({ type: "image", requestedById: admin.id });
    }
  });

  it("refuses a story no MCP draft of the caller's created, spending nothing", async () => {
    const handWritten = await prisma.story.create({
      data: {
        worldId: curriculum.world.id,
        slug: "hand-written",
        title: "Hand-written",
        theme: "Sharing",
        gradeLevels: ["KG1"],
        pages: {
          create: [{ sortOrder: 1, illustrationPrompt: "A rabbit." }],
        },
      },
    });
    const client = await connect();

    const result = await client.callTool({
      name: "request_illustrations",
      arguments: { storyId: handWritten.id },
    });

    expect(errorText(result)).toContain("No such story among your drafts");
    expect(
      await prisma.aIGenerationJob.count({ where: { type: "image" } }),
    ).toBe(0);
  });

  it("refuses the caller's own story once it is published", async () => {
    const client = await connect();
    const story = structured(
      await client.callTool({
        name: "submit_story_draft",
        arguments: storyArgs(),
      }),
    );
    await prisma.story.updateMany({
      where: { aiJobId: String(story.jobId) },
      data: { status: "published" },
    });
    const storyRow = await prisma.story.findFirstOrThrow({
      where: { aiJobId: String(story.jobId) },
    });

    const result = await client.callTool({
      name: "request_illustrations",
      arguments: { storyId: storyRow.id },
    });

    expect(errorText(result)).toContain("already published");
    expect(
      await prisma.aIGenerationJob.count({ where: { type: "image" } }),
    ).toBe(0);
  });
});

describe("what a submitted lesson leaves for the next tool", () => {
  it("lets get_lesson report what an MCP-written lesson taught", async () => {
    const client = await connect();
    structured(
      await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs(),
      }),
    );
    const lesson = await prisma.lesson.findFirstOrThrow({
      where: { aiJobId: { not: null } },
    });

    const read = structured(
      await client.callTool({
        name: "get_lesson",
        arguments: { lessonId: lesson.id },
      }),
    );

    expect(read.whatItTaught).toContain("Count to three");
    expect(read.whatItTaught).toContain("One, two, three apples.");
  });

  it("lists the caller's drafts with their content, in the published contract", async () => {
    const client = await connect();
    structured(
      await client.callTool({
        name: "submit_lesson_draft",
        arguments: lessonArgs(),
      }),
    );
    structured(
      await client.callTool({
        name: "submit_story_draft",
        arguments: storyArgs(),
      }),
    );

    const list = McpDraftListSchema.parse(
      structured(
        await client.callTool({ name: "list_my_drafts", arguments: {} }),
      ),
    );

    expect(list.drafts.map((one) => one.type)).toEqual(["story", "lesson"]);
    expect(list.drafts[1].entities.map((one) => one.resource).sort()).toEqual([
      "lessons",
      "quizzes",
    ]);
    expect(list.drafts[0].entities.map((one) => one.resource)).toEqual([
      "stories",
    ]);
  });
});

describe("failures inside a tool", () => {
  it("answers with a fixed message, never the database's own text", async () => {
    const client = await connect();
    vi.spyOn(prisma.aIGenerationJob, "findMany").mockRejectedValueOnce(
      new Error('relation "AIGenerationJob" does not exist'),
    );

    const result = await client.callTool({
      name: "list_my_drafts",
      arguments: {},
    });

    expect(errorText(result)).toBe(INTERNAL_TOOL_ERROR);
  });

  it("answers the daily cap as a tool error naming it, not a protocol failure", async () => {
    await prisma.aIGenerationJob.createMany({
      data: Array.from({ length: 30 }, () => ({
        type: "lesson" as const,
        source: "mcp" as const,
        status: "awaiting_review" as const,
        input: {},
        requestedById: admin.id,
      })),
    });
    const client = await connect();

    const result = await client.callTool({
      name: "submit_lesson_draft",
      arguments: lessonArgs(),
    });

    expect(errorText(result)).toContain("Daily MCP draft cap (30) reached");
  });
});

describe("who may call /mcp", () => {
  const LIST = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

  function post(authorization?: string) {
    const call = request(app)
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream");
    return (
      authorization === undefined
        ? call
        : call.set("Authorization", authorization)
    ).send(LIST);
  }

  it("401s without a token, naming the Bearer scheme and no error code", async () => {
    const res = await post();

    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe('Bearer realm="kidlearn"');
  });

  it("401s an unknown token as invalid_token", async () => {
    const res = await post(`Bearer klat_${"x".repeat(43)}`);

    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain('error="invalid_token"');
  });

  it("403s a token without the mcp:drafts scope as insufficient_scope", async () => {
    await prisma.adminAccessToken.updateMany({ data: { scopes: [] } });

    const res = await post(`Bearer ${secret}`);

    expect(res.status).toBe(403);
    expect(res.headers["www-authenticate"]).toContain(
      'error="insufficient_scope"',
    );
  });

  it("records last use at most every five minutes", async () => {
    const start = new Date();
    const at = (minutes: number) =>
      new Date(start.getTime() + minutes * 60_000);
    const lastUsed = async () =>
      (await prisma.adminAccessToken.findFirstOrThrow()).lastUsedAt?.getTime();

    await resolveMcpPrincipal(`Bearer ${secret}`, start);
    await resolveMcpPrincipal(`Bearer ${secret}`, at(4));
    expect(await lastUsed()).toBe(start.getTime());

    await resolveMcpPrincipal(`Bearer ${secret}`, at(6));
    expect(await lastUsed()).toBe(at(6).getTime());
  });

  it("limits requests per admin, across every token they hold", async () => {
    const second = await createAccessToken(admin.id, {
      name: "Cursor",
      expiresInDays: 7,
    });
    for (let sent = 0; sent < RATE_LIMIT; sent += 1) {
      const token = sent % 2 === 0 ? secret : second.secret;
      expect((await post(`Bearer ${token}`)).status).toBe(200);
    }

    const over = await post(`Bearer ${second.secret}`);

    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("RATE_LIMITED");
  });

  it("401s a revoked token on the next call", async () => {
    expect((await post(`Bearer ${secret}`)).status).toBe(200);
    await prisma.adminAccessToken.updateMany({
      data: { revokedAt: new Date() },
    });

    expect((await post(`Bearer ${secret}`)).status).toBe(401);
  });

  it("401s an expired token", async () => {
    await prisma.adminAccessToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await post(`Bearer ${secret}`)).status).toBe(401);
  });

  it("401s a token whose admin was removed, because the token went with them", async () => {
    await prisma.adminUser.delete({ where: { id: admin.id } });

    expect((await post(`Bearer ${secret}`)).status).toBe(401);
  });

  it("403s an admin with a linked Google account", async () => {
    await prisma.account.create({
      data: {
        id: "google-account-1",
        accountId: "google-sub-1",
        providerId: "google",
        userId: admin.authUserId ?? "",
      },
    });

    expect((await post(`Bearer ${secret}`)).status).toBe(403);
  });

  it("403s an admin whose sign-in was deleted", async () => {
    await prisma.user.delete({ where: { id: admin.authUserId ?? "" } });

    expect((await post(`Bearer ${secret}`)).status).toBe(403);
  });

  it("does not accept a signed-in parent's session in place of a token", async () => {
    const parent = await createParent();
    // A live parent session as better-auth would resolve it; only the cookie signature is skipped.
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: parent.userId },
      session: {
        id: "parent-session",
        userId: parent.userId,
        createdAt: new Date(),
      },
    } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);

    const res = await request(app)
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .set("Cookie", "better-auth.session_token=parent-session")
      .send(LIST);
    const asBearer = await post("Bearer parent-session");

    expect(res.status).toBe(401);
    expect(asBearer.status).toBe(401);
  });

  it("answers GET with 405, since there is no session to resume", async () => {
    const res = await request(app)
      .get("/mcp")
      .set("Authorization", `Bearer ${secret}`);

    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("POST");
    expect(res.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });
});
