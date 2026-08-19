/**
 * The heartbeat surface and the parent-scoped learning-time read.
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four rules that bound it shape this suite:
 *
 *  - **Rule 1, stub state not answers.** `store.events` is a real append-only
 *    array, and `sessionEvent.findFirst`/`findMany` read it with the same ordering
 *    and window Prisma would. So the throttle is a *second* request seeing what the
 *    first wrote, and `minutesToday` is the pure function run over rows the suite
 *    made the server write — not a number handed back by a mock.
 *  - **Rule 2, assert the query.** A stub cannot show that a draft lesson stayed
 *    invisible, so the `where` clause that keeps it invisible is asserted directly,
 *    against the same clause `routes/progress.test.ts` asserts.
 *  - **Rule 4, name what the stub cannot prove.** The composite index the window
 *    query relies on is asserted against `schema.prisma`; whether Postgres uses it
 *    needs a real database and an `EXPLAIN`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ChildProfile, Parent } from "@kidlearn/db";
import {
  ActivityEventResponseSchema,
  HeartbeatResponseSchema,
  LearningTimeReadResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";

const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const STORY_ID = "55555555-5555-4555-8555-555555555555";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";
const CHILD_ID = "child_1";
const OTHER_CHILD_ID = "child_2";

type EventRow = {
  id: string;
  childId: string;
  type: string;
  occurredAt: Date;
  payload: unknown;
};

const store = vi.hoisted(() => ({
  events: [] as unknown[],
  /** What `sessionEvent.create` stamps next. Advanced by the suite, not by a clock. */
  now: new Date("2026-08-18T09:00:00.000Z"),
}));

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  childFindFirst: vi.fn(),
  lessonFindFirst: vi.fn(),
  storyFindFirst: vi.fn(),
  eventCreate: vi.fn(),
  eventFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    lesson: { findFirst: db.lessonFindFirst },
    story: { findFirst: db.storyFindFirst },
    sessionEvent: {
      create: db.eventCreate,
      findFirst: db.eventFindFirst,
      findMany: db.eventFindMany,
    },
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

function events(): EventRow[] {
  return store.events as EventRow[];
}

/**
 * Moves the wall clock the *service* reads. `vi.setSystemTime` rather than a
 * parameter, because the throttle compares `Date.now()` against a stored row and
 * that comparison is the thing under test.
 */
function setNow(iso: string) {
  store.now = new Date(iso);
  vi.setSystemTime(store.now);
}

function postHeartbeat() {
  return request(app).post("/api/events/heartbeat");
}

beforeEach(() => {
  store.events = [];
  for (const fn of Object.values(db)) fn.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setNow("2026-08-18T09:00:00.000Z");

  // Visible unless a test says otherwise.
  db.lessonFindFirst.mockResolvedValue({ id: LESSON_ID });
  db.storyFindFirst.mockResolvedValue({ id: STORY_ID });

  db.eventCreate.mockImplementation(async ({ data }: { data: unknown }) => {
    const input = data as { childId: string; type: string; payload?: unknown };
    const row: EventRow = {
      id: `event_${store.events.length + 1}`,
      childId: input.childId,
      type: input.type,
      // Nullable column: a heartbeat sends no payload and an activity event does,
      // so the absence is the schema's default and not something set here.
      payload: input.payload ?? null,
      // The column default too. This is the value the server keeps — nothing in
      // any request on this surface could have supplied one (FR-TIME-06).
      occurredAt: store.now,
    };
    store.events.push(row);
    return row;
  });

  db.eventFindFirst.mockImplementation(
    async ({ where }: { where: { childId: string; type?: string } }) =>
      events()
        .filter(
          (row) =>
            row.childId === where.childId &&
            (where.type === undefined || row.type === where.type),
        )
        // `orderBy: { occurredAt: "desc" }` — the latest beat, which is what the
        // throttle compares against.
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0] ??
      null,
  );

  db.eventFindMany.mockImplementation(
    async ({
      where,
    }: {
      where: { childId: string; occurredAt: { gte: Date; lt: Date } };
    }) =>
      events()
        .filter(
          (row) =>
            row.childId === where.childId &&
            row.occurredAt >= where.occurredAt.gte &&
            row.occurredAt < where.occurredAt.lt,
        )
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .map((row) => ({ occurredAt: row.occurredAt })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/events/heartbeat", () => {
  it("returns 401 without a session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await postHeartbeat();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(store.events).toHaveLength(0);
  });

  it("returns 403 when the session has no active child profile", async () => {
    signInAs(null);

    const res = await postHeartbeat();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(store.events).toHaveLength(0);
  });

  it("stores a heartbeat and answers with today's minutes", async () => {
    signInAs(childProfile());

    const res = await postHeartbeat();

    expect(res.status).toBe(200);
    assertContract(
      HeartbeatResponseSchema,
      res.body,
      "POST /api/events/heartbeat",
    );
    expect(res.body.data).toEqual({ recorded: true, minutesToday: 1 });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      childId: CHILD_ID,
      type: "heartbeat",
    });
  });

  it("takes no timestamp from the request, whatever the client sends", async () => {
    signInAs(childProfile());

    // A body at all is more than the contract allows, and a backdated one is the
    // shape a tampered client would send. Neither reaches the row: `occurredAt` is
    // the column default, and there is no schema field it could have come from.
    const res = await postHeartbeat().send({
      occurredAt: "2020-01-01T00:00:00.000Z",
      minutesToday: 0,
    });

    expect(res.status).toBe(200);
    expect(events()[0].occurredAt.toISOString()).toBe(
      "2026-08-18T09:00:00.000Z",
    );
  });

  it("drops a beat arriving under 20 seconds after the previous one", async () => {
    signInAs(childProfile());
    await postHeartbeat();

    setNow("2026-08-18T09:00:19.000Z");
    const res = await postHeartbeat();

    expect(res.status).toBe(200);
    expect(res.body.data.recorded).toBe(false);
    // Nothing written — the density minutes are derived from is unchanged, which
    // is the whole point of the guard.
    expect(store.events).toHaveLength(1);
    // And the total is still honest, so a throttled client is not blind to a
    // limit it is about to cross (file 28).
    expect(res.body.data.minutesToday).toBe(1);
  });

  it("accepts the next beat at the client's 30-second cadence", async () => {
    signInAs(childProfile());
    await postHeartbeat();

    setNow("2026-08-18T09:00:30.000Z");
    const res = await postHeartbeat();

    expect(res.body.data.recorded).toBe(true);
    expect(store.events).toHaveLength(2);
    // 30s spanned + 30s tail credit = 1 minute.
    expect(res.body.data.minutesToday).toBe(1);
  });

  it("cannot be inflated by a client beating in a loop", async () => {
    signInAs(childProfile());

    // Twenty beats one second apart. A client that could pack them would claim
    // more than the twenty seconds that actually passed.
    for (let second = 0; second < 20; second += 1) {
      setNow(`2026-08-18T09:00:${String(second).padStart(2, "0")}.000Z`);
      await postHeartbeat();
    }

    expect(store.events).toHaveLength(1);
  });

  it("counts a real sitting from the rows it wrote, not from a counter", async () => {
    signInAs(childProfile());

    // Ten minutes at the honest cadence: 21 beats, 30s apart.
    for (let beat = 0; beat < 21; beat += 1) {
      const seconds = beat * 30;
      setNow(
        new Date(
          Date.UTC(2026, 7, 18, 9, Math.floor(seconds / 60), seconds % 60),
        ).toISOString(),
      );
      await postHeartbeat();
    }

    const res = await postHeartbeat();
    // 10 minutes spanned + 30s tail = 10.5 → 11. The figure survives because it
    // is derived from 21 stored rows, so no client state could have reset it.
    expect(res.body.data.minutesToday).toBe(11);
    expect(store.events).toHaveLength(21);
  });

  it("keeps each child's beats to themselves", async () => {
    signInAs(childProfile());
    await postHeartbeat();
    setNow("2026-08-18T09:00:30.000Z");
    await postHeartbeat();

    signInAs(childProfile({ id: OTHER_CHILD_ID }));
    const res = await postHeartbeat();

    // A first beat for the sibling, and their own total — not the two rows the
    // first child wrote a moment ago.
    expect(res.body.data).toEqual({ recorded: true, minutesToday: 1 });
  });
});

describe("POST /api/events/activity", () => {
  function postActivity(body: Record<string, unknown>) {
    return request(app).post("/api/events/activity").send(body);
  }

  it("returns 401 without a session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await postActivity({ type: "story_start", refId: STORY_ID });

    expect(res.status).toBe(401);
    expect(store.events).toHaveLength(0);
  });

  it("stores a story_start against the story and answers 201", async () => {
    signInAs(childProfile());

    const res = await postActivity({ type: "story_start", refId: STORY_ID });

    expect(res.status).toBe(201);
    assertContract(
      ActivityEventResponseSchema,
      res.body,
      "POST /api/events/activity",
    );
    expect(store.events[0]).toMatchObject({
      childId: CHILD_ID,
      type: "story_start",
      payload: { refId: STORY_ID },
    });
  });

  it("stores a lesson milestone against the lesson", async () => {
    signInAs(childProfile());

    await postActivity({ type: "lesson_complete", refId: LESSON_ID });

    expect(store.events[0]).toMatchObject({
      type: "lesson_complete",
      payload: { refId: LESSON_ID },
    });
  });

  it("keeps a sitting alive across a gap a heartbeat alone would have split", async () => {
    signInAs(childProfile());
    await postHeartbeat();

    // 80s later — past the 30s cadence but inside the 90s session gap only
    // because this event exists.
    setNow("2026-08-18T09:01:20.000Z");
    await postActivity({ type: "story_complete", refId: STORY_ID });

    setNow("2026-08-18T09:02:40.000Z");
    const res = await postHeartbeat();

    // One sitting of 160s + 30s tail = 3 minutes. Without the middle event the
    // two beats would be lone sittings worth 1 minute between them.
    expect(res.body.data.minutesToday).toBe(3);
  });

  it("rejects a type outside the five surface milestones", async () => {
    signInAs(childProfile());

    const res = await postActivity({ type: "heartbeat", refId: LESSON_ID });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    // A forged heartbeat is exactly what the enum subset exists to refuse.
    expect(store.events).toHaveLength(0);
  });

  it("rejects an empty refId and an unknown key", async () => {
    signInAs(childProfile());

    const empty = await postActivity({ type: "story_start", refId: "" });
    const extra = await postActivity({
      type: "story_start",
      refId: STORY_ID,
      occurredAt: "2020-01-01T00:00:00.000Z",
    });

    expect(empty.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(store.events).toHaveLength(0);
  });

  it("returns 404 — not 403 — for content the child cannot see, and writes nothing", async () => {
    signInAs(childProfile());
    db.lessonFindFirst.mockResolvedValue(null);
    db.storyFindFirst.mockResolvedValue(null);

    const lesson = await postActivity({
      type: "lesson_start",
      refId: MISSING_ID,
    });
    const story = await postActivity({
      type: "story_start",
      refId: MISSING_ID,
    });

    // 403 would confirm the row exists; draft content must not be discoverable
    // by probing (NFR-SAFE-02).
    expect(lesson.status).toBe(404);
    expect(story.status).toBe(404);
    expect(store.events).toHaveLength(0);
  });

  it("resolves a story event against the story table and a lesson event against lessons", async () => {
    signInAs(childProfile());

    await postActivity({ type: "story_start", refId: STORY_ID });
    expect(db.storyFindFirst).toHaveBeenCalledTimes(1);
    expect(db.lessonFindFirst).not.toHaveBeenCalled();

    await postActivity({ type: "step_complete", refId: LESSON_ID });
    expect(db.lessonFindFirst).toHaveBeenCalledTimes(1);
  });

  it("filters both lookups to published content tagged for this child's grade", async () => {
    signInAs(childProfile({ gradeLevel: "KG1" }));

    await postActivity({ type: "lesson_start", refId: LESSON_ID });
    await postActivity({ type: "story_start", refId: STORY_ID });

    const expected = {
      status: "published",
      gradeLevels: { has: "KG1" },
      world: { is: { status: "published" } },
    };
    expect(db.lessonFindFirst).toHaveBeenCalledWith({
      where: { id: LESSON_ID, ...expected },
      select: { id: true },
    });
    expect(db.storyFindFirst).toHaveBeenCalledWith({
      where: { id: STORY_ID, ...expected },
      select: { id: true },
    });
  });
});

describe("GET /api/children/:id/learning-time", () => {
  function getLearningTime(childId: string, query: string) {
    return request(app).get(`/api/children/${childId}/learning-time${query}`);
  }

  /** Puts `count` beats 30s apart into the store, starting at `start`. */
  function seedBeats(childId: string, start: string, count: number) {
    const first = new Date(start).getTime();
    for (let beat = 0; beat < count; beat += 1) {
      store.events.push({
        id: `seed_${store.events.length + 1}`,
        childId,
        type: "heartbeat",
        occurredAt: new Date(first + beat * 30_000),
        payload: null,
      });
    }
  }

  beforeEach(() => {
    // The route's guard is `loadOwnedChild`, which looks the child up by id *and*
    // parentId — so a stub that answers by id alone would hide the ownership
    // check. This one honours both, which is what makes the 404 test meaningful.
    db.childFindFirst.mockImplementation(
      async ({ where }: { where: { id: string; parentId: string } }) =>
        where.id === CHILD_ID && where.parentId === PARENT.id
          ? childProfile()
          : null,
    );
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: SESSION_USER,
      session: {
        id: "session_1",
        userId: SESSION_USER.id,
        activeChildProfileId: CHILD_ID,
      },
    } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
    db.parentFindUnique.mockResolvedValue(PARENT);
  });

  it("returns 401 without a session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await getLearningTime(CHILD_ID, "?range=today");

    expect(res.status).toBe(401);
  });

  it("answers all three ranges for the owning parent's child", async () => {
    // Ten minutes this morning, in Dhaka: 09:00 UTC is 15:00 local on the 18th.
    seedBeats(CHILD_ID, "2026-08-18T09:00:00.000Z", 21);

    for (const range of ["today", "week", "month"] as const) {
      const res = await getLearningTime(CHILD_ID, `?range=${range}`);

      expect(res.status).toBe(200);
      assertContract(
        LearningTimeReadResponseSchema,
        res.body,
        "GET /api/children/{id}/learning-time",
      );
      expect(res.body.data.range).toBe(range);
      expect(res.body.data.minutes).toBe(11);
    }
  });

  it("bounds each window on a local calendar edge, not on now", async () => {
    const today = await getLearningTime(CHILD_ID, "?range=today");
    const week = await getLearningTime(CHILD_ID, "?range=week");
    const month = await getLearningTime(CHILD_ID, "?range=month");

    // 18:00 UTC is midnight in Dhaka (+06). 18 August 2026 is a Tuesday, so the
    // week starts on Monday the 17th.
    expect(today.body.data.from).toBe("2026-08-17T18:00:00.000Z");
    expect(today.body.data.to).toBe("2026-08-18T18:00:00.000Z");
    expect(week.body.data.from).toBe("2026-08-16T18:00:00.000Z");
    expect(month.body.data.from).toBe("2026-07-31T18:00:00.000Z");
  });

  it("excludes events outside the window it was asked for", async () => {
    // 17:30 UTC on the 17th is 23:30 local — yesterday, in the same week.
    seedBeats(CHILD_ID, "2026-08-17T17:30:00.000Z", 21);

    const today = await getLearningTime(CHILD_ID, "?range=today");
    const week = await getLearningTime(CHILD_ID, "?range=week");

    expect(today.body.data.minutes).toBe(0);
    expect(week.body.data.minutes).toBe(11);
  });

  it("splits a sitting that crosses local midnight across the two days", async () => {
    // 23:58 local on the 17th through 00:04 on the 18th, unbroken.
    seedBeats(CHILD_ID, "2026-08-17T17:58:00.000Z", 13);

    const today = await getLearningTime(CHILD_ID, "?range=today");
    // Four beats fall before midnight; nine after. The pre-midnight half is
    // credited to the 17th and is invisible here.
    expect(today.body.data.minutes).toBe(5);
  });

  it("counts only this child's events", async () => {
    seedBeats(OTHER_CHILD_ID, "2026-08-18T09:00:00.000Z", 21);

    const res = await getLearningTime(CHILD_ID, "?range=today");

    expect(res.body.data.minutes).toBe(0);
  });

  it("returns a 404 envelope for another parent's child", async () => {
    const res = await getLearningTime(OTHER_CHILD_ID, "?range=today");

    // 404, not 403: a 403 would confirm the profile exists and belongs to
    // somebody, which is what a probe is after (NFR-SAFE-02).
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a missing, unknown or extra query parameter", async () => {
    const missing = await getLearningTime(CHILD_ID, "");
    const unknown = await getLearningTime(CHILD_ID, "?range=yesterday");
    const extra = await getLearningTime(CHILD_ID, "?range=today&childId=other");

    for (const res of [missing, unknown, extra]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("windows the query on the indexed pair rather than filtering in memory", async () => {
    await getLearningTime(CHILD_ID, "?range=today");

    expect(db.eventFindMany).toHaveBeenCalledWith({
      where: {
        childId: CHILD_ID,
        occurredAt: {
          gte: new Date("2026-08-17T18:00:00.000Z"),
          lt: new Date("2026-08-18T18:00:00.000Z"),
        },
      },
      select: { occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });
  });

  it("rests on a composite index the stub cannot exercise", () => {
    // Rule 4 of the stubbing exception: whether Postgres uses the index needs a
    // real database and an `EXPLAIN`. What is assertable here is that the index
    // the query above was written for still exists, in the column order that
    // makes the range scan possible.
    const schemaPath = fileURLToPath(
      new URL("../../../../packages/db/prisma/schema.prisma", import.meta.url),
    );
    const schema = readFileSync(schemaPath, "utf8");
    const model = schema.slice(
      schema.indexOf("model SessionEvent {"),
      schema.indexOf("model WeeklyReport {"),
    );

    expect(model).toContain("@@index([childId, occurredAt])");
  });
});
