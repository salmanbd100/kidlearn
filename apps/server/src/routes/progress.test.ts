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
 *    `$transaction`; whether Postgres honours it needs a real database.
 */
import type { ChildProfile, LessonProgress, Parent } from "@kidlearn/db";
import {
  LessonProgressReadResponseSchema,
  LessonProgressResponseSchema,
  SessionEventResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";

const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";
const CHILD_ID = "child_1";
const CLIENT_TS = "2026-08-10T09:00:00.000Z";

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

/**
 * An in-memory store, not a queue of canned answers.
 *
 * `progressRow` is carried between requests, so "advance", "no regress" and "do not
 * re-stamp `completedAt`" are each a *second* request reading what the first wrote.
 */
const store = vi.hoisted(() => ({
  progressRow: null as unknown,
  events: [] as unknown[],
  transactionOptions: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  childFindFirst: vi.fn(),
  lessonFindFirst: vi.fn(),
  progressFindUnique: vi.fn(),
  progressCreate: vi.fn(),
  progressUpdate: vi.fn(),
  sessionEventCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    lesson: { findFirst: db.lessonFindFirst },
    lessonProgress: {
      findUnique: db.progressFindUnique,
      create: db.progressCreate,
      update: db.progressUpdate,
    },
    sessionEvent: { create: db.sessionEventCreate },
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

function currentRow(): ProgressRow {
  const row = store.progressRow as ProgressRow | null;
  if (row === null) throw new Error("no LessonProgress row was written");
  return row;
}

beforeEach(() => {
  store.progressRow = null;
  store.events = [];
  store.transactionOptions = [];
  for (const fn of Object.values(db)) fn.mockReset();

  // The lesson is visible unless a test says otherwise.
  db.lessonFindFirst.mockResolvedValue({ id: LESSON_ID });

  db.progressFindUnique.mockImplementation(async () => store.progressRow);

  db.progressCreate.mockImplementation(async ({ data }: { data: unknown }) => {
    const input = data as Omit<
      ProgressRow,
      "id" | "score" | "timeSpentSec" | "updatedAt"
    >;
    const row: ProgressRow = {
      id: "progress_1",
      ...input,
      score: null,
      timeSpentSec: 0,
      updatedAt: new Date("2026-08-10T09:00:00.000Z"),
    };
    store.progressRow = row;
    return row;
  });

  db.progressUpdate.mockImplementation(async ({ data }: { data: unknown }) => {
    const row = { ...currentRow(), ...(data as Partial<ProgressRow>) };
    store.progressRow = row;
    return row;
  });

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

  // Runs the real callback against the in-memory store, and records the options
  // so the isolation level can be asserted (Rule 4).
  db.transaction.mockImplementation(
    async (
      callback: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ): Promise<unknown> => {
      store.transactionOptions.push(options);
      return callback({
        lessonProgress: {
          findUnique: db.progressFindUnique,
          create: db.progressCreate,
          update: db.progressUpdate,
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

    for (const res of [step, read, event]) {
      // 403 would confirm the row exists, which is what a probe is after.
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.sessionEventCreate).not.toHaveBeenCalled();
    expect(store.progressRow).toBeNull();
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
