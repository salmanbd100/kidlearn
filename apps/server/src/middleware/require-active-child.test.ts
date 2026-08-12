/**
 * See the note at the top of `require-parent.test.ts` about stubbing
 * `lib/prisma.js` in the absence of a test database.
 */
import type { ChildProfile, Parent } from "@kidlearn/db";
import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  accountFindFirst: vi.fn(),
  childFindFirst: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique, upsert: db.parentUpsert },
    account: { findFirst: db.accountFindFirst },
    childProfile: { findFirst: db.childFindFirst },
  },
}));

const { auth } = await import("../lib/auth.js");
const { errorHandler } = await import("./error-handler.js");
const { requireParent } = await import("./require-parent.js");
const { activeChild, requireActiveChild } = await import(
  "./require-active-child.js"
);

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

const CHILD: ChildProfile = {
  id: "child_1",
  firstName: "Ava",
  age: 4,
  gradeLevel: "NURSERY",
  preferredLanguage: "bn",
  avatarCharacterId: null,
  parentId: PARENT.id,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function mockSession(activeChildProfileId: string | null) {
  // `getSession` returns a deep better-auth type; only the fields the
  // middleware reads are supplied, so the shape is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: { id: "session_1", userId: SESSION_USER.id, activeChildProfileId },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

function buildProbeApp(): Express {
  const app = express();
  app.get("/probe", requireParent, requireActiveChild, (req, res) => {
    const child = activeChild(req);
    res.json({
      childId: child.id,
      gradeLevel: child.gradeLevel,
      preferredLanguage: child.preferredLanguage,
    });
  });
  app.use(errorHandler);
  return app;
}

describe("requireActiveChild", () => {
  beforeEach(() => {
    db.parentFindUnique.mockReset();
    db.childFindFirst.mockReset();
    db.parentFindUnique.mockResolvedValue(PARENT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    mockSession(null);

    const res = await request(buildProbeApp()).get("/probe");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: "FORBIDDEN", message: "No active child profile" },
    });
    expect(db.childFindFirst).not.toHaveBeenCalled();
  });

  it("returns 403 FORBIDDEN when the active profile belongs to another parent", async () => {
    mockSession("child_of_someone_else");
    // The ownership condition is part of the query, so a foreign child is
    // simply not found.
    db.childFindFirst.mockResolvedValue(null);

    const res = await request(buildProbeApp()).get("/probe");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("scopes the profile lookup to the signed-in parent", async () => {
    mockSession(CHILD.id);
    db.childFindFirst.mockResolvedValue(CHILD);

    await request(buildProbeApp()).get("/probe");

    expect(db.childFindFirst).toHaveBeenCalledWith({
      where: { id: CHILD.id, parentId: PARENT.id },
    });
  });

  it("attaches the child profile, carrying its grade and preferred language", async () => {
    mockSession(CHILD.id);
    db.childFindFirst.mockResolvedValue(CHILD);

    const res = await request(buildProbeApp()).get("/probe");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      childId: "child_1",
      gradeLevel: "NURSERY",
      preferredLanguage: "bn",
    });
  });
});

describe("activeChild", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed with a 403 when a route is mounted without requireActiveChild", async () => {
    const app = express();
    app.get("/unguarded", (req, res) => {
      // Deliberately no requireActiveChild — simulates a wiring mistake.
      res.json({ childId: activeChild(req).id });
    });
    app.use(errorHandler);

    const res = await request(app).get("/unguarded");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
