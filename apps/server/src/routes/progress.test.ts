/**
 * Lesson progress and the player's event log.
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four rules that bound it shape this suite:
 *
 *  - **Rule 1, stub state not answers.** `db` below keeps a single mutable
 *    `LessonProgress` row and an array of `SessionEvent`s, and the stubbed
 *    `$transaction` runs the real callback against them. So the monotonic guard is
 *    exercised as a sequence of requests against carried-over state, which is the
 *    only way it can be tested at all — a chain of one-shot `mockResolvedValue`s
 *    would be asserting the test's own script.
 *  - **Rule 2, assert the query.** A stub cannot show that a draft lesson stayed
 *    invisible, so the `where` clause that keeps it invisible is asserted directly,
 *    and against the same clause `routes/content.test.ts` asserts.
 *  - **Rule 4, name what the stub cannot prove.** The Serializable isolation level
 *    that makes the read-then-write safe is asserted as the argument passed to
 *    `$transaction`; whether Postgres honours it needs a real database. So is the
 *    unique index the reward grants rely on: the stubbed `createMany` *emulates*
 *    `skipDuplicates`, which proves the service's arithmetic and nothing about
 *    Postgres — so `schema.prisma` is read and the constraint asserted directly.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ChildProfile, LessonProgress, Parent } from "@kidlearn/db";
import {
  LessonCompletionResponseSchema,
  LessonProgressReadResponseSchema,
  LessonProgressResponseSchema,
  QuizResponsesResponseSchema,
  SessionEventResponseSchema,
  StoryCompletionResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDateIn } from "../lib/local-date.js";
import { assertContract } from "../openapi/assert-contract.js";

/** The zone `lib/env.ts` defaults to, which the suite runs under. */
const APP_TIMEZONE = "Asia/Dhaka";

const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const STORY_ID = "55555555-5555-4555-8555-555555555555";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";
const QUIZ_ID = "44444444-4444-4444-8444-444444444444";
const CHILD_ID = "child_1";
const CLIENT_TS = "2026-08-10T09:00:00.000Z";

/** Four questions, so a three-correct run scores a round 75. */
const QUESTION_IDS = ["q_1", "q_2", "q_3", "q_4"] as const;

type ProgressRow = {
  id: string;
  childId: string;
  lessonId: string;
  currentStep: LessonProgress["currentStep"];
  completedAt: Date | null;
  score: number | null;
  timeSpentSec: number;
  updatedAt: Date;
};

type EventRow = {
  id: string;
  childId: string;
  type: string;
  occurredAt: Date;
  payload: unknown;
};

type QuizResponseRow = {
  childId: string;
  questionId: string;
  answer: unknown;
  isCorrect: boolean;
  attempts: number;
  answeredAt: Date;
};

type LedgerRow = {
  childId: string;
  rewardType: "star" | "coin" | "badge";
  amount: number;
  sourceType: string;
  sourceId: string | null;
  badgeId?: string | null;
};

type StreakRow = {
  childId: string;
  current: number;
  longest: number;
  lastActivityDate: Date | null;
};

type BadgeRow = {
  id: string;
  slug: string;
  name: string;
  ruleType: string;
  rule: unknown;
  iconAsset: { url: string } | null;
};

type CharacterRow = {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  unlockRule: unknown;
  asset: { url: string } | null;
};

type ChildCharacterRow = { childId: string; characterId: string };

/** The `yyyy-MM-dd` local date `rewardService` will key today's grants on. */
function localToday(): string {
  return localDateIn(APP_TIMEZONE, new Date());
}

/** `n` days before today, as the `@db.Date` column stores it: midnight UTC. */
function daysAgoAsDateColumn(days: number): Date {
  const date = new Date(`${localToday()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

/** An in-memory store, not a queue of canned answers. */
const store = vi.hoisted(() => ({
  progressRows: [] as unknown[],
  events: [] as unknown[],
  quizResponses: [] as unknown[],
  ledger: [] as unknown[],
  transactionOptions: [] as unknown[],
  /** One row per child, as `Streak.childId @unique` enforces. */
  streaks: [] as unknown[],
  /** The published badge catalogue this run evaluates against. */
  badges: [] as unknown[],
  characters: [] as unknown[],
  childCharacters: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  childFindFirst: vi.fn(),
  storyFindFirst: vi.fn(),
  lessonFindFirst: vi.fn(),
  lessonFindUnique: vi.fn(),
  lessonFindMany: vi.fn(),
  progressFindUnique: vi.fn(),
  progressFindMany: vi.fn(),
  progressCreate: vi.fn(),
  progressUpdate: vi.fn(),
  sessionEventCreate: vi.fn(),
  quizResponseCreateMany: vi.fn(),
  quizResponseFindMany: vi.fn(),
  ledgerFindMany: vi.fn(),
  ledgerCreateMany: vi.fn(),
  ledgerGroupBy: vi.fn(),
  streakFindUnique: vi.fn(),
  streakUpsert: vi.fn(),
  badgeFindMany: vi.fn(),
  characterFindMany: vi.fn(),
  childCharacterFindMany: vi.fn(),
  childCharacterCreateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    story: { findFirst: db.storyFindFirst },
    lesson: {
      findFirst: db.lessonFindFirst,
      findUnique: db.lessonFindUnique,
      findMany: db.lessonFindMany,
    },
    lessonProgress: {
      findUnique: db.progressFindUnique,
      findMany: db.progressFindMany,
      create: db.progressCreate,
      update: db.progressUpdate,
    },
    sessionEvent: { create: db.sessionEventCreate },
    quizResponse: {
      createMany: db.quizResponseCreateMany,
      findMany: db.quizResponseFindMany,
    },
    rewardLedger: {
      findMany: db.ledgerFindMany,
      createMany: db.ledgerCreateMany,
      groupBy: db.ledgerGroupBy,
    },
    streak: { findUnique: db.streakFindUnique, upsert: db.streakUpsert },
    badge: { findMany: db.badgeFindMany },
    character: { findMany: db.characterFindMany },
    childCharacter: {
      findMany: db.childCharacterFindMany,
      createMany: db.childCharacterCreateMany,
    },
    $transaction: db.transaction,
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../lib/auth.js");
const { Prisma } = await import("@kidlearn/db");

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

/** Signs the request in as PARENT with `child` as the session's active profile. */
function signInAs(child: ChildProfile | null) {
  // `getSession` returns a deep better-auth type; only the fields the middleware
  // reads are supplied, so the shape is narrowed at this boundary.
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

function postStep(step: string, completed: boolean, lessonId = LESSON_ID) {
  return request(app)
    .post(`/api/progress/lessons/${lessonId}/step`)
    .send({ step, completed });
}

function progressRows(): ProgressRow[] {
  return store.progressRows as ProgressRow[];
}

/** The row for `LESSON_ID`, which is the lesson almost every test uses. */
function currentRow(lessonId = LESSON_ID): ProgressRow {
  const row = progressRows().find(
    (candidate) => candidate.lessonId === lessonId,
  );
  if (row === undefined) {
    throw new Error(`no LessonProgress row was written for ${lessonId}`);
  }
  return row;
}

beforeEach(() => {
  store.progressRows = [];
  store.events = [];
  store.quizResponses = [];
  store.ledger = [];
  store.transactionOptions = [];
  store.streaks = [];
  store.badges = [];
  store.characters = [];
  store.childCharacters = [];
  for (const fn of Object.values(db)) fn.mockReset();

  // The lesson is visible unless a test says otherwise. The `quiz` half is what
  // the quiz-submission query selects; the step and event services read only
  // `id`, so carrying it here costs them nothing.
  db.lessonFindFirst.mockResolvedValue({
    id: LESSON_ID,
    quiz: { questions: QUESTION_IDS.map((id) => ({ id })) },
  });

  // The story the reader finishes is visible unless a test says otherwise. Only
  // its id is selected — the completion endpoint needs the row to exist and
  // nothing from it (file 26).
  db.storyFindFirst.mockResolvedValue({ id: STORY_ID });

  // The reward service reads the lesson by id — visibility was settled by the
  // step report before it ran — and needs the quiz's own status.
  db.lessonFindUnique.mockResolvedValue({
    quiz: {
      status: "published",
      questions: QUESTION_IDS.map((id) => ({ id })),
    },
  });

  db.progressFindUnique.mockImplementation(
    async ({
      where,
    }: {
      where: { childId_lessonId: { childId: string; lessonId: string } };
    }) =>
      progressRows().find(
        (row) =>
          row.childId === where.childId_lessonId.childId &&
          row.lessonId === where.childId_lessonId.lessonId,
      ) ?? null,
  );

  // Column defaults first, then whatever the caller supplied — the quiz endpoint
  // creates a row with a `score` and no `currentStep`, the step endpoint the
  // other way round, and a stub that pinned either would be asserting its own
  // script rather than the schema's defaults.
  db.progressCreate.mockImplementation(async ({ data }: { data: unknown }) => {
    const row: ProgressRow = {
      id: `progress_${progressRows().length + 1}`,
      childId: CHILD_ID,
      lessonId: LESSON_ID,
      currentStep: "intro",
      completedAt: null,
      score: null,
      timeSpentSec: 0,
      updatedAt: new Date("2026-08-10T09:00:00.000Z"),
      ...(data as Partial<ProgressRow>),
    };
    store.progressRows.push(row);
    return row;
  });

  db.progressUpdate.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: unknown }) => {
      const index = progressRows().findIndex((row) => row.id === where.id);
      const row = {
        ...progressRows()[index],
        ...(data as Partial<ProgressRow>),
      };
      store.progressRows[index] = row;
      return row;
    },
  );

  db.sessionEventCreate.mockImplementation(
    async ({ data }: { data: unknown }) => {
      const input = data as Omit<EventRow, "id" | "occurredAt">;
      const row: EventRow = {
        id: `event_${store.events.length + 1}`,
        ...input,
        // The column default — this is the value the server keeps, never clientTs.
        occurredAt: new Date("2026-08-10T10:30:00.000Z"),
      };
      store.events.push(row);
      return row;
    },
  );

  db.quizResponseCreateMany.mockImplementation(
    async ({ data }: { data: unknown }) => {
      const rows = (data as Omit<QuizResponseRow, "answeredAt">[]).map(
        (row, index) => ({
          ...row,
          // The column default. Ordered so that a replay's rows sort after the
          // first run's, which is what makes "latest response per question"
          // mean anything in the reward service.
          answeredAt: new Date(
            Date.UTC(2026, 7, 10, 9, 0, store.quizResponses.length + index),
          ),
        }),
      );
      store.quizResponses.push(...rows);
      return { count: rows.length };
    },
  );

  db.quizResponseFindMany.mockImplementation(
    async ({
      where,
      orderBy,
    }: {
      where: { childId: string; questionId: { in: string[] } };
      orderBy: { answeredAt: "asc" | "desc" };
    }) => {
      const rows = (store.quizResponses as QuizResponseRow[])
        .filter(
          (row) =>
            row.childId === where.childId &&
            where.questionId.in.includes(row.questionId),
        )
        .sort(
          (a, b) =>
            (orderBy.answeredAt === "desc" ? -1 : 1) *
            (a.answeredAt.getTime() - b.answeredAt.getTime()),
        );
      return rows;
    },
  );

  // Three callers, three `where` shapes — the reward grant asks by `sourceId`,
  // the badge engine by `rewardType`, and the story fact by `sourceType`. Filtered
  // generically rather than per caller so the stub stays a store rather than
  // becoming a script (Rule 1).
  db.ledgerFindMany.mockImplementation(
    async ({
      where,
    }: {
      where: {
        childId: string;
        rewardType?: string;
        sourceType?: string;
        sourceId?: { in: string[] };
      };
    }) =>
      (store.ledger as LedgerRow[]).filter((row) => {
        if (row.childId !== where.childId) return false;
        if (
          where.rewardType !== undefined &&
          row.rewardType !== where.rewardType
        )
          return false;
        if (
          where.sourceType !== undefined &&
          row.sourceType !== where.sourceType
        )
          return false;
        if (where.sourceId !== undefined) {
          // Postgres treats a NULL as outside an `IN`, and so does this.
          if (row.sourceId === null) return false;
          if (!where.sourceId.in.includes(row.sourceId)) return false;
        }
        return true;
      }),
  );

  // `skipDuplicates` is *emulated* here, so nothing in this file proves the
  // database enforces it — that is what the `schema.prisma` assertion at the
  // bottom is for (Rule 4). What this does prove is the service's arithmetic:
  // that it reports as earned only what it actually inserted.
  db.ledgerCreateMany.mockImplementation(
    async ({
      data,
      skipDuplicates,
    }: {
      data: LedgerRow[];
      skipDuplicates?: boolean;
    }) => {
      const key = (row: LedgerRow) =>
        `${row.childId}|${row.rewardType}|${row.sourceType}|${row.sourceId}`;
      const existing = new Set((store.ledger as LedgerRow[]).map(key));
      const rows = skipDuplicates
        ? data.filter((row) => !existing.has(key(row)))
        : data;
      store.ledger.push(...rows);
      return { count: rows.length };
    },
  );

  db.ledgerGroupBy.mockImplementation(
    async ({ where }: { where: { childId: string } }) => {
      const totals = new Map<string, { sum: number; count: number }>();
      for (const row of store.ledger as LedgerRow[]) {
        if (row.childId !== where.childId) continue;
        const entry = totals.get(row.rewardType) ?? { sum: 0, count: 0 };
        totals.set(row.rewardType, {
          sum: entry.sum + row.amount,
          count: entry.count + 1,
        });
      }
      return [...totals].map(([rewardType, entry]) => ({
        rewardType,
        _sum: { amount: entry.sum },
        _count: { _all: entry.count },
      }));
    },
  );

  // --- Streaks, badges and characters (file 24) ---------------------------
  //
  // The catalogues start empty, so the reward tests above stay about stars and
  // coins; a test that cares seeds `store.badges` / `store.characters` itself.

  db.streakFindUnique.mockImplementation(
    async ({ where }: { where: { childId: string } }) =>
      (store.streaks as StreakRow[]).find(
        (row) => row.childId === where.childId,
      ) ?? null,
  );

  db.streakUpsert.mockImplementation(
    async ({
      where,
      create,
      update,
    }: {
      where: { childId: string };
      create: StreakRow;
      update: Omit<StreakRow, "childId">;
    }) => {
      const index = (store.streaks as StreakRow[]).findIndex(
        (row) => row.childId === where.childId,
      );
      if (index === -1) {
        store.streaks.push({ ...create });
        return create;
      }
      const row = { ...(store.streaks[index] as StreakRow), ...update };
      store.streaks[index] = row;
      return row;
    },
  );

  db.badgeFindMany.mockImplementation(async () => store.badges as BadgeRow[]);

  db.characterFindMany.mockImplementation(
    async ({ where }: { where: { isDefault?: boolean } }) =>
      (store.characters as CharacterRow[]).filter((row) =>
        where.isDefault === undefined
          ? true
          : row.isDefault === where.isDefault,
      ),
  );

  db.childCharacterFindMany.mockImplementation(
    async ({ where }: { where: { childId: string } }) =>
      (store.childCharacters as ChildCharacterRow[]).filter(
        (row) => row.childId === where.childId,
      ),
  );

  // `skipDuplicates` emulated, exactly as the ledger's is — and proving the same
  // amount about Postgres, which is none (Rule 4: the unique pair is asserted
  // against `schema.prisma` at the bottom of this file).
  db.childCharacterCreateMany.mockImplementation(
    async ({
      data,
      skipDuplicates,
    }: {
      data: ChildCharacterRow[];
      skipDuplicates?: boolean;
    }) => {
      const key = (row: ChildCharacterRow) =>
        `${row.childId}|${row.characterId}`;
      const existing = new Set(
        (store.childCharacters as ChildCharacterRow[]).map(key),
      );
      const rows = skipDuplicates
        ? data.filter((row) => !existing.has(key(row)))
        : data;
      store.childCharacters.push(...rows);
      return { count: rows.length };
    },
  );

  // The badge fact loader only runs when a candidate rule names a topic, and no
  // suite here seeds curriculum for one — an empty answer is the honest zero.
  db.lessonFindMany.mockResolvedValue([]);
  db.progressFindMany.mockResolvedValue([]);

  // Runs the real callback against the in-memory store, and records the options
  // so the isolation level can be asserted (Rule 4).
  db.transaction.mockImplementation(
    async (
      callback: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ): Promise<unknown> => {
      store.transactionOptions.push(options);
      return callback({
        lesson: {
          findUnique: db.lessonFindUnique,
          findMany: db.lessonFindMany,
        },
        lessonProgress: {
          findUnique: db.progressFindUnique,
          findMany: db.progressFindMany,
          create: db.progressCreate,
          update: db.progressUpdate,
        },
        quizResponse: {
          createMany: db.quizResponseCreateMany,
          findMany: db.quizResponseFindMany,
        },
        rewardLedger: {
          findMany: db.ledgerFindMany,
          createMany: db.ledgerCreateMany,
          groupBy: db.ledgerGroupBy,
        },
        streak: { findUnique: db.streakFindUnique, upsert: db.streakUpsert },
        badge: { findMany: db.badgeFindMany },
        character: { findMany: db.characterFindMany },
        childCharacter: {
          findMany: db.childCharacterFindMany,
          createMany: db.childCharacterCreateMany,
        },
      });
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("progress route guards", () => {
  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await postStep("intro", false);

    expect(res.status).toBe(401);
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    signInAs(null);

    const res = await postStep("intro", false);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid lesson id before touching the database", async () => {
    signInAs(childProfile());

    const res = await postStep("intro", false, "letter-a");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });
});

describe("POST /api/progress/lessons/:id/step", () => {
  it("creates the row on the first step and reports it back", async () => {
    signInAs(childProfile());

    const res = await postStep("intro", false);

    expect(res.status).toBe(200);
    assertContract(
      LessonProgressResponseSchema,
      res.body,
      "POST /api/progress/lessons/{id}/step",
    );
    expect(res.body.data.progress).toEqual({
      lessonId: LESSON_ID,
      currentStep: "intro",
      completedAt: null,
    });
    expect(db.progressCreate).toHaveBeenCalledTimes(1);
  });

  it("advances currentStep across the whole flow", async () => {
    signInAs(childProfile());

    for (const step of ["intro", "video", "activity", "quiz"] as const) {
      const res = await postStep(step, false);
      expect(res.body.data.progress.currentStep).toBe(step);
    }

    const res = await postStep("reward", true);
    expect(res.body.data.progress.currentStep).toBe("reward");
    expect(currentRow().currentStep).toBe("reward");
  });

  it("does not regress currentStep when an earlier step is replayed", async () => {
    signInAs(childProfile());
    await postStep("intro", false);
    await postStep("video", false);
    await postStep("activity", false);

    // A replay walks the flow again from the beginning. Acknowledged, absorbed —
    // never a step backwards, or a resuming child gets the video twice.
    const res = await postStep("intro", false);

    expect(res.status).toBe(200);
    expect(res.body.data.progress.currentStep).toBe("activity");
    expect(currentRow().currentStep).toBe("activity");
  });

  it("stamps completedAt when the reward step is reported complete", async () => {
    signInAs(childProfile());

    const res = await postStep("reward", true);

    expect(res.body.data.progress.completedAt).not.toBeNull();
    expect(currentRow().completedAt).toBeInstanceOf(Date);
  });

  it("keeps the original completedAt when a finished lesson is replayed", async () => {
    signInAs(childProfile());
    await postStep("reward", true);
    const firstCompletion = currentRow().completedAt;

    await postStep("intro", false);
    await postStep("reward", true);

    // A child re-watching something must not move the date they first finished it.
    expect(currentRow().completedAt).toEqual(firstCompletion);
  });

  it("rejects completed: true on any step but the reward", async () => {
    signInAs(childProfile());

    for (const step of ["intro", "video", "activity", "quiz"] as const) {
      const res = await postStep(step, true);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects an unknown step name", async () => {
    signInAs(childProfile());

    const res = await postStep("bonus", false);

    expect(res.status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("reads the row and writes it inside one Serializable transaction", async () => {
    signInAs(childProfile());

    await postStep("video", false);

    // The read-then-write is a lost update under READ COMMITTED. Whether Postgres
    // honours the level needs a real database; that it is asked for is testable.
    expect(store.transactionOptions).toEqual([
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ]);
  });

  it("retries once when Postgres aborts the transaction as a serialization failure", async () => {
    signInAs(childProfile());
    let attempts = 0;
    db.transaction.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Prisma.PrismaClientKnownRequestError("write conflict", {
          code: "P2034",
          clientVersion: "6",
        });
      }
      return {
        id: "progress_1",
        childId: CHILD_ID,
        lessonId: LESSON_ID,
        currentStep: "video",
        completedAt: null,
        score: null,
        timeSpentSec: 0,
        updatedAt: new Date("2026-08-10T09:00:00.000Z"),
      };
    });

    const res = await postStep("video", false);

    expect(res.status).toBe(200);
    expect(attempts).toBe(2);
  });
});

describe("POST /api/progress/lessons/:id/complete", () => {
  function complete(lessonId = LESSON_ID) {
    return request(app).post(`/api/progress/lessons/${lessonId}/complete`);
  }

  /** Three of the four right on the first go, as the quiz endpoint would store. */
  function answerTheQuiz(correct = 3) {
    return request(app)
      .post(`/api/progress/quizzes/${QUIZ_ID}/responses`)
      .send({
        responses: QUESTION_IDS.map((questionId, index) => ({
          questionId,
          answer: "apple",
          isCorrect: index < correct,
          attempts: index < correct ? 1 : 2,
        })),
      });
  }

  function ledger(): LedgerRow[] {
    return store.ledger as LedgerRow[];
  }

  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await complete();

    expect(res.status).toBe(401);
    expect(ledger()).toHaveLength(0);
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    signInAs(null);

    const res = await complete();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(ledger()).toHaveLength(0);
  });

  it("returns 404 and grants nothing for a lesson the child cannot see", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(null);

    const res = await complete(MISSING_ID);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(ledger()).toHaveLength(0);
  });

  it("grants the lesson star and the day's coins on a first completion", async () => {
    signInAs(childProfile());

    const res = await complete();

    expect(res.status).toBe(200);
    assertContract(
      LessonCompletionResponseSchema,
      res.body,
      "POST /api/progress/lessons/{id}/complete",
    );
    // No quiz was answered, so no quiz star and no answer coins — 2 stars for
    // the lesson, 5 coins for being the first thing done today.
    expect(res.body.data).toEqual({
      starsEarned: 2,
      coinsEarned: 5,
      newBadges: [],
      newCharacters: [],
      // The child's first day of learning, so the streak opens at one and no
      // milestone has been reached.
      streak: { current: 1, milestone: null },
      totals: { stars: 2, coins: 5 },
    });
  });

  it("adds the quiz star and two coins per correct answer (FR-GAM-01..02)", async () => {
    signInAs(childProfile());
    await answerTheQuiz(3);

    const res = await complete();

    // 2 + 1 stars; 6 coins for three correct answers, plus 5 for the day.
    expect(res.body.data).toMatchObject({ starsEarned: 3, coinsEarned: 11 });
    expect(res.body.data.totals).toEqual({ stars: 3, coins: 11 });
  });

  it("counts correct answers from the stored responses, not from the request", async () => {
    signInAs(childProfile());
    await answerTheQuiz(1);

    // The request has no body at all — there is nothing a client could inflate.
    const res = await complete().send({ correctCount: 99, coinsEarned: 500 });

    expect(res.body.data.coinsEarned).toBe(7);
  });

  it("counts the latest response to each question, so a replay cannot inflate it", async () => {
    signInAs(childProfile());
    await answerTheQuiz(4);
    // A second, worse run appends new rows for the same questions.
    await answerTheQuiz(1);

    const res = await complete();

    // One correct on the latest attempt → 2 coins, not 8.
    expect(res.body.data.coinsEarned).toBe(2 + 5);
  });

  it("writes one traceable ledger row per grant (FR-GAM-07)", async () => {
    signInAs(childProfile());
    await answerTheQuiz(2);

    await complete();

    expect(ledger()).toEqual([
      {
        childId: CHILD_ID,
        rewardType: "star",
        amount: 2,
        sourceType: "lesson_completion",
        sourceId: LESSON_ID,
      },
      {
        childId: CHILD_ID,
        rewardType: "star",
        amount: 1,
        sourceType: "quiz_completion",
        sourceId: LESSON_ID,
      },
      {
        childId: CHILD_ID,
        rewardType: "coin",
        amount: 4,
        sourceType: "quiz_correct_answers",
        sourceId: LESSON_ID,
      },
      {
        childId: CHILD_ID,
        rewardType: "coin",
        amount: 5,
        sourceType: "daily_activity",
        // The local date, so "once a day" is the same uniqueness as "once a
        // lesson" — matched loosely because the suite runs on whatever day it
        // runs on.
        sourceId: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
    ]);
  });

  it("grants nothing the second time the same lesson is completed", async () => {
    signInAs(childProfile());
    await answerTheQuiz(3);
    const first = await complete();
    const rowsAfterFirst = ledger().length;

    const second = await complete();

    // A four-year-old who liked a lesson will play it five more times. A balance
    // that counted that would measure re-watching, not learning.
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({
      starsEarned: 0,
      coinsEarned: 0,
      newBadges: [],
      newCharacters: [],
      // Same day, so the streak stands still and the milestone is not re-fired.
      streak: { current: 1, milestone: null },
      totals: first.body.data.totals,
    });
    expect(ledger()).toHaveLength(rowsAfterFirst);
  });

  it("grants the daily coins once across two different lessons the same day", async () => {
    signInAs(childProfile());
    const OTHER_LESSON = "55555555-5555-4555-8555-555555555555";
    await complete();

    db.lessonFindFirst.mockResolvedValue({ id: OTHER_LESSON, quiz: null });
    db.lessonFindUnique.mockResolvedValue({ quiz: null });
    const res = await complete(OTHER_LESSON);

    // The second lesson still pays its own 2 stars; the day is already bought.
    expect(res.body.data).toMatchObject({ starsEarned: 2, coinsEarned: 0 });
    expect(
      ledger().filter((row) => row.sourceType === "daily_activity"),
    ).toHaveLength(1);
  });

  it("stamps completedAt once and never moves it", async () => {
    signInAs(childProfile());
    await complete();
    const firstCompletion = currentRow().completedAt;

    await complete();

    expect(currentRow().currentStep).toBe("reward");
    expect(firstCompletion).toBeInstanceOf(Date);
    expect(currentRow().completedAt).toEqual(firstCompletion);
  });

  it("grants no quiz star for a lesson whose quiz is not published", async () => {
    signInAs(childProfile());
    db.lessonFindUnique.mockResolvedValue({
      quiz: {
        status: "in_review",
        questions: QUESTION_IDS.map((id) => ({ id })),
      },
    });
    await answerTheQuiz(4);

    const res = await complete();

    // An in-review quiz is not served, so it cannot be what a star was for.
    expect(res.body.data.starsEarned).toBe(2);
    expect(ledger().some((row) => row.sourceType === "quiz_completion")).toBe(
      false,
    );
  });

  it("grants inside a Serializable transaction", async () => {
    signInAs(childProfile());

    await complete();

    // Two: the step report that marks the lesson finished, then the grant. Both
    // are read-then-write, and the grant's read is what decides the number the
    // child is shown — under READ COMMITTED two taps would both celebrate the
    // same stars even though the index let only one row through.
    expect(store.transactionOptions).toEqual([
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ]);
  });

  it("grants for the session's child, not one named in the request", async () => {
    signInAs(childProfile());

    await complete().send({ childId: "someone_else" });

    expect(ledger().every((row) => row.childId === CHILD_ID)).toBe(true);
  });

  it("retries a Serializable abort rather than answering 500 mid-celebration", async () => {
    signInAs(childProfile());
    const grantTransaction = db.transaction.getMockImplementation();
    if (grantTransaction === undefined) throw new Error("no transaction stub");
    // The step report commits, then the grant loses the race exactly once —
    // which is what the isolation level does to the second of two taps.
    let calls = 0;
    db.transaction.mockImplementation(async (...args: unknown[]) => {
      calls += 1;
      if (calls === 2) {
        throw new Prisma.PrismaClientKnownRequestError("write conflict", {
          code: "P2034",
          clientVersion: "6.19.3",
        });
      }
      return grantTransaction(...args);
    });

    const res = await complete();

    // Three, not two: the step report, the abort, and the grant that retried.
    expect(calls).toBe(3);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ starsEarned: 2, coinsEarned: 5 });
    expect(ledger()).toHaveLength(2);
  });
});

/**
 * Streaks, badges and character unlocks, through the endpoint that produces them
 * (FR-GAM-04..06).
 */
describe("POST /api/progress/lessons/:id/complete — achievements", () => {
  function complete(lessonId = LESSON_ID) {
    return request(app).post(`/api/progress/lessons/${lessonId}/complete`);
  }

  function ledger(): LedgerRow[] {
    return store.ledger as LedgerRow[];
  }

  function streakRow(): StreakRow {
    const row = (store.streaks as StreakRow[])[0];
    if (row === undefined) throw new Error("no Streak row was written");
    return row;
  }

  /** Seeds the child mid-streak: `current` days, last active `daysAgo` days ago. */
  function seedStreak(current: number, longest: number, daysAgo: number) {
    store.streaks = [
      {
        childId: CHILD_ID,
        current,
        longest,
        lastActivityDate: daysAgoAsDateColumn(daysAgo),
      },
    ];
  }

  const STREAK_STARTER: BadgeRow = {
    id: "badge_streak_starter",
    slug: "streak-starter",
    name: "Streak Starter",
    ruleType: "streak_days",
    rule: { days: 3 },
    iconAsset: null,
  };

  describe("streaks (FR-GAM-06)", () => {
    it("opens a streak at one on a child's first completion", async () => {
      signInAs(childProfile());

      const res = await complete();

      expect(res.body.data.streak).toEqual({ current: 1, milestone: null });
      expect(streakRow()).toMatchObject({ current: 1, longest: 1 });
    });

    it("does not move the streak on a second lesson the same day", async () => {
      signInAs(childProfile());
      const OTHER_LESSON = "55555555-5555-4555-8555-555555555555";
      await complete();

      db.lessonFindFirst.mockResolvedValue({ id: OTHER_LESSON, quiz: null });
      db.lessonFindUnique.mockResolvedValue({ quiz: null });
      const res = await complete(OTHER_LESSON);

      // A child who finishes four lessons in an afternoon has learned on one day.
      expect(res.body.data.streak).toEqual({ current: 1, milestone: null });
      expect(streakRow().current).toBe(1);
    });

    it("extends the streak when the last activity was yesterday", async () => {
      signInAs(childProfile());
      seedStreak(1, 1, 1);

      const res = await complete();

      expect(res.body.data.streak).toEqual({ current: 2, milestone: null });
      expect(streakRow()).toMatchObject({ current: 2, longest: 2 });
    });

    it("resets to one after a gap while keeping the longest run on record", async () => {
      signInAs(childProfile());
      seedStreak(9, 9, 3);

      const res = await complete();

      // The streak is broken; what the child once did is not.
      expect(res.body.data.streak.current).toBe(1);
      expect(streakRow()).toMatchObject({ current: 1, longest: 9 });
    });
  });

  describe("badges (FR-GAM-04)", () => {
    it("grants streak-starter on the third consecutive day, with milestone 3", async () => {
      signInAs(childProfile());
      seedStreak(2, 2, 1);
      store.badges = [STREAK_STARTER];

      const res = await complete();

      assertContract(
        LessonCompletionResponseSchema,
        res.body,
        "POST /api/progress/lessons/{id}/complete",
      );
      expect(res.body.data.streak).toEqual({ current: 3, milestone: 3 });
      expect(res.body.data.newBadges).toEqual([
        {
          id: "badge_streak_starter",
          slug: "streak-starter",
          name: "Streak Starter",
          iconUrl: null,
        },
      ]);
    });

    it("writes the badge as a traceable ledger row", async () => {
      signInAs(childProfile());
      seedStreak(2, 2, 1);
      store.badges = [STREAK_STARTER];

      await complete();

      expect(ledger().find((row) => row.rewardType === "badge")).toEqual({
        childId: CHILD_ID,
        rewardType: "badge",
        // `1` because the ledger is one table — a badge is had, not accumulated.
        amount: 1,
        sourceType: "badge_unlock",
        sourceId: "streak-starter",
        badgeId: "badge_streak_starter",
      });
    });

    it("grants the same badge only once, however often the lesson is replayed", async () => {
      signInAs(childProfile());
      seedStreak(2, 2, 1);
      store.badges = [STREAK_STARTER];
      await complete();
      const rowsAfterFirst = ledger().length;

      const second = await complete();

      expect(second.body.data.newBadges).toEqual([]);
      expect(second.body.data.streak).toEqual({ current: 3, milestone: null });
      expect(ledger()).toHaveLength(rowsAfterFirst);
    });

    it("evaluates the streak rule after the streak has advanced", async () => {
      signInAs(childProfile());
      // Two days on the row; the badge needs three, and the third is *this* call.
      // Evaluated before the update, the child would be told about their streak
      // today and handed the badge for it tomorrow.
      seedStreak(2, 2, 1);
      store.badges = [STREAK_STARTER];

      const res = await complete();

      expect(res.body.data.newBadges).toHaveLength(1);
    });

    it("does not grant a badge whose rule is not met", async () => {
      signInAs(childProfile());
      store.badges = [
        {
          ...STREAK_STARTER,
          id: "badge_week",
          slug: "week-warrior",
          rule: { days: 7 },
        },
      ];

      const res = await complete();

      expect(res.body.data.newBadges).toEqual([]);
      expect(ledger().some((row) => row.rewardType === "badge")).toBe(false);
    });

    it("survives a badge row with an unknown ruleType", async () => {
      signInAs(childProfile());
      store.badges = [
        {
          ...STREAK_STARTER,
          id: "badge_nonsense",
          slug: "tuesday-champion",
          ruleType: "lessons_completed_on_a_tuesday",
          rule: { count: 1 },
        },
        STREAK_STARTER,
      ];
      seedStreak(2, 2, 1);

      const res = await complete();

      // A bad CMS row must never turn a child's celebration into a 500 — and it
      // must not stop the badges beside it being granted either.
      expect(res.status).toBe(200);
      expect(
        res.body.data.newBadges.map((badge: { slug: string }) => badge.slug),
      ).toEqual(["streak-starter"]);
    });

    it("survives a badge row whose rule payload is malformed", async () => {
      signInAs(childProfile());
      store.badges = [{ ...STREAK_STARTER, rule: { days: "three" } }];
      seedStreak(2, 2, 1);

      const res = await complete();

      expect(res.status).toBe(200);
      expect(res.body.data.newBadges).toEqual([]);
    });
  });

  describe("character unlocks (FR-GAM-05)", () => {
    const MIA: CharacterRow = {
      id: "character_mia",
      slug: "mia-the-monkey",
      name: "Mia the Monkey",
      isDefault: false,
      unlockRule: { stars: 2 },
      asset: null,
    };

    it("unlocks a character whose criteria the new totals meet", async () => {
      signInAs(childProfile());
      store.characters = [MIA];

      const res = await complete();

      // 2 stars for the lesson is exactly the rule.
      expect(res.body.data.newCharacters).toEqual([
        {
          id: "character_mia",
          slug: "mia-the-monkey",
          name: "Mia the Monkey",
          imageUrl: null,
        },
      ]);
      expect(store.childCharacters).toEqual([
        { childId: CHILD_ID, characterId: "character_mia" },
      ]);
    });

    it("leaves a character locked until its criteria are met", async () => {
      signInAs(childProfile());
      store.characters = [{ ...MIA, unlockRule: { stars: 100 } }];

      const res = await complete();

      expect(res.body.data.newCharacters).toEqual([]);
      expect(store.childCharacters).toHaveLength(0);
    });

    it("counts a badge granted a moment earlier in the same transaction", async () => {
      signInAs(childProfile());
      seedStreak(2, 2, 1);
      store.badges = [STREAK_STARTER];
      store.characters = [{ ...MIA, unlockRule: { badges: 1 } }];

      const res = await complete();

      // The ordering rule's other half: characters are evaluated after badges,
      // so `{ badges: 1 }` sees the row written a few lines above it.
      expect(res.body.data.newCharacters).toHaveLength(1);
    });

    it("never unlocks a starter character, which every child already has", async () => {
      signInAs(childProfile());
      store.characters = [{ ...MIA, isDefault: true, unlockRule: {} }];

      const res = await complete();

      expect(res.body.data.newCharacters).toEqual([]);
      expect(store.childCharacters).toHaveLength(0);
    });

    it("creates exactly one ChildCharacter row across repeated completions", async () => {
      signInAs(childProfile());
      store.characters = [MIA];
      await complete();

      const second = await complete();

      expect(second.body.data.newCharacters).toEqual([]);
      expect(store.childCharacters).toHaveLength(1);
    });
  });

  it("does all of it inside the one Serializable transaction the grants use", async () => {
    signInAs(childProfile());
    seedStreak(2, 2, 1);
    store.badges = [STREAK_STARTER];
    store.characters = [];

    await complete();

    // Two, not five: the step report, then one transaction covering the grants,
    // the streak, the badges and the characters. A badge visible without the
    // star that earned it is a state no reader should ever be able to observe.
    expect(store.transactionOptions).toEqual([
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ]);
  });
});

describe("GET /api/progress/lessons/:id", () => {
  it("returns null for a lesson this child has never opened", async () => {
    signInAs(childProfile());

    const res = await request(app).get(`/api/progress/lessons/${LESSON_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      LessonProgressReadResponseSchema,
      res.body,
      "GET /api/progress/lessons/{id}",
    );
    // Distinct from a fresh row on purpose: `currentStep` means *finished*, so no
    // value of it could say "started, nothing done".
    expect(res.body.data.progress).toBeNull();
  });

  it("returns the last finished step so the player can resume after it", async () => {
    signInAs(childProfile());
    await postStep("intro", false);
    await postStep("video", false);

    const res = await request(app).get(`/api/progress/lessons/${LESSON_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      LessonProgressReadResponseSchema,
      res.body,
      "GET /api/progress/lessons/{id}",
    );
    expect(res.body.data.progress).toEqual({
      lessonId: LESSON_ID,
      currentStep: "video",
      completedAt: null,
    });
  });

  it("serialises completedAt as an ISO string, not a Date", async () => {
    signInAs(childProfile());
    await postStep("reward", true);

    const res = await request(app).get(`/api/progress/lessons/${LESSON_ID}`);

    expect(typeof res.body.data.progress.completedAt).toBe("string");
    assertContract(
      LessonProgressReadResponseSchema,
      res.body,
      "GET /api/progress/lessons/{id}",
    );
  });
});

describe("POST /api/progress/events", () => {
  function postEvent(body: Record<string, unknown>) {
    return request(app).post("/api/progress/events").send(body);
  }

  it("stores a lesson_start event and answers 201", async () => {
    signInAs(childProfile());

    const res = await postEvent({
      type: "lesson_start",
      lessonId: LESSON_ID,
      clientTs: CLIENT_TS,
    });

    expect(res.status).toBe(201);
    assertContract(
      SessionEventResponseSchema,
      res.body,
      "POST /api/progress/events",
    );
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      childId: CHILD_ID,
      type: "lesson_start",
      payload: { lessonId: LESSON_ID },
    });
  });

  it("carries the step in the payload on a step_complete event", async () => {
    signInAs(childProfile());

    await postEvent({
      type: "step_complete",
      lessonId: LESSON_ID,
      step: "video",
      clientTs: CLIENT_TS,
    });

    expect(store.events[0]).toMatchObject({
      payload: { lessonId: LESSON_ID, step: "video" },
    });
  });

  it("records the locale-fallback flag the step reported (FR-I18N-01)", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));

    await postEvent({
      type: "step_complete",
      lessonId: LESSON_ID,
      step: "video",
      fallback: true,
      clientTs: CLIENT_TS,
    });

    expect(store.events[0]).toMatchObject({
      payload: { lessonId: LESSON_ID, step: "video", fallback: true },
    });
  });

  it("leaves the fallback key off the payload when the step did not report one", async () => {
    signInAs(childProfile());

    await postEvent({
      type: "step_complete",
      lessonId: LESSON_ID,
      step: "intro",
      clientTs: CLIENT_TS,
    });

    // Absent, not `false`: a step that never reported is distinguishable from one
    // that reported "no fallback", which is what makes the report countable.
    expect(store.events[0]).toMatchObject({ payload: { step: "intro" } });
    expect(
      Object.hasOwn(
        (store.events[0] as { payload: Record<string, unknown> }).payload,
        "fallback",
      ),
    ).toBe(false);
  });

  it("ignores clientTs and stamps its own time (FR-TIME-06)", async () => {
    signInAs(childProfile());

    const res = await postEvent({
      type: "lesson_complete",
      lessonId: LESSON_ID,
      // A client that could backdate an event could spend an afternoon inside a
      // 30-minute budget.
      clientTs: "2020-01-01T00:00:00.000Z",
    });

    expect(res.body.data.event.occurredAt).toBe("2026-08-10T10:30:00.000Z");
    const [event] = store.events as Array<{ occurredAt: Date }>;
    expect(event.occurredAt.toISOString()).toBe("2026-08-10T10:30:00.000Z");
    // Nothing the client sent about time reached the row.
    expect(JSON.stringify(store.events)).not.toContain("2020-01-01");
  });

  it("appends rather than replacing — the log is the raw material for file 27", async () => {
    signInAs(childProfile());

    await postEvent({
      type: "lesson_start",
      lessonId: LESSON_ID,
      clientTs: CLIENT_TS,
    });
    for (const step of ["intro", "video", "activity", "quiz", "reward"]) {
      await postEvent({
        type: "step_complete",
        lessonId: LESSON_ID,
        step,
        clientTs: CLIENT_TS,
      });
    }
    await postEvent({
      type: "lesson_complete",
      lessonId: LESSON_ID,
      clientTs: CLIENT_TS,
    });

    expect(store.events).toHaveLength(7);
    expect(
      (store.events as Array<{ type: string }>).map((event) => event.type),
    ).toEqual([
      "lesson_start",
      "step_complete",
      "step_complete",
      "step_complete",
      "step_complete",
      "step_complete",
      "lesson_complete",
    ]);
  });

  it.each([
    "heartbeat",
    "session_start",
    "story_complete",
  ])("rejects %s — a client may not forge the rows a time limit is enforced from", async (type) => {
    signInAs(childProfile());

    const res = await postEvent({
      type,
      lessonId: LESSON_ID,
      clientTs: CLIENT_TS,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(store.events).toHaveLength(0);
  });
});

describe("POST /api/progress/quizzes/:quizId/responses", () => {
  /** Three of the four right on the first go — 75%. */
  function answers(overrides: Partial<Record<string, boolean>> = {}) {
    return QUESTION_IDS.map((questionId, index) => ({
      questionId,
      answer: "apple",
      isCorrect: overrides[questionId] ?? index < 3,
      attempts: (overrides[questionId] ?? index < 3) ? 1 : 2,
    }));
  }

  function submit(responses: unknown[], quizId = QUIZ_ID) {
    return request(app)
      .post(`/api/progress/quizzes/${quizId}/responses`)
      .send({ responses });
  }

  function storedResponses(): QuizResponseRow[] {
    return store.quizResponses as QuizResponseRow[];
  }

  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await submit(answers());

    expect(res.status).toBe(401);
    expect(store.quizResponses).toHaveLength(0);
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    signInAs(null);

    const res = await submit(answers());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid quiz id before touching the database", async () => {
    signInAs(childProfile());

    const res = await submit(answers(), "quiz-one");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("stores one row per answer and answers with the score", async () => {
    signInAs(childProfile());

    const res = await submit(answers());

    expect(res.status).toBe(200);
    assertContract(
      QuizResponsesResponseSchema,
      res.body,
      "POST /api/progress/quizzes/{quizId}/responses",
    );
    expect(res.body.data).toEqual({
      lessonId: LESSON_ID,
      score: 75,
      correctCount: 3,
      totalQuestions: 4,
    });
    expect(storedResponses()).toHaveLength(4);
  });

  it("keeps the attempt count each answer took (FR-QUIZ-08)", async () => {
    signInAs(childProfile());

    await submit([
      { questionId: "q_1", answer: "apple", isCorrect: true, attempts: 1 },
      {
        questionId: "q_2",
        answer: { pairs: [{ leftId: "dog", rightId: "woof" }] },
        isCorrect: false,
        attempts: 3,
      },
    ]);

    // `isCorrect` alone cannot tell a walkover from a struggle — this is the
    // column that can.
    expect(storedResponses()).toEqual([
      expect.objectContaining({ questionId: "q_1", attempts: 1 }),
      expect.objectContaining({ questionId: "q_2", attempts: 3 }),
    ]);
  });

  it("stores a match_pair answer as the pair set the child ended with", async () => {
    signInAs(childProfile());
    const pairs = [
      { leftId: "dog", rightId: "woof" },
      { leftId: "cat", rightId: "meow" },
    ];

    await submit([
      { questionId: "q_1", answer: { pairs }, isCorrect: true, attempts: 1 },
    ]);

    expect(storedResponses()[0].answer).toEqual({ pairs });
  });

  it("writes the score onto the lesson's progress row", async () => {
    signInAs(childProfile());

    await submit(answers());

    expect(currentRow()).toMatchObject({
      childId: CHILD_ID,
      lessonId: LESSON_ID,
      score: 75,
    });
  });

  it("keeps the higher score when a weaker replay is submitted", async () => {
    signInAs(childProfile());
    await submit(answers());

    const res = await submit(
      answers({ q_1: false, q_2: false, q_3: false, q_4: false }),
    );

    // The reply describes the attempt; the row keeps the child's best. A second,
    // more tired run must not erase what they did on the first.
    expect(res.body.data.score).toBe(0);
    expect(currentRow().score).toBe(75);
  });

  it("raises the score when a replay goes better", async () => {
    signInAs(childProfile());
    await submit(answers({ q_1: false, q_2: false, q_3: false, q_4: false }));

    await submit(answers({ q_4: true }));

    expect(currentRow().score).toBe(100);
  });

  it("scores over the quiz, not over what was submitted", async () => {
    signInAs(childProfile());

    // One of four, and it was right. A denominator taken from the submission
    // would score this 100% for skipping the three that went badly.
    const res = await submit([
      { questionId: "q_1", answer: "apple", isCorrect: true, attempts: 1 },
    ]);

    expect(res.body.data).toMatchObject({
      score: 25,
      correctCount: 1,
      totalQuestions: 4,
    });
  });

  it("rejects a questionId belonging to another quiz and stores nothing", async () => {
    signInAs(childProfile());

    const res = await submit([
      { questionId: "q_1", answer: "apple", isCorrect: true, attempts: 1 },
      {
        questionId: "someone_elses_question",
        answer: "apple",
        isCorrect: true,
        attempts: 1,
      },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    // The whole submission is rejected — a partial write would score the quiz
    // from a set of answers nobody asked for.
    expect(db.transaction).not.toHaveBeenCalled();
    expect(store.quizResponses).toHaveLength(0);
  });

  it("rejects one question answered twice and stores nothing", async () => {
    signInAs(childProfile());

    // Four questions, five records, every one of them the same correct answer.
    // Counted as sent, that is 125% — and five rows against one question in the
    // accuracy report file 29 reads.
    const res = await submit(
      Array.from({ length: 5 }, () => ({
        questionId: "q_1",
        answer: "apple",
        isCorrect: true,
        attempts: 1,
      })),
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
    expect(store.quizResponses).toHaveLength(0);
  });

  it("rejects an empty submission", async () => {
    signInAs(childProfile());

    const res = await submit([]);

    expect(res.status).toBe(400);
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("rejects attempts below one", async () => {
    signInAs(childProfile());

    const res = await submit([
      { questionId: "q_1", answer: "apple", isCorrect: true, attempts: 0 },
    ]);

    expect(res.status).toBe(400);
    expect(store.quizResponses).toHaveLength(0);
  });

  it("stores the rows under the session's child, not one named in the request", async () => {
    signInAs(childProfile());

    await submit(answers());

    expect(storedResponses().every((row) => row.childId === CHILD_ID)).toBe(
      true,
    );
  });

  it("writes the rows and the score inside one Serializable transaction", async () => {
    signInAs(childProfile());

    await submit(answers());

    // Both the best-score read-then-write and the row insert have to survive two
    // submissions racing. Whether Postgres honours the level needs a real
    // database; that it is asked for is testable.
    expect(store.transactionOptions).toEqual([
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ]);
  });

  it("retries once when Postgres aborts the transaction as a serialization failure", async () => {
    signInAs(childProfile());
    let attempts = 0;
    db.transaction.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Prisma.PrismaClientKnownRequestError("write conflict", {
          code: "P2034",
          clientVersion: "6",
        });
      }
      return undefined;
    });

    const res = await submit(answers());

    expect(res.status).toBe(200);
    expect(attempts).toBe(2);
  });
});

describe("POST /api/progress/stories/:id/complete", () => {
  function finish(storyId = STORY_ID) {
    return request(app).post(`/api/progress/stories/${storyId}/complete`);
  }

  function ledger(): LedgerRow[] {
    return store.ledger as LedgerRow[];
  }

  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await finish();

    expect(res.status).toBe(401);
    expect(db.storyFindFirst).not.toHaveBeenCalled();
    expect(ledger()).toHaveLength(0);
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    signInAs(null);

    const res = await finish();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(ledger()).toHaveLength(0);
  });

  it("rejects a malformed story id at the boundary before querying", async () => {
    signInAs(childProfile());

    const res = await finish("not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(db.storyFindFirst).not.toHaveBeenCalled();
  });

  it("grants 1 star and 5 coins the first time a story is finished (FR-STORY-07)", async () => {
    signInAs(childProfile());

    const res = await finish();

    expect(res.status).toBe(200);
    assertContract(
      StoryCompletionResponseSchema,
      res.body,
      "POST /api/progress/stories/{id}/complete",
    );
    expect(res.body.data).toEqual({
      alreadyCompleted: false,
      granted: { stars: 1, coins: 5 },
    });
    expect(ledger()).toEqual([
      {
        childId: CHILD_ID,
        rewardType: "star",
        amount: 1,
        sourceType: "story_completion",
        sourceId: STORY_ID,
      },
      {
        childId: CHILD_ID,
        rewardType: "coin",
        amount: 5,
        sourceType: "story_completion",
        sourceId: STORY_ID,
      },
    ]);
  });

  it("grants nothing on a second reading, and says so rather than failing (FR-STORY-06)", async () => {
    signInAs(childProfile());
    await finish();

    const res = await finish();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ alreadyCompleted: true, granted: null });
    // Two rows, not four: reading again is free and unlimited, and the endpoint
    // stays callable every time rather than being withheld by the client.
    expect(ledger()).toHaveLength(2);
  });

  it("keeps one child's completion out of another's ledger", async () => {
    signInAs(childProfile());
    await finish();

    signInAs(childProfile({ id: "child_2" }));
    const res = await finish();

    expect(res.body.data.granted).toEqual({ stars: 1, coins: 5 });
    expect(ledger().filter((row) => row.childId === "child_2")).toHaveLength(2);
  });

  it("pays for each story separately", async () => {
    signInAs(childProfile());
    await finish();

    db.storyFindFirst.mockResolvedValue({ id: MISSING_ID });
    const res = await finish(MISSING_ID);

    expect(res.body.data.alreadyCompleted).toBe(false);
    expect(ledger()).toHaveLength(4);
  });

  it("returns 404 and grants nothing for a story the child cannot see", async () => {
    signInAs(childProfile());
    db.storyFindFirst.mockResolvedValue(null);

    const res = await finish(MISSING_ID);

    // Not 403: an unpublished or wrong-grade story must be indistinguishable
    // from one that was never written (NFR-SAFE-02) — and a draft that paid out
    // would be a star farm for anyone who could guess a uuid.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(ledger()).toHaveLength(0);
  });

  it("gates the story on the same clause the content API reads it with", async () => {
    signInAs(childProfile({ gradeLevel: "KG1" }));

    await finish();

    // Asserted rather than demonstrated, for the reason the file header gives
    // (`general.md §5`, rule 2) — and asserted to be the *same* clause
    // `stories.test.ts` requires, because the two disagreeing is the failure
    // mode: a story the reader cannot open but can be paid for finishing.
    expect(db.storyFindFirst).toHaveBeenCalledWith({
      where: {
        id: STORY_ID,
        status: "published",
        gradeLevels: { has: "KG1" },
        world: { is: { status: "published" } },
      },
      select: { id: true },
    });
  });

  it("writes the grant under Serializable isolation", async () => {
    signInAs(childProfile());

    await finish();

    // Rule 4: whether Postgres honours it needs a real database. What is
    // assertable here is that the service asked for it — two taps arriving
    // together must not both be told they earned the star.
    expect(store.transactionOptions).toContainEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it("does not advance the streak or evaluate badges", async () => {
    signInAs(childProfile());

    await finish();

    // Finishing a story pays its own small reward and nothing else: file 24's
    // milestone engine counts these rows the next time a *lesson* completes, so
    // a bedtime story does not turn into a six-phase celebration.
    expect(db.streakUpsert).not.toHaveBeenCalled();
    expect(db.badgeFindMany).not.toHaveBeenCalled();
    expect(db.childCharacterCreateMany).not.toHaveBeenCalled();
  });
});

/**
 * The content-safety half (`backend.md §4`). A stub cannot show that a draft
 * lesson stayed out of the progress table, so the `where` clause that keeps it out
 * is asserted — and it is asserted to be the *same* clause `content.test.ts`
 * requires, because the two endpoints disagreeing is the actual failure mode: a
 * lesson the player cannot open but can record progress against.
 */
describe("lesson visibility (FR-CURR-02, NFR-SAFE-02)", () => {
  const VISIBILITY_WHERE = {
    id: LESSON_ID,
    status: "published",
    gradeLevels: { has: "NURSERY" },
    world: { is: { status: "published" } },
  };

  it("resolves the lesson through the published + grade filter before writing a step", async () => {
    signInAs(childProfile());

    await postStep("intro", false);

    expect(db.lessonFindFirst).toHaveBeenCalledWith({
      where: VISIBILITY_WHERE,
      select: { id: true },
    });
  });

  it("applies the same filter before recording an event", async () => {
    signInAs(childProfile());

    await request(app)
      .post("/api/progress/events")
      .send({ type: "lesson_start", lessonId: LESSON_ID, clientTs: CLIENT_TS });

    expect(db.lessonFindFirst).toHaveBeenCalledWith({
      where: VISIBILITY_WHERE,
      select: { id: true },
    });
  });

  it("applies the same filter before reading progress", async () => {
    signInAs(childProfile());

    await request(app).get(`/api/progress/lessons/${LESSON_ID}`);

    expect(db.lessonFindFirst).toHaveBeenCalledWith({
      where: VISIBILITY_WHERE,
      select: { id: true },
    });
  });

  it("returns 404 — not 403 — and writes nothing for a lesson the child cannot see", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(null);

    const step = await postStep("intro", false, MISSING_ID);
    const read = await request(app).get(`/api/progress/lessons/${MISSING_ID}`);
    const event = await request(app).post("/api/progress/events").send({
      type: "lesson_start",
      lessonId: MISSING_ID,
      clientTs: CLIENT_TS,
    });
    const quiz = await request(app)
      .post(`/api/progress/quizzes/${MISSING_ID}/responses`)
      .send({
        responses: [
          { questionId: "q_1", answer: "apple", isCorrect: true, attempts: 1 },
        ],
      });

    for (const res of [step, read, event, quiz]) {
      // 403 would confirm the row exists, which is what a probe is after.
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.sessionEventCreate).not.toHaveBeenCalled();
    expect(store.progressRows).toHaveLength(0);
    expect(store.quizResponses).toHaveLength(0);
  });

  it("reaches a quiz only through a lesson the child can see", async () => {
    signInAs(childProfile());

    await request(app)
      .post(`/api/progress/quizzes/${QUIZ_ID}/responses`)
      .send({
        responses: [
          { questionId: "q_1", answer: "apple", isCorrect: true, attempts: 1 },
        ],
      });

    // A `Quiz` carries a status but no grade tags, so resolving it by id alone
    // would let a child answer another grade's content. Every clause of the
    // lesson gate above applies, plus the quiz's own status.
    expect(db.lessonFindFirst).toHaveBeenCalledWith({
      where: {
        quizId: QUIZ_ID,
        status: "published",
        gradeLevels: { has: "NURSERY" },
        world: { is: { status: "published" } },
        quiz: { is: { status: "published" } },
      },
      select: {
        id: true,
        quiz: { select: { questions: { select: { id: true } } } },
      },
    });
  });

  it("never sends a status other than published to Prisma", async () => {
    signInAs(childProfile());

    await postStep("intro", false);
    await request(app).get(`/api/progress/lessons/${LESSON_ID}`);

    const clauses = JSON.stringify(
      db.lessonFindFirst.mock.calls.map(
        ([args]) => (args as { where?: unknown } | undefined)?.where,
      ),
    );
    expect(clauses).toContain('"status":"published"');
    for (const status of ["draft", "in_review", "approved", "rejected"]) {
      expect(clauses).not.toContain(status);
    }
  });

  it("takes the grade from the child row, never from the request", async () => {
    signInAs(childProfile({ gradeLevel: "KG2" }));

    await request(app)
      .post(`/api/progress/lessons/${LESSON_ID}/step?gradeLevel=NURSERY`)
      .send({ step: "intro", completed: false, childId: "someone_else" });

    // The extra body key is rejected by the strict schema before anything runs.
    expect(db.lessonFindFirst).not.toHaveBeenCalled();

    await postStep("intro", false);
    expect(db.lessonFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ gradeLevels: { has: "KG2" } }),
      }),
    );
  });

  it("writes progress for the session's child, not one named in the request", async () => {
    signInAs(childProfile());

    await postStep("intro", false);

    expect(currentRow().childId).toBe(CHILD_ID);
  });
});

/**
 * The two guarantees the rewards engine rests on that a stubbed Prisma client
 * cannot demonstrate (Rule 4). Replace the first with a real double-insert once
 * the test-database harness exists; the second is a source-level property and
 * stays useful either way.
 */
describe("reward grant contract (FR-GAM-07..08)", () => {
  const serverSrc = new URL("../", import.meta.url);

  it("declares the unique index the idempotency guard is", () => {
    const schema = readFileSync(
      new URL("../../../../packages/db/prisma/schema.prisma", import.meta.url),
      "utf8",
    );

    // Without it, `skipDuplicates` skips nothing and every replay pays out
    // again — the emulation in this file's stub would keep passing regardless.
    expect(schema).toContain(
      "@@unique([childId, rewardType, sourceType, sourceId])",
    );
    // The character unlock's equivalent, and emulated by the same stub trick.
    expect(schema).toContain("@@unique([childId, characterId])");
    // One streak per child. Without it, `upsert` could write a second row and a
    // child would carry two streaks that alternate depending on read order.
    expect(schema).toContain("childId          String       @unique");
  });

  it("writes RewardLedger rows from one service and nowhere else (FR-GAM-08)", () => {
    const files = readdirRecursive(new URL("./", serverSrc)).filter(
      (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
    );

    const writers = files.filter((path) =>
      /rewardLedger\.(create|createMany|update|updateMany|upsert|delete)/.test(
        readFileSync(path, "utf8"),
      ),
    );

    // A second writer is how a purchase path gets built by accident: any route
    // that could insert a row could be handed an amount from a request body.
    expect(writers.map((path) => path.split("/src/")[1])).toEqual([
      "services/rewardService.ts",
    ]);
  });
});

function readdirRecursive(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? readdirRecursive(new URL(`${entry.name}/`, dir))
      : [fileURLToPath(new URL(entry.name, dir))],
  );
}
