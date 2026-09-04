/**
 * `/api/admin/ai` — the generation pipeline's HTTP surface (files 34–36,
 * FR-AI-01..05).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* One `admins` array behind the guard, and the
 *     generator services are mocked at their own boundary: this suite is about
 *     the routes — guards, validation, status codes, contracts — and what each
 *     generator writes is asserted against a stubbed database in
 *     `services/ai/generators/{lesson,story,quiz}.test.ts`.
 *  2. *Assert the query, not just the result.* The claim this file makes about
 *     the database is negative — an unauthenticated or non-admin request must not
 *     reach the generator at all — so it asserts the service was never called.
 *     The one positive claim is the daily cap's: the stubbed `count` applies the
 *     `type.in` clause to a jobs array, so "the audio bucket is full" is
 *     expressed as audio rows rather than as a queued number, and the test that
 *     a full audio bucket still lets a lesson through means something.
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here
 *     reads content.
 *  4. *Name what the stub cannot prove.* That generated content is invisible to
 *     a child is a property of the student API's `status: "published"` filter,
 *     asserted in `routes/content.test.ts` and `routes/stories.test.ts`, and of
 *     the `draft` default, asserted in the generator suites. Neither is provable
 *     from here. Nor is the *reason* the quiz route refuses a published quiz —
 *     the guard lives in the generator, and this file asserts only that its `409`
 *     survives the HTTP boundary with its `details.code` intact.
 */

import {
  BatchGenerationRefResponseSchema,
  GenerationJobRefResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../lib/env.js";
import { assertContract } from "../../openapi/assert-contract.js";

const BASE = "/api/admin/ai";
const PATH = `${BASE}/generate/lesson`;
const STORY_PATH = `${BASE}/generate/story`;
const QUIZ_PATH = `${BASE}/generate/quiz`;
const NARRATION_PATH = `${BASE}/generate/narration`;
const ILLUSTRATIONS_PATH = `${BASE}/generate/illustrations`;
const OPERATION = "POST /api/admin/ai/generate/lesson";
const STORY_OPERATION = "POST /api/admin/ai/generate/story";
const QUIZ_OPERATION = "POST /api/admin/ai/generate/quiz";
const NARRATION_OPERATION = "POST /api/admin/ai/generate/narration";
const ILLUSTRATIONS_OPERATION = "POST /api/admin/ai/generate/illustrations";

const ADMIN_USER_ID = "user_admin_1";
const PARENT_USER_ID = "user_parent_1";

const TOPIC_ID = "11111111-1111-4111-8111-111111111111";
const LESSON_ID = "55555555-5555-4555-8555-555555555555";
const SUBJECT_ID = "22222222-2222-4222-8222-222222222222";
const WORLD_ID = "33333333-3333-4333-8333-333333333333";
const STORY_ID = "66666666-6666-4666-8666-666666666666";
const QUIZ_ID = "77777777-7777-4777-8777-777777777777";

const store = vi.hoisted(() => ({
  admins: [] as Array<Record<string, unknown> & { authUserId: string | null }>,
  /** The rows `requireGenerationBudget` counts (file 36). */
  jobs: [] as Array<{ type: string; createdAt: Date }>,
}));

const db = vi.hoisted(() => ({ adminFindUnique: vi.fn() }));
const service = vi.hoisted(() => ({
  generateLesson: vi.fn(),
  generateStory: vi.fn(),
  generateQuiz: vi.fn(),
  generateNarrationBatch: vi.fn(),
  generateIllustrationBatch: vi.fn(),
}));

vi.mock("../../services/ai/generators/lesson.js", () => ({
  generateLesson: service.generateLesson,
}));

vi.mock("../../services/ai/generators/story.js", () => ({
  generateStory: service.generateStory,
}));

vi.mock("../../services/ai/generators/quiz.js", () => ({
  generateQuiz: service.generateQuiz,
}));

vi.mock("../../services/ai/generators/narration.js", () => ({
  generateNarrationBatch: service.generateNarrationBatch,
}));

vi.mock("../../services/ai/generators/illustration.js", () => ({
  generateIllustrationBatch: service.generateIllustrationBatch,
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    adminUser: { findUnique: db.adminFindUnique },
    // Present so a stray parent-provisioning read fails loudly: no admin route
    // may create a Parent row.
    parent: { findUnique: vi.fn(), upsert: vi.fn() },
    account: { findFirst: vi.fn() },
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

const { app } = await import("../../app.js");
const { auth } = await import("../../lib/auth.js");

function mockSession(userId: string) {
  // Only the fields the guards read are supplied, so the deep better-auth return
  // type is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: { id: userId, email: "someone@example.com", name: "Someone" },
    session: { id: `session_${userId}`, userId },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    gradeLevel: "KG1",
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    lessonFocus: "The letter A",
    languages: ["en", "bn"],
    ...overrides,
  };
}

function storyBody(overrides: Record<string, unknown> = {}) {
  return {
    gradeLevels: ["NURSERY", "KG1"],
    theme: "Sharing with friends",
    worldId: WORLD_ID,
    languages: ["en", "bn"],
    ...overrides,
  };
}

function quizBody(overrides: Record<string, unknown> = {}) {
  return {
    lessonId: LESSON_ID,
    count: 4,
    languages: ["en", "bn"],
    ...overrides,
  };
}

function fillBucket(type: string, count: number): void {
  for (let index = 0; index < count; index += 1) {
    store.jobs.push({ type, createdAt: new Date() });
  }
}

function narrationBody(overrides: Record<string, unknown> = {}) {
  return { entity: "lesson", id: LESSON_ID, ...overrides };
}

function illustrationsBody(overrides: Record<string, unknown> = {}) {
  return { storyId: STORY_ID, ...overrides };
}

beforeEach(() => {
  store.jobs = [];
  store.admins = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      email: "reviewer@kidlearn.test",
      name: "Reviewer One",
      role: "admin",
      authUserId: ADMIN_USER_ID,
    },
  ];
  db.adminFindUnique.mockReset();
  db.adminFindUnique.mockImplementation(
    async ({ where }: { where: { authUserId?: string } }) =>
      store.admins.find((row) => row.authUserId === where.authUserId) ?? null,
  );
  for (const generate of [
    service.generateLesson,
    service.generateStory,
    service.generateQuiz,
  ]) {
    generate.mockReset();
    generate.mockResolvedValue({ jobId: "job-1", status: "awaiting_review" });
  }
  for (const batch of [
    service.generateNarrationBatch,
    service.generateIllustrationBatch,
  ]) {
    batch.mockReset();
    batch.mockResolvedValue({
      jobIds: ["job-1", "job-2"],
      skipped: 1,
      failed: 0,
    });
  }
  mockSession(ADMIN_USER_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The guard is `requireAdmin` on the parent router, so it holds for every path
 * here by construction — but "by construction" is exactly the claim a new route
 * mounted in the wrong place breaks, so each generator is checked in its own
 * right.
 */
const GUARDED: Array<{
  path: string;
  send: () => Record<string, unknown>;
  generate: () => unknown;
}> = [
  { path: PATH, send: body, generate: () => service.generateLesson },
  { path: STORY_PATH, send: storyBody, generate: () => service.generateStory },
  { path: QUIZ_PATH, send: quizBody, generate: () => service.generateQuiz },
  {
    path: NARRATION_PATH,
    send: narrationBody,
    generate: () => service.generateNarrationBatch,
  },
  {
    path: ILLUSTRATIONS_PATH,
    send: illustrationsBody,
    generate: () => service.generateIllustrationBatch,
  },
];

describe("the admin guard", () => {
  for (const route of GUARDED) {
    it(`401s an unauthenticated POST ${route.path}, without reaching the generator`, async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

      const res = await request(app).post(route.path).send(route.send());

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(route.generate()).not.toHaveBeenCalled();
    });

    it(`403s a signed-in parent on POST ${route.path}, without reaching the generator`, async () => {
      // A Google sign-in never writes an AdminUser row, and that absence *is* the
      // authorisation check (spec §4.3).
      mockSession(PARENT_USER_ID);

      const res = await request(app).post(route.path).send(route.send());

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(route.generate()).not.toHaveBeenCalled();
    });
  }
});

describe("POST /api/admin/ai/generate/lesson", () => {
  it("202s with the job reference for an admin", async () => {
    const res = await request(app).post(PATH).send(body());

    expect(res.status).toBe(202);
    assertContract(GenerationJobRefResponseSchema, res.body, OPERATION);
    expect(res.body.data).toEqual({
      jobId: "job-1",
      status: "awaiting_review",
    });
  });

  it("202s with a failed job rather than an error status", async () => {
    // A generation that could not produce valid output is not a broken request.
    // The job row exists and holds both attempts (FR-AI-08), so the caller is
    // given it and branches on `status`.
    service.generateLesson.mockResolvedValue({
      jobId: "job-2",
      status: "failed",
    });

    const res = await request(app).post(PATH).send(body());

    expect(res.status).toBe(202);
    assertContract(GenerationJobRefResponseSchema, res.body, OPERATION);
    expect(res.body.data.status).toBe("failed");
  });

  it("passes the admin's parameters through unchanged", async () => {
    await request(app)
      .post(PATH)
      .send(body({ worldId: WORLD_ID }));

    expect(service.generateLesson).toHaveBeenCalledWith({
      gradeLevel: "KG1",
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      worldId: WORLD_ID,
      lessonFocus: "The letter A",
      languages: ["en", "bn"],
    });
  });

  it("400s on an unknown grade", async () => {
    const res = await request(app)
      .post(PATH)
      .send(body({ gradeLevel: "KG3" }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(service.generateLesson).not.toHaveBeenCalled();
  });

  it("400s on an empty language list", async () => {
    const res = await request(app)
      .post(PATH)
      .send(body({ languages: [] }));

    expect(res.status).toBe(400);
    expect(service.generateLesson).not.toHaveBeenCalled();
  });

  it("400s on a repeated language", async () => {
    // A repeat asks for the same script twice and would make the schema's locale
    // keys ambiguous.
    const res = await request(app)
      .post(PATH)
      .send(body({ languages: ["en", "en"] }));

    expect(res.status).toBe(400);
    expect(service.generateLesson).not.toHaveBeenCalled();
  });

  it("400s on a status the caller tried to smuggle in", async () => {
    // `.strict()` is what keeps generated content out of `published`: there must
    // be no body key that names a status, on this route above all (FR-AI-07).
    const res = await request(app)
      .post(PATH)
      .send({ ...body(), status: "published" });

    expect(res.status).toBe(400);
    expect(service.generateLesson).not.toHaveBeenCalled();
  });

  it("400s on a lesson focus too short to prompt from", async () => {
    const res = await request(app)
      .post(PATH)
      .send(body({ lessonFocus: "A" }));

    expect(res.status).toBe(400);
    expect(service.generateLesson).not.toHaveBeenCalled();
  });

  it("surfaces the generator's 409 for a topic outside the named subject", async () => {
    const { ApiError } = await import("../../lib/errors.js");
    service.generateLesson.mockRejectedValue(
      ApiError.conflict("That topic does not belong to that subject"),
    );

    const res = await request(app).post(PATH).send(body());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("surfaces the generator's 404 for an unknown topic", async () => {
    const { ApiError } = await import("../../lib/errors.js");
    service.generateLesson.mockRejectedValue(
      ApiError.notFound("No such topic"),
    );

    const res = await request(app).post(PATH).send(body());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/admin/ai/generate/story", () => {
  it("202s with the job reference for an admin", async () => {
    const res = await request(app).post(STORY_PATH).send(storyBody());

    expect(res.status).toBe(202);
    assertContract(GenerationJobRefResponseSchema, res.body, STORY_OPERATION);
    expect(res.body.data).toEqual({
      jobId: "job-1",
      status: "awaiting_review",
    });
  });

  it("202s with a failed job rather than an error status", async () => {
    service.generateStory.mockResolvedValue({
      jobId: "job-3",
      status: "failed",
    });

    const res = await request(app).post(STORY_PATH).send(storyBody());

    expect(res.status).toBe(202);
    assertContract(GenerationJobRefResponseSchema, res.body, STORY_OPERATION);
    expect(res.body.data.status).toBe("failed");
  });

  it("passes the admin's parameters through unchanged", async () => {
    await request(app)
      .post(STORY_PATH)
      .send(storyBody({ pageCount: 6 }));

    expect(service.generateStory).toHaveBeenCalledWith({
      gradeLevels: ["NURSERY", "KG1"],
      theme: "Sharing with friends",
      worldId: WORLD_ID,
      languages: ["en", "bn"],
      pageCount: 6,
    });
  });

  it("400s on a page count outside the 6–8 range a young child sits through", async () => {
    const res = await request(app)
      .post(STORY_PATH)
      .send(storyBody({ pageCount: 12 }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(service.generateStory).not.toHaveBeenCalled();
  });

  it("400s on an empty grade level list", async () => {
    const res = await request(app)
      .post(STORY_PATH)
      .send(storyBody({ gradeLevels: [] }));

    expect(res.status).toBe(400);
    expect(service.generateStory).not.toHaveBeenCalled();
  });

  it("400s on a repeated grade level", async () => {
    const res = await request(app)
      .post(STORY_PATH)
      .send(storyBody({ gradeLevels: ["KG1", "KG1"] }));

    expect(res.status).toBe(400);
    expect(service.generateStory).not.toHaveBeenCalled();
  });

  it("400s on a theme too short to prompt from", async () => {
    const res = await request(app)
      .post(STORY_PATH)
      .send(storyBody({ theme: "A" }));

    expect(res.status).toBe(400);
    expect(service.generateStory).not.toHaveBeenCalled();
  });

  it("400s on a status the caller tried to smuggle in", async () => {
    // `.strict()` is what keeps generated content out of `published`: there must
    // be no body key that names a status (FR-AI-07).
    const res = await request(app)
      .post(STORY_PATH)
      .send({ ...storyBody(), status: "published" });

    expect(res.status).toBe(400);
    expect(service.generateStory).not.toHaveBeenCalled();
  });

  it("surfaces the generator's 404 for an unknown world", async () => {
    const { ApiError } = await import("../../lib/errors.js");
    service.generateStory.mockRejectedValue(ApiError.notFound("No such world"));

    const res = await request(app).post(STORY_PATH).send(storyBody());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/admin/ai/generate/quiz", () => {
  it("202s with the job reference for an admin", async () => {
    const res = await request(app).post(QUIZ_PATH).send(quizBody());

    expect(res.status).toBe(202);
    assertContract(GenerationJobRefResponseSchema, res.body, QUIZ_OPERATION);
    expect(res.body.data).toEqual({
      jobId: "job-1",
      status: "awaiting_review",
    });
  });

  it("defaults the count in the service rather than the body", async () => {
    // The default lives next to the prompt that has to state it, so the body may
    // legitimately omit it.
    await request(app)
      .post(QUIZ_PATH)
      .send({
        lessonId: LESSON_ID,
        languages: ["en"],
      });

    expect(service.generateQuiz).toHaveBeenCalledWith({
      lessonId: LESSON_ID,
      languages: ["en"],
    });
  });

  it("400s on a count outside the 3–5 range FR-QUIZ-01 sets", async () => {
    const res = await request(app)
      .post(QUIZ_PATH)
      .send(quizBody({ count: 9 }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(service.generateQuiz).not.toHaveBeenCalled();
  });

  it("400s on a grade level, which comes from the lesson and not the caller", async () => {
    // A body that could name a grade would be a way to ask for questions pitched
    // at an age the lesson was not written for.
    const res = await request(app)
      .post(QUIZ_PATH)
      .send({ ...quizBody(), gradeLevel: "NURSERY" });

    expect(res.status).toBe(400);
    expect(service.generateQuiz).not.toHaveBeenCalled();
  });

  it("400s on a lesson id that is not a uuid", async () => {
    const res = await request(app)
      .post(QUIZ_PATH)
      .send(quizBody({ lessonId: "the-letter-a" }));

    expect(res.status).toBe(400);
    expect(service.generateQuiz).not.toHaveBeenCalled();
  });

  it("surfaces the generator's 409 for a published quiz, with its code intact", async () => {
    // The client branches on `details.code` to tell this apart from any other
    // conflict on the same status — it is the difference between "withdraw the
    // quiz" and something the admin cannot act on.
    const { ApiError } = await import("../../lib/errors.js");
    service.generateQuiz.mockRejectedValue(
      ApiError.conflict(
        "Unpublish the lesson's quiz before generating questions",
        {
          code: "QUIZ_PUBLISHED",
        },
      ),
    );

    const res = await request(app).post(QUIZ_PATH).send(quizBody());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.details).toEqual({ code: "QUIZ_PUBLISHED" });
  });

  it("surfaces the generator's 404 for an unknown lesson", async () => {
    const { ApiError } = await import("../../lib/errors.js");
    service.generateQuiz.mockRejectedValue(ApiError.notFound("No such lesson"));

    const res = await request(app).post(QUIZ_PATH).send(quizBody());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/admin/ai/generate/narration", () => {
  it("202s with the batch reference for an admin", async () => {
    const res = await request(app).post(NARRATION_PATH).send(narrationBody());

    expect(res.status).toBe(202);
    assertContract(
      BatchGenerationRefResponseSchema,
      res.body,
      NARRATION_OPERATION,
    );
    expect(res.body.data).toEqual({
      jobIds: ["job-1", "job-2"],
      skipped: 1,
      failed: 0,
    });
  });

  it("202s with no jobs at all when everything already has audio", async () => {
    // Re-running the action on finished work is the ordinary case, not an error:
    // nothing was wrong with the request, and `skipped` is what says so.
    service.generateNarrationBatch.mockResolvedValue({
      jobIds: [],
      skipped: 4,
      failed: 0,
    });

    const res = await request(app).post(NARRATION_PATH).send(narrationBody());

    expect(res.status).toBe(202);
    assertContract(
      BatchGenerationRefResponseSchema,
      res.body,
      NARRATION_OPERATION,
    );
    expect(res.body.data).toEqual({ jobIds: [], skipped: 4, failed: 0 });
  });

  it("passes the entity and id through unchanged", async () => {
    await request(app)
      .post(NARRATION_PATH)
      .send(narrationBody({ entity: "quiz", id: QUIZ_ID }));

    expect(service.generateNarrationBatch).toHaveBeenCalledWith({
      entity: "quiz",
      id: QUIZ_ID,
    });
  });

  it("400s on an entity that is not a lesson, story or quiz", async () => {
    const res = await request(app)
      .post(NARRATION_PATH)
      .send(narrationBody({ entity: "activity" }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(service.generateNarrationBatch).not.toHaveBeenCalled();
  });

  it("400s on a language the caller tried to choose", async () => {
    // The locales are computed from what has text and no audio. A body that could
    // name one would be a way to re-record an existing clip, or to ask for a
    // Bangla clip on a page with no Bangla text.
    const res = await request(app)
      .post(NARRATION_PATH)
      .send({ ...narrationBody(), language: "bn" });

    expect(res.status).toBe(400);
    expect(service.generateNarrationBatch).not.toHaveBeenCalled();
  });

  it("400s on an id that is not a uuid", async () => {
    const res = await request(app)
      .post(NARRATION_PATH)
      .send(narrationBody({ id: "the-letter-a" }));

    expect(res.status).toBe(400);
    expect(service.generateNarrationBatch).not.toHaveBeenCalled();
  });

  it("surfaces the generator's 404 for an unknown lesson", async () => {
    const { ApiError } = await import("../../lib/errors.js");
    service.generateNarrationBatch.mockRejectedValue(
      ApiError.notFound("No such lesson"),
    );

    const res = await request(app).post(NARRATION_PATH).send(narrationBody());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/admin/ai/generate/illustrations", () => {
  it("202s with the batch reference for an admin", async () => {
    const res = await request(app)
      .post(ILLUSTRATIONS_PATH)
      .send(illustrationsBody());

    expect(res.status).toBe(202);
    assertContract(
      BatchGenerationRefResponseSchema,
      res.body,
      ILLUSTRATIONS_OPERATION,
    );
    expect(res.body.data.jobIds).toEqual(["job-1", "job-2"]);
  });

  it("passes the story id through unchanged", async () => {
    await request(app).post(ILLUSTRATIONS_PATH).send(illustrationsBody());

    expect(service.generateIllustrationBatch).toHaveBeenCalledWith({
      storyId: STORY_ID,
    });
  });

  it("400s on a prompt the caller tried to supply", async () => {
    // A caller-supplied prompt would be a way to draw a picture no character
    // sheet was applied to, which is FR-AI-09 defeated in one request.
    const res = await request(app)
      .post(ILLUSTRATIONS_PATH)
      .send({ ...illustrationsBody(), prompt: "a rabbit, any rabbit" });

    expect(res.status).toBe(400);
    expect(service.generateIllustrationBatch).not.toHaveBeenCalled();
  });

  it("surfaces the generator's 404 for an unknown story", async () => {
    const { ApiError } = await import("../../lib/errors.js");
    service.generateIllustrationBatch.mockRejectedValue(
      ApiError.notFound("No such story"),
    );

    const res = await request(app)
      .post(ILLUSTRATIONS_PATH)
      .send(illustrationsBody());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

/** The daily caps (file 36). */
describe("the daily generation caps", () => {
  it("429s the text generators once the text bucket is full", async () => {
    fillBucket("lesson", env.AI_TEXT_JOBS_PER_DAY);

    const res = await request(app).post(PATH).send(body());

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(service.generateLesson).not.toHaveBeenCalled();
  });

  it("shares one text bucket across lesson, story and quiz", async () => {
    // Three job types, one ceiling: the three cost roughly the same per call, so
    // a day of story writing has to count against the lesson budget.
    fillBucket("story", env.AI_TEXT_JOBS_PER_DAY);

    for (const [path, send] of [
      [PATH, body],
      [STORY_PATH, storyBody],
      [QUIZ_PATH, quizBody],
    ] as const) {
      const res = await request(app).post(path).send(send());
      expect(res.status).toBe(429);
    }
  });

  it("429s narration once the audio bucket is full", async () => {
    fillBucket("audio", env.AI_AUDIO_JOBS_PER_DAY);

    const res = await request(app).post(NARRATION_PATH).send(narrationBody());

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(service.generateNarrationBatch).not.toHaveBeenCalled();
  });

  it("429s illustrations once the image bucket is full", async () => {
    fillBucket("image", env.AI_IMAGE_JOBS_PER_DAY);

    const res = await request(app)
      .post(ILLUSTRATIONS_PATH)
      .send(illustrationsBody());

    expect(res.status).toBe(429);
    expect(service.generateIllustrationBatch).not.toHaveBeenCalled();
  });

  it("does not let a full audio bucket block a lesson generation", async () => {
    // The three ceilings are independent so a morning of narration work cannot
    // stop somebody writing a lesson in the afternoon.
    fillBucket("audio", env.AI_AUDIO_JOBS_PER_DAY);
    fillBucket("image", env.AI_IMAGE_JOBS_PER_DAY);

    const res = await request(app).post(PATH).send(body());

    expect(res.status).toBe(202);
    expect(service.generateLesson).toHaveBeenCalled();
  });

  it("reports the arithmetic in details so the CMS can say what is left", async () => {
    fillBucket("audio", env.AI_AUDIO_JOBS_PER_DAY);

    const res = await request(app).post(NARRATION_PATH).send(narrationBody());

    expect(res.body.error.details).toEqual({
      bucket: "audio",
      cap: env.AI_AUDIO_JOBS_PER_DAY,
      used: env.AI_AUDIO_JOBS_PER_DAY,
      pending: 1,
    });
  });

  it("refuses before validation runs, so a full bucket bills nothing", async () => {
    // The guard sits ahead of the body schema: a request that would have been a
    // `400` still gets the `429`, because there is no budget to spend on finding
    // out what was wrong with it.
    fillBucket("audio", env.AI_AUDIO_JOBS_PER_DAY);

    const res = await request(app)
      .post(NARRATION_PATH)
      .send(narrationBody({ entity: "activity" }));

    expect(res.status).toBe(429);
  });
});
