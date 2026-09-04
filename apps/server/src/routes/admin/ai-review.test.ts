/**
 * `/api/admin/ai/jobs/*` — the review queue's HTTP surface (file 37, FR-AI-07,
 * FR-CMS-05..06).
 *
 * **A second suite over `routes/admin/ai.ts`**, rather than more cases in
 * `ai.test.ts`. That file mocks the five generator services at their own boundary
 * because it is about the generation routes; this one mocks the review service
 * for the guard and contract cases and then runs it for real against a stubbed
 * database, because the queue's interesting claims are about what a decision
 * writes. One file cannot hold both mockings of the same module, and splitting
 * by concern is what keeps each stub honest about what it proves.
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* One array per table, written by the service
 *     under test. The approve round trip reads back the lesson row it moved.
 *  2. *Assert the query, not just the result.* The claim that an unauthenticated
 *     caller cannot decide anything is negative, so it is asserted as the job
 *     still sitting at `awaiting_review` afterwards rather than only as a `401`.
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here
 *     serves student-facing content. That a rejected row cannot reach a child is
 *     the student API's filter, covered in `routes/content.test.ts`.
 *  4. *Name what the stub cannot prove.* Atomicity across the job update and the
 *     status chain is Postgres's; the stub runs the `$transaction` callback
 *     directly. `services/ai/review.test.ts` asserts the isolation level asked
 *     for, and this file asserts the HTTP contract over the top of it.
 */

import {
  AiJobCountResponseSchema,
  AiJobDetailResponseSchema,
  AiJobListResponseSchema,
  AiReviewResultResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";

const BASE = "/api/admin/ai/jobs";

const ADMIN_USER_ID = "user_admin_1";
const PARENT_USER_ID = "user_parent_1";
const ADMIN_ID = "44444444-4444-4444-8444-444444444444";

const LESSON_JOB_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const AUDIO_JOB_ID = "aaaaaaaa-0000-4000-8000-000000000002";
const MISSING_JOB_ID = "aaaaaaaa-0000-4000-8000-00000000000f";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  admins: [] as Array<Record<string, unknown> & { authUserId: string | null }>,
  jobs: [] as Row[],
  lessons: [] as Row[],
  quizzes: [] as Row[],
  questions: [] as Row[],
  activities: [] as Row[],
  stories: [] as Row[],
  mediaAssets: [] as Row[],
  lessonTranslations: [] as Row[],
}));

const db = vi.hoisted(() => ({ adminFindUnique: vi.fn() }));

vi.mock("../../lib/prisma.js", () => {
  /**
   * Applies a `where` clause, including the `AND`/`OR` nesting and the
   * `input: { path, equals | array_contains }` JSON filters `listJobs` builds.
   */
  const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === "AND") {
        return (value as Array<Record<string, unknown>>).every((clause) =>
          matches(row, clause),
        );
      }
      if (key === "OR") {
        return (value as Array<Record<string, unknown>>).some((clause) =>
          matches(row, clause),
        );
      }
      if (
        value !== null &&
        typeof value === "object" &&
        !(value instanceof Date)
      ) {
        const filter = value as Record<string, unknown>;
        if (!("path" in filter)) return true;
        const source = row[key] as Record<string, unknown> | undefined;
        const at = source?.[(filter.path as string[])[0]];
        if ("equals" in filter) return at === filter.equals;
        if ("array_contains" in filter) {
          const wanted = filter.array_contains as unknown[];
          return (
            Array.isArray(at) &&
            wanted.every((one) => (at as unknown[]).includes(one))
          );
        }
        return true;
      }
      return row[key] === value;
    });

  function table(rows: () => Row[]) {
    return {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        rows().filter((row) => matches(row, where)),
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        rows().find((row) => matches(row, where)) ?? null,
      findUniqueOrThrow: async ({
        where,
      }: {
        where: Record<string, unknown>;
      }) => {
        const found = rows().find((row) => matches(row, where));
        if (!found) throw new Error("not found");
        return found;
      },
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const found = rows().find((row) => matches(row, where));
        if (!found) throw new Error("not found");
        Object.assign(found, data);
        return found;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const found = rows().filter((row) => matches(row, where));
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
      count: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        rows().filter((row) => matches(row, where)).length,
    };
  }

  const translationTable = (rows: () => Row[], parentKey: string) => {
    const find = (where: Record<string, unknown>) => {
      const compound = Object.values(where)[0] as Record<string, unknown>;
      return rows().find(
        (row) =>
          row[parentKey] === compound[parentKey] &&
          row.language === compound.language,
      );
    };
    return {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        find(where) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const found = find(where);
        if (!found) throw new Error("translation row not found");
        Object.assign(found, data);
        return found;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const found = find(where);
        if (found) {
          Object.assign(found, update);
          return found;
        }
        const row: Row = { id: `translation-${rows().length + 1}`, ...create };
        rows().push(row);
        return row;
      },
    };
  };

  const client = {
    adminUser: { findUnique: db.adminFindUnique },
    aIGenerationJob: table(() => store.jobs),
    lesson: table(() => store.lessons),
    quiz: table(() => store.quizzes),
    activity: table(() => store.activities),
    story: table(() => store.stories),
    storyPage: table(() => []),
    mediaAsset: table(() => store.mediaAssets),
    quizQuestion: {
      ...table(() => store.questions),
      findMany: async ({
        where = {},
        select,
      }: {
        where?: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) => {
        const rows = store.questions.filter((row) => matches(row, where));
        if (select?.quiz === undefined) return rows;
        return rows.map((row) => ({
          quiz: store.quizzes.find((quiz) => quiz.id === row.quizId),
        }));
      },
    },
    lessonTranslation: translationTable(
      () => store.lessonTranslations,
      "lessonId",
    ),
    storyPageTranslation: translationTable(() => [], "storyPageId"),
    quizQuestionTranslation: translationTable(() => [], "questionId"),
    // Present so a stray parent-provisioning read fails loudly: no admin route
    // may create a Parent row.
    parent: { findUnique: vi.fn(), upsert: vi.fn() },
    account: { findFirst: vi.fn() },
  };

  return {
    prisma: {
      ...client,
      $transaction: async (run: (tx: unknown) => unknown) => run(client),
    },
  };
});

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

function seedLessonJob(overrides: Record<string, unknown> = {}): void {
  store.jobs.push({
    id: LESSON_JOB_ID,
    type: "lesson",
    status: "awaiting_review",
    decision: null,
    input: {
      gradeLevel: "KG1",
      languages: ["en", "bn"],
      lessonFocus: "The letter A",
    },
    rawOutput: { attempts: [{ attempt: 1, usage: { inputTokens: 10 } }] },
    reviewerId: null,
    reviewNote: null,
    createdAt: new Date("2026-09-01T09:00:00.000Z"),
    updatedAt: new Date("2026-09-01T09:00:00.000Z"),
    reviewedAt: null,
    ...overrides,
  });
  store.lessons.push({
    id: "lesson-1",
    title: "The letter A",
    status: "draft",
    aiJobId: LESSON_JOB_ID,
    createdAt: new Date(),
  });
  store.quizzes.push({
    id: "quiz-1",
    title: "The letter A",
    status: "draft",
    aiJobId: LESSON_JOB_ID,
    createdAt: new Date(),
  });
  store.questions.push({
    id: "question-1",
    quizId: "quiz-1",
    sortOrder: 1,
    aiJobId: LESSON_JOB_ID,
    definition: { type: "mcq", prompt: { en: "Which is A?", bn: "কোনটি A?" } },
  });
}

function seedAudioJob(): void {
  store.jobs.push({
    id: AUDIO_JOB_ID,
    type: "audio",
    status: "awaiting_review",
    decision: null,
    input: {
      entity: "lesson",
      entityId: "lesson-9",
      targetTable: "LessonTranslation",
      targetId: "lesson-9",
      locale: "bn",
      text: "চলো A শিখি",
    },
    rawOutput: {},
    reviewerId: null,
    reviewNote: null,
    createdAt: new Date("2026-09-02T09:00:00.000Z"),
    updatedAt: new Date("2026-09-02T09:00:00.000Z"),
    reviewedAt: null,
  });
  store.mediaAssets.push({
    id: "asset-1",
    url: "https://cdn.example.test/clip.mp3",
    kind: "audio",
    language: "bn",
    aiJobId: AUDIO_JOB_ID,
    createdAt: new Date(),
  });
  store.lessonTranslations.push({
    id: "translation-1",
    lessonId: "lesson-9",
    language: "bn",
    introScript: "চলো A শিখি",
    introAudioAssetId: null,
  });
}

beforeEach(() => {
  store.jobs = [];
  store.lessons = [];
  store.quizzes = [];
  store.questions = [];
  store.activities = [];
  store.stories = [];
  store.mediaAssets = [];
  store.lessonTranslations = [];
  store.admins = [
    {
      id: ADMIN_ID,
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
  mockSession(ADMIN_USER_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * `requireAdmin` guards the parent router, so it holds for every path here by
 * construction — but "by construction" is exactly the claim a route mounted in
 * the wrong place breaks, and the decision routes are the two in this product
 * that can make content visible to a child.
 */
describe("the admin guard", () => {
  const DECISIONS: Array<{
    path: () => string;
    send: Record<string, unknown>;
  }> = [
    { path: () => `${BASE}/${LESSON_JOB_ID}/approve`, send: {} },
    {
      path: () => `${BASE}/${LESSON_JOB_ID}/reject`,
      send: { reason: "The Bangla reads as a translation." },
    },
  ];

  for (const route of DECISIONS) {
    it(`401s an unauthenticated POST ${route.path()}, deciding nothing`, async () => {
      seedLessonJob();
      vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

      const res = await request(app).post(route.path()).send(route.send);

      expect(res.status).toBe(401);
      expect(store.jobs[0].status).toBe("awaiting_review");
      expect(store.lessons[0].status).toBe("draft");
    });

    it(`403s a signed-in parent on POST ${route.path()}, deciding nothing`, async () => {
      // A Google sign-in never writes an AdminUser row, and that absence *is* the
      // authorisation check (spec §4.3).
      seedLessonJob();
      mockSession(PARENT_USER_ID);

      const res = await request(app).post(route.path()).send(route.send);

      expect(res.status).toBe(403);
      expect(store.jobs[0].status).toBe("awaiting_review");
      expect(store.lessons[0].status).toBe("draft");
    });
  }

  it("401s the list", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get(BASE);

    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/ai/jobs", () => {
  const OPERATION = "GET /api/admin/ai/jobs";

  it("defaults to the jobs awaiting review", async () => {
    seedLessonJob();
    store.jobs.push({
      id: "bbbbbbbb-0000-4000-8000-000000000001",
      type: "story",
      status: "approved",
      decision: "approve",
      input: {},
      rawOutput: {},
      reviewerId: ADMIN_ID,
      reviewNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: new Date(),
    });

    const res = await request(app).get(BASE);

    expect(res.status).toBe(200);
    assertContract(AiJobListResponseSchema, res.body, OPERATION);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.jobs[0].id).toBe(LESSON_JOB_ID);
  });

  it("filters by type", async () => {
    seedLessonJob();
    seedAudioJob();

    const res = await request(app).get(`${BASE}?type=audio`);

    expect(res.status).toBe(200);
    expect(res.body.data.jobs.map((job: { id: string }) => job.id)).toEqual([
      AUDIO_JOB_ID,
    ]);
  });

  it("filters by language against the job's input JSON", async () => {
    // The filter reaches into `input`, which is where the generator recorded what
    // it was asked for — there is no column to filter on, deliberately.
    seedLessonJob();
    store.jobs.push({
      id: "bbbbbbbb-0000-4000-8000-000000000002",
      type: "story",
      status: "awaiting_review",
      decision: null,
      input: { gradeLevels: ["NURSERY"], languages: ["en"] },
      rawOutput: {},
      reviewerId: null,
      reviewNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
    });

    const res = await request(app).get(`${BASE}?language=bn`);

    expect(res.status).toBe(200);
    expect(res.body.data.jobs.map((job: { id: string }) => job.id)).toEqual([
      LESSON_JOB_ID,
    ]);
  });

  it("filters by grade level, matching a scalar or an array", async () => {
    seedLessonJob();
    store.jobs.push({
      id: "bbbbbbbb-0000-4000-8000-000000000003",
      type: "story",
      status: "awaiting_review",
      decision: null,
      input: { gradeLevels: ["KG1", "KG2"], languages: ["en"] },
      rawOutput: {},
      reviewerId: null,
      reviewNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
    });

    const res = await request(app).get(`${BASE}?gradeLevel=KG1`);

    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toHaveLength(2);
  });

  it("400s a status that is not a status", async () => {
    const res = await request(app).get(`${BASE}?status=maybe`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("GET /api/admin/ai/jobs/count", () => {
  it("answers with the awaiting-review count", async () => {
    seedLessonJob();
    seedAudioJob();

    const res = await request(app).get(`${BASE}/count`);

    expect(res.status).toBe(200);
    assertContract(
      AiJobCountResponseSchema,
      res.body,
      "GET /api/admin/ai/jobs/count",
    );
    expect(res.body.data).toEqual({ awaitingReview: 2 });
  });

  it("is not shadowed by the detail route", async () => {
    // `count` is a valid path segment, so registration order is what keeps every
    // badge poll from landing in the uuid params validator.
    const res = await request(app).get(`${BASE}/count`);

    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/ai/jobs/:id", () => {
  const OPERATION = "GET /api/admin/ai/jobs/{id}";

  it("returns the job, its content rows and its audit record", async () => {
    seedLessonJob();

    const res = await request(app).get(`${BASE}/${LESSON_JOB_ID}`);

    expect(res.status).toBe(200);
    assertContract(AiJobDetailResponseSchema, res.body, OPERATION);
    expect(res.body.data.entities).toHaveLength(2);
    expect(res.body.data.rawOutput).toMatchObject({
      attempts: [{ attempt: 1 }],
    });
    expect(res.body.data.blockers).toEqual([]);
  });

  it("returns the unattached asset for a media job", async () => {
    seedAudioJob();

    const res = await request(app).get(`${BASE}/${AUDIO_JOB_ID}`);

    expect(res.status).toBe(200);
    assertContract(AiJobDetailResponseSchema, res.body, OPERATION);
    expect(res.body.data.assets[0]).toMatchObject({
      targetTable: "LessonTranslation",
      isAttached: false,
    });
  });

  it("404s an unknown job", async () => {
    const res = await request(app).get(`${BASE}/${MISSING_JOB_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("400s an id that is not a uuid", async () => {
    const res = await request(app).get(`${BASE}/not-a-uuid`);

    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/ai/jobs/:id/approve", () => {
  const OPERATION = "POST /api/admin/ai/jobs/{id}/approve";

  it("publishes the lesson and its quiz, and records the decision", async () => {
    seedLessonJob();

    const res = await request(app).post(`${BASE}/${LESSON_JOB_ID}/approve`);

    expect(res.status).toBe(200);
    assertContract(AiReviewResultResponseSchema, res.body, OPERATION);
    expect(store.lessons[0].status).toBe("published");
    expect(store.quizzes[0].status).toBe("published");
    expect(res.body.data.job).toMatchObject({
      status: "approved",
      decision: "approve",
      reviewerId: ADMIN_ID,
    });
  });

  it("attaches a media job's asset to the key the generation recorded", async () => {
    seedAudioJob();

    const res = await request(app).post(`${BASE}/${AUDIO_JOB_ID}/approve`);

    expect(res.status).toBe(200);
    assertContract(AiReviewResultResponseSchema, res.body, OPERATION);
    expect(res.body.data.attachedAssetIds).toEqual(["asset-1"]);
    expect(store.lessonTranslations[0].introAudioAssetId).toBe("asset-1");
  });

  it("409s with the blockers when a question still holds a placeholder asset", async () => {
    seedLessonJob();
    store.questions[0].definition = {
      type: "picture_selection",
      options: [
        { image: { url: "https://placeholder.kidlearn.invalid/a.png" } },
      ],
    };

    const res = await request(app).post(`${BASE}/${LESSON_JOB_ID}/approve`);

    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ code: "APPROVAL_BLOCKED" });
    expect(store.lessons[0].status).toBe("draft");
  });

  it("409s a job that has already been decided", async () => {
    seedLessonJob({ status: "approved", decision: "approve" });

    const res = await request(app).post(`${BASE}/${LESSON_JOB_ID}/approve`);

    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({
      code: "JOB_NOT_AWAITING_REVIEW",
    });
  });

  it("404s an unknown job", async () => {
    const res = await request(app).post(`${BASE}/${MISSING_JOB_ID}/approve`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/ai/jobs/:id/reject", () => {
  const OPERATION = "POST /api/admin/ai/jobs/{id}/reject";
  const REASON = "The Bangla script reads as a translation, not as speech.";

  it("rejects the content and stores the reason", async () => {
    seedLessonJob();

    const res = await request(app)
      .post(`${BASE}/${LESSON_JOB_ID}/reject`)
      .send({ reason: REASON });

    expect(res.status).toBe(200);
    assertContract(AiReviewResultResponseSchema, res.body, OPERATION);
    expect(store.lessons[0].status).toBe("rejected");
    expect(res.body.data.job).toMatchObject({
      status: "rejected",
      decision: "reject",
      reviewNote: REASON,
      reviewerId: ADMIN_ID,
    });
  });

  it("400s a reason shorter than ten characters", async () => {
    seedLessonJob();

    const res = await request(app)
      .post(`${BASE}/${LESSON_JOB_ID}/reject`)
      .send({ reason: "no" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(store.jobs[0].status).toBe("awaiting_review");
  });

  it("400s a body with no reason at all", async () => {
    seedLessonJob();

    const res = await request(app)
      .post(`${BASE}/${LESSON_JOB_ID}/reject`)
      .send({});

    expect(res.status).toBe(400);
    expect(store.lessons[0].status).toBe("draft");
  });

  it("keeps the audit record, so a rejected generation stays diagnosable", async () => {
    seedLessonJob();

    await request(app)
      .post(`${BASE}/${LESSON_JOB_ID}/reject`)
      .send({ reason: REASON });

    expect(store.jobs[0].rawOutput).toMatchObject({
      attempts: [{ attempt: 1 }],
    });
  });
});
