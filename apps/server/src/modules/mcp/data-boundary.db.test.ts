import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Req. 9: no MCP tool reads a parent, a child or anything recorded about them. Every Prisma delegate a tool
 * touches, and every relation it `select`s or `include`s at any depth, is recorded by a proxy over the real
 * client, then compared against what holds household data. Driven in-process, so the guard's own reads
 * (`adminAccessToken`, `account`) are not counted. Every call must succeed: a call refused before its query runs
 * proves nothing about that query.
 */

const touched = vi.hoisted(() => ({
  delegates: new Set<string>(),
  relations: new Set<string>(),
}));

vi.mock("../../config/prisma.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../config/prisma.js")>();

  const collect = (args: unknown): void => {
    if (typeof args !== "object" || args === null) return;
    for (const clause of ["select", "include"] as const) {
      // Prisma query arguments: plain objects whose nested `select`/`include` are walked the same way.
      const fields = (args as Record<string, unknown>)[clause];
      if (typeof fields !== "object" || fields === null) continue;
      for (const [key, value] of Object.entries(fields)) {
        touched.relations.add(key);
        collect(value);
      }
    }
  };

  const recordDelegate = <T extends object>(delegate: T): T =>
    new Proxy(delegate, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (typeof value !== "function") return value;
        return (args: unknown, ...rest: unknown[]) => {
          collect(args);
          return value.call(target, args, ...rest);
        };
      },
    });

  const record = <T extends object>(client: T): T =>
    new Proxy(client, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        // `$transaction` hands the callback a client of its own, which must be recorded too.
        if (key === "$transaction" && typeof value === "function") {
          return (arg: unknown, options?: unknown) =>
            typeof arg === "function"
              ? value.call(target, (tx: object) => arg(record(tx)), options)
              : value.call(target, arg, options);
        }
        if (typeof key === "string" && !key.startsWith("$")) {
          touched.delegates.add(key);
          return typeof value === "object" && value !== null
            ? recordDelegate(value)
            : value;
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  return { ...real, prisma: record(real.prisma) };
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

const HOUSEHOLD_DELEGATES = [
  "parent",
  "childProfile",
  "lessonProgress",
  "quizResponse",
  "rewardLedger",
  "childCharacter",
  "streak",
  "screenTimeSetting",
  "sessionEvent",
  "weeklyReport",
  "session",
  "account",
  "user",
];

// Every relation field in schema.prisma, on a model the tools may read, whose type is a household model.
const HOUSEHOLD_RELATIONS = [
  "authUser",
  "progress",
  "responses",
  "ledger",
  "unlocks",
  "avatars",
];

describe("the MCP tools' data boundary", () => {
  it("touches no delegate or relation holding parent or child data, across every tool and prompt", async () => {
    const { createCurriculum, createSignedInAdmin } = await import(
      "../../shared/testing/factories.js"
    );
    const { mcpLessonArgs, mcpQuizArgs, mcpStoryArgs } = await import(
      "../../shared/testing/mcp-fixtures.js"
    );
    const { logger } = await import("../../config/logger.js");
    const { buildMcpServer } = await import("./mcp.server.js");

    const admin = await createSignedInAdmin();
    const curriculum = await createCurriculum("draft");
    touched.delegates.clear();
    touched.relations.clear();

    const server = buildMcpServer({
      principal: {
        adminId: admin.id,
        adminName: admin.name,
        tokenId: "in-process",
        scopes: ["mcp:drafts"],
      },
      client: null,
      log: logger,
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "boundary", version: "1" });
    await client.connect(clientSide);

    const called = new Set<string>();
    const call = async (name: string, args: Record<string, unknown>) => {
      called.add(name);
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError ?? false, name).toBe(false);
      // `structuredContent` is the tool's own object; only its id fields are read below.
      return result.structuredContent as Record<string, unknown>;
    };

    const lessonJob = await call(
      "submit_lesson_draft",
      mcpLessonArgs(curriculum),
    );
    const storyJob = await call("submit_story_draft", mcpStoryArgs(curriculum));
    const story = await (
      await import("../../config/prisma.js")
    ).prisma.story.findFirstOrThrow({
      where: { aiJobId: String(storyJob.jobId) },
      select: { id: true },
    });

    await call("get_authoring_guide", {});
    await call("list_curriculum", {});
    await call("get_lesson", { lessonId: curriculum.lesson.id });
    await call("list_characters", {});
    await call("get_quiz_format_schema", { format: "mcq" });
    await call("get_draft_status", { jobId: lessonJob.jobId });
    await call("list_my_drafts", {});
    await call("submit_quiz_questions", mcpQuizArgs(curriculum));
    await call("request_narration", { jobId: lessonJob.jobId });
    await call("request_illustrations", { storyId: story.id });

    await client.getPrompt({
      name: "write_lesson",
      arguments: {
        topicId: curriculum.topic.id,
        gradeLevel: "KG1",
        lessonFocus: "Counting",
        languages: "en,bn",
      },
    });
    await client.getPrompt({
      name: "write_story",
      arguments: {
        worldId: curriculum.world.id,
        gradeLevels: "KG1",
        theme: "Sharing",
        languages: "en",
      },
    });
    await client.getPrompt({
      name: "write_quiz",
      arguments: { lessonId: curriculum.lesson.id, languages: "en,bn" },
    });
    // A tool registered later and never called above would cross the boundary unseen; this fails until it is added.
    const listed = (await client.listTools()).tools.map((tool) => tool.name);
    const prompts = (await client.listPrompts()).prompts.map((one) => one.name);
    await client.close();

    expect([...called].sort()).toEqual([...listed].sort());
    expect(prompts.sort()).toEqual([
      "write_lesson",
      "write_quiz",
      "write_story",
    ]);

    expect(touched.delegates).toContain("mediaAsset");
    expect(touched.relations).toContain("translations");
    expect(
      [...touched.delegates].filter((one) => HOUSEHOLD_DELEGATES.includes(one)),
    ).toEqual([]);
    expect(
      [...touched.relations].filter((one) => HOUSEHOLD_RELATIONS.includes(one)),
    ).toEqual([]);
  });
});
