/**
 * `/api/admin/content/{quizzes,activities,badges}` — the guided editors
 * (file 33, FR-CMS-03, FR-GAM-04).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* Four arrays, and the stub applies each route's
 *     real `where`, `orderBy`, `count` and `_count` to them. So "the second
 *     question got `sortOrder` 1" is a consequence of what the first create wrote,
 *     and the renumbering test reads back rows the delete itself moved.
 *  2. *Assert the query, not just the result.* The round trip below re-parses a
 *     stored `definition` with `parseQuizQuestion` — the throwing parser the
 *     student API's own reader is built on — so the acceptance criterion "parses
 *     when read back raw from Postgres" is asserted against the payload actually
 *     in the store, not against the response body.
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here is
 *     content-gated. This API deliberately returns drafts, and the student gate
 *     lives in `routes/content.ts`, where `content.test.ts` covers it.
 *  4. *Name what the stub cannot prove.* Two things. The unique index behind
 *     `409 DUPLICATE_SLUG` on a badge is asserted against `schema.prisma` at the
 *     bottom of this file rather than by inserting a duplicate, as is the
 *     `@@unique([quizId, sortOrder])` the renumbering exists for. And the
 *     Serializable isolation that makes a concurrent publish-and-edit safe is
 *     asserted as the level passed to `$transaction`, not by racing two writes.
 */

import { readFileSync } from "node:fs";
import { Prisma } from "@kidlearn/db";
import {
  AdminActivityListResponseSchema,
  AdminActivityResponseSchema,
  AdminBadgeListResponseSchema,
  AdminBadgeResponseSchema,
  AdminQuizDetailResponseSchema,
  AdminQuizListResponseSchema,
  AdminQuizQuestionResponseSchema,
  AdminQuizResponseSchema,
  invalidMcqBadCorrectId,
  invalidMcqMissingBanglaPrompt,
  invalidPuzzleSlotCount,
  parseQuizQuestion,
  QuestionDeletedResponseSchema,
  validDragDrop,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";

const BASE = "/api/admin/content";

const ADMIN_USER_ID = "user_admin_1";
const PARENT_USER_ID = "user_parent_1";
/** The `AdminUser.id` behind that session — what a decision is stamped with. */
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

/** Ids are uuids because every params schema demands one. */
const QUIZ_ID = "eeeeeeee-0000-4000-8000-000000000001";
const ACTIVITY_ID = "ffffffff-0000-4000-8000-000000000001";
const BADGE_ID = "aaaaaaaa-1111-4000-8000-000000000001";
const OTHER_QUIZ_ID = "eeeeeeee-0000-4000-8000-000000000002";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  admins: [] as Array<Record<string, unknown> & { authUserId: string | null }>,
  quizzes: [] as Row[],
  questions: [] as Row[],
  activities: [] as Row[],
  badges: [] as Row[],
  /** File 37 — the jobs a `?jobId` save can record its decision on. */
  jobs: [] as Row[],
  /** Isolation levels `$transaction` was called with, for bound 4 above. */
  isolationLevels: [] as Array<string | undefined>,
  nextId: 0,
}));

const db = vi.hoisted(() => ({ adminFindUnique: vi.fn() }));

vi.mock("../../lib/prisma.js", async () => {
  const { Prisma: PrismaNamespace } = await import("@kidlearn/db");

  const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([column, condition]) => {
      if (
        condition !== null &&
        typeof condition === "object" &&
        "not" in condition
      ) {
        return row[column] !== (condition as { not: unknown }).not;
      }
      return row[column] === condition;
    });

  const sort = (list: Row[], orderBy: unknown): Row[] => {
    if (!orderBy) return [...list];
    const entry = Object.entries(orderBy as Record<string, string>)[0];
    if (!entry) return [...list];
    const [column, direction] = entry;
    return [...list].sort((left, right) => {
      const a = left[column];
      const b = right[column];
      if (a === b) return 0;
      const smaller =
        typeof a === "number" && typeof b === "number"
          ? a < b
          : String(a) < String(b);
      return (smaller ? -1 : 1) * (direction === "desc" ? -1 : 1);
    });
  };

  /**
   * A minimal Prisma model over one array.
   *
   * `uniqueColumns` names the unique index the model carries, so inserting a
   * colliding value throws the same `P2002` Postgres would — which is what makes
   * the duplicate-slug path real rather than mocked.
   */
  function table(
    rows: () => Row[],
    defaults: () => Record<string, unknown>,
    uniqueColumns: string[] = [],
  ) {
    return {
      findUnique: async ({
        where,
      }: {
        where: { id: string };
      }): Promise<Row | null> =>
        rows().find((row) => row.id === where.id) ?? null,

      findMany: async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: unknown;
      }) =>
        sort(
          rows().filter((row) => matches(row, where)),
          orderBy,
        ),

      count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows().filter((row) => matches(row, where)).length,

      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.nextId += 1;
        const row: Row = {
          // Uuid-shaped, because every params schema on this surface demands one
          // and a `generated-1` id would fail validation before the handler ran.
          id: `99999999-0000-4000-8000-${String(store.nextId).padStart(12, "0")}`,
          ...defaults(),
          ...data,
        };
        if (
          uniqueColumns.length > 0 &&
          rows().some((existing) =>
            uniqueColumns.every((column) => existing[column] === row[column]),
          )
        ) {
          throw new PrismaNamespace.PrismaClientKnownRequestError(
            "Unique constraint failed",
            { code: "P2002", clientVersion: "test" },
          );
        }
        rows().push(row);
        return row;
      },

      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = rows().find((one) => one.id === where.id);
        if (!row) throw new Error(`no row ${where.id}`);
        if (
          uniqueColumns.length > 0 &&
          rows().some(
            (existing) =>
              existing.id !== row.id &&
              uniqueColumns.every(
                (column) => existing[column] === (data[column] ?? row[column]),
              ),
          )
        ) {
          throw new PrismaNamespace.PrismaClientKnownRequestError(
            "Unique constraint failed",
            { code: "P2002", clientVersion: "test" },
          );
        }
        Object.assign(row, data, {
          updatedAt: new Date("2026-08-24T00:00:00.000Z"),
        });
        return row;
      },

      delete: async ({ where }: { where: { id: string } }) => {
        const index = rows().findIndex((one) => one.id === where.id);
        if (index === -1) throw new Error(`no row ${where.id}`);
        return rows().splice(index, 1)[0];
      },
    };
  }

  const timestamps = () => ({
    createdAt: new Date("2026-08-23T00:00:00.000Z"),
    updatedAt: new Date("2026-08-23T00:00:00.000Z"),
    status: "draft",
  });

  const quizTable = table(() => store.quizzes, timestamps);
  const questionTable = table(
    () => store.questions,
    () => ({
      schemaVersion: 1,
      sortOrder: 0,
    }),
  );

  /** Adds the `_count` the service's `quizSelect` asks for. */
  const withQuestionCount = (row: Row) => ({
    ...row,
    _count: {
      questions: store.questions.filter(
        (question) => question.quizId === row.id,
      ).length,
    },
  });

  const client = {
    $transaction: async (
      fn: unknown,
      options?: { isolationLevel?: string },
    ) => {
      store.isolationLevels.push(options?.isolationLevel);
      return typeof fn === "function" ? fn(client) : undefined;
    },
    adminUser: { findUnique: db.adminFindUnique },
    quiz: {
      ...quizTable,
      create: async (args: { data: Record<string, unknown> }) =>
        withQuestionCount(await quizTable.create(args)),
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => withQuestionCount(await quizTable.update(args)),
      // `_count: { select: { questions: true } }` and the nested `questions`
      // select the service reads are resolved here rather than in `table`, which
      // knows nothing about relations.
      findUnique: async (args: {
        where: { id: string };
        select?: Record<string, unknown>;
      }) => {
        const row = await quizTable.findUnique(args);
        if (!row) return null;
        return {
          ...withQuestionCount(row),
          questions: store.questions.filter(
            (question) => question.quizId === row.id,
          ),
        };
      },
      findMany: async (args: {
        where?: Record<string, unknown>;
        orderBy?: unknown;
      }) => {
        const rows = await quizTable.findMany(args);
        return rows.map((row) => ({
          ...row,
          _count: {
            questions: store.questions.filter(
              (question) => question.quizId === row.id,
            ).length,
          },
        }));
      },
    },
    quizQuestion: {
      ...questionTable,
      // `readQuizAiJobIds` asks for the distinct jobs that wrote a quiz's
      // questions; the generic table has neither `select` nor `distinct`.
      findMany: async ({
        where,
        distinct,
      }: {
        where?: Record<string, unknown>;
        distinct?: string[];
      }) => {
        const rows = store.questions.filter((row) => matches(row, where));
        if (distinct === undefined) return rows;
        const seen = new Set<string>();
        return rows
          .filter((row) => {
            const key = distinct.map((field) => String(row[field])).join("|");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((row) => Object.fromEntries(distinct.map((f) => [f, row[f]])));
      },
      findUnique: async (args: { where: { id: string } }) => {
        const row = await questionTable.findUnique(args);
        if (!row) return null;
        const quiz = store.quizzes.find((one) => one.id === row.quizId);
        return { ...row, quiz: quiz ? { status: quiz.status } : null };
      },
    },
    activity: table(() => store.activities, timestamps),
    // File 37 — the edit-then-approve breadcrumb. `updateMany` rather than
    // `update` in the service, so the "still awaiting review" condition is part
    // of the write; the stub applies it for the same reason.
    aIGenerationJob: {
      // `assertAiPublishable` reads every job a row answers for in one query.
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        store.jobs.filter((row) => where.id.in.includes(row.id as string)),
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const found = store.jobs.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
    },
    badge: table(
      () => store.badges,
      () => ({ status: "draft", description: null, iconAssetId: null }),
      ["slug"],
    ),
    // Present so a stray parent-provisioning read fails loudly.
    parent: { findUnique: vi.fn(), upsert: vi.fn() },
    account: { findFirst: vi.fn() },
  };

  return { prisma: client };
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

function seedQuiz(id = QUIZ_ID, status = "draft"): Row {
  const row: Row = {
    id,
    title: "Letters quiz",
    status,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  store.quizzes.push(row);
  return row;
}

function seedActivity(status = "draft"): Row {
  const row: Row = {
    id: ACTIVITY_ID,
    type: "drag_drop",
    schemaVersion: 1,
    status,
    definition: validDragDrop,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  store.activities.push(row);
  return row;
}

function seedBadge(status = "draft", icon?: { id: string; url: string }): Row {
  const row: Row = {
    id: BADGE_ID,
    slug: "alphabet-champion",
    name: "Alphabet Champion",
    description: null,
    ruleType: "lessons_completed_in_topic",
    rule: { topicSlug: "alphabet", count: "all" },
    iconAssetId: icon?.id ?? null,
    // The stub returns whole rows and ignores `select`, so the relation the
    // service reads `iconUrl` from is seeded as a nested object here.
    iconAsset: icon === undefined ? null : { url: icon.url },
    status,
  };
  store.badges.push(row);
  return row;
}

beforeEach(() => {
  store.admins = [
    {
      id: ADMIN_ID,
      email: "reviewer@kidlearn.test",
      name: "Reviewer One",
      role: "admin",
      authUserId: ADMIN_USER_ID,
    },
  ];
  store.quizzes = [];
  store.questions = [];
  store.activities = [];
  store.badges = [];
  store.jobs = [];
  store.isolationLevels = [];
  store.nextId = 0;
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

describe("the admin guard covers every editor path", () => {
  const PROBES = [
    { method: "post" as const, path: `${BASE}/quizzes` },
    { method: "get" as const, path: `${BASE}/quizzes` },
    { method: "post" as const, path: `${BASE}/quizzes/${QUIZ_ID}/questions` },
    { method: "post" as const, path: `${BASE}/activities` },
    { method: "get" as const, path: `${BASE}/badges` },
    { method: "post" as const, path: `${BASE}/badges/${BADGE_ID}/transition` },
  ];

  it.each(PROBES)("401 unauthenticated: $method $path", async ({
    method,
    path,
  }) => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it.each(PROBES)("403 for a signed-in parent: $method $path", async ({
    method,
    path,
  }) => {
    mockSession(PARENT_USER_ID);

    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(store.questions).toEqual([]);
  });
});

describe("POST /api/admin/content/quizzes", () => {
  it("creates an empty quiz as a draft", async () => {
    const res = await request(app)
      .post(`${BASE}/quizzes`)
      .send({ title: "Letters" });

    expect(res.status).toBe(201);
    assertContract(
      AdminQuizResponseSchema,
      res.body,
      "POST /api/admin/content/quizzes",
    );
    expect(res.body.data).toMatchObject({
      title: "Letters",
      status: "draft",
      questionCount: 0,
    });
  });

  it("accepts an untitled quiz", async () => {
    const res = await request(app).post(`${BASE}/quizzes`).send({});

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBeNull();
  });

  it("rejects a body carrying a status", async () => {
    // Publishing has one door, and it is the transition endpoint. A create that
    // accepted `status` would be a second one with no review behind it.
    const res = await request(app)
      .post(`${BASE}/quizzes`)
      .send({ title: "Letters", status: "published" });

    expect(res.status).toBe(400);
    expect(store.quizzes).toEqual([]);
  });
});

describe("GET /api/admin/content/quizzes", () => {
  it("lists quizzes with their question counts", async () => {
    seedQuiz();
    store.questions.push({
      id: "q1",
      quizId: QUIZ_ID,
      format: "mcq",
      schemaVersion: 1,
      sortOrder: 0,
      definition: validMcq,
    });

    const res = await request(app).get(`${BASE}/quizzes`);

    expect(res.status).toBe(200);
    assertContract(
      AdminQuizListResponseSchema,
      res.body,
      "GET /api/admin/content/quizzes",
    );
    expect(res.body.data[0].questionCount).toBe(1);
  });

  it("hides archived quizzes unless asked", async () => {
    seedQuiz(QUIZ_ID, "archived");

    const hidden = await request(app).get(`${BASE}/quizzes`);
    const shown = await request(app).get(
      `${BASE}/quizzes?includeArchived=true`,
    );

    expect(hidden.body.data).toEqual([]);
    expect(shown.body.data).toHaveLength(1);
  });
});

describe("POST /api/admin/content/quizzes/:quizId/questions", () => {
  const OPERATION = "POST /api/admin/content/quizzes/{quizId}/questions";

  beforeEach(() => {
    seedQuiz();
  });

  it("stores a valid MCQ payload and assigns its position", async () => {
    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: validMcq });

    expect(res.status).toBe(201);
    assertContract(AdminQuizQuestionResponseSchema, res.body, OPERATION);
    expect(res.body.data).toMatchObject({
      quizId: QUIZ_ID,
      format: "mcq",
      schemaVersion: 1,
      sortOrder: 0,
    });
  });

  it("stores a payload that parses when read back raw", () => {
    // The acceptance criterion, asserted against the row rather than the
    // response: `parseQuizQuestion` throws, and it is the same parser the student
    // API's reader is built on.
    return request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "match_pair", definition: validMatchPair })
      .then(() => {
        expect(() =>
          parseQuizQuestion(store.questions[0].definition),
        ).not.toThrow();
      });
  });

  it("appends each question after the last", async () => {
    await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: validMcq });
    const second = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "picture_select", definition: validPictureSelect });

    expect(second.body.data.sortOrder).toBe(1);
  });

  it("rejects a definition whose answer key names an option that is not there", async () => {
    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: invalidMcqBadCorrectId });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(store.questions).toEqual([]);
  });

  it("names the offending field when a locale is missing", async () => {
    // A missing `bn` prompt would ship an untranslated question to a Bangla
    // learner (FR-I18N-01). The path is prefixed `definition.` so the editor can
    // put the message under the input that produced it.
    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: invalidMcqMissingBanglaPrompt });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error.details)).toContain(
      "definition.prompt.bn",
    );
  });

  it("rejects a payload whose type disagrees with the format column", async () => {
    // Two columns' worth of one fact. A row where they disagree is what makes the
    // student endpoint answer `500`, so it is refused here.
    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "picture_select", definition: validMcq });

    expect(res.status).toBe(400);
    expect(store.questions).toEqual([]);
  });

  it("404s for a quiz that does not exist", async () => {
    const res = await request(app)
      .post(`${BASE}/quizzes/${OTHER_QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: validMcq });

    expect(res.status).toBe(404);
  });

  it("refuses to add a question to a published quiz", async () => {
    store.quizzes = [];
    seedQuiz(QUIZ_ID, "published");

    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: validMcq });

    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe("EDIT_REQUIRES_UNPUBLISH");
    expect(store.questions).toEqual([]);
  });

  it("reads the quiz's status under Serializable isolation", () => {
    // What the stub cannot prove is the race itself; what it can prove is that the
    // read and the write share a Serializable transaction, which is what makes a
    // concurrent publish-and-add safe.
    return request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: validMcq })
      .then(() => {
        expect(store.isolationLevels).toContain(
          Prisma.TransactionIsolationLevel.Serializable,
        );
      });
  });
});

/**
 * `?jobId=…` — edit-then-approve (file 37, requirement 5, FR-AI-07).
 *
 * The review queue deep-links into these editors carrying the job it came from,
 * and saving is what records the decision. The claims worth asserting are that
 * it rides on the *save* — one request, so the two facts cannot come apart — and
 * that recording it publishes nothing on its own.
 */
describe("saving with ?jobId records edit_then_approve", () => {
  const JOB_ID = "dddddddd-0000-4000-8000-000000000001";

  beforeEach(() => {
    seedQuiz();
    store.jobs = [
      {
        id: JOB_ID,
        status: "awaiting_review",
        decision: null,
        reviewerId: null,
      },
    ];
  });

  it("records the decision when a question is added from the queue", async () => {
    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions?jobId=${JOB_ID}`)
      .send({ format: "mcq", definition: validMcq });

    expect(res.status).toBe(201);
    expect(store.jobs[0]).toMatchObject({
      decision: "edit_then_approve",
      reviewerId: ADMIN_ID,
    });
  });

  it("records it when a question is replaced, and when one is removed", async () => {
    await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: validMcq });
    const questionId = store.questions[0].id as string;

    await request(app)
      .patch(
        `${BASE}/quizzes/${QUIZ_ID}/questions/${questionId}?jobId=${JOB_ID}`,
      )
      .send({ format: "mcq", definition: validMcq });
    expect(store.jobs[0].decision).toBe("edit_then_approve");

    store.jobs[0].decision = null;
    await request(app).delete(
      `${BASE}/quizzes/${QUIZ_ID}/questions/${questionId}?jobId=${JOB_ID}`,
    );
    expect(store.jobs[0].decision).toBe("edit_then_approve");
  });

  it("leaves the job's status alone, so the decision publishes nothing", async () => {
    // Recording an edit is not approving it. The publish guard additionally
    // requires the job to *be* approved, which only the review queue writes.
    await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions?jobId=${JOB_ID}`)
      .send({ format: "mcq", definition: validMcq });

    expect(store.jobs[0].status).toBe("awaiting_review");
    expect(store.quizzes[0].status).toBe("draft");
  });

  it("records nothing when the save itself is refused", async () => {
    // The recording runs after the write, not as middleware — a save the server
    // rejected must not leave a decision claiming an edit that never happened.
    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions?jobId=${JOB_ID}`)
      .send({ format: "mcq", definition: { nonsense: true } });

    expect(res.status).toBe(400);
    expect(store.jobs[0].decision).toBeNull();
  });

  it("is a no-op on a job somebody has already decided", async () => {
    // The `jobId` is a breadcrumb; the save is real work. Losing the save to a
    // colleague's concurrent decision would be the wrong trade.
    store.jobs[0].status = "rejected";
    store.jobs[0].decision = "reject";

    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions?jobId=${JOB_ID}`)
      .send({ format: "mcq", definition: validMcq });

    expect(res.status).toBe(201);
    expect(store.jobs[0].decision).toBe("reject");
  });

  it("400s a jobId that is not a uuid", async () => {
    const res = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions?jobId=nope`)
      .send({ format: "mcq", definition: validMcq });

    expect(res.status).toBe(400);
    expect(store.questions).toHaveLength(0);
  });
});

describe("PATCH /api/admin/content/quizzes/:quizId", () => {
  it("renames a draft quiz", async () => {
    seedQuiz();

    const res = await request(app)
      .patch(`${BASE}/quizzes/${QUIZ_ID}`)
      .send({ title: "Letters quiz, revised" });

    expect(res.status).toBe(200);
    assertContract(
      AdminQuizResponseSchema,
      res.body,
      "PATCH /api/admin/content/quizzes/{quizId}",
    );
    expect(res.body.data.title).toBe("Letters quiz, revised");
  });

  it("refuses to rename a published quiz", async () => {
    seedQuiz(QUIZ_ID, "published");

    const res = await request(app)
      .patch(`${BASE}/quizzes/${QUIZ_ID}`)
      .send({ title: "Letters quiz, revised" });

    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe("EDIT_REQUIRES_UNPUBLISH");
    expect(store.quizzes[0].title).toBe("Letters quiz");
  });

  it("reads the status and writes the title in one Serializable transaction", async () => {
    // The check and the write must not straddle two transactions: a publish
    // committing between them would let a rename land on a published quiz.
    seedQuiz();
    store.isolationLevels.length = 0;

    await request(app)
      .patch(`${BASE}/quizzes/${QUIZ_ID}`)
      .send({ title: "Letters quiz, revised" });

    expect(store.isolationLevels).toEqual([
      Prisma.TransactionIsolationLevel.Serializable,
    ]);
  });

  it("404s for a quiz that does not exist", async () => {
    const res = await request(app)
      .patch(`${BASE}/quizzes/${QUIZ_ID}`)
      .send({ title: "Letters quiz, revised" });

    expect(res.status).toBe(404);
    // Not "No such quizze" — the message names the resource in the singular.
    expect(res.body.error.message).toBe("No such quiz");
  });
});

describe("PATCH /api/admin/content/quizzes/:quizId/questions/:id", () => {
  beforeEach(async () => {
    seedQuiz();
    await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
      .send({ format: "mcq", definition: validMcq });
  });

  it("replaces the payload and may change the format with it", async () => {
    const id = store.questions[0].id as string;

    const res = await request(app)
      .patch(`${BASE}/quizzes/${QUIZ_ID}/questions/${id}`)
      .send({ format: "picture_select", definition: validPictureSelect });

    expect(res.status).toBe(200);
    assertContract(
      AdminQuizQuestionResponseSchema,
      res.body,
      "PATCH /api/admin/content/quizzes/{quizId}/questions/{id}",
    );
    expect(res.body.data.format).toBe("picture_select");
    expect(res.body.data.sortOrder).toBe(0);
  });

  it("404s for a question belonging to another quiz", async () => {
    // Not a `403`: from this caller's point of view the question does not exist
    // under that quiz.
    seedQuiz(OTHER_QUIZ_ID);
    const id = store.questions[0].id as string;

    const res = await request(app)
      .patch(`${BASE}/quizzes/${OTHER_QUIZ_ID}/questions/${id}`)
      .send({ format: "mcq", definition: validMcq });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/content/quizzes/:quizId/questions/:id", () => {
  it("closes the gap it left behind", async () => {
    seedQuiz();
    for (const definition of [validMcq, validMatchPair, validPictureSelect]) {
      await request(app)
        .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
        .send({ format: definition.type, definition });
    }
    const middleId = store.questions[1].id as string;

    const res = await request(app).delete(
      `${BASE}/quizzes/${QUIZ_ID}/questions/${middleId}`,
    );

    expect(res.status).toBe(200);
    assertContract(
      QuestionDeletedResponseSchema,
      res.body,
      "DELETE /api/admin/content/quizzes/{quizId}/questions/{id}",
    );
    // Contiguous from 0, which is what stops the next append from colliding with
    // an existing row under `@@unique([quizId, sortOrder])`.
    expect(store.questions.map((question) => question.sortOrder)).toEqual([
      0, 1,
    ]);
    expect(res.body.data.remainingIds).toHaveLength(2);
  });
});

describe("GET /api/admin/content/quizzes/:quizId", () => {
  it("returns the quiz with its questions in order", async () => {
    seedQuiz();
    for (const definition of [validMcq, validMatchPair]) {
      await request(app)
        .post(`${BASE}/quizzes/${QUIZ_ID}/questions`)
        .send({ format: definition.type, definition });
    }

    const res = await request(app).get(`${BASE}/quizzes/${QUIZ_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      AdminQuizDetailResponseSchema,
      res.body,
      "GET /api/admin/content/quizzes/{quizId}",
    );
    expect(
      res.body.data.questions.map(
        (question: { format: string }) => question.format,
      ),
    ).toEqual(["mcq", "match_pair"]);
  });
});

describe("activities", () => {
  it("stores a valid drag-drop payload as a draft", async () => {
    const res = await request(app)
      .post(`${BASE}/activities`)
      .send({ type: "drag_drop", definition: validDragDrop });

    expect(res.status).toBe(201);
    assertContract(
      AdminActivityResponseSchema,
      res.body,
      "POST /api/admin/content/activities",
    );
    expect(res.body.data).toMatchObject({
      type: "drag_drop",
      status: "draft",
      schemaVersion: 1,
    });
  });

  it("rejects a puzzle whose slot count does not match its grid", async () => {
    const res = await request(app)
      .post(`${BASE}/activities`)
      .send({ type: "puzzle", definition: invalidPuzzleSlotCount });

    expect(res.status).toBe(400);
    expect(store.activities).toEqual([]);
  });

  it("rejects a payload whose type disagrees with the column", async () => {
    const res = await request(app)
      .post(`${BASE}/activities`)
      .send({ type: "trace", definition: validDragDrop });

    expect(res.status).toBe(400);
  });

  it("filters the list by type", async () => {
    seedActivity();

    const matching = await request(app).get(
      `${BASE}/activities?type=drag_drop`,
    );
    const other = await request(app).get(`${BASE}/activities?type=trace`);

    assertContract(
      AdminActivityListResponseSchema,
      matching.body,
      "GET /api/admin/content/activities",
    );
    expect(matching.body.data).toHaveLength(1);
    expect(other.body.data).toEqual([]);
  });

  it("returns one activity with its payload", async () => {
    seedActivity();

    const res = await request(app).get(`${BASE}/activities/${ACTIVITY_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      AdminActivityResponseSchema,
      res.body,
      "GET /api/admin/content/activities/{id}",
    );
    expect(res.body.data.definition).toEqual(validDragDrop);
  });

  it("404s for an activity that does not exist", async () => {
    const res = await request(app).get(`${BASE}/activities/${ACTIVITY_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("No such activity");
  });

  it("rewrites a draft activity's payload", async () => {
    seedActivity();

    const res = await request(app)
      .patch(`${BASE}/activities/${ACTIVITY_ID}`)
      .send({ type: "drag_drop", definition: validDragDrop });

    expect(res.status).toBe(200);
    assertContract(
      AdminActivityResponseSchema,
      res.body,
      "PATCH /api/admin/content/activities/{id}",
    );
    expect(res.body.data.type).toBe("drag_drop");
  });

  it("refuses to rewrite a published activity", async () => {
    seedActivity("published");

    const res = await request(app)
      .patch(`${BASE}/activities/${ACTIVITY_ID}`)
      .send({ type: "drag_drop", definition: validDragDrop });

    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe("EDIT_REQUIRES_UNPUBLISH");
  });
});

describe("badges", () => {
  const OPERATION = "POST /api/admin/content/badges";

  const body = {
    slug: "alphabet-champion",
    name: "Alphabet Champion",
    ruleType: "lessons_completed_in_topic",
    rule: { topicSlug: "alphabet", count: "all" },
  };

  it("creates a badge as a draft — authored but not yet earnable", async () => {
    const res = await request(app).post(`${BASE}/badges`).send(body);

    expect(res.status).toBe(201);
    assertContract(AdminBadgeResponseSchema, res.body, OPERATION);
    expect(res.body.data).toMatchObject({
      slug: "alphabet-champion",
      ruleType: "lessons_completed_in_topic",
      rule: { topicSlug: "alphabet", count: "all" },
      status: "draft",
    });
  });

  it("rejects a parameter the selected ruleType does not allow", async () => {
    // `.strict()` on each rule schema. A dropped `topicSlug` would leave the badge
    // evaluating against a rule nobody authored.
    const res = await request(app)
      .post(`${BASE}/badges`)
      .send({
        ...body,
        ruleType: "streak_days",
        rule: { days: 7, topicSlug: "alphabet" },
      });

    expect(res.status).toBe(400);
    // Zod reports an unrecognised key against the *object*, not the key, so the
    // prefixed path is `rule` and `topicSlug` is named in the message.
    expect(JSON.stringify(res.body.error.details)).toContain("topicSlug");
    expect(store.badges).toEqual([]);
  });

  it("rejects a rule that is missing its parameter", async () => {
    const res = await request(app)
      .post(`${BASE}/badges`)
      .send({ ...body, ruleType: "streak_days", rule: {} });

    expect(res.status).toBe(400);
  });

  it("rejects an unknown ruleType", async () => {
    // The engine warns and treats an unknown type as unearned, so a badge nobody
    // can ever get is refused at authoring time instead.
    const res = await request(app)
      .post(`${BASE}/badges`)
      .send({ ...body, ruleType: "animals_identified", rule: { count: 3 } });

    expect(res.status).toBe(400);
  });

  it("answers 409 DUPLICATE_SLUG for a slug that is taken", async () => {
    seedBadge();

    const res = await request(app).post(`${BASE}/badges`).send(body);

    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe("DUPLICATE_SLUG");
  });

  it("refuses a rule without its type", async () => {
    seedBadge();

    const res = await request(app)
      .patch(`${BASE}/badges/${BADGE_ID}`)
      .send({ rule: { days: 5 } });

    expect(res.status).toBe(400);
    expect(store.badges[0].rule).toEqual({
      topicSlug: "alphabet",
      count: "all",
    });
  });

  it("accepts the pair together", async () => {
    seedBadge();

    const res = await request(app)
      .patch(`${BASE}/badges/${BADGE_ID}`)
      .send({ ruleType: "streak_days", rule: { days: 5 } });

    expect(res.status).toBe(200);
    assertContract(
      AdminBadgeResponseSchema,
      res.body,
      "PATCH /api/admin/content/badges/{id}",
    );
    expect(res.body.data).toMatchObject({
      ruleType: "streak_days",
      rule: { days: 5 },
    });
  });

  it("returns one badge, with the url of the icon it points at", async () => {
    // `iconUrl` is what the editor's media picker matches on: without it the
    // form reports a badge that has an icon as "Not set".
    seedBadge("draft", {
      id: "cccccccc-0000-4000-8000-000000000001",
      url: "https://res.cloudinary.com/test-cloud/image/upload/badge.png",
    });

    const res = await request(app).get(`${BASE}/badges/${BADGE_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      AdminBadgeResponseSchema,
      res.body,
      "GET /api/admin/content/badges/{id}",
    );
    expect(res.body.data).toMatchObject({
      iconAssetId: "cccccccc-0000-4000-8000-000000000001",
      iconUrl: "https://res.cloudinary.com/test-cloud/image/upload/badge.png",
    });
  });

  it("reports no icon as a null url rather than omitting it", async () => {
    seedBadge();

    const res = await request(app).get(`${BASE}/badges/${BADGE_ID}`);

    expect(res.body.data.iconAssetId).toBeNull();
    expect(res.body.data.iconUrl).toBeNull();
  });

  it("lists badges by slug", async () => {
    seedBadge();

    const res = await request(app).get(`${BASE}/badges`);

    assertContract(
      AdminBadgeListResponseSchema,
      res.body,
      "GET /api/admin/content/badges",
    );
    expect(res.body.data).toHaveLength(1);
  });
});

describe("transitions", () => {
  it("publishes a quiz only from approved", async () => {
    seedQuiz();

    const tooSoon = await request(app)
      .post(`${BASE}/quizzes/${QUIZ_ID}/transition`)
      .send({ to: "published" });

    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body.error.details.code).toBe("INVALID_TRANSITION");
    expect(tooSoon.body.error.details.allowed).toEqual([
      "in_review",
      "archived",
    ]);

    for (const to of ["in_review", "approved", "published"]) {
      const hop = await request(app)
        .post(`${BASE}/quizzes/${QUIZ_ID}/transition`)
        .send({ to });
      expect(hop.status).toBe(200);
      assertContract(
        AdminQuizResponseSchema,
        hop.body,
        "POST /api/admin/content/quizzes/{quizId}/transition",
      );
    }
    expect(store.quizzes[0].status).toBe("published");
  });

  it("returns the badge at its new status", async () => {
    seedBadge();

    const res = await request(app)
      .post(`${BASE}/badges/${BADGE_ID}/transition`)
      .send({ to: "in_review" });

    expect(res.status).toBe(200);
    assertContract(
      AdminBadgeResponseSchema,
      res.body,
      "POST /api/admin/content/badges/{id}/transition",
    );
    expect(res.body.data.status).toBe("in_review");
  });

  it("returns the activity at its new status", async () => {
    seedActivity();

    const res = await request(app)
      .post(`${BASE}/activities/${ACTIVITY_ID}/transition`)
      .send({ to: "in_review" });

    expect(res.status).toBe(200);
    assertContract(
      AdminActivityResponseSchema,
      res.body,
      "POST /api/admin/content/activities/{id}/transition",
    );
  });

  it("judges the hop inside a Serializable transaction", async () => {
    seedActivity();

    await request(app)
      .post(`${BASE}/activities/${ACTIVITY_ID}/transition`)
      .send({ to: "in_review" });

    expect(store.isolationLevels).toContain(
      Prisma.TransactionIsolationLevel.Serializable,
    );
  });

  it("404s for a row that does not exist", async () => {
    const res = await request(app)
      .post(`${BASE}/badges/${BADGE_ID}/transition`)
      .send({ to: "in_review" });

    expect(res.status).toBe(404);
  });

  /**
   * The FR-AI-07 guard's questions half (file 37).
   *
   * A quiz generated against a lesson that already had one stamps `aiJobId` on
   * the *questions* and leaves the quiz row's own null. A guard that read only the
   * quiz column let every one of those questions reach a child through the
   * ordinary CMS publish path, with the job still sitting in the review queue.
   */
  describe("a quiz answers for its questions' generation jobs", () => {
    function seedGeneratedQuestion(jobStatus: string, decision: string | null) {
      store.jobs.push({
        id: "job-questions",
        status: jobStatus,
        decision,
      });
      store.questions.push({
        id: "q-generated",
        quizId: QUIZ_ID,
        format: "mcq",
        schemaVersion: 1,
        sortOrder: 0,
        definition: validMcq,
        aiJobId: "job-questions",
      });
    }

    async function walkToPublished() {
      let last = await request(app)
        .post(`${BASE}/quizzes/${QUIZ_ID}/transition`)
        .send({ to: "in_review" });
      for (const to of ["approved", "published"]) {
        last = await request(app)
          .post(`${BASE}/quizzes/${QUIZ_ID}/transition`)
          .send({ to });
      }
      return last;
    }

    it("409s the publish hop when the questions' job is still awaiting review", async () => {
      // The quiz itself was written by a person — `aiJobId` is null on the row —
      // so the only thing standing between an unreviewed model answer and a
      // five-year-old is this guard reaching through to the questions.
      seedQuiz();
      seedGeneratedQuestion("awaiting_review", null);

      const res = await walkToPublished();

      expect(res.status).toBe(409);
      expect(res.body.error.details).toMatchObject({
        code: "AI_REVIEW_REQUIRED",
        jobId: "job-questions",
      });
      expect(store.quizzes[0].status).toBe("approved");
    });

    it("409s when a reviewer edited the questions but nobody approved them", async () => {
      seedQuiz();
      seedGeneratedQuestion("awaiting_review", "edit_then_approve");

      const res = await walkToPublished();

      expect(res.status).toBe(409);
      expect(res.body.error.details.code).toBe("AI_REVIEW_REQUIRED");
    });

    it("publishes once the questions' job carries an approved decision", async () => {
      seedQuiz();
      seedGeneratedQuestion("approved", "approve");

      const res = await walkToPublished();

      expect(res.status).toBe(200);
      expect(store.quizzes[0].status).toBe("published");
    });

    it("leaves a hand-written quiz alone, at no query cost", async () => {
      seedQuiz();
      store.questions.push({
        id: "q-human",
        quizId: QUIZ_ID,
        format: "mcq",
        schemaVersion: 1,
        sortOrder: 0,
        definition: validMcq,
        aiJobId: null,
      });

      const res = await walkToPublished();

      expect(res.status).toBe(200);
      expect(store.quizzes[0].status).toBe("published");
    });
  });
});

describe("what the stub cannot prove, asserted against the schema", () => {
  const schema = readFileSync(
    new URL("../../../../../packages/db/prisma/schema.prisma", import.meta.url),
    "utf8",
  );

  it("declares Badge.slug unique, which is what makes DUPLICATE_SLUG reachable", () => {
    expect(schema).toMatch(/model Badge \{[\s\S]*?slug\s+String\s+@unique/);
  });

  it("declares the question ordering unique, which is why a delete renumbers", () => {
    expect(schema).toMatch(
      /model QuizQuestion \{[\s\S]*?@@unique\(\[quizId, sortOrder\]\)/,
    );
  });
});
