/**
 * Content read API — behaviour and, above all, leak-proofing.
 *
 * See the note at the top of `middleware/require-parent.test.ts` about stubbing
 * `lib/prisma.js` in the absence of a test database. Because these tests cannot
 * assert on real rows, they assert on the **`where` clause** each endpoint sends
 * to Prisma: that is where `status: "published"` and the grade condition live,
 * and asserting on the query is the only way a stubbed suite can prove content
 * safety rather than assume it. The `@kidlearn/types` fixtures supply realistic
 * JSONB so the definition parsing is exercised for real.
 */
import type { ChildProfile, Parent } from "@kidlearn/db";
import { validDragDrop, validMcq, validPictureSelect } from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  accountFindFirst: vi.fn(),
  childFindFirst: vi.fn(),
  worldFindMany: vi.fn(),
  subjectFindMany: vi.fn(),
  subjectFindFirst: vi.fn(),
  topicFindMany: vi.fn(),
  topicFindFirst: vi.fn(),
  lessonFindMany: vi.fn(),
  lessonFindFirst: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique, upsert: db.parentUpsert },
    account: { findFirst: db.accountFindFirst },
    childProfile: { findFirst: db.childFindFirst },
    world: { findMany: db.worldFindMany },
    subject: { findMany: db.subjectFindMany, findFirst: db.subjectFindFirst },
    topic: { findMany: db.topicFindMany, findFirst: db.topicFindFirst },
    lesson: { findMany: db.lessonFindMany, findFirst: db.lessonFindFirst },
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../lib/auth.js");

const SESSION_USER = {
  id: "user_1",
  email: "parent@example.com",
  name: "Parent One",
  image: null,
};

const PARENT: Parent = {
  id: "parent_1",
  userId: SESSION_USER.id,
  googleId: "google_profile_1",
  email: SESSION_USER.email,
  name: SESSION_USER.name,
  avatarUrl: null,
  pinHash: null,
  consentGivenAt: null,
  consentVersion: null,
  pinFailedCount: 0,
  pinLockedUntil: null,
  deleteToken: null,
  deleteTokenExpiresAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";
const TOPIC_ID = "22222222-2222-4222-8222-222222222222";
const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

function childProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id: "child_1",
    firstName: "Ava",
    age: 4,
    gradeLevel: "NURSERY",
    preferredLanguage: "en",
    avatarCharacterId: null,
    parentId: PARENT.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** Signs the request in as PARENT with `child` as the session's active profile. */
function signInAs(child: ChildProfile | null) {
  // `getSession` returns a deep better-auth type; only the fields the
  // middleware reads are supplied, so the shape is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: {
      id: "session_1",
      userId: SESSION_USER.id,
      activeChildProfileId: child?.id ?? null,
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
  db.parentFindUnique.mockResolvedValue(PARENT);
  db.childFindFirst.mockResolvedValue(child);
}

const JUNGLE_MASCOT = {
  id: "asset_mascot",
  url: "https://cdn.kidlearn.test/images/monkey.png",
  kind: "image" as const,
  language: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const JUNGLE_WORLD = {
  id: "world_jungle",
  slug: "jungle",
  name: "Jungle World",
  palette: { primary: "#2E7D32", secondary: "#FDD835", bg: "#E8F5E9" },
  mascotAssetId: JUNGLE_MASCOT.id,
  mascotAsset: JUNGLE_MASCOT,
  status: "published" as const,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function lessonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LESSON_ID,
    topicId: TOPIC_ID,
    worldId: JUNGLE_WORLD.id,
    slug: "letter-a-sounds",
    title: "The Letter A",
    sortOrder: 1,
    gradeLevels: ["NURSERY", "KG1"],
    status: "published",
    activityId: "activity_1",
    quizId: "quiz_1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    world: JUNGLE_WORLD,
    translations: [
      {
        id: "lt_en",
        lessonId: LESSON_ID,
        language: "en",
        introScript: "Hello! Today we learn the letter A.",
        introAudioAssetId: null,
        introAudioAsset: null,
        videoAssetId: "asset_video_en",
        videoAsset: {
          id: "asset_video_en",
          url: "https://cdn.kidlearn.test/video/en/letter-a.mp4",
          kind: "video",
        },
      },
      {
        id: "lt_bn",
        lessonId: LESSON_ID,
        language: "bn",
        introScript: "হ্যালো! আজ আমরা A শিখব।",
        introAudioAssetId: null,
        introAudioAsset: null,
        videoAssetId: "asset_video_bn",
        videoAsset: {
          id: "asset_video_bn",
          url: "https://cdn.kidlearn.test/video/bn/letter-a.mp4",
          kind: "video",
        },
      },
    ],
    activity: {
      id: "activity_1",
      type: "drag_drop",
      definition: validDragDrop,
      schemaVersion: 1,
      status: "published",
    },
    quiz: {
      id: "quiz_1",
      title: "Letter A Quiz",
      status: "published",
      questions: [
        {
          id: "q1",
          quizId: "quiz_1",
          format: "mcq",
          definition: validMcq,
          schemaVersion: 1,
          sortOrder: 1,
        },
        {
          id: "q2",
          quizId: "quiz_1",
          format: "picture_select",
          definition: validPictureSelect,
          schemaVersion: 1,
          sortOrder: 2,
        },
        {
          id: "q3",
          quizId: "quiz_1",
          format: "mcq",
          definition: validMcq,
          schemaVersion: 1,
          sortOrder: 3,
        },
      ],
    },
    ...overrides,
  };
}

/** Every `where` object the mocked Prisma methods were called with, flattened. */
function everyWhereClause(): unknown[] {
  return [
    db.worldFindMany,
    db.subjectFindMany,
    db.subjectFindFirst,
    db.topicFindMany,
    db.topicFindFirst,
    db.lessonFindMany,
    db.lessonFindFirst,
  ].flatMap((fn) =>
    fn.mock.calls.map((call) => {
      const [args] = call as [{ where?: unknown } | undefined];
      return args?.where;
    }),
  );
}

beforeEach(() => {
  for (const fn of Object.values(db)) {
    fn.mockReset();
  }
  db.worldFindMany.mockResolvedValue([]);
  db.subjectFindMany.mockResolvedValue([]);
  db.topicFindMany.mockResolvedValue([]);
  db.lessonFindMany.mockResolvedValue([]);
  db.subjectFindFirst.mockResolvedValue({ id: SUBJECT_ID });
  db.topicFindFirst.mockResolvedValue({ id: TOPIC_ID });
  db.lessonFindFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("content route guards", () => {
  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get("/api/content/worlds");

    expect(res.status).toBe(401);
    expect(db.worldFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    signInAs(null);

    const res = await request(app).get("/api/content/subjects");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.subjectFindMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed content id at the boundary before querying", async () => {
    signInAs(childProfile());

    const res = await request(app).get("/api/content/lessons/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/content/worlds", () => {
  it("returns palette and mascot so the client can theme itself (FR-WORLD-05)", async () => {
    signInAs(childProfile());
    db.worldFindMany.mockResolvedValue([JUNGLE_WORLD]);

    const res = await request(app).get("/api/content/worlds");

    expect(res.status).toBe(200);
    expect(res.body.data.worlds).toEqual([
      {
        id: "world_jungle",
        slug: "jungle",
        name: "Jungle World",
        palette: { primary: "#2E7D32", secondary: "#FDD835", bg: "#E8F5E9" },
        mascot: {
          id: "asset_mascot",
          url: "https://cdn.kidlearn.test/images/monkey.png",
          kind: "image",
        },
      },
    ]);
  });

  it("asks Prisma only for published worlds", async () => {
    signInAs(childProfile());

    await request(app).get("/api/content/worlds");

    expect(db.worldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "published" } }),
    );
  });
});

describe("GET /api/content/subjects", () => {
  it("returns only subjects that have a published lesson for the child's grade", async () => {
    signInAs(childProfile());
    db.subjectFindMany.mockResolvedValue([
      {
        id: SUBJECT_ID,
        slug: "language",
        name: "Language",
        sortOrder: 1,
        gradeLevels: ["NURSERY"],
        status: "published",
      },
    ]);

    const res = await request(app).get("/api/content/subjects");

    expect(res.status).toBe(200);
    expect(res.body.data.subjects).toEqual([
      {
        id: SUBJECT_ID,
        slug: "language",
        name: "Language",
        sortOrder: 1,
        iconAsset: null,
      },
    ]);
  });

  it("filters on published status and grade at every level of the query", async () => {
    signInAs(childProfile({ gradeLevel: "KG1" }));

    await request(app).get("/api/content/subjects");

    const visible = { status: "published", gradeLevels: { has: "KG1" } };
    expect(db.subjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...visible,
          topics: { some: { ...visible, lessons: { some: visible } } },
        },
      }),
    );
  });

  it("returns an empty list rather than a dead tile when nothing is published", async () => {
    signInAs(childProfile());

    const res = await request(app).get("/api/content/subjects");

    expect(res.body.data.subjects).toEqual([]);
  });
});

describe("GET /api/content/subjects/:id/topics", () => {
  it("returns topics ordered by sortOrder", async () => {
    signInAs(childProfile());
    db.topicFindMany.mockResolvedValue([
      { id: TOPIC_ID, slug: "alphabet", name: "Alphabet", sortOrder: 1 },
    ]);

    const res = await request(app).get(
      `/api/content/subjects/${SUBJECT_ID}/topics`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.topics).toEqual([
      { id: TOPIC_ID, slug: "alphabet", name: "Alphabet", sortOrder: 1 },
    ]);
    expect(db.topicFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { sortOrder: "asc" } }),
    );
  });

  it("returns 404 for an unknown subject", async () => {
    signInAs(childProfile());
    db.subjectFindFirst.mockResolvedValue(null);

    const res = await request(app).get(
      `/api/content/subjects/${MISSING_ID}/topics`,
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(db.topicFindMany).not.toHaveBeenCalled();
  });

  it("returns 404 — not 403 — for a draft subject, so its existence stays hidden", async () => {
    signInAs(childProfile());
    // The status condition is part of the lookup, so a draft row is simply not
    // found. Assert the condition is really there as well as the status code.
    db.subjectFindFirst.mockResolvedValue(null);

    const res = await request(app).get(
      `/api/content/subjects/${SUBJECT_ID}/topics`,
    );

    expect(res.status).toBe(404);
    expect(db.subjectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: SUBJECT_ID,
          status: "published",
          gradeLevels: { has: "NURSERY" },
        },
      }),
    );
  });
});

describe("GET /api/content/topics/:id/lessons", () => {
  it("returns the list shape with progress reserved as null (file 16)", async () => {
    signInAs(childProfile());
    db.lessonFindMany.mockResolvedValue([lessonRow()]);

    const res = await request(app).get(
      `/api/content/topics/${TOPIC_ID}/lessons`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.lessons).toEqual([
      {
        id: LESSON_ID,
        slug: "letter-a-sounds",
        title: "The Letter A",
        worldId: "world_jungle",
        sortOrder: 1,
        thumbnailUrl: null,
        durationEstimateSec: null,
        progress: null,
      },
    ]);
  });

  it("queries lessons published for the child's grade, ordered by sortOrder", async () => {
    signInAs(childProfile());

    await request(app).get(`/api/content/topics/${TOPIC_ID}/lessons`);

    expect(db.lessonFindMany).toHaveBeenCalledWith({
      where: {
        topicId: TOPIC_ID,
        status: "published",
        gradeLevels: { has: "NURSERY" },
        // The lesson's world carries its own status, and the list must agree
        // with the detail endpoint about which lessons exist.
        world: { is: { status: "published" } },
      },
      orderBy: { sortOrder: "asc" },
    });
  });

  it("returns 404 for an unknown topic", async () => {
    signInAs(childProfile());
    db.topicFindFirst.mockResolvedValue(null);

    const res = await request(app).get(
      `/api/content/topics/${MISSING_ID}/lessons`,
    );

    expect(res.status).toBe(404);
    expect(db.lessonFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/content/lessons/:id", () => {
  it("returns intro script, video url, activity and all three quiz questions in one response", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(lessonRow());

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(200);
    const { lesson } = res.body.data;
    expect(lesson.title).toBe("The Letter A");
    expect(lesson.locale).toBe("en");
    expect(lesson.introScript).toBe("Hello! Today we learn the letter A.");
    expect(lesson.videoUrl).toBe(
      "https://cdn.kidlearn.test/video/en/letter-a.mp4",
    );
    expect(lesson.world).toEqual({
      id: "world_jungle",
      slug: "jungle",
      name: "Jungle World",
      palette: { primary: "#2E7D32", secondary: "#FDD835", bg: "#E8F5E9" },
      mascot: {
        id: "asset_mascot",
        url: "https://cdn.kidlearn.test/images/monkey.png",
        kind: "image",
      },
    });
    expect(lesson.activity).toEqual({
      id: "activity_1",
      type: "drag_drop",
      schemaVersion: 1,
      definition: validDragDrop,
    });
    expect(lesson.quiz.questions).toHaveLength(3);
    expect(
      lesson.quiz.questions.map((q: { format: string }) => q.format),
    ).toEqual(["mcq", "picture_select", "mcq"]);
    // Payloads are passed through whole — the engines pick their own locale.
    expect(lesson.quiz.questions[1].definition).toEqual(validPictureSelect);
    expect(lesson.progress).toBeNull();
  });

  it("asks for the quiz questions in author-defined order", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(lessonRow());

    await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(db.lessonFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          quiz: { include: { questions: { orderBy: { sortOrder: "asc" } } } },
        }),
      }),
    );
  });

  it("returns a lesson with no activity or quiz attached without failing", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(
      lessonRow({ activity: null, activityId: null, quiz: null, quizId: null }),
    );

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lesson.activity).toBeNull();
    expect(res.body.data.lesson.quiz).toBeNull();
  });

  it("returns 500 INTERNAL and leaks no payload when a published activity definition is corrupt", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(
      lessonRow({
        activity: {
          id: "activity_1",
          type: "drag_drop",
          schemaVersion: 1,
          status: "published",
          definition: {
            ...validDragDrop,
            // Points at a drop target that is not on screen.
            correctMappings: [{ itemId: "cow", targetId: "barn" }],
          },
        },
      }),
    );

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.text).not.toContain("correctMappings");
    expect(res.text).not.toContain("barn");
  });

  it("returns 500 INTERNAL when a published quiz question definition is corrupt", async () => {
    signInAs(childProfile());
    const row = lessonRow();
    row.quiz.questions[1] = {
      ...row.quiz.questions[1],
      // Two options is below the FR-QUIZ-01 floor of three.
      definition: { ...validMcq, options: validMcq.options.slice(0, 2) },
    };
    db.lessonFindFirst.mockResolvedValue(row);

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.text).not.toContain("options");
  });
});

/**
 * `Lesson.status` is only part of the guard. `Activity`, `Quiz` and `World` each
 * carry a `ContentStatus` of their own, and the publishing workflow routinely
 * produces a published lesson whose activity is still in review. Those edges are
 * relations, so the `where`-clause assertions above cannot see them — these
 * tests inspect the response body instead.
 */
describe("related rows carry their own status gate (backend.md §4)", () => {
  const UNPUBLISHED = ["draft", "in_review", "approved", "rejected"] as const;

  it.each(
    UNPUBLISHED,
  )("omits an activity in %s from a published lesson rather than serving it", async (status) => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(
      lessonRow({
        activity: {
          id: "activity_1",
          type: "drag_drop",
          schemaVersion: 1,
          status,
          definition: validDragDrop,
        },
      }),
    );

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lesson.activity).toBeNull();
    // Not one field of the unreviewed payload reaches the child.
    expect(res.text).not.toContain("drag_drop");
  });

  it.each(
    UNPUBLISHED,
  )("omits a quiz in %s from a published lesson rather than serving it", async (status) => {
    signInAs(childProfile());
    const row = lessonRow();
    db.lessonFindFirst.mockResolvedValue({
      ...row,
      quiz: { ...row.quiz, status },
    });

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lesson.quiz).toBeNull();
    expect(res.text).not.toContain("picture_select");
  });

  it("still serves a published activity and quiz", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(lessonRow());

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.body.data.lesson.activity).not.toBeNull();
    expect(res.body.data.lesson.quiz.questions).toHaveLength(3);
  });

  it("requires the lesson's world to be published, on both the detail and list queries", async () => {
    signInAs(childProfile());

    await request(app).get(`/api/content/lessons/${LESSON_ID}`);
    await request(app).get(`/api/content/topics/${TOPIC_ID}/lessons`);

    // A required to-one relation cannot be filtered in an `include`, so the
    // condition sits in `where` and an unpublished world 404s the lesson.
    for (const fn of [db.lessonFindFirst, db.lessonFindMany]) {
      const [args] = fn.mock.calls[0] as [{ where: Record<string, unknown> }];
      expect(args.where.world).toEqual({ is: { status: "published" } });
    }
  });
});

describe("leak-proofing (FR-CURR-02, spec §7.3.4)", () => {
  const HIDDEN_STATUSES = [
    "draft",
    "in_review",
    "approved",
    "rejected",
    "archived",
  ];

  it("never sends a status other than published to Prisma, on any endpoint", async () => {
    signInAs(childProfile());
    await request(app).get("/api/content/worlds");
    await request(app).get("/api/content/subjects");
    await request(app).get(`/api/content/subjects/${SUBJECT_ID}/topics`);
    await request(app).get(`/api/content/topics/${TOPIC_ID}/lessons`);
    await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    const clauses = JSON.stringify(everyWhereClause());

    expect(clauses).toContain('"status":"published"');
    for (const status of HIDDEN_STATUSES) {
      expect(clauses).not.toContain(status);
    }
  });

  it("constrains every content query by status, with no unfiltered reads", async () => {
    signInAs(childProfile());
    await request(app).get("/api/content/worlds");
    await request(app).get("/api/content/subjects");
    await request(app).get(`/api/content/subjects/${SUBJECT_ID}/topics`);
    await request(app).get(`/api/content/topics/${TOPIC_ID}/lessons`);
    await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    const clauses = everyWhereClause();
    expect(clauses.length).toBeGreaterThan(0);
    for (const where of clauses) {
      expect(JSON.stringify(where)).toContain('"status":"published"');
    }
  });

  it("returns 404 for a lesson that is not tagged for the child's grade", async () => {
    signInAs(childProfile({ gradeLevel: "NURSERY" }));
    // A kg2-only lesson does not satisfy the grade condition, so the query
    // finds nothing — 404, not 403: a 403 would confirm the row exists.
    db.lessonFindFirst.mockResolvedValue(null);

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(db.lessonFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: LESSON_ID,
          status: "published",
          gradeLevels: { has: "NURSERY" },
          world: { is: { status: "published" } },
        },
      }),
    );
  });

  it("ignores a gradeLevel query parameter — grade comes from the child row only", async () => {
    signInAs(childProfile({ gradeLevel: "NURSERY" }));

    await request(app).get(
      `/api/content/topics/${TOPIC_ID}/lessons?gradeLevel=KG2&status=draft`,
    );

    const clauses = JSON.stringify(everyWhereClause());
    expect(clauses).toContain('"has":"NURSERY"');
    expect(clauses).not.toContain("KG2");
    expect(clauses).not.toContain("draft");
  });

  it("ignores a lang query parameter — language comes from the child row only", async () => {
    signInAs(childProfile({ preferredLanguage: "en" }));
    db.lessonFindFirst.mockResolvedValue(lessonRow());

    const res = await request(app).get(
      `/api/content/lessons/${LESSON_ID}?lang=bn`,
    );

    expect(res.body.data.lesson.locale).toBe("en");
    expect(res.body.data.lesson.introScript).toBe(
      "Hello! Today we learn the letter A.",
    );
  });
});

describe("locale resolution (FR-PROF-03, FR-I18N-01)", () => {
  it("serves Bangla text and video to a bn-preferring child", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    db.lessonFindFirst.mockResolvedValue(lessonRow());

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    const { lesson } = res.body.data;
    expect(lesson.locale).toBe("bn");
    expect(lesson.introScript).toBe("হ্যালো! আজ আমরা A শিখব।");
    expect(lesson.videoUrl).toBe(
      "https://cdn.kidlearn.test/video/bn/letter-a.mp4",
    );
    // Single-locale resolution: the other language never reaches the child.
    expect(res.text).not.toContain("Hello! Today we learn the letter A.");
  });

  it("falls back to English when the Bangla translation is missing entirely", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    const row = lessonRow();
    db.lessonFindFirst.mockResolvedValue({
      ...row,
      translations: row.translations.filter((t) => t.language === "en"),
    });

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    const { lesson } = res.body.data;
    expect(lesson.locale).toBe("en");
    expect(lesson.introScript).toBe("Hello! Today we learn the letter A.");
    expect(lesson.videoUrl).toBe(
      "https://cdn.kidlearn.test/video/en/letter-a.mp4",
    );
  });

  it("falls back to the English video when only the Bangla video asset is absent", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    const row = lessonRow();
    db.lessonFindFirst.mockResolvedValue({
      ...row,
      translations: row.translations.map((t) =>
        t.language === "bn"
          ? { ...t, videoAssetId: null, videoAsset: null }
          : t,
      ),
    });

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    const { lesson } = res.body.data;
    // Text stayed Bangla; only the missing asset fell back.
    expect(lesson.locale).toBe("bn");
    expect(lesson.introScript).toBe("হ্যালো! আজ আমরা A শিখব।");
    expect(lesson.videoUrl).toBe(
      "https://cdn.kidlearn.test/video/en/letter-a.mp4",
    );
  });

  it("returns null rather than failing when a lesson has no translations at all", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(lessonRow({ translations: [] }));

    const res = await request(app).get(`/api/content/lessons/${LESSON_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lesson.introScript).toBeNull();
    expect(res.body.data.lesson.videoUrl).toBeNull();
  });
});
