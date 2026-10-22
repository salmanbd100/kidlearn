import type { AdminUser } from "@kidlearn/db";
import {
  AiCapabilitiesResponseSchema,
  BatchGenerationRefResponseSchema,
} from "@kidlearn/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../../app.js";
import { auth } from "../../../config/auth.js";
import { assertContract } from "../../../openapi/assert-contract.js";
import {
  type Curriculum,
  createCurriculum,
  createSignedInAdmin,
} from "../../../shared/testing/factories.js";
import { connectMcp } from "../../../shared/testing/mcp-client.js";
import request from "../../../shared/testing/request.js";
import { createAccessToken } from "../access-tokens/access-tokens.service.js";

/** `/api/admin/ai` and `/mcp` with `GEMINI_API_KEY` unset (FR-AI-10). Its own file because `env` is read once at import. */

// Empty rather than deleted: dotenv would refill a deleted key from a developer's local env file, and never overwrites a set one.
vi.hoisted(() => {
  process.env.GEMINI_API_KEY = "";
});

// The Gemini generators are replaced only to prove a refused request never reaches them.
const generators = vi.hoisted(() => ({
  generateLesson: vi.fn(),
  generateStory: vi.fn(),
  generateQuiz: vi.fn(),
  generateIllustrationBatch: vi.fn(),
}));

vi.mock("./generators/lesson.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./generators/lesson.js")>()),
  generateLesson: generators.generateLesson,
}));
vi.mock("./generators/story.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./generators/story.js")>()),
  generateStory: generators.generateStory,
}));
vi.mock("./generators/quiz.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./generators/quiz.js")>()),
  generateQuiz: generators.generateQuiz,
}));
vi.mock("./generators/illustration.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./generators/illustration.js")>()),
  generateIllustrationBatch: generators.generateIllustrationBatch,
}));
// Narration runs for real against the database; only the provider call and the upload are replaced.
vi.mock("./google-tts.js", () => ({
  generateNarration: async () => Buffer.from("audio"),
}));
vi.mock("../media/media.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../media/media.service.js")>()),
  uploadBuffer: async () => "https://res.cloudinary.com/test/clip.mp3",
}));

let admin: AdminUser;
let curriculum: Curriculum;

beforeEach(async () => {
  admin = await createSignedInAdmin();
  curriculum = await createCurriculum("draft");
  // Real rows behind the session; only the cookie lookup is skipped, so the deep better-auth type is narrowed here.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: { id: admin.authUserId },
    session: {
      id: "session-1",
      userId: admin.authUserId,
      createdAt: new Date(),
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("without a Gemini key", () => {
  it.each([
    [
      "lesson",
      () => ({
        gradeLevel: "KG1",
        subjectId: curriculum.subject.id,
        topicId: curriculum.topic.id,
        lessonFocus: "The letter A",
        languages: ["en"],
      }),
      generators.generateLesson,
    ],
    [
      "story",
      () => ({
        gradeLevels: ["KG1"],
        theme: "Sharing",
        worldId: curriculum.world.id,
        languages: ["en"],
      }),
      generators.generateStory,
    ],
    [
      "quiz",
      () => ({ lessonId: curriculum.lesson.id, languages: ["en"] }),
      generators.generateQuiz,
    ],
    [
      "illustrations",
      () => ({ storyId: "66666666-6666-4666-8666-666666666666" }),
      generators.generateIllustrationBatch,
    ],
  ])(
    "refuses /generate/%s with 503 before reaching the generator",
    async (path, body, generate) => {
      const res = await request(app)
        .post(`/api/admin/ai/generate/${path}`)
        .send(body());

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it("still narrates, which runs on Cloud TTS rather than Gemini", async () => {
    const res = await request(app)
      .post("/api/admin/ai/generate/narration")
      .send({ entity: "lesson", id: curriculum.lesson.id });

    expect(res.status).toBe(202);
    assertContract(
      BatchGenerationRefResponseSchema,
      res.body,
      "POST /api/admin/ai/generate/narration",
    );
    expect(res.body.data.jobIds.length).toBeGreaterThan(0);
  });

  it("reports Gemini as unavailable so the CMS can hide its Generate dialogs", async () => {
    const res = await request(app).get("/api/admin/ai/capabilities");

    assertContract(
      AiCapabilitiesResponseSchema,
      res.body,
      "GET /api/admin/ai/capabilities",
    );
    expect(res.body.data).toMatchObject({
      geminiText: false,
      geminiImage: false,
      narration: true,
    });
  });

  it("answers request_illustrations over MCP with a tool error naming the manual path", async () => {
    const { secret } = await createAccessToken(admin.id, {
      name: "Claude Code",
      expiresInDays: 7,
    });
    const session = await connectMcp(app, secret);

    try {
      const result = await session.client.callTool({
        name: "request_illustrations",
        arguments: { storyId: "66666666-6666-4666-8666-666666666666" },
      });

      expect(result.isError).toBe(true);
      // A tool error here is always one text block; the SDK types `content` loosely across protocol versions.
      expect((result.content as Array<{ text: string }>)[0].text).toContain(
        "uploaded by hand",
      );
      expect(generators.generateIllustrationBatch).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });
});
