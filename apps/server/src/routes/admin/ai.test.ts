/**
 * `/api/admin/ai` — the generation pipeline's HTTP surface (file 34, FR-AI-01).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* One `admins` array behind the guard, and the
 *     generator service is mocked at its own boundary: this suite is about the
 *     route — guards, validation, status code, contract — and what the generator
 *     writes is asserted against a stubbed database in
 *     `services/ai/generators/lesson.test.ts`.
 *  2. *Assert the query, not just the result.* The claim this file makes about
 *     the database is negative — an unauthenticated or non-admin request must not
 *     reach the generator at all — so it asserts the service was never called.
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here
 *     reads content.
 *  4. *Name what the stub cannot prove.* That a generated lesson is invisible to
 *     a child is a property of the student API's `status: "published"` filter,
 *     asserted in `routes/content.test.ts`, and of the `draft` default, asserted
 *     in the generator suite. Neither is provable from here.
 */

import { GenerationJobRefResponseSchema } from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";

const BASE = "/api/admin/ai";
const PATH = `${BASE}/generate/lesson`;
const OPERATION = "POST /api/admin/ai/generate/lesson";

const ADMIN_USER_ID = "user_admin_1";
const PARENT_USER_ID = "user_parent_1";

const TOPIC_ID = "11111111-1111-4111-8111-111111111111";
const SUBJECT_ID = "22222222-2222-4222-8222-222222222222";
const WORLD_ID = "33333333-3333-4333-8333-333333333333";

const store = vi.hoisted(() => ({
  admins: [] as Array<Record<string, unknown> & { authUserId: string | null }>,
}));

const db = vi.hoisted(() => ({ adminFindUnique: vi.fn() }));
const service = vi.hoisted(() => ({ generateLesson: vi.fn() }));

vi.mock("../../services/ai/generators/lesson.js", () => ({
  generateLesson: service.generateLesson,
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    adminUser: { findUnique: db.adminFindUnique },
    // Present so a stray parent-provisioning read fails loudly: no admin route
    // may create a Parent row.
    parent: { findUnique: vi.fn(), upsert: vi.fn() },
    account: { findFirst: vi.fn() },
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

beforeEach(() => {
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
  service.generateLesson.mockReset();
  service.generateLesson.mockResolvedValue({
    jobId: "job-1",
    status: "awaiting_review",
  });
  mockSession(ADMIN_USER_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the admin guard", () => {
  it("401 unauthenticated, without reaching the generator", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).post(PATH).send(body());

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(service.generateLesson).not.toHaveBeenCalled();
  });

  it("403 for a signed-in parent, without reaching the generator", async () => {
    // A Google sign-in never writes an AdminUser row, and that absence *is* the
    // authorisation check (spec §4.3).
    mockSession(PARENT_USER_ID);

    const res = await request(app).post(PATH).send(body());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(service.generateLesson).not.toHaveBeenCalled();
  });
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
