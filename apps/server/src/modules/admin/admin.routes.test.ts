import {
  AdminIdentityResponseSchema,
  PlatformOverviewResponseSchema,
} from "@kidlearn/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";
import request from "../../shared/testing/request.js";

const ME_PATH = "/api/admin/me";
const OVERVIEW_PATH = "/api/admin/analytics/overview";

/** Wednesday 19 August 2026, midday in Dhaka (UTC+6). */
const NOW = new Date("2026-08-19T06:00:00.000Z");
/** Local Monday 17 August 00:00 Dhaka — the start of `NOW`'s week. */
const WEEK_FROM = new Date("2026-08-16T18:00:00.000Z");
/** Local 19 August 00:00 Dhaka — the start of `NOW`'s day. */
const DAY_FROM = new Date("2026-08-18T18:00:00.000Z");

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const ADMIN_USER_ID = "user_admin_1";
const PARENT_USER_ID = "user_parent_1";

const ADMIN_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "reviewer@kidlearn.test",
  name: "Reviewer One",
  role: "admin",
  authUserId: ADMIN_USER_ID,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

type CompletionRow = { childId: string; completedAt: Date | null };
type EventRow = { childId: string; occurredAt: Date };

const store = vi.hoisted(() => ({
  admins: [] as Array<Record<string, unknown> & { authUserId: string | null }>,
  parentCount: 0,
  childCount: 0,
  completions: [] as CompletionRow[],
  events: [] as EventRow[],
}));

const db = vi.hoisted(() => ({
  adminFindUnique: vi.fn(),
  parentCount: vi.fn(),
  childCount: vi.fn(),
  progressCount: vi.fn(),
  eventGroupBy: vi.fn(),
  // A stray parent-provisioning read fails loudly: no admin route may create a Parent row.
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  accountFindFirst: vi.fn(),
  sessionDeleteMany: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    // better-auth opens a transaction before consulting disableSignUp; the stub needs one for the rejection test to reach the guard.
    $transaction: async (fn: unknown) =>
      typeof fn === "function" ? fn({}) : undefined,
    adminUser: { findUnique: db.adminFindUnique },
    parent: {
      count: db.parentCount,
      findUnique: db.parentFindUnique,
      upsert: db.parentUpsert,
    },
    childProfile: { count: db.childCount },
    lessonProgress: { count: db.progressCount },
    sessionEvent: { groupBy: db.eventGroupBy },
    account: { findFirst: db.accountFindFirst },
    session: { deleteMany: db.sessionDeleteMany },
  },
}));

const { app } = await import("../../app.js");
const { auth } = await import("../../config/auth.js");

function mockSession(userId: string, createdAt: Date | null = new Date()) {
  // Only the fields the guards read are supplied; the deep better-auth return type is narrowed here.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: { id: userId, email: "someone@example.com", name: "Someone" },
    session: { id: `session_${userId}`, userId, createdAt },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

function mockNoSession() {
  vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
}

beforeEach(() => {
  store.admins = [];
  store.parentCount = 0;
  store.childCount = 0;
  store.completions = [];
  store.events = [];
  for (const fn of Object.values(db)) fn.mockReset();

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);

  db.adminFindUnique.mockImplementation(
    async ({ where }: { where: { authUserId?: string; email?: string } }) =>
      store.admins.find(
        (row) =>
          (where.authUserId !== undefined &&
            row.authUserId === where.authUserId) ||
          (where.email !== undefined && row.email === where.email),
      ) ?? null,
  );

  db.parentCount.mockImplementation(async () => store.parentCount);
  db.childCount.mockImplementation(async () => store.childCount);

  db.progressCount.mockImplementation(
    async ({ where }: { where: { completedAt: { gte: Date; lt: Date } } }) =>
      store.completions.filter(
        (row) =>
          row.completedAt !== null &&
          row.completedAt >= where.completedAt.gte &&
          row.completedAt < where.completedAt.lt,
      ).length,
  );

  // Models SQL GROUP BY childId: one row per distinct child, grouped column only.
  db.eventGroupBy.mockImplementation(
    async ({
      by,
      where,
    }: {
      by: string[];
      where: { occurredAt: { gte: Date; lt: Date } };
    }) => {
      const inWindow = store.events.filter(
        (row) =>
          row.occurredAt >= where.occurredAt.gte &&
          row.occurredAt < where.occurredAt.lt,
      );
      if (!by.includes("childId")) return inWindow.map(() => ({}));
      const seen = new Set<string>();
      for (const row of inWindow) seen.add(row.childId);
      return [...seen].map((childId) => ({ childId }));
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("requireAdmin", () => {
  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    mockNoSession();

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(db.adminFindUnique).not.toHaveBeenCalled();
  });

  it("returns 403 FORBIDDEN for a signed-in parent, whose session is perfectly valid", async () => {
    mockSession(PARENT_USER_ID);
    // A Google sign-in never writes an AdminUser row; that absence is the authorisation check.

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("looks the admin up by the session's user id, never by anything the caller sent", async () => {
    mockSession(PARENT_USER_ID);

    await request(app).get(ME_PATH).set("X-Admin-Id", ADMIN_ROW.id);

    expect(db.adminFindUnique).toHaveBeenCalledWith({
      where: { authUserId: PARENT_USER_ID },
    });
  });

  it("never provisions an admin the way requireParent provisions a parent", async () => {
    mockSession(PARENT_USER_ID);

    const res = await request(app).get(ME_PATH);

    // Admins exist only via the seed script; a missing row is a mistake, not a new account.
    expect(res.status).toBe(403);
    expect(db.parentUpsert).not.toHaveBeenCalled();
  });

  it("passes an admin session through", async () => {
    store.admins = [ADMIN_ROW];
    mockSession(ADMIN_USER_ID);

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(200);
  });

  it("refuses an AdminUser row whose identity link was cleared", async () => {
    // ON DELETE SET NULL keeps the history row, but the account must no longer be able to sign in.
    store.admins = [{ ...ADMIN_ROW, authUserId: null }];
    mockSession(ADMIN_USER_ID);

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(403);
  });

  it("passes an admin session just inside the 12-hour limit", async () => {
    store.admins = [ADMIN_ROW];
    mockSession(ADMIN_USER_ID, new Date(NOW.getTime() - TWELVE_HOURS_MS));

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(200);
    expect(db.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("refuses and revokes an admin session signed in more than 12 hours ago", async () => {
    store.admins = [ADMIN_ROW];
    // Activity would slide better-auth's expiry forward; the limit counts from sign-in, so it must not matter.
    mockSession(ADMIN_USER_ID, new Date(NOW.getTime() - TWELVE_HOURS_MS - 1));

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(db.sessionDeleteMany).toHaveBeenCalledWith({
      where: { id: `session_${ADMIN_USER_ID}` },
    });
  });

  it("treats an admin session with no createdAt as expired", async () => {
    store.admins = [ADMIN_ROW];
    mockSession(ADMIN_USER_ID, null);

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(401);
  });

  it("leaves an old parent session to requireParent — the limit is for admins", async () => {
    mockSession(PARENT_USER_ID, new Date("2026-07-01T00:00:00.000Z"));

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(403);
    expect(db.sessionDeleteMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/me", () => {
  const OPERATION = "GET /api/admin/me";

  it("returns the signed-in administrator", async () => {
    store.admins = [ADMIN_ROW];
    mockSession(ADMIN_USER_ID);

    const res = await request(app).get(ME_PATH);

    expect(res.status).toBe(200);
    assertContract(AdminIdentityResponseSchema, res.body, OPERATION);
    expect(res.body.data).toEqual({
      id: ADMIN_ROW.id,
      name: ADMIN_ROW.name,
      email: ADMIN_ROW.email,
    });
  });

  it("leaks neither the role nor the identity link", async () => {
    store.admins = [ADMIN_ROW];
    mockSession(ADMIN_USER_ID);

    const res = await request(app).get(ME_PATH);

    // Both fields are the kind that gets added back by accident, so they are stated explicitly.
    expect(res.body.data).not.toHaveProperty("role");
    expect(res.body.data).not.toHaveProperty("authUserId");
  });
});

describe("principal separation (§4.3)", () => {
  it("refuses an admin session on a parent-only route", async () => {
    store.admins = [ADMIN_ROW];
    mockSession(ADMIN_USER_ID);
    db.parentFindUnique.mockResolvedValue(null);
    db.accountFindFirst.mockResolvedValue(null);

    const res = await request(app).get("/api/auth/me");

    // Neither guard accepts the other's session: the two surfaces stay disjoint both ways.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.parentUpsert).not.toHaveBeenCalled();
  });

  it("refuses a parent session on every admin route", async () => {
    mockSession(PARENT_USER_ID);

    const [me, overview] = await Promise.all([
      request(app).get(ME_PATH),
      request(app).get(OVERVIEW_PATH),
    ]);

    expect(me.status).toBe(403);
    expect(overview.status).toBe(403);
    expect(db.parentCount).not.toHaveBeenCalled();
  });
});

describe("no self-service admin signup", () => {
  it("rejects POST /api/auth/sign-up/email for everybody", async () => {
    const res = await request(app).post("/api/auth/sign-up/email").send({
      email: "someone@example.com",
      password: "a-long-enough-admin-password",
      name: "Someone",
    });

    // disableSignUp keeps the shared better-auth user table safe: nobody can mint an admin over HTTP, so the seed script is the only door.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  });
});

describe("GET /api/admin/analytics/overview", () => {
  const OPERATION = "GET /api/admin/analytics/overview";

  beforeEach(() => {
    store.admins = [ADMIN_ROW];
    mockSession(ADMIN_USER_ID);
  });

  it("returns the four platform counters", async () => {
    store.parentCount = 2;
    store.childCount = 3;
    store.completions = [
      { childId: "child_1", completedAt: new Date("2026-08-17T04:00:00.000Z") },
      { childId: "child_2", completedAt: new Date("2026-08-19T05:00:00.000Z") },
      // One in the week before, which must not be counted.
      { childId: "child_1", completedAt: new Date("2026-08-12T04:00:00.000Z") },
      // A lesson started and never finished.
      { childId: "child_3", completedAt: null },
    ];
    store.events = [
      { childId: "child_1", occurredAt: new Date("2026-08-19T03:00:00.000Z") },
      { childId: "child_1", occurredAt: new Date("2026-08-19T05:30:00.000Z") },
      { childId: "child_2", occurredAt: new Date("2026-08-18T19:00:00.000Z") },
      // Yesterday, locally — outside the window.
      { childId: "child_3", occurredAt: new Date("2026-08-18T10:00:00.000Z") },
    ];

    const res = await request(app).get(OVERVIEW_PATH);

    expect(res.status).toBe(200);
    assertContract(PlatformOverviewResponseSchema, res.body, OPERATION);
    expect(res.body.data).toEqual({
      totalParents: 2,
      totalChildren: 3,
      lessonsCompletedThisWeek: 2,
      // Children, not events: child_1 sent two beats and counts once.
      dauToday: 2,
      generatedAt: NOW.toISOString(),
    });
  });

  it("windows both counts on APP_TIMEZONE, not on UTC", async () => {
    await request(app).get(OVERVIEW_PATH);

    // Rule 2 of the stub exception: assert the window itself. Dhaka is UTC+6, so a local Monday and midnight both begin at 18:00 the day before.
    expect(db.progressCount).toHaveBeenCalledWith({
      where: { completedAt: { gte: WEEK_FROM, lt: expect.any(Date) } },
    });
    expect(db.eventGroupBy).toHaveBeenCalledWith({
      by: ["childId"],
      where: { occurredAt: { gte: DAY_FROM, lt: expect.any(Date) } },
    });
  });

  it("reads nothing that could identify a household", async () => {
    await request(app).get(OVERVIEW_PATH);

    // NFR-SAFE-02: reviewers have no relationship to any family, so the only per-child column read is the id groupBy needs.
    expect(db.eventGroupBy.mock.calls[0][0]).toEqual({
      by: ["childId"],
      where: { occurredAt: { gte: DAY_FROM, lt: expect.any(Date) } },
    });
    expect(db.parentFindUnique).not.toHaveBeenCalled();
  });

  it("answers honest zeroes on an empty deployment", async () => {
    const res = await request(app).get(OVERVIEW_PATH);

    expect(res.status).toBe(200);
    assertContract(PlatformOverviewResponseSchema, res.body, OPERATION);
    expect(res.body.data).toMatchObject({
      totalParents: 0,
      totalChildren: 0,
      lessonsCompletedThisWeek: 0,
      dauToday: 0,
    });
  });
});
