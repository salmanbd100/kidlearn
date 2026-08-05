/**
 * `general.md §5` forbids mocking `@kidlearn/db` — service tests belong against a
 * real test database. There is no test database wired up yet (no Vitest DB
 * harness, `document/project-requirement-details.md §12` assumption 8), so these
 * tests stub `lib/prisma.js` under the recorded exception in `general.md §5`
 * ("apps/server stubs lib/prisma.js until the test database lands"). Read the
 * four rules there before adding a stubbed suite — they exist because two
 * defects have already shipped through this gap.
 *
 * When the test-database harness lands, rewrite the provisioning assertions
 * against real rows: the behaviour under test (exactly one `Parent` per `User`)
 * is precisely the kind of thing a stub can agree with while a migration is
 * broken.
 */
import type { Parent } from "@kidlearn/db";
import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  accountFindFirst: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique, upsert: db.parentUpsert },
    account: { findFirst: db.accountFindFirst },
  },
}));

const { auth } = await import("../lib/auth.js");
const { errorHandler } = await import("./error-handler.js");
const { authContext, requireParent } = await import("./require-parent.js");

const SESSION_USER = {
  id: "user_1",
  email: "parent@example.com",
  name: "Parent One",
  image: "https://example.com/avatar.png",
};

/** A minimal but complete `Parent` row, as Prisma would return it. */
function parentRow(overrides: Partial<Parent> = {}): Parent {
  return {
    id: "parent_1",
    userId: SESSION_USER.id,
    googleId: "google_profile_1",
    email: SESSION_USER.email,
    name: SESSION_USER.name,
    avatarUrl: SESSION_USER.image,
    pinHash: null,
    consentGivenAt: null,
    consentVersion: null,
    pinFailedCount: 0,
    pinLockedUntil: null,
    deleteToken: null,
    deleteTokenExpiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** Makes `auth.api.getSession` resolve to a session, or to null when omitted. */
function mockSession(activeChildProfileId: string | null = null) {
  // `getSession` returns a deep better-auth type; the test only supplies the
  // fields `requireParent` reads, so the shape is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: { id: "session_1", userId: SESSION_USER.id, activeChildProfileId },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

function mockNoSession() {
  vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
}

/** A throwaway app that exposes whatever `requireParent` attached. */
function buildProbeApp(): Express {
  const app = express();
  app.get("/probe", requireParent, (req, res) => {
    const { parent, session } = authContext(req);
    res.json({
      parentId: parent.id,
      activeChildProfileId: session.activeChildProfileId ?? null,
    });
  });
  app.use(errorHandler);
  return app;
}

describe("requireParent", () => {
  beforeEach(() => {
    db.parentFindUnique.mockReset();
    db.parentUpsert.mockReset();
    db.accountFindFirst.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a 401 UNAUTHORIZED envelope when the request carries no session", async () => {
    mockNoSession();

    const res = await request(buildProbeApp()).get("/probe");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    expect(db.parentFindUnique).not.toHaveBeenCalled();
  });

  it("creates the Parent row on a first-time user's first request", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(null);
    db.accountFindFirst.mockResolvedValue({ accountId: "google_profile_1" });
    db.parentUpsert.mockResolvedValue(parentRow());

    const res = await request(buildProbeApp()).get("/probe");

    expect(res.status).toBe(200);
    expect(res.body.parentId).toBe("parent_1");
    expect(db.parentUpsert).toHaveBeenCalledTimes(1);
    expect(db.parentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: SESSION_USER.id },
        create: expect.objectContaining({
          userId: SESSION_USER.id,
          // Taken from the better-auth `account` row, not from the session.
          googleId: "google_profile_1",
          email: SESSION_USER.email,
        }),
      }),
    );
  });

  it("reuses the existing Parent row on later requests instead of creating a second one", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(parentRow());

    const app = buildProbeApp();
    const first = await request(app).get("/probe");
    const second = await request(app).get("/probe");

    expect(first.body.parentId).toBe("parent_1");
    expect(second.body.parentId).toBe("parent_1");
    expect(db.parentUpsert).not.toHaveBeenCalled();
    expect(db.accountFindFirst).not.toHaveBeenCalled();
  });

  it("refuses to provision a Parent for a user who did not sign in with Google", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(null);
    // An admin signing in with credentials (file 31) has no google account row.
    db.accountFindFirst.mockResolvedValue(null);

    const res = await request(buildProbeApp()).get("/probe");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.parentUpsert).not.toHaveBeenCalled();
  });

  it("exposes the session's activeChildProfileId so profile switching needs no re-auth", async () => {
    mockSession("child_7");
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(buildProbeApp()).get("/probe");

    expect(res.body.activeChildProfileId).toBe("child_7");
  });
});

describe("authContext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed with a 401 when a route is mounted without requireParent", async () => {
    const app = express();
    app.get("/unguarded", (req, res) => {
      // Deliberately no requireParent — simulates a wiring mistake.
      const { parent } = authContext(req);
      res.json({ parentId: parent.id });
    });
    app.use(errorHandler);

    const res = await request(app).get("/unguarded");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
