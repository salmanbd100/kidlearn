/**
 * The screen-time surface: the parent's settings, the student's status read, and
 * the `423` the two content-start routes now answer with.
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four rules that bound it shape this suite:
 *
 *  - **Rule 1, stub state not answers.** `store.settings` is one row keyed by
 *    child, and `screenTimeSetting.upsert` applies Prisma's own create/update
 *    semantics to it. So "PATCH twice leaves one row" is a second request meeting
 *    what the first wrote, not a mock told to say so — which is the only way that
 *    assertion means anything.
 *  - **Rule 2, assert the query.** A stub cannot show that a draft lesson stayed
 *    invisible, so the `where` clause carrying `status: "published"` is asserted
 *    directly on the gated route, alongside the block itself.
 *  - **Rule 3, `where` is not the whole guard.** The in-progress exemption turns
 *    on `completedAt` being null on a row the gate *reads*, so the exemption tests
 *    assert the response, not the call.
 *  - **Rule 4, name what the stub cannot prove.** `ScreenTimeSetting.childId` is
 *    `@unique`, which is what makes the upsert single-row under concurrency; that
 *    is asserted against `schema.prisma` below, and a real test replaces it when
 *    the harness lands.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ChildProfile, Parent } from "@kidlearn/db";
import {
  ScreenTimeSettingResponseSchema,
  ScreenTimeStatusResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";
import { LESSON_RESUME_GRACE_MS } from "../services/screenTimeService.js";

const CHILD_ID = "child_1";
const OTHER_CHILD_ID = "child_2";
const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_LESSON_ID = "44444444-4444-4444-8444-444444444444";
const STORY_ID = "55555555-5555-4555-8555-555555555555";

type SettingRow = {
  id: string;
  childId: string;
  dailyLimitMinutes: number | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  /** At most one row per child — the shape the `@unique` column guarantees. */
  settings: [] as unknown[],
  /** Presence rows the minutes are derived from. */
  events: [] as Date[],
  /**
   * `null` = never opened; a row with `completedAt: null` and a recent
   * `updatedAt` = in progress. The gate reads both — an incomplete row older
   * than `LESSON_RESUME_GRACE_MS` is a new start, not a resume.
   */
  lessonProgress: null as {
    completedAt: Date | null;
    updatedAt: Date;
  } | null,
}));

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  childFindFirst: vi.fn(),
  screenTimeFindUnique: vi.fn(),
  screenTimeUpsert: vi.fn(),
  sessionEventFindMany: vi.fn(),
  sessionEventFindFirst: vi.fn(),
  lessonProgressFindUnique: vi.fn(),
  lessonFindFirst: vi.fn(),
  lessonFindUnique: vi.fn(),
  storyFindFirst: vi.fn(),
  transaction: vi.fn(),
  progressCreate: vi.fn(),
  progressUpdate: vi.fn(),
  sessionEventCreate: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    screenTimeSetting: {
      findUnique: db.screenTimeFindUnique,
      upsert: db.screenTimeUpsert,
    },
    sessionEvent: {
      findMany: db.sessionEventFindMany,
      findFirst: db.sessionEventFindFirst,
      create: db.sessionEventCreate,
    },
    lessonProgress: {
      findUnique: db.lessonProgressFindUnique,
      create: db.progressCreate,
      update: db.progressUpdate,
    },
    lesson: { findFirst: db.lessonFindFirst, findUnique: db.lessonFindUnique },
    story: { findFirst: db.storyFindFirst },
    $transaction: db.transaction,
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
  /** Whether this session holds a live PIN grant. */
  isPinVerified?: boolean;
};

function signInAs({
  child = childProfile(),
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
  db.parentFindUnique.mockResolvedValue(PARENT);
  // `loadOwnedChild` and `requireActiveChild` both filter on `parentId`, so a
  // child of another parent is simply not found — which is what the 404 test
  // below drives by passing `null`.
  db.childFindFirst.mockResolvedValue(child);
}

function settings(): SettingRow[] {
  return store.settings as SettingRow[];
}

/** Seeds enough beats to make `getLearningMinutes` report `minutes`. */
function seedMinutes(minutes: number) {
  const start = new Date("2026-08-19T06:00:00.000Z").getTime();
  // One beat every 30s: the density rule credits the span plus a 30s tail, so
  // `n` beats are `n * 0.5` minutes.
  store.events = Array.from(
    { length: minutes * 2 },
    (_, index) => new Date(start + index * 30_000),
  );
}

function seedSetting(row: Partial<SettingRow>) {
  store.settings = [
    {
      id: "setting_1",
      childId: CHILD_ID,
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: null,
      updatedAt: new Date("2026-08-19T00:00:00.000Z"),
      ...row,
    },
  ];
}

function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

beforeEach(() => {
  store.settings = [];
  store.events = [];
  store.lessonProgress = null;
  for (const fn of Object.values(db)) fn.mockReset();

  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Midday in Asia/Dhaka (UTC+6), so the default clock is inside any ordinary
  // daytime window and every window test moves it deliberately.
  vi.setSystemTime(new Date("2026-08-19T06:00:00.000Z"));

  db.screenTimeFindUnique.mockImplementation(
    async ({ where }: { where: { childId: string } }) =>
      settings().find((row) => row.childId === where.childId) ?? null,
  );

  db.screenTimeUpsert.mockImplementation(
    async ({
      where,
      create,
      update,
    }: {
      where: { childId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const existing = settings().find((row) => row.childId === where.childId);
      if (existing) {
        Object.assign(existing, update, {
          updatedAt: new Date("2026-08-19T06:00:00.000Z"),
        });
        return existing;
      }
      const row = {
        id: `setting_${settings().length + 1}`,
        updatedAt: new Date("2026-08-19T06:00:00.000Z"),
        ...create,
      } as SettingRow;
      store.settings.push(row);
      return row;
    },
  );

  db.sessionEventFindMany.mockImplementation(
    async ({ where }: { where: { occurredAt: { gte: Date; lt: Date } } }) =>
      (store.events as Date[])
        .filter((at) => at >= where.occurredAt.gte && at < where.occurredAt.lt)
        .map((occurredAt) => ({ occurredAt })),
  );

  db.lessonProgressFindUnique.mockImplementation(
    async () => store.lessonProgress,
  );
  // The heartbeat throttle's "was there a recent beat" lookup. No previous beat
  // by default, so a posted one is always recorded.
  db.sessionEventFindFirst.mockResolvedValue(null);
  db.lessonFindFirst.mockResolvedValue({ id: LESSON_ID });
  db.lessonFindUnique.mockResolvedValue(null);
  db.storyFindFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/children/:id/screen-time", () => {
  it("returns all-null defaults for a child with no policy", async () => {
    signInAs();

    const res = await request(app).get(`/api/children/${CHILD_ID}/screen-time`);

    expect(res.status).toBe(200);
    assertContract(
      ScreenTimeSettingResponseSchema,
      res.body,
      "GET /api/children/{id}/screen-time",
    );
    expect(res.body.data).toEqual({
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: null,
    });
  });

  it("returns the stored policy, times as HH:MM", async () => {
    signInAs();
    seedSetting({
      dailyLimitMinutes: 45,
      windowStart: timeOfDay("07:30"),
      windowEnd: timeOfDay("19:00"),
    });

    const res = await request(app).get(`/api/children/${CHILD_ID}/screen-time`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      dailyLimitMinutes: 45,
      windowStart: "07:30",
      windowEnd: "19:00",
    });
  });

  it("returns 404 for another parent's child", async () => {
    signInAs({ child: null });

    const res = await request(app).get(
      `/api/children/${OTHER_CHILD_ID}/screen-time`,
    );

    // Not 403: a 403 would confirm the profile exists (NFR-SAFE-02).
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 401 without a session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get(`/api/children/${CHILD_ID}/screen-time`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 PIN_VERIFICATION_REQUIRED without a live PIN grant", async () => {
    signInAs({ isPinVerified: false });

    const res = await request(app).get(`/api/children/${CHILD_ID}/screen-time`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_VERIFICATION_REQUIRED");
    expect(db.screenTimeFindUnique).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/children/:id/screen-time", () => {
  // `send` types its argument as `string | object`, and every body below — valid
  // or not — is an object; a malformed *shape* is what these tests are about, not
  // a malformed request.
  function patch(body: object, childId = CHILD_ID) {
    return request(app)
      .patch(`/api/children/${childId}/screen-time`)
      .send(body);
  }

  it("stores a limit and reads it back unchanged", async () => {
    signInAs();

    const res = await patch({
      dailyLimitMinutes: 30,
      windowStart: null,
      windowEnd: null,
    });

    expect(res.status).toBe(200);
    assertContract(
      ScreenTimeSettingResponseSchema,
      res.body,
      "PATCH /api/children/{id}/screen-time",
    );
    expect(res.body.data).toEqual({
      dailyLimitMinutes: 30,
      windowStart: null,
      windowEnd: null,
    });
  });

  it("round-trips a window through the Time(0) columns", async () => {
    signInAs();

    await patch({
      dailyLimitMinutes: null,
      windowStart: "07:00",
      windowEnd: "19:30",
    });
    const res = await request(app).get(`/api/children/${CHILD_ID}/screen-time`);

    expect(res.body.data).toEqual({
      dailyLimitMinutes: null,
      windowStart: "07:00",
      windowEnd: "19:30",
    });
  });

  it("leaves exactly one row when called twice", async () => {
    signInAs();

    await patch({
      dailyLimitMinutes: 15,
      windowStart: null,
      windowEnd: null,
    });
    const second = await patch({
      dailyLimitMinutes: 60,
      windowStart: "08:00",
      windowEnd: "20:00",
    });

    expect(second.body.data).toEqual({
      dailyLimitMinutes: 60,
      windowStart: "08:00",
      windowEnd: "20:00",
    });
    expect(store.settings).toHaveLength(1);
  });

  it("clears a policy when every field is sent as null", async () => {
    signInAs();
    seedSetting({
      dailyLimitMinutes: 30,
      windowStart: timeOfDay("07:00"),
      windowEnd: timeOfDay("19:00"),
    });

    const res = await patch({
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: null,
    });

    expect(res.body.data).toEqual({
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: null,
    });
    expect(store.settings).toHaveLength(1);
  });

  it.each([
    [
      "a limit outside the offered set",
      { dailyLimitMinutes: 17, windowStart: null, windowEnd: null },
    ],
    [
      "a half-set window",
      { dailyLimitMinutes: null, windowStart: "08:00", windowEnd: null },
    ],
    [
      "a malformed time",
      { dailyLimitMinutes: null, windowStart: "8:00", windowEnd: "19:00" },
    ],
    [
      "an unknown key",
      { dailyLimitMinutes: null, windowStart: null, windowEnd: null, extra: 1 },
    ],
    ["a missing field", { dailyLimitMinutes: 30 }],
  ])("returns 400 for %s", async (_label, body) => {
    signInAs();

    const res = await patch(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(db.screenTimeUpsert).not.toHaveBeenCalled();
  });

  it("returns 404 for another parent's child, writing nothing", async () => {
    signInAs({ child: null });

    const res = await patch(
      { dailyLimitMinutes: 30, windowStart: null, windowEnd: null },
      OTHER_CHILD_ID,
    );

    expect(res.status).toBe(404);
    expect(db.screenTimeUpsert).not.toHaveBeenCalled();
  });

  it("returns 403 without a live PIN grant, writing nothing", async () => {
    signInAs({ isPinVerified: false });

    const res = await patch({
      dailyLimitMinutes: 30,
      windowStart: null,
      windowEnd: null,
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_VERIFICATION_REQUIRED");
    expect(db.screenTimeUpsert).not.toHaveBeenCalled();
  });

  /**
   * Rule 4 — the stub cannot prove the database rejects a second row for the same
   * child, so the constraint that makes the upsert single-row is asserted against
   * its declaration. A real test replaces this when the test-database harness
   * lands.
   */
  it("relies on a unique childId, as the schema declares", () => {
    const schema = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../packages/db/prisma/schema.prisma",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const model = schema.slice(
      schema.indexOf("model ScreenTimeSetting"),
      schema.indexOf("model SessionEvent"),
    );

    expect(model).toMatch(/childId\s+String\s+@unique/);
  });
});

describe("GET /api/screen-time/status", () => {
  function getStatus() {
    return request(app).get("/api/screen-time/status");
  }

  it("returns 401 without a session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await getStatus();

    expect(res.status).toBe(401);
  });

  it("returns 403 when the session has no active child", async () => {
    signInAs({ child: null });

    const res = await getStatus();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allows a child with no policy at all", async () => {
    signInAs();
    seedMinutes(120);

    const res = await getStatus();

    expect(res.status).toBe(200);
    assertContract(
      ScreenTimeStatusResponseSchema,
      res.body,
      "GET /api/screen-time/status",
    );
    expect(res.body.data).toEqual({
      allowed: true,
      reason: null,
      minutesToday: 120,
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: null,
    });
  });

  it("allows a child under the limit", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(20);

    const res = await getStatus();

    expect(res.body.data.allowed).toBe(true);
    expect(res.body.data.reason).toBeNull();
    expect(res.body.data.minutesToday).toBe(20);
  });

  it("blocks a child who has reached the limit", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(30);

    const res = await getStatus();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      allowed: false,
      reason: "TIME_LIMIT_REACHED",
      minutesToday: 30,
      dailyLimitMinutes: 30,
      windowStart: null,
      windowEnd: null,
    });
  });

  it("blocks a child outside the access window and names the start", async () => {
    signInAs();
    seedSetting({
      windowStart: timeOfDay("07:00"),
      windowEnd: timeOfDay("19:00"),
    });
    // 22:00 in Asia/Dhaka.
    vi.setSystemTime(new Date("2026-08-19T16:00:00.000Z"));

    const res = await getStatus();

    expect(res.body.data.allowed).toBe(false);
    expect(res.body.data.reason).toBe("OUTSIDE_WINDOW");
    // The lock screen has nothing else to say "come back at…" from.
    expect(res.body.data.windowStart).toBe("07:00");
  });

  /**
   * The status read always asks "may I start something new", so a lesson in
   * progress does not make it say yes. The lesson's own endpoint is where the
   * exemption lives, and the two disagreeing here is correct rather than a bug.
   */
  it("ignores an in-progress lesson", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(45);
    store.lessonProgress = { completedAt: null, updatedAt: new Date() };

    const res = await getStatus();

    expect(res.body.data.allowed).toBe(false);
    expect(db.lessonProgressFindUnique).not.toHaveBeenCalled();
  });
});

describe("the gate on GET /api/content/lessons/:id", () => {
  function getLesson(id = LESSON_ID) {
    return request(app).get(`/api/content/lessons/${id}`);
  }

  it("answers 423 TIME_LIMIT_REACHED for a new lesson once the limit is reached", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(31);

    const res = await getLesson();

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("TIME_LIMIT_REACHED");
    expect(res.body.error.details).toEqual({
      minutesToday: 31,
      dailyLimitMinutes: 30,
      windowStart: null,
      windowEnd: null,
    });
    // The lesson was never looked up: the gate is in front of the read.
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("answers 423 OUTSIDE_WINDOW outside the access window", async () => {
    signInAs();
    seedSetting({
      windowStart: timeOfDay("07:00"),
      windowEnd: timeOfDay("19:00"),
    });
    vi.setSystemTime(new Date("2026-08-19T16:00:00.000Z"));

    const res = await getLesson();

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("OUTSIDE_WINDOW");
    expect(res.body.error.details).toMatchObject({ windowStart: "07:00" });
  });

  /**
   * FR-TIME-03 — the exemption, and the reason it is per-lesson rather than
   * per-child: a child part-way through one lesson may finish *that* lesson, and
   * may not start a different one on the strength of it.
   */
  it("serves a lesson the child is part-way through", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(60);
    store.lessonProgress = { completedAt: null, updatedAt: new Date() };

    const res = await getLesson();

    expect(res.status).not.toBe(423);
    expect(db.lessonFindFirst).toHaveBeenCalled();
    // Rule 2 — the content-safety filter is still on the query the gate let through.
    expect(db.lessonFindFirst.mock.calls[0][0].where).toMatchObject({
      status: "published",
    });
  });

  it("still blocks a different lesson while one is in progress", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(60);
    // The gate looks up progress for the lesson in the path; this one has none.
    db.lessonProgressFindUnique.mockImplementation(
      async ({
        where,
      }: {
        where: { childId_lessonId: { lessonId: string } };
      }) =>
        where.childId_lessonId.lessonId === LESSON_ID
          ? { completedAt: null, updatedAt: new Date() }
          : null,
    );

    const res = await getLesson(OTHER_LESSON_ID);

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("TIME_LIMIT_REACHED");
  });

  it("blocks a replay of a lesson that was already finished", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(60);
    // A completed row is not "in progress" — replaying is starting.
    store.lessonProgress = {
      completedAt: new Date("2026-08-19T05:00:00.000Z"),
      updatedAt: new Date("2026-08-19T05:00:00.000Z"),
    };

    const res = await getLesson();

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("TIME_LIMIT_REACHED");
  });

  /**
   * The bound on the exemption (`LESSON_RESUME_GRACE_MS`). Without it, the row
   * written by the first step report — on an endpoint the gate deliberately never
   * touches — would stand as a permanent pass for that lesson: half-start one
   * thing in the morning and the cap and the window are both off for it forever.
   */
  it("blocks a lesson abandoned longer ago than the resume grace", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(60);
    store.lessonProgress = {
      completedAt: null,
      updatedAt: new Date(Date.now() - LESSON_RESUME_GRACE_MS - 1),
    };

    const res = await getLesson();

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("TIME_LIMIT_REACHED");
    expect(db.lessonFindFirst).not.toHaveBeenCalled();
  });

  it("still serves a lesson touched right on the edge of the grace", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 30 });
    seedMinutes(60);
    store.lessonProgress = {
      completedAt: null,
      updatedAt: new Date(Date.now() - LESSON_RESUME_GRACE_MS),
    };

    const res = await getLesson();

    expect(res.status).not.toBe(423);
  });

  /**
   * The window half of the same bound: a lesson left open at bedtime is not a way
   * back in the next morning before the window opens.
   */
  it("blocks a stale lesson outside the window too", async () => {
    signInAs();
    seedSetting({
      windowStart: timeOfDay("07:00"),
      windowEnd: timeOfDay("19:00"),
    });
    vi.setSystemTime(new Date("2026-08-19T16:00:00.000Z"));
    store.lessonProgress = {
      completedAt: null,
      updatedAt: new Date("2026-08-19T09:00:00.000Z"),
    };

    const res = await getLesson();

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("OUTSIDE_WINDOW");
  });

  it("does not read the policy twice on an unrestricted child", async () => {
    signInAs();

    await getLesson();

    // The cheap path: an allowed child skips the progress lookup entirely.
    expect(db.lessonProgressFindUnique).not.toHaveBeenCalled();
  });
});

describe("the gate on GET /api/content/stories/:id", () => {
  it("answers 423 OUTSIDE_WINDOW outside the access window", async () => {
    signInAs();
    seedSetting({
      windowStart: timeOfDay("07:00"),
      windowEnd: timeOfDay("19:00"),
    });
    vi.setSystemTime(new Date("2026-08-19T16:00:00.000Z"));

    const res = await request(app).get(`/api/content/stories/${STORY_ID}`);

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("OUTSIDE_WINDOW");
    expect(db.storyFindFirst).not.toHaveBeenCalled();
  });

  it("answers 423 TIME_LIMIT_REACHED once the limit is reached", async () => {
    signInAs();
    seedSetting({ dailyLimitMinutes: 15 });
    seedMinutes(20);

    const res = await request(app).get(`/api/content/stories/${STORY_ID}`);

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("TIME_LIMIT_REACHED");
  });
});

/**
 * FR-TIME-03's other half. A lesson already under way must be finishable, which
 * means the endpoints it finishes *through* are never gated — otherwise the
 * exemption on the read would hand a child a lesson they could not complete.
 */
describe("endpoints the gate never touches", () => {
  beforeEach(() => {
    seedSetting({ dailyLimitMinutes: 15 });
    seedMinutes(90);
  });

  it("keeps accepting step reports while the child is blocked", async () => {
    signInAs();
    const progressRow = {
      id: "progress_1",
      childId: CHILD_ID,
      lessonId: LESSON_ID,
      currentStep: "activity",
      completedAt: null,
      startedAt: new Date("2026-08-19T05:00:00.000Z"),
      updatedAt: new Date("2026-08-19T05:00:00.000Z"),
    };
    db.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          lessonProgress: {
            findUnique: async () => null,
            create: db.progressCreate,
            update: db.progressUpdate,
          },
        }),
    );
    db.progressCreate.mockResolvedValue(progressRow);

    const res = await request(app)
      .post(`/api/progress/lessons/${LESSON_ID}/step`)
      .send({ step: "activity", completed: false });

    expect(res.status).toBe(200);
    expect(db.progressCreate).toHaveBeenCalled();
  });

  it("keeps accepting heartbeats while the child is blocked", async () => {
    signInAs();
    db.sessionEventCreate.mockResolvedValue({
      id: "event_1",
      occurredAt: new Date(),
    });

    const res = await request(app).post("/api/events/heartbeat");

    // Time must keep being recorded past the limit (FR-TIME-06): stopping the
    // clock at the moment the limit is hit would make the recorded total short.
    expect(res.status).toBe(200);
    expect(res.body.data.minutesToday).toBe(90);
  });

  it("keeps serving the world list while the child is blocked", async () => {
    signInAs();

    const res = await request(app).get(`/api/content/worlds`);

    // Browsing is not starting. A blocked child gets the friendly screen from the
    // status read, not a wall of errors on every list.
    expect(res.status).not.toBe(423);
  });
});
