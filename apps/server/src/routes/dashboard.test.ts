/**
 * `GET /api/children/:id/dashboard` — the one read the `/parent` screen makes
 * (FR-DASH-01..04).
 *
 * The route itself lives on `routes/children.ts`, beside the other per-child
 * reads, so this file is named for the endpoint rather than for a module of its
 * own — a deliberate exception to the `<file-under-test>.test.ts` convention in
 * `general.md §4`, not the precedent `screen-time.test.ts` sets (that suite does
 * have a `routes/screen-time.ts`). `children.test.ts` already covers the profile
 * CRUD on that router; folding twenty-four dashboard cases into it would bury
 * both. If a `routes/dashboard.ts` ever appears, this name is already right.
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four rules that bound it shape this suite:
 *
 *  - **Rule 1, stub state not answers.** `store` holds curriculum rows, progress
 *    rows and ledger rows, and the stubbed queries *filter* them the way Prisma
 *    would. So "a draft lesson is not in the denominator" is a real row this
 *    request could not see, not a mock told to return a smaller number.
 *  - **Rule 2, assert the query.** A stub cannot prove a draft row stayed in the
 *    database, so the `where` clauses carrying `status: "published"` — on the
 *    lesson count, the topic list, the progress join and the feed — are asserted
 *    directly.
 *  - **Rule 3, `where` is not the whole guard.** The badge title arrives through
 *    an `include`d relation, so its gate is asserted on the response body as well
 *    as on the query. The story title does *not*: it is a separate top-level
 *    `story.findMany` with a `where` of its own, and an earlier version of this
 *    file mis-filed it under this rule and asserted only the body — which let both
 *    feed guards be deleted with the suite still green, because the stubs were
 *    applying the status filter themselves. They now apply only what the query
 *    asks for; see `WhereNode`.
 *  - **Rule 4, name what the stub cannot prove.** Nothing here rests on database
 *    behaviour — no cascade, no transaction, no unique constraint. The arithmetic
 *    itself is unit-tested without any Prisma at all in
 *    `services/dashboardService.test.ts`.
 */
import type { ChildProfile, Parent } from "@kidlearn/db";
import { DashboardSummaryResponseSchema } from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";

const CHILD_ID = "child_1";
const OTHER_CHILD_ID = "child_2";
const OPERATION = "GET /api/children/{id}/dashboard";

type StatusRow = { status: string; gradeLevels: string[] };

type SubjectRow = StatusRow & {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  translations: { language: string; name: string }[];
};

type TopicRow = StatusRow & { id: string; subjectId: string };

type WorldRow = { id: string; status: string };

type LessonRow = StatusRow & {
  id: string;
  topicId: string;
  worldId: string;
  title: string;
  translations: { language: string; title: string }[];
};

type StoryRow = {
  id: string;
  worldId: string;
  title: string;
  status: string;
  translations: { language: string; title: string }[];
};

type BadgeRow = { id: string; name: string; status: string };

type ProgressRow = {
  childId: string;
  lessonId: string;
  completedAt: Date | null;
};

type LedgerRow = {
  childId: string;
  rewardType: string;
  sourceType: string;
  sourceId: string | null;
  badgeId: string | null;
};

const store = vi.hoisted(() => ({
  subjects: [] as unknown[],
  topics: [] as unknown[],
  worlds: [] as unknown[],
  lessons: [] as unknown[],
  progress: [] as unknown[],
  ledger: [] as unknown[],
  badges: [] as unknown[],
  stories: [] as unknown[],
  /** Presence rows the three minute figures are derived from. */
  events: [] as Date[],
}));

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  childFindFirst: vi.fn(),
  sessionEventFindMany: vi.fn(),
  lessonGroupBy: vi.fn(),
  topicFindMany: vi.fn(),
  progressFindMany: vi.fn(),
  ledgerFindMany: vi.fn(),
  storyFindMany: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    sessionEvent: { findMany: db.sessionEventFindMany },
    lesson: { groupBy: db.lessonGroupBy },
    topic: { findMany: db.topicFindMany },
    lessonProgress: { findMany: db.progressFindMany },
    rewardLedger: { findMany: db.ledgerFindMany },
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

type SignInOptions = {
  child?: ChildProfile | null;
  hasPin?: boolean;
  isPinVerified?: boolean;
};

function signInAs({
  child = childProfile(),
  hasPin = true,
  isPinVerified = true,
}: SignInOptions = {}) {
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
  // `loadOwnedChild` filters on `parentId`, so another parent's child is simply
  // not found — which is what the 404 test drives by passing `null`.
  db.childFindFirst.mockResolvedValue(child);
}

const PUBLISHED_NURSERY: StatusRow = {
  status: "published",
  gradeLevels: ["NURSERY", "KG1"],
};

/**
 * `World` carries its own `status` and every lesson and story requires one, so a
 * fixture needs both kinds: the reviewed world everything hangs off by default,
 * and one pulled back for revision that a lesson or story can be moved into.
 */
const LIVE_WORLD = "world_meadow";
const DRAFT_WORLD = "world_unreviewed";

function seedCurriculum() {
  store.worlds = [
    { id: LIVE_WORLD, status: "published" },
    { id: DRAFT_WORLD, status: "draft" },
  ] satisfies WorldRow[];

  store.subjects = [
    {
      id: "subject_language",
      slug: "language",
      name: "Language",
      sortOrder: 0,
      translations: [
        { language: "en", name: "Language" },
        { language: "bn", name: "ভাষা" },
      ],
      ...PUBLISHED_NURSERY,
    },
    {
      id: "subject_maths",
      slug: "maths",
      name: "Maths",
      sortOrder: 1,
      translations: [{ language: "en", name: "Maths" }],
      ...PUBLISHED_NURSERY,
    },
  ] satisfies SubjectRow[];

  store.topics = [
    {
      id: "topic_alphabet",
      subjectId: "subject_language",
      ...PUBLISHED_NURSERY,
    },
    { id: "topic_counting", subjectId: "subject_maths", ...PUBLISHED_NURSERY },
  ] satisfies TopicRow[];

  store.lessons = [
    lessonRow("lesson_a", "topic_alphabet", "Letter A", "অ"),
    lessonRow("lesson_b", "topic_alphabet", "Letter B", "ব"),
    lessonRow("lesson_c", "topic_alphabet", "Letter C", "স"),
    lessonRow("lesson_d", "topic_alphabet", "Letter D", "ড"),
    lessonRow("lesson_1", "topic_counting", "Number One", "এক"),
    lessonRow("lesson_2", "topic_counting", "Number Two", "দুই"),
  ] satisfies LessonRow[];
}

function lessonRow(
  id: string,
  topicId: string,
  title: string,
  bnTitle: string,
  overrides: Partial<LessonRow> = {},
): LessonRow {
  return {
    id,
    topicId,
    worldId: LIVE_WORLD,
    title,
    translations: [
      { language: "en", title },
      { language: "bn", title: bnTitle },
    ],
    ...PUBLISHED_NURSERY,
    ...overrides,
  };
}

function completed(lessonId: string, at: string): ProgressRow {
  return { childId: CHILD_ID, lessonId, completedAt: new Date(at) };
}

/** Seeds enough beats to make `getLearningMinutes` report `minutes` today. */
function seedMinutes(minutes: number) {
  const start = new Date("2026-08-19T06:00:00.000Z").getTime();
  // One beat every 30s: the density rule credits the span plus a 30s tail, so
  // `n` beats are `n * 0.5` minutes.
  store.events = Array.from(
    { length: minutes * 2 },
    (_, index) => new Date(start + index * 30_000),
  );
}

/**
 * The subset of Prisma's `where` grammar this service sends.
 *
 * The stubs below **interpret** it rather than reimplementing the visibility rule,
 * and that is the whole point: a clause the service stops sending stops being
 * applied here, so rows the guard was keeping out start arriving and a
 * behavioural test fails. A stub that applied `status === "published"` of its own
 * accord passes whether the query asked for it or not — which is exactly how the
 * story and badge guards came to be untested while looking covered
 * (`general.md §5`, rule 2).
 */
type WhereNode = {
  status?: string;
  gradeLevels?: { has: string };
  world?: { is: { status?: string } };
  topic?: { is: WhereNode };
  subject?: { is: WhereNode };
};

function subjectsById(): Map<string, SubjectRow> {
  return new Map((store.subjects as SubjectRow[]).map((row) => [row.id, row]));
}

function topicsById(): Map<string, TopicRow> {
  return new Map((store.topics as TopicRow[]).map((row) => [row.id, row]));
}

function worldsById(): Map<string, WorldRow> {
  return new Map((store.worlds as WorldRow[]).map((row) => [row.id, row]));
}

/** `status` and `gradeLevels`, applied only where the query asked for them. */
function matchesStatus(
  row: { status: string; gradeLevels?: string[] },
  node: WhereNode,
): boolean {
  if (node.status !== undefined && row.status !== node.status) return false;
  if (node.gradeLevels !== undefined) {
    return row.gradeLevels?.includes(node.gradeLevels.has) === true;
  }
  return true;
}

/** The `world: { is: … }` relation filter — absent from the node means unasked. */
function matchesWorld(worldId: string, node: WhereNode): boolean {
  if (node.world === undefined) return true;
  const world = worldsById().get(worldId);
  if (world === undefined) return false;
  return matchesStatus(world, node.world.is);
}

function matchesTopic(topic: TopicRow, node: WhereNode): boolean {
  if (!matchesStatus(topic, node)) return false;
  if (node.subject === undefined) return true;
  const subject = subjectsById().get(topic.subjectId);
  return subject !== undefined && matchesStatus(subject, node.subject.is);
}

function matchesLesson(lesson: LessonRow, node: WhereNode): boolean {
  if (!matchesStatus(lesson, node)) return false;
  if (!matchesWorld(lesson.worldId, node)) return false;
  if (node.topic === undefined) return true;
  const topic = topicsById().get(lesson.topicId);
  return topic !== undefined && matchesTopic(topic, node.topic.is);
}

function lessonsMatching(node: WhereNode): LessonRow[] {
  return (store.lessons as LessonRow[]).filter((lesson) =>
    matchesLesson(lesson, node),
  );
}

beforeEach(() => {
  store.subjects = [];
  store.topics = [];
  store.worlds = [];
  store.lessons = [];
  store.progress = [];
  store.ledger = [];
  store.badges = [];
  store.stories = [];
  store.events = [];
  for (const fn of Object.values(db)) fn.mockReset();

  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Midday in Asia/Dhaka (UTC+6), so `today`, `week` and `month` all contain the
  // seeded beats without a boundary case in the way.
  vi.setSystemTime(new Date("2026-08-19T06:00:00.000Z"));

  db.sessionEventFindMany.mockImplementation(
    async ({ where }: { where: { occurredAt: { gte: Date; lt: Date } } }) =>
      store.events
        .filter((at) => at >= where.occurredAt.gte && at < where.occurredAt.lt)
        .map((occurredAt) => ({ occurredAt })),
  );

  db.lessonGroupBy.mockImplementation(
    async ({ where }: { where: WhereNode }) => {
      const counts = new Map<string, number>();
      for (const lesson of lessonsMatching(where)) {
        counts.set(lesson.topicId, (counts.get(lesson.topicId) ?? 0) + 1);
      }
      return [...counts].map(([topicId, total]) => ({
        topicId,
        _count: { _all: total },
      }));
    },
  );

  db.topicFindMany.mockImplementation(
    async ({ where }: { where: WhereNode }) => {
      const subjects = subjectsById();
      return (store.topics as TopicRow[])
        .filter((topic) => matchesTopic(topic, where))
        .map((topic) => ({
          id: topic.id,
          subject: subjects.get(topic.subjectId),
        }));
    },
  );

  db.progressFindMany.mockImplementation(
    async (args: {
      where: { childId: string; lesson: { is: WhereNode } };
      take?: number;
    }) => {
      // Both calls gate through `lesson.is`; they differ only in what that node
      // asks for, which is the distinction under test (grade for the fraction,
      // status and world for the feed).
      const visible = new Map(
        lessonsMatching(args.where.lesson.is).map((lesson) => [
          lesson.id,
          lesson,
        ]),
      );
      const matched = (store.progress as ProgressRow[]).filter(
        (row) =>
          row.childId === args.where.childId &&
          row.completedAt !== null &&
          visible.has(row.lessonId),
      );

      // The feed call is the one that pages; the progress-count call is not.
      if (args.take === undefined) {
        return matched.map((row) => ({
          lesson: { topicId: visible.get(row.lessonId)?.topicId },
        }));
      }

      return matched
        .sort(
          (a, b) =>
            (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
        )
        .slice(0, args.take)
        .map((row) => {
          const lesson = visible.get(row.lessonId);
          return {
            lessonId: row.lessonId,
            completedAt: row.completedAt,
            lesson: {
              title: lesson?.title,
              translations: lesson?.translations,
            },
          };
        });
    },
  );

  db.ledgerFindMany.mockImplementation(
    async (args: {
      where: {
        childId: string;
        OR: {
          rewardType: string;
          sourceType?: string;
          badge?: { is: { status?: string } };
        }[];
      };
      take: number;
    }) => {
      const badges = new Map(
        (store.badges as BadgeRow[]).map((badge) => [badge.id, badge]),
      );

      return (store.ledger as (LedgerRow & { createdAt: Date })[])
        .filter((row) => {
          if (row.childId !== args.where.childId) return false;

          // Each branch of the query's `OR`, applied exactly as it arrived. Drop
          // `badge: publishedRelation` from the service and the badge branch
          // stops checking a status here too — which is the point.
          return args.where.OR.some((clause) => {
            if (clause.rewardType !== row.rewardType) return false;
            if (
              clause.sourceType !== undefined &&
              clause.sourceType !== row.sourceType
            ) {
              return false;
            }
            if (clause.badge !== undefined) {
              const badge =
                row.badgeId === null ? undefined : badges.get(row.badgeId);
              // A to-one relation filter also excludes rows with no relation.
              if (badge === undefined) return false;
              if (!matchesStatus(badge, clause.badge.is)) return false;
            }
            return true;
          });
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, args.take)
        .map((row) => {
          const badge =
            row.badgeId === null ? undefined : badges.get(row.badgeId);
          return {
            rewardType: row.rewardType,
            sourceId: row.sourceId,
            createdAt: row.createdAt,
            // Only the two columns the service selects.
            badge:
              badge === undefined ? null : { id: badge.id, name: badge.name },
          };
        });
    },
  );

  db.storyFindMany.mockImplementation(
    async ({ where }: { where: WhereNode & { id: { in: string[] } } }) =>
      (store.stories as StoryRow[])
        .filter(
          (story) =>
            where.id.in.includes(story.id) &&
            // Status and world come from the query, not from this stub — the
            // guard is only tested while the stub can be made to leak by
            // removing it.
            matchesStatus(story, where) &&
            matchesWorld(story.worldId, where),
        )
        .map((story) => ({
          id: story.id,
          title: story.title,
          translations: story.translations,
        })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/children/:id/dashboard — scoping", () => {
  it("returns 401 without a session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 PIN_VERIFICATION_REQUIRED without a live PIN grant", async () => {
    signInAs({ isPinVerified: false });

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // 403 rather than the 401 the implementation file guessed at: the caller *is*
    // authenticated, and the client's next screen is the PIN pad, not sign-in.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_VERIFICATION_REQUIRED");
  });

  it("returns 403 PIN_REQUIRED for an account with no PIN at all", async () => {
    signInAs({ hasPin: false, isPinVerified: false });

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // A different code because a different screen: PIN setup, not the pad.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_REQUIRED");
  });

  it("returns 404 for another parent's child", async () => {
    signInAs({ child: null });

    const res = await request(app).get(
      `/api/children/${OTHER_CHILD_ID}/dashboard`,
    );

    // Not 403: a 403 would confirm the profile exists (NFR-SAFE-02).
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("reads progress for the child in the path and nobody else", async () => {
    signInAs();
    seedCurriculum();
    store.progress = [
      completed("lesson_a", "2026-08-18T10:00:00.000Z"),
      {
        childId: OTHER_CHILD_ID,
        lessonId: "lesson_b",
        completedAt: new Date(),
      },
    ] satisfies ProgressRow[];

    await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    for (const call of db.progressFindMany.mock.calls) {
      expect(call[0].where.childId).toBe(CHILD_ID);
    }
    expect(db.ledgerFindMany.mock.calls[0][0].where.childId).toBe(CHILD_ID);
  });
});

describe("GET /api/children/:id/dashboard — learning minutes", () => {
  it("reports the three windows from the same derived figure", async () => {
    signInAs();
    seedCurriculum();
    seedMinutes(12);

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    expect(res.status).toBe(200);
    assertContract(DashboardSummaryResponseSchema, res.body, OPERATION);
    // All the beats sit inside today, which is inside this week and this month.
    expect(res.body.data.learningMinutes).toEqual({
      today: 12,
      week: 12,
      month: 12,
    });
  });

  it("reports zero minutes for a child who has never opened the app", async () => {
    signInAs();
    seedCurriculum();

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    expect(res.body.data.learningMinutes).toEqual({
      today: 0,
      week: 0,
      month: 0,
    });
  });
});

describe("GET /api/children/:id/dashboard — subject progress", () => {
  it("returns a percentage per subject with both locales of its name", async () => {
    signInAs();
    seedCurriculum();
    store.progress = [
      completed("lesson_a", "2026-08-18T10:00:00.000Z"),
      completed("lesson_b", "2026-08-18T11:00:00.000Z"),
      completed("lesson_1", "2026-08-18T12:00:00.000Z"),
    ] satisfies ProgressRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    assertContract(DashboardSummaryResponseSchema, res.body, OPERATION);
    // Both at 50%, so the tie is broken by the subject's own `sortOrder`.
    expect(res.body.data.subjects).toEqual([
      {
        subjectId: "subject_language",
        slug: "language",
        name: { en: "Language", bn: "ভাষা" },
        completed: 2,
        total: 4,
        percent: 50,
      },
      {
        subjectId: "subject_maths",
        slug: "maths",
        name: { en: "Maths", bn: null },
        completed: 1,
        total: 2,
        percent: 50,
      },
    ]);
  });

  it("names the strongest and weakest subject once they differ", async () => {
    signInAs();
    seedCurriculum();
    store.progress = [
      completed("lesson_a", "2026-08-18T10:00:00.000Z"),
      completed("lesson_1", "2026-08-18T12:00:00.000Z"),
      completed("lesson_2", "2026-08-18T13:00:00.000Z"),
    ] satisfies ProgressRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // Maths 2/2, Language 1/4.
    expect(res.body.data.strongestSubjectId).toBe("subject_maths");
    expect(res.body.data.weakestSubjectId).toBe("subject_language");
  });

  it("suppresses both highlights for a brand-new child", async () => {
    signInAs();
    seedCurriculum();

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    expect(res.body.data.subjects).toHaveLength(2);
    expect(
      res.body.data.subjects.every((s: { percent: number }) => s.percent === 0),
    ).toBe(true);
    expect(res.body.data.strongestSubjectId).toBeNull();
    expect(res.body.data.weakestSubjectId).toBeNull();
  });

  it("counts only published lessons in the denominator", async () => {
    signInAs();
    seedCurriculum();
    store.lessons = [
      ...(store.lessons as LessonRow[]),
      lessonRow("lesson_draft", "topic_counting", "Number Three", "তিন", {
        status: "draft",
      }),
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    const maths = res.body.data.subjects.find(
      (subject: { slug: string }) => subject.slug === "maths",
    );
    expect(maths.total).toBe(2);
    // Rule 2: the stub cannot show that the draft row stayed in the database, so
    // the clause that keeps it out of the count is asserted directly.
    expect(db.lessonGroupBy.mock.calls[0][0].where).toMatchObject({
      status: "published",
      gradeLevels: { has: "NURSERY" },
      world: { is: { status: "published" } },
      topic: {
        is: {
          status: "published",
          gradeLevels: { has: "NURSERY" },
          subject: {
            is: { status: "published", gradeLevels: { has: "NURSERY" } },
          },
        },
      },
    });
  });

  it("omits a subject whose lessons are all for another grade", async () => {
    signInAs();
    seedCurriculum();
    store.subjects = [
      ...(store.subjects as SubjectRow[]),
      {
        id: "subject_science",
        slug: "science",
        name: "Science",
        sortOrder: 2,
        translations: [],
        status: "published",
        gradeLevels: ["KG2"],
      },
    ] satisfies SubjectRow[];
    store.topics = [
      ...(store.topics as TopicRow[]),
      {
        id: "topic_plants",
        subjectId: "subject_science",
        status: "published",
        gradeLevels: ["KG2"],
      },
    ] satisfies TopicRow[];
    store.lessons = [
      ...(store.lessons as LessonRow[]),
      lessonRow("lesson_leaf", "topic_plants", "Leaves", "পাতা", {
        gradeLevels: ["KG2"],
      }),
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // No 0% bar and no `NaN%` for a curriculum this child has not reached.
    expect(
      res.body.data.subjects.map((subject: { slug: string }) => subject.slug),
    ).toEqual(["language", "maths"]);
  });

  it("excludes a lesson under a draft topic from both halves of the fraction", async () => {
    signInAs();
    seedCurriculum();
    store.topics = [
      ...(store.topics as TopicRow[]),
      {
        id: "topic_unreviewed",
        subjectId: "subject_language",
        status: "draft",
        gradeLevels: ["NURSERY"],
      },
    ] satisfies TopicRow[];
    store.lessons = [
      ...(store.lessons as LessonRow[]),
      lessonRow("lesson_hidden", "topic_unreviewed", "Hidden", "গোপন"),
    ];
    store.progress = [
      completed("lesson_hidden", "2026-08-18T10:00:00.000Z"),
    ] satisfies ProgressRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    const language = res.body.data.subjects.find(
      (subject: { slug: string }) => subject.slug === "language",
    );
    // A published lesson under an unreviewed topic is neither counted nor
    // credited — the fraction stays over the visible curriculum only.
    expect(language).toMatchObject({ completed: 0, total: 4 });
  });

  it("excludes a lesson in an unreviewed world from both halves of the fraction", async () => {
    signInAs();
    seedCurriculum();
    store.lessons = [
      ...(store.lessons as LessonRow[]),
      lessonRow("lesson_curtained", "topic_alphabet", "Hidden", "গোপন", {
        worldId: DRAFT_WORLD,
      }),
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    const language = res.body.data.subjects.find(
      (subject: { slug: string }) => subject.slug === "language",
    );
    // `requireVisibleLessonId` gates on the world, so this lesson can never be
    // completed. Counting it in `total` would cap Language below 100% for as long
    // as the world stayed in review — a bar the child cannot fill.
    expect(language).toMatchObject({ completed: 0, total: 4 });
    expect(db.lessonGroupBy.mock.calls[0][0].where.world).toEqual({
      is: { status: "published" },
    });
  });
});

describe("GET /api/children/:id/dashboard — recent activity", () => {
  function seedFeed() {
    store.badges = [
      { id: "badge_first", name: "First Lesson", status: "published" },
      { id: "badge_secret", name: "Unreleased", status: "draft" },
    ] satisfies BadgeRow[];
    store.stories = [
      {
        id: "story_fox",
        worldId: LIVE_WORLD,
        title: "The Clever Fox",
        status: "published",
        translations: [
          { language: "en", title: "The Clever Fox" },
          { language: "bn", title: "চতুর শিয়াল" },
        ],
      },
      {
        id: "story_hidden",
        worldId: LIVE_WORLD,
        title: "Not Yet",
        status: "draft",
        translations: [],
      },
      {
        // Published itself, but its world was pulled back for revision — so the
        // child can no longer open it and its title is not the parent's to read.
        id: "story_withdrawn_world",
        worldId: DRAFT_WORLD,
        title: "Behind The Curtain",
        status: "published",
        translations: [],
      },
    ] satisfies StoryRow[];
  }

  function ledger(
    row: Partial<LedgerRow & { createdAt: Date }>,
  ): LedgerRow & { createdAt: Date } {
    return {
      childId: CHILD_ID,
      rewardType: "star",
      sourceType: "story_completion",
      sourceId: "story_fox",
      badgeId: null,
      createdAt: new Date("2026-08-19T05:00:00.000Z"),
      ...row,
    };
  }

  it("merges lessons, stories and badges newest first", async () => {
    signInAs();
    seedCurriculum();
    seedFeed();
    store.progress = [
      completed("lesson_a", "2026-08-18T10:00:00.000Z"),
    ] satisfies ProgressRow[];
    store.ledger = [
      ledger({ createdAt: new Date("2026-08-19T05:00:00.000Z") }),
      ledger({
        rewardType: "badge",
        sourceType: "badge_unlock",
        sourceId: "first-lesson",
        badgeId: "badge_first",
        createdAt: new Date("2026-08-17T09:00:00.000Z"),
      }),
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    assertContract(DashboardSummaryResponseSchema, res.body, OPERATION);
    expect(res.body.data.recentActivity).toEqual([
      {
        type: "story_completed",
        refId: "story_fox",
        title: { en: "The Clever Fox", bn: "চতুর শিয়াল" },
        occurredAt: "2026-08-19T05:00:00.000Z",
      },
      {
        type: "lesson_completed",
        refId: "lesson_a",
        title: { en: "Letter A", bn: "অ" },
        occurredAt: "2026-08-18T10:00:00.000Z",
      },
      {
        type: "badge_earned",
        refId: "badge_first",
        title: { en: "First Lesson", bn: null },
        occurredAt: "2026-08-17T09:00:00.000Z",
      },
    ]);
  });

  it("lists a finished story once, though it wrote two ledger rows", async () => {
    signInAs();
    seedCurriculum();
    seedFeed();
    // What `grantStoryCompletion` actually writes: a star row and a coin row.
    store.ledger = [
      ledger({ rewardType: "star" }),
      ledger({ rewardType: "coin" }),
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    expect(res.body.data.recentActivity).toHaveLength(1);
    expect(res.body.data.recentActivity[0].type).toBe("story_completed");
  });

  it("omits an entry whose story is no longer published", async () => {
    signInAs();
    seedCurriculum();
    seedFeed();
    store.ledger = [ledger({ sourceId: "story_hidden" })];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // Rule 3: the title comes through a relation, so no `where` assertion can
    // show this — the response body is the only proof.
    expect(res.body.data.recentActivity).toEqual([]);
  });

  it("omits an entry whose badge is no longer published", async () => {
    signInAs();
    seedCurriculum();
    seedFeed();
    store.ledger = [
      ledger({
        rewardType: "badge",
        sourceType: "badge_unlock",
        sourceId: "unreleased",
        badgeId: "badge_secret",
      }),
    ];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    expect(res.body.data.recentActivity).toEqual([]);
  });

  it("keeps a lesson in an unreviewed world out of the feed", async () => {
    signInAs();
    seedCurriculum();
    seedFeed();
    store.lessons = [
      ...(store.lessons as LessonRow[]),
      lessonRow("lesson_curtained", "topic_alphabet", "Hidden", "গোপন", {
        worldId: DRAFT_WORLD,
      }),
    ];
    store.progress = [
      completed("lesson_curtained", "2026-08-18T10:00:00.000Z"),
    ] satisfies ProgressRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    expect(res.body.data.recentActivity).toEqual([]);
  });

  it("omits an entry whose story sits in an unreviewed world", async () => {
    signInAs();
    seedCurriculum();
    seedFeed();
    store.ledger = [ledger({ sourceId: "story_withdrawn_world" })];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // The story row is `published`; its *world* is not, which is what takes it
    // down — the same rule `storyService.requireVisibleStoryId` applies.
    expect(res.body.data.recentActivity).toEqual([]);
  });

  it("asks the database for the story and badge gates, not just the right answer", async () => {
    signInAs();
    seedCurriculum();
    seedFeed();
    store.ledger = [
      ledger({ sourceId: "story_fox" }),
      ledger({
        rewardType: "badge",
        sourceType: "badge_unlock",
        sourceId: "first-lesson",
        badgeId: "badge_first",
      }),
    ];

    await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // Rule 2 again, for the two feed gates the response body alone cannot pin:
    // the stub honours whatever `where` it is handed, so without these a guard
    // could be deleted and the behavioural tests above would still pass.
    expect(db.storyFindMany.mock.calls[0][0].where).toMatchObject({
      status: "published",
      world: { is: { status: "published" } },
    });
    expect(db.ledgerFindMany.mock.calls[0][0].where.OR).toEqual([
      { rewardType: "badge", badge: { is: { status: "published" } } },
      { rewardType: "star", sourceType: "story_completion" },
    ]);
  });

  it("still fills the feed when a withdrawn story sits among the newest rows", async () => {
    signInAs();
    seedCurriculum();
    seedFeed();

    const readable = Array.from({ length: 21 }, (_, index) => ({
      id: `story_${index}`,
      worldId: LIVE_WORLD,
      title: `Story ${index}`,
      status: "published",
      translations: [],
    })) satisfies StoryRow[];
    store.stories = [
      ...readable,
      {
        id: "story_pulled",
        worldId: LIVE_WORLD,
        title: "Pulled",
        status: "draft",
        translations: [],
      },
    ] satisfies StoryRow[];

    // Newest first, with the withdrawn story third — inside a 20-row window.
    const order = [
      "story_0",
      "story_1",
      "story_pulled",
      ...readable.slice(2).map((s) => s.id),
    ];
    store.ledger = order.map((sourceId, index) =>
      ledger({
        sourceId,
        createdAt: new Date(Date.UTC(2026, 7, 19, 5, 0, 0) - index * 60_000),
      }),
    );

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // The cap is applied after the drop, so the slot the withdrawn story would
    // have taken goes to the next readable one instead of shortening the feed.
    expect(res.body.data.recentActivity).toHaveLength(20);
    expect(
      res.body.data.recentActivity.map((item: { refId: string }) => item.refId),
    ).not.toContain("story_pulled");
  });

  it("keeps a completed lesson in the feed after the child changes grade", async () => {
    signInAs({ child: childProfile({ gradeLevel: "KG2" }) });
    seedCurriculum();
    store.progress = [
      completed("lesson_a", "2026-08-18T10:00:00.000Z"),
    ] satisfies ProgressRow[];

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    // The feed gate is status-only, so a month of work does not vanish because a
    // parent corrected an age. The progress fraction still excludes it, because
    // its two halves must be counted over the same lessons.
    expect(res.body.data.recentActivity).toHaveLength(1);
    expect(res.body.data.subjects).toEqual([]);
    expect(db.progressFindMany.mock.calls[1][0].where.lesson).toEqual({
      is: { status: "published", world: { is: { status: "published" } } },
    });
  });

  it("returns an empty feed for a child who has done nothing yet", async () => {
    signInAs();
    seedCurriculum();

    const res = await request(app).get(`/api/children/${CHILD_ID}/dashboard`);

    assertContract(DashboardSummaryResponseSchema, res.body, OPERATION);
    expect(res.body.data.recentActivity).toEqual([]);
  });
});
