/**
 * `GET /api/children/:id/reports` — the weekly report list, and the lazy
 * generation behind it (FR-DASH-05..06).
 *
 * The route lives on `routes/children.ts`, beside the other per-child reads, so
 * this file is named for the endpoint rather than a module of its own — the same
 * deliberate exception to `general.md §4` that `dashboard.test.ts` records, and for
 * the same reason.
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four rules that bound it shape this suite:
 *
 *  - **Rule 1, stub state not answers.** `store.reports` is a table: the stubbed
 *    `upsert` matches on `(childId, weekStart)` and replaces in place, exactly as
 *    the unique index makes Postgres do. So "calling this twice does not duplicate
 *    a week" is a row count over real state rather than a mock told to return one
 *    row twice — which is the whole of FR-DASH-06.
 *  - **Rule 2, assert the query.** A stub cannot show that a draft lesson stayed in
 *    the database, so the `where` clauses that keep unreviewed content out of the
 *    concept tokens and the badge list are asserted directly.
 *  - **Rule 3, `where` is not the whole guard.** The badge name arrives through an
 *    `include`d relation, so its gate is asserted on the response body as well.
 *  - **Rule 4, name what the stub cannot prove.** The one-row-per-week guarantee
 *    ultimately rests on the `@@unique([childId, weekStart])` index, which no stub
 *    can demonstrate. The declaration it rests on is asserted at the bottom of this
 *    file; a real concurrency test replaces it once the harness exists.
 */
import { readFileSync } from "node:fs";
import type { ChildProfile, Parent } from "@kidlearn/db";
import { WeeklyReportListResponseSchema } from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";

const CHILD_ID = "child_1";
const OTHER_CHILD_ID = "child_2";
const OPERATION = "GET /api/children/{id}/reports";

/** Wednesday midday in Dhaka, so "last completed week" is 10–16 August. */
const NOW = new Date("2026-08-19T06:00:00.000Z");
const LAST_WEEK = "2026-08-10T00:00:00.000Z";
const WEEK_BEFORE = "2026-08-03T00:00:00.000Z";

type ReportRow = {
  childId: string;
  weekStart: Date;
  metrics: unknown;
  note: string | null;
  createdAt: Date;
};

type LessonRow = {
  id: string;
  status: string;
  worldId: string;
  conceptsIntroduced: string[];
};

type BadgeRow = { id: string; slug: string; name: string; status: string };

type ProgressRow = { childId: string; lessonId: string; completedAt: Date };

type LedgerRow = {
  childId: string;
  rewardType: string;
  sourceType: string;
  sourceId: string | null;
  badgeId: string | null;
  createdAt: Date;
};

type StoryRow = { id: string; status: string; worldId: string };

/** `QuizResponse.question -> QuizQuestion.quiz`, the path the quiz gate walks. */
type QuestionRow = { id: string; quizId: string };
type QuizRow = { id: string; status: string };

const store = vi.hoisted(() => ({
  reports: [] as unknown[],
  lessons: [] as unknown[],
  badges: [] as unknown[],
  worlds: [] as unknown[],
  progress: [] as unknown[],
  ledger: [] as unknown[],
  responses: [] as unknown[],
  stories: [] as unknown[],
  quizzes: [] as unknown[],
  questions: [] as unknown[],
  events: [] as Date[],
}));

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  childFindFirst: vi.fn(),
  reportFindUnique: vi.fn(),
  reportFindMany: vi.fn(),
  reportUpsert: vi.fn(),
  sessionEventFindMany: vi.fn(),
  progressFindMany: vi.fn(),
  ledgerFindMany: vi.fn(),
  quizResponseFindMany: vi.fn(),
  storyFindMany: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    weeklyReport: {
      findUnique: db.reportFindUnique,
      findMany: db.reportFindMany,
      upsert: db.reportUpsert,
    },
    sessionEvent: { findMany: db.sessionEventFindMany },
    lessonProgress: { findMany: db.progressFindMany },
    rewardLedger: { findMany: db.ledgerFindMany },
    quizResponse: { findMany: db.quizResponseFindMany },
    story: { findMany: db.storyFindMany },
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
  pinHash: "hashed-pin",
  consentGivenAt: new Date("2026-01-01T00:00:00.000Z"),
  consentVersion: "1.0",
  pinFailedCount: 0,
  pinLockoutStrikes: 0,
  pinLockedUntil: null,
  deleteToken: null,
  deleteTokenExpiresAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function childProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id: CHILD_ID,
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

function signInAs({
  child = childProfile(),
  hasPin = true,
  isPinVerified = true,
}: {
  child?: ChildProfile | null;
  hasPin?: boolean;
  isPinVerified?: boolean;
} = {}) {
  // `getSession` returns a deep better-auth type; only the fields the middleware
  // reads are supplied, so the shape is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: {
      id: "session_1",
      userId: SESSION_USER.id,
      activeChildProfileId: child?.id ?? null,
      pinVerifiedUntil: isPinVerified
        ? new Date(Date.now() + 15 * 60_000).toISOString()
        : null,
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
  db.parentFindUnique.mockResolvedValue({
    ...PARENT,
    pinHash: hasPin ? PARENT.pinHash : null,
  });
  db.childFindFirst.mockResolvedValue(child);
}

const LIVE_WORLD = "world_meadow";
const DRAFT_WORLD = "world_unreviewed";

function seedCurriculum() {
  store.worlds = [
    { id: LIVE_WORLD, status: "published" },
    { id: DRAFT_WORLD, status: "draft" },
  ];
  store.lessons = [
    {
      id: "lesson_a",
      status: "published",
      worldId: LIVE_WORLD,
      conceptsIntroduced: ["letter:A", "word:apple"],
    },
    {
      id: "lesson_b",
      status: "published",
      worldId: LIVE_WORLD,
      conceptsIntroduced: ["letter:B", "number:2"],
    },
    {
      id: "lesson_draft",
      status: "draft",
      worldId: LIVE_WORLD,
      conceptsIntroduced: ["letter:D"],
    },
    {
      id: "lesson_curtained",
      status: "published",
      worldId: DRAFT_WORLD,
      conceptsIntroduced: ["letter:C"],
    },
  ] satisfies LessonRow[];
  store.stories = [
    { id: "story_live", status: "published", worldId: LIVE_WORLD },
    { id: "story_pulled", status: "draft", worldId: LIVE_WORLD },
    { id: "story_curtained", status: "published", worldId: DRAFT_WORLD },
  ] satisfies StoryRow[];
  store.quizzes = [
    { id: "quiz_live", status: "published" },
    { id: "quiz_draft", status: "draft" },
  ] satisfies QuizRow[];
  store.questions = [
    { id: "q1", quizId: "quiz_live" },
    { id: "q2", quizId: "quiz_live" },
    { id: "q_draft", quizId: "quiz_draft" },
  ] satisfies QuestionRow[];
  store.badges = [
    {
      id: "badge_first",
      slug: "first-lesson",
      name: "First Lesson",
      status: "published",
    },
    {
      id: "badge_secret",
      slug: "unreleased",
      name: "Unreleased",
      status: "draft",
    },
  ] satisfies BadgeRow[];
}

/** A completion inside last week (10–16 August, local). */
function completed(lessonId: string, at = "2026-08-11T04:00:00.000Z") {
  return { childId: CHILD_ID, lessonId, completedAt: new Date(at) };
}

/** One of the two ledger rows a finished story writes. */
function storyCompletion(
  storyId: string,
  rewardType: "star" | "coin",
  at = "2026-08-11T04:00:00.000Z",
): LedgerRow {
  return {
    childId: CHILD_ID,
    rewardType,
    sourceType: "story_completion",
    sourceId: storyId,
    badgeId: null,
    createdAt: new Date(at),
  };
}

function answered(
  questionId: string,
  isCorrect: boolean,
  at = "2026-08-11T04:00:00.000Z",
) {
  return { questionId, isCorrect, answeredAt: new Date(at) };
}

function storedReport(weekStart: string): ReportRow {
  return {
    childId: CHILD_ID,
    weekStart: new Date(weekStart),
    metrics: {
      activeDays: 3,
      learningMinutes: 42,
      newLetters: ["A"],
      newWords: [],
      newNumbers: [],
      lessonsCompleted: 2,
      storiesCompleted: 1,
      quizAccuracy: 80,
      quizFirstAttempts: 5,
      quizFirstAttemptsCorrect: 4,
      badgesEarned: [],
      noteKey: "steadyProgress",
      noteParams: { count: 2 },
    },
    note: "2 lessons finished this week. Every one of them counts.",
    createdAt: new Date("2026-08-17T02:00:00.000Z"),
  };
}

type WhereNode = {
  status?: string;
  world?: { is: { status?: string } };
};

function matchesWorld(worldId: string, node: WhereNode): boolean {
  if (node.world === undefined) return true;
  const world = (store.worlds as { id: string; status: string }[]).find(
    (row) => row.id === worldId,
  );
  if (world === undefined) return false;
  const wanted = node.world.is.status;
  return wanted === undefined || world.status === wanted;
}

/**
 * Lessons the query asked for — the clauses are **interpreted**, not reimplemented.
 *
 * A gate the service stops sending stops being applied here, so rows it was keeping
 * out start arriving and a behavioural test fails. A stub that filtered on
 * `status === "published"` of its own accord would pass whether the query asked for
 * it or not (`general.md §5`, rule 2).
 */
function visibleLessons(node: WhereNode): LessonRow[] {
  return (store.lessons as LessonRow[]).filter((lesson) => {
    if (node.status !== undefined && lesson.status !== node.status)
      return false;
    return matchesWorld(lesson.worldId, node);
  });
}

function reportsFor(childId: string): ReportRow[] {
  return (store.reports as ReportRow[]).filter(
    (row) => row.childId === childId,
  );
}

beforeEach(() => {
  store.reports = [];
  store.lessons = [];
  store.badges = [];
  store.worlds = [];
  store.progress = [];
  store.ledger = [];
  store.responses = [];
  store.stories = [];
  store.quizzes = [];
  store.questions = [];
  store.events = [];
  for (const fn of Object.values(db)) fn.mockReset();

  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);

  db.reportFindUnique.mockImplementation(
    async ({
      where,
    }: {
      where: { childId_weekStart: { childId: string; weekStart: Date } };
    }) =>
      reportsFor(where.childId_weekStart.childId).find(
        (row) =>
          row.weekStart.getTime() ===
          where.childId_weekStart.weekStart.getTime(),
      ) ?? null,
  );

  db.reportFindMany.mockImplementation(
    async ({ where }: { where: { childId: string } }) =>
      reportsFor(where.childId).sort(
        (a, b) => b.weekStart.getTime() - a.weekStart.getTime(),
      ),
  );

  // Rule 1: the table, not the answer. Matching on the same pair the unique index
  // covers is what makes the idempotency assertions below mean anything.
  db.reportUpsert.mockImplementation(
    async (args: {
      where: { childId_weekStart: { childId: string; weekStart: Date } };
      create: ReportRow;
      update: { metrics: unknown; note: string | null };
    }) => {
      const { childId, weekStart } = args.where.childId_weekStart;
      const rows = store.reports as ReportRow[];
      const existing = rows.find(
        (row) =>
          row.childId === childId &&
          row.weekStart.getTime() === weekStart.getTime(),
      );

      if (existing) {
        existing.metrics = args.update.metrics;
        existing.note = args.update.note;
        return existing;
      }

      const created: ReportRow = {
        childId,
        weekStart,
        metrics: args.create.metrics,
        note: args.create.note,
        createdAt: new Date(),
      };
      rows.push(created);
      return created;
    },
  );

  db.sessionEventFindMany.mockImplementation(
    async ({ where }: { where: { occurredAt: { gte: Date; lt: Date } } }) =>
      store.events
        .filter((at) => at >= where.occurredAt.gte && at < where.occurredAt.lt)
        .map((occurredAt) => ({ occurredAt })),
  );

  db.progressFindMany.mockImplementation(
    async (args: {
      where: {
        childId: string;
        completedAt: { gte: Date; lt: Date };
        lesson: { is: WhereNode };
      };
    }) => {
      const visible = new Map(
        visibleLessons(args.where.lesson.is).map((lesson) => [
          lesson.id,
          lesson,
        ]),
      );
      return (store.progress as ProgressRow[])
        .filter(
          (row) =>
            row.childId === args.where.childId &&
            row.completedAt >= args.where.completedAt.gte &&
            row.completedAt < args.where.completedAt.lt &&
            visible.has(row.lessonId),
        )
        .map((row) => ({
          completedAt: row.completedAt,
          lesson: {
            conceptsIntroduced:
              visible.get(row.lessonId)?.conceptsIntroduced ?? [],
          },
        }));
    },
  );

  db.ledgerFindMany.mockImplementation(
    async (args: {
      where: {
        childId: string;
        rewardType: string;
        sourceType?: string;
        createdAt: { gte: Date; lt: Date };
        badge?: { is: { status?: string } };
      };
    }) => {
      const badges = new Map(
        (store.badges as BadgeRow[]).map((badge) => [badge.id, badge]),
      );

      return (store.ledger as LedgerRow[])
        .filter((row) => {
          if (row.childId !== args.where.childId) return false;
          if (row.rewardType !== args.where.rewardType) return false;
          if (
            args.where.sourceType !== undefined &&
            row.sourceType !== args.where.sourceType
          ) {
            return false;
          }
          if (
            row.createdAt < args.where.createdAt.gte ||
            row.createdAt >= args.where.createdAt.lt
          ) {
            return false;
          }
          if (args.where.badge !== undefined) {
            const badge =
              row.badgeId === null ? undefined : badges.get(row.badgeId);
            // A to-one relation filter also excludes rows with no relation.
            if (badge === undefined) return false;
            const wanted = args.where.badge.is.status;
            if (wanted !== undefined && badge.status !== wanted) return false;
          }
          return true;
        })
        .map((row) => {
          const badge =
            row.badgeId === null ? undefined : badges.get(row.badgeId);
          return {
            createdAt: row.createdAt,
            sourceId: row.sourceId,
            badge:
              badge === undefined
                ? null
                : { slug: badge.slug, name: badge.name },
          };
        });
    },
  );

  // The story count's gate is a second query, because `RewardLedger.sourceId` is
  // text rather than a relation. Interpreted, not reimplemented (rule 2): drop the
  // `status` clause from the service and a pulled story starts being counted.
  db.storyFindMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } & WhereNode }) =>
      (store.stories as StoryRow[])
        .filter((story) => {
          if (!where.id.in.includes(story.id)) return false;
          if (where.status !== undefined && story.status !== where.status)
            return false;
          return matchesWorld(story.worldId, where);
        })
        .map((story) => ({ id: story.id })),
  );

  db.quizResponseFindMany.mockImplementation(
    async ({
      where,
    }: {
      where: {
        answeredAt: { gte: Date; lt: Date };
        question?: { is: { quiz: { is: { status?: string } } } };
      };
    }) => {
      const quizzes = new Map(
        (store.quizzes as QuizRow[]).map((quiz) => [quiz.id, quiz]),
      );
      const questions = new Map(
        (store.questions as QuestionRow[]).map((question) => [
          question.id,
          question,
        ]),
      );

      return (
        store.responses as {
          questionId: string;
          isCorrect: boolean;
          answeredAt: Date;
        }[]
      ).filter((row) => {
        if (
          row.answeredAt < where.answeredAt.gte ||
          row.answeredAt >= where.answeredAt.lt
        ) {
          return false;
        }
        if (where.question === undefined) return true;
        const quizId = questions.get(row.questionId)?.quizId;
        const quiz = quizId === undefined ? undefined : quizzes.get(quizId);
        // A to-one relation filter also excludes rows with no relation.
        if (quiz === undefined) return false;
        const wanted = where.question.is.quiz.is.status;
        return wanted === undefined || quiz.status === wanted;
      });
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/children/:id/reports — scoping", () => {
  it("returns 401 without a session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 PIN_VERIFICATION_REQUIRED without a live PIN grant", async () => {
    signInAs({ isPinVerified: false });

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    // A report says what a child did and did not learn — the household's private
    // record, and what FR-AUTH-04 puts the parental gate in front of.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_VERIFICATION_REQUIRED");
  });

  it("returns 403 PIN_REQUIRED for an account with no PIN at all", async () => {
    signInAs({ hasPin: false, isPinVerified: false });

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_REQUIRED");
  });

  it("returns 404 for another parent's child", async () => {
    signInAs({ child: null });

    const res = await request(app).get(
      `/api/children/${OTHER_CHILD_ID}/reports`,
    );

    // Not 403: a 403 would confirm the profile exists (NFR-SAFE-02).
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    // And nothing was generated for a child the caller does not own.
    expect(db.reportUpsert).not.toHaveBeenCalled();
  });

  it("lists only the child in the path", async () => {
    signInAs();
    seedCurriculum();
    store.reports = [
      storedReport(LAST_WEEK),
      { ...storedReport(WEEK_BEFORE), childId: OTHER_CHILD_ID },
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.status).toBe(200);
    expect(res.body.data.reports).toHaveLength(1);
    expect(db.reportFindMany.mock.calls[0][0].where.childId).toBe(CHILD_ID);
  });
});

describe("GET /api/children/:id/reports — lazy generation", () => {
  it("generates the last completed week on the first read", async () => {
    signInAs();
    seedCurriculum();
    store.progress = [completed("lesson_a")] satisfies ProgressRow[];
    store.events = [new Date("2026-08-11T04:00:00.000Z")];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.status).toBe(200);
    assertContract(WeeklyReportListResponseSchema, res.body, OPERATION);
    expect(res.body.data.reports).toHaveLength(1);
    // The Monday of the week before the one containing `NOW`, not this week's.
    expect(res.body.data.reports[0].weekStart).toBe(LAST_WEEK);
    // The Sunday, inclusive — the far edge the range header renders.
    expect(res.body.data.reports[0].weekEnd).toBe("2026-08-16T00:00:00.000Z");
    expect(res.body.data.reports[0].metrics).toMatchObject({
      activeDays: 1,
      lessonsCompleted: 1,
      newLetters: ["A"],
      newWords: ["apple"],
    });
  });

  it("adds no row on a second read of the same week", async () => {
    signInAs();
    seedCurriculum();
    store.progress = [completed("lesson_a")] satisfies ProgressRow[];

    await request(app).get(`/api/children/${CHILD_ID}/reports`);
    const second = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    // FR-DASH-06: the history stays clean however often the screen is opened.
    expect(second.body.data.reports).toHaveLength(1);
    expect(store.reports).toHaveLength(1);
    // The row already existed, so the second read did not regenerate it.
    expect(db.reportUpsert).toHaveBeenCalledTimes(1);
  });

  it("leaves an existing row for the last completed week alone", async () => {
    signInAs();
    seedCurriculum();
    store.reports = [storedReport(LAST_WEEK)];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(db.reportUpsert).not.toHaveBeenCalled();
    expect(res.body.data.reports[0].metrics.learningMinutes).toBe(42);
  });

  it("fills only one week, leaving older gaps to the cron job", async () => {
    signInAs();
    seedCurriculum();

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    // A parent returning after a long absence gets last week's card immediately
    // rather than waiting on an aggregation per missing week.
    expect(db.reportUpsert).toHaveBeenCalledTimes(1);
    expect(res.body.data.reports).toHaveLength(1);
  });

  it("generates nothing for a week the child did not exist in", async () => {
    // Created Wednesday, so the last completed week (10–16 Aug) ended before the
    // profile did. Aggregating it would store `activeDays: 0` and a `quietWeek`
    // note as the first thing a parent ever reads about a profile they just made.
    signInAs({
      child: childProfile({ createdAt: new Date("2026-08-19T05:00:00.000Z") }),
    });
    seedCurriculum();

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.status).toBe(200);
    assertContract(WeeklyReportListResponseSchema, res.body, OPERATION);
    expect(res.body.data.reports).toEqual([]);
    expect(db.reportUpsert).not.toHaveBeenCalled();
  });

  it("generates the partial week a child was created in, once it has ended", async () => {
    // Created on the Tuesday of 10–16 Aug: that week has ended and the child did
    // learn in part of it, so withholding it would be withholding their first week.
    signInAs({
      child: childProfile({ createdAt: new Date("2026-08-11T05:00:00.000Z") }),
    });
    seedCurriculum();
    store.events = [new Date("2026-08-12T04:00:00.000Z")];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.body.data.reports).toHaveLength(1);
    expect(res.body.data.reports[0].weekStart).toBe(LAST_WEEK);
  });

  it("returns every past week, newest first", async () => {
    signInAs();
    seedCurriculum();
    store.reports = [storedReport(WEEK_BEFORE), storedReport(LAST_WEEK)];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    assertContract(WeeklyReportListResponseSchema, res.body, OPERATION);
    expect(
      res.body.data.reports.map((report: { weekStart: string }) =>
        report.weekStart.slice(0, 10),
      ),
    ).toEqual(["2026-08-10", "2026-08-03"]);
  });

  it("stores the English note beside the key it was rendered from", async () => {
    signInAs();
    seedCurriculum();
    store.progress = [completed("lesson_a")] satisfies ProgressRow[];
    // A finished lesson always leaves session events behind, and without them the
    // week has zero active days — which `quietWeek` correctly claims first.
    store.events = [new Date("2026-08-11T04:00:00.000Z")];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    const report = res.body.data.reports[0];
    expect(report.metrics.noteKey).toBe("steadyProgress");
    expect(report.metrics.noteParams).toEqual({ count: 1 });
    // The stored string is a fallback and a debugging aid; the client renders from
    // the key so the note can be Bangla.
    expect(report.note).toContain("1 lessons finished this week");
  });

  it("omits a stored week whose metrics no longer parse", async () => {
    signInAs();
    seedCurriculum();
    store.reports = [
      storedReport(LAST_WEEK),
      { ...storedReport(WEEK_BEFORE), metrics: { activeDays: "three" } },
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    // One unreadable blob must not 500 a parent's whole history — the week is
    // dropped and logged instead.
    expect(res.status).toBe(200);
    assertContract(WeeklyReportListResponseSchema, res.body, OPERATION);
    expect(res.body.data.reports).toHaveLength(1);
  });
});

describe("GET /api/children/:id/reports — what the figures may see", () => {
  it("counts the local week, not seven UTC days", async () => {
    signInAs();
    seedCurriculum();
    // 16 Aug 18:30 UTC is 17 Aug 00:30 in Dhaka — the Monday *after* the reported
    // week, so it must not be counted. A UTC window would include it.
    store.events = [new Date("2026-08-16T18:30:00.000Z")];
    store.progress = [
      completed("lesson_a", "2026-08-16T18:30:00.000Z"),
    ] satisfies ProgressRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.body.data.reports[0].metrics).toMatchObject({
      activeDays: 0,
      lessonsCompleted: 0,
    });
    const window = db.sessionEventFindMany.mock.calls[0][0].where.occurredAt;
    expect(window.gte.toISOString()).toBe("2026-08-09T18:00:00.000Z");
    expect(window.lt.toISOString()).toBe("2026-08-16T18:00:00.000Z");
  });

  it("keeps a draft lesson's concepts out of the report", async () => {
    signInAs();
    seedCurriculum();
    store.progress = [
      completed("lesson_a"),
      completed("lesson_draft"),
    ] satisfies ProgressRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.body.data.reports[0].metrics.newLetters).toEqual(["A"]);
    // Rule 2: the stub cannot show the draft row stayed in the database, so the
    // clause that keeps it out of the aggregate is asserted directly.
    expect(db.progressFindMany.mock.calls[0][0].where.lesson).toEqual({
      is: { status: "published", world: { is: { status: "published" } } },
    });
  });

  it("keeps a lesson in an unreviewed world out of the report", async () => {
    signInAs();
    seedCurriculum();
    store.progress = [completed("lesson_curtained")] satisfies ProgressRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    // `World.status` defaults to draft and takes its lessons down with it, so its
    // concept tokens are no more the parent's to read than the child's.
    expect(res.body.data.reports[0].metrics).toMatchObject({
      lessonsCompleted: 0,
      newLetters: [],
    });
  });

  it("counts a finished story once, though it wrote two ledger rows", async () => {
    signInAs();
    seedCurriculum();
    store.ledger = [
      storyCompletion("story_live", "star"),
      storyCompletion("story_live", "coin"),
    ] satisfies LedgerRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.body.data.reports[0].metrics.storiesCompleted).toBe(1);
  });

  it("stops counting a story that has been pulled from the catalogue", async () => {
    signInAs();
    seedCurriculum();
    store.ledger = [
      storyCompletion("story_live", "star"),
      storyCompletion("story_pulled", "star"),
      storyCompletion("story_curtained", "star"),
    ] satisfies LedgerRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    // The ledger rows stay — the child earned those stars — but a figure about
    // withdrawn content is not one a parent is told, and the endpoint documents
    // that unpublished content never reaches the figures (`backend.md §4`).
    expect(res.body.data.reports[0].metrics.storiesCompleted).toBe(1);
    // Rule 2: the gate is a `where` on a second query, so assert it directly.
    expect(db.storyFindMany.mock.calls[0][0].where).toMatchObject({
      status: "published",
      world: { is: { status: "published" } },
    });
  });

  it("keeps answers to an unpublished quiz out of the accuracy", async () => {
    signInAs();
    seedCurriculum();
    store.responses = [
      answered("q1", true),
      answered("q_draft", false, "2026-08-11T04:01:00.000Z"),
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    // 100% of one published answer, not 50% of two — a quiz withdrawn from the
    // catalogue does not go on shaping the figure a parent reads.
    expect(res.body.data.reports[0].metrics).toMatchObject({
      quizAccuracy: 100,
      quizFirstAttempts: 1,
    });
    expect(db.quizResponseFindMany.mock.calls[0][0].where.question).toEqual({
      is: { quiz: { is: { status: "published" } } },
    });
  });

  it("names badges earned in the week and omits unpublished ones", async () => {
    signInAs();
    seedCurriculum();
    store.ledger = [
      {
        childId: CHILD_ID,
        rewardType: "badge",
        sourceType: "badge_unlock",
        sourceId: null,
        badgeId: "badge_first",
        createdAt: new Date("2026-08-11T04:00:00.000Z"),
      },
      {
        childId: CHILD_ID,
        rewardType: "badge",
        sourceType: "badge_unlock",
        sourceId: null,
        badgeId: "badge_secret",
        createdAt: new Date("2026-08-12T04:00:00.000Z"),
      },
    ] satisfies LedgerRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    // Rule 3: the name arrives through a relation, so the response body is the
    // only place the gate on it can be seen.
    expect(res.body.data.reports[0].metrics.badgesEarned).toEqual([
      { slug: "first-lesson", name: "First Lesson" },
    ]);
    const badgeCall = db.ledgerFindMany.mock.calls.find(
      (call) => call[0].where.rewardType === "badge",
    );
    expect(badgeCall?.[0].where.badge).toEqual({
      is: { status: "published" },
    });
  });

  it("reports first-attempt accuracy over the week's answers", async () => {
    signInAs();
    seedCurriculum();
    store.responses = [
      {
        questionId: "q1",
        isCorrect: true,
        answeredAt: new Date("2026-08-11T04:00:00.000Z"),
      },
      {
        questionId: "q2",
        isCorrect: false,
        answeredAt: new Date("2026-08-11T04:01:00.000Z"),
      },
      {
        questionId: "q2",
        isCorrect: true,
        answeredAt: new Date("2026-08-11T04:02:00.000Z"),
      },
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    expect(res.body.data.reports[0].metrics).toMatchObject({
      quizAccuracy: 50,
      quizFirstAttempts: 2,
      // Stored, not left to the client to invert out of the rounded percentage.
      quizFirstAttemptsCorrect: 1,
    });
  });

  it("reports a null accuracy for a week with no answers", async () => {
    signInAs();
    seedCurriculum();

    const res = await request(app).get(`/api/children/${CHILD_ID}/reports`);

    assertContract(WeeklyReportListResponseSchema, res.body, OPERATION);
    expect(res.body.data.reports[0].metrics.quizAccuracy).toBeNull();
  });
});

describe("one-row-per-week contract", () => {
  /**
   * The idempotency assertions above run against a stub that matches on
   * `(childId, weekStart)` because that is what the index makes Postgres do. A
   * stubbed client cannot demonstrate the index itself, so this asserts the
   * declaration the guarantee rests on. Replace it with a real concurrent-write
   * test once the test-database harness exists.
   */
  it("declares the unique index generation upserts against", () => {
    const schema = readFileSync(
      new URL("../../../../packages/db/prisma/schema.prisma", import.meta.url),
      "utf8",
    );

    const model = schema.slice(
      schema.indexOf("model WeeklyReport {"),
      schema.indexOf("model AIGenerationJob {"),
    );

    expect(model).toContain("@@unique([childId, weekStart])");
    // A date column, not a timestamp: the upsert key is a calendar week, and two
    // instants inside one Monday must not be two rows.
    expect(model).toContain("weekStart DateTime     @db.Date");
  });
});
