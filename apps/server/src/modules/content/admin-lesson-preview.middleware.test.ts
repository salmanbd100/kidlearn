/**
 * Stubs `config/prisma.js` under the general.md §5 stub exception. `lesson.findFirst`
 * applies the route's real `where` to one draft lesson (rule 1); the student path's
 * `where` must carry `status: "published"` and the preview path's none (rule 2);
 * the lesson's `activity`/`quiz` gate is asserted on the response body (rule 3).
 * That no progress row is written is asserted as the absence of any write delegate
 * on the stub (rule 4); the structural guarantee is that progress endpoints sit
 * behind `requireParent` + `requireActiveChild`, which an admin session cannot pass.
 */

import type { ChildProfile, Parent } from "@kidlearn/db";
import {
  LessonDetailResponseSchema,
  validDragDrop,
  validMcq,
} from "@kidlearn/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";
import request from "../../shared/testing/request.js";

const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_USER_ID = "user_admin_1";
const PARENT_USER_ID = "user_parent_1";

const db = vi.hoisted(() => ({
  adminFindUnique: vi.fn(),
  parentFindUnique: vi.fn(),
  accountFindFirst: vi.fn(),
  childFindFirst: vi.fn(),
  lessonFindFirst: vi.fn(),
  screenTimeFindUnique: vi.fn(),
  sessionEventFindMany: vi.fn(),
  lessonProgressFindUnique: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    adminUser: { findUnique: db.adminFindUnique },
    parent: { findUnique: db.parentFindUnique },
    account: { findFirst: db.accountFindFirst },
    childProfile: { findFirst: db.childFindFirst },
    lesson: { findFirst: db.lessonFindFirst },
    screenTimeSetting: { findUnique: db.screenTimeFindUnique },
    // Reads only: with no `create`/`update`/`upsert` on these, a preview that wrote
    // progress would fail with `not a function` (rule 4).
    sessionEvent: { findMany: db.sessionEventFindMany },
    lessonProgress: { findUnique: db.lessonProgressFindUnique },
  },
}));

const { app } = await import("../../app.js");
const { auth } = await import("../../config/auth.js");

const ADMIN_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "reviewer@kidlearn.test",
  name: "Reviewer One",
  role: "admin",
  authUserId: ADMIN_USER_ID,
};

const PARENT = {
  id: "parent_1",
  userId: PARENT_USER_ID,
  email: "parent@example.com",
} as unknown as Parent;

const CHILD = {
  id: "child_1",
  firstName: "Ava",
  gradeLevel: "NURSERY",
  preferredLanguage: "en",
  parentId: PARENT.id,
} as unknown as ChildProfile;

const DRAFT_LESSON = {
  id: LESSON_ID,
  topicId: "22222222-2222-4222-8222-222222222222",
  worldId: "world_jungle",
  slug: "letter-a-sounds",
  title: "The Letter A",
  sortOrder: 1,
  gradeLevels: ["KG2"],
  status: "draft",
  activityId: "activity_1",
  quizId: "quiz_1",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  world: {
    id: "world_jungle",
    slug: "jungle",
    name: "Jungle World",
    translations: [
      { language: "en", name: "Jungle World" },
      { language: "bn", name: "জঙ্গল জগৎ" },
    ],
    palette: { primary: "#2E7D32" },
    mascotAssetId: null,
    mascotAsset: null,
    status: "draft",
  },
  translations: [
    {
      language: "en",
      title: "The Letter A",
      introScript: "Hello! Today we learn the letter A.",
      introAudioAsset: null,
      videoAsset: null,
      videoPosterAsset: null,
    },
    {
      language: "bn",
      title: "অক্ষর A",
      introScript: "হ্যালো! আজ আমরা A শিখব।",
      introAudioAsset: null,
      videoAsset: null,
      videoPosterAsset: null,
    },
  ],
  activity: {
    id: "activity_1",
    type: "drag_drop",
    definition: validDragDrop,
    schemaVersion: 1,
    status: "draft",
  },
  quiz: {
    id: "quiz_1",
    title: "Letter A Quiz",
    status: "draft",
    questions: [
      {
        id: "q1",
        quizId: "quiz_1",
        format: "mcq",
        definition: validMcq,
        schemaVersion: 1,
        sortOrder: 1,
      },
    ],
  },
};

function findFirstAgainstTheDraft(args: {
  where: Record<string, unknown>;
}): typeof DRAFT_LESSON | null {
  const { where } = args;
  if (where.id !== DRAFT_LESSON.id) return null;
  if (where.status !== undefined && where.status !== DRAFT_LESSON.status) {
    return null;
  }
  const grade = (where.gradeLevels as { has?: string } | undefined)?.has;
  if (grade !== undefined && !DRAFT_LESSON.gradeLevels.includes(grade)) {
    return null;
  }
  const worldStatus = (where.world as { is?: { status?: string } } | undefined)
    ?.is?.status;
  if (worldStatus !== undefined && worldStatus !== DRAFT_LESSON.world.status) {
    return null;
  }
  return DRAFT_LESSON;
}

// An admin session as the database describes one: an `AdminUser` row, no `Parent`
// row and no Google account, so every parent route answers `403` for an admin.
function signInAsAdmin(createdAt = new Date()) {
  mockSession(ADMIN_USER_ID, createdAt);
  db.adminFindUnique.mockResolvedValue(ADMIN_ROW);
  db.parentFindUnique.mockResolvedValue(null);
  db.accountFindFirst.mockResolvedValue(null);
}

function signInAsParent() {
  mockSession(PARENT_USER_ID);
  db.adminFindUnique.mockResolvedValue(null);
  db.parentFindUnique.mockResolvedValue(PARENT);
  db.childFindFirst.mockResolvedValue(CHILD);
}

function mockSession(userId: string, createdAt = new Date()) {
  // Only the fields the guards read are supplied; narrows the deep better-auth return type.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: { id: userId, email: "someone@example.com", name: "Someone" },
    session: {
      id: `session_${userId}`,
      userId,
      activeChildProfileId: CHILD.id,
      createdAt,
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

function lastWhere(): Record<string, unknown> {
  const calls = db.lessonFindFirst.mock.calls;
  const [args] = calls[calls.length - 1] as [
    { where: Record<string, unknown> },
  ];
  return args.where;
}

beforeEach(() => {
  for (const fn of Object.values(db)) fn.mockReset();
  db.lessonFindFirst.mockImplementation(async (args) =>
    findFirstAgainstTheDraft(args),
  );
  db.screenTimeFindUnique.mockResolvedValue(null);
  db.sessionEventFindMany.mockResolvedValue([]);
  db.lessonProgressFindUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the preview bypass matrix", () => {
  it("serves the draft lesson to an admin who asks for a preview", async () => {
    signInAsAdmin();

    const res = await request(app).get(
      `/api/content/lessons/${LESSON_ID}?preview=1`,
    );

    expect(res.status).toBe(200);
    // Same contract as the student response, so the CMS can mount the real player against it.
    assertContract(
      LessonDetailResponseSchema,
      res.body,
      "GET /api/content/lessons/{id}",
    );
    expect(res.body.data.lesson.title).toBe("The Letter A");
  });

  it("skips the status and grade filters entirely in preview", async () => {
    signInAsAdmin();

    await request(app).get(`/api/content/lessons/${LESSON_ID}?preview=1`);

    // The filter is absent, not merely matching: a preview passing a `published`
    // condition against a draft row would break the moment the row changed.
    expect(lastWhere()).toEqual({ id: LESSON_ID });
  });

  it("includes the unpublished activity and quiz a reviewer is there to look at", async () => {
    // Gated *after* the read, so no `where` assertion can see them (rule 3).
    signInAsAdmin();

    const res = await request(app).get(
      `/api/content/lessons/${LESSON_ID}?preview=1`,
    );

    expect(res.body.data.lesson.activity).toEqual({
      id: "activity_1",
      type: "drag_drop",
      schemaVersion: 1,
      definition: validDragDrop,
    });
    expect(res.body.data.lesson.quiz.questions).toHaveLength(1);
  });

  it("renders the preview in the language asked for", async () => {
    signInAsAdmin();

    const res = await request(app).get(
      `/api/content/lessons/${LESSON_ID}?preview=1&lang=bn`,
    );

    expect(res.body.data.lesson.locale).toBe("bn");
    expect(res.body.data.lesson.title).toBe("অক্ষর A");
  });

  it("previews in English for an unrecognised language rather than failing", async () => {
    signInAsAdmin();

    const res = await request(app).get(
      `/api/content/lessons/${LESSON_ID}?preview=1&lang=fr`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.lesson.locale).toBe("en");
  });

  it("404s for a parent who asks for a preview themselves", async () => {
    // The query parameter requests the mode; the session grants it. Without that this would be a content leak.
    signInAsParent();

    const res = await request(app).get(
      `/api/content/lessons/${LESSON_ID}?preview=1`,
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(lastWhere()).toMatchObject({ status: "published" });
  });

  it("does not preview for an admin session past requireAdmin's 12-hour limit", async () => {
    signInAsAdmin(new Date(Date.now() - 13 * 60 * 60 * 1000));

    const res = await request(app).get(
      `/api/content/lessons/${LESSON_ID}?preview=1`,
    );

    // Falls through to the student route, which an admin cannot pass.
    expect(res.status).toBe(403);
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("404s for a child's ordinary request, with no parameter", async () => {
    signInAsParent();

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(404);
    expect(lastWhere()).toMatchObject({ status: "published" });
  });

  it("401s when nobody is signed in, parameter or not", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get(
      `/api/content/lessons/${LESSON_ID}?preview=1`,
    );

    expect(res.status).toBe(401);
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("gives an admin nothing without the parameter", async () => {
    // An admin is not a parent: `requireParent` refuses to provision a `Parent` for
    // an account with no Google sign-in, so the student path answers `403`.
    signInAsAdmin();

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(403);
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });
});

describe("what the interception does not touch", () => {
  it("leaves every other content path to the ordinary guards", async () => {
    // `preview=1` off the lesson-detail path must not be intercepted, or the middleware is a second undocumented read surface.
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get("/api/content/worlds?preview=1");

    expect(res.status).toBe(401);
  });

  it("leaves a malformed id to the ordinary guards", async () => {
    signInAsAdmin();

    const res = await request(app).get(
      "/api/content/lessons/not-a-uuid?preview=1",
    );

    // Falls through, so an admin meets `requireParent`'s `403`, not a `400` about their typo.
    expect(res.status).toBe(403);
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("does not intercept a write to the same path shape", async () => {
    signInAsAdmin();

    const res = await request(app)
      .post(`/api/progress/lessons/${LESSON_ID}/step?preview=1`)
      .send({ step: "intro", completed: false });

    // Not a `200`: the progress surface is behind the parent guards. Nothing was written.
    expect(res.status).toBe(403);
  });
});
