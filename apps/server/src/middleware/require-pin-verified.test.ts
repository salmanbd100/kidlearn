/**
 * See the note at the top of `require-parent.test.ts`: there is no test database
 * yet, so `lib/prisma.js` is stubbed and `auth.api.getSession` is spied on. The
 * behaviour under test here is pure gate logic — no row is written.
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
const { requireParent } = await import("./require-parent.js");
const { requirePinVerified } = await import("./require-pin-verified.js");

const SESSION_USER = {
  id: "user_1",
  email: "parent@example.com",
  name: "Parent One",
  image: null,
};

const PIN_HASH = "$argon2id$v=19$m=65536,t=3,p=4$stub$stub";

function parentRow(overrides: Partial<Parent> = {}): Parent {
  return {
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
    ...overrides,
  };
}

function mockSession(pinVerifiedUntil: Date | null = null) {
  // `getSession` returns a deep better-auth type; only the fields the gate
  // reads are supplied, so the shape is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: {
      id: "session_1",
      userId: SESSION_USER.id,
      activeChildProfileId: null,
      pinVerifiedUntil,
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

/** Stands in for the settings/dashboard routes of files 28–30. */
function buildGatedApp(): Express {
  const app = express();
  app.get("/settings", requireParent, requirePinVerified, (_req, res) => {
    res.json({ data: { ok: true } });
  });
  app.use(errorHandler);
  return app;
}

describe("requirePinVerified", () => {
  beforeEach(() => {
    db.parentFindUnique.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells a parent with no PIN yet to set one up", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(parentRow({ pinHash: null }));

    const res = await request(buildGatedApp()).get("/settings");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_REQUIRED");
  });

  it("blocks a session that has never verified its PIN", async () => {
    mockSession(null);
    db.parentFindUnique.mockResolvedValue(parentRow({ pinHash: PIN_HASH }));

    const res = await request(buildGatedApp()).get("/settings");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_VERIFICATION_REQUIRED");
  });

  it("blocks a session whose 15-minute grant has expired", async () => {
    mockSession(new Date(Date.now() - 1_000));
    db.parentFindUnique.mockResolvedValue(parentRow({ pinHash: PIN_HASH }));

    const res = await request(buildGatedApp()).get("/settings");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_VERIFICATION_REQUIRED");
  });

  it("lets a session with a live grant through", async () => {
    mockSession(new Date(Date.now() + 5 * 60_000));
    db.parentFindUnique.mockResolvedValue(parentRow({ pinHash: PIN_HASH }));

    const res = await request(buildGatedApp()).get("/settings");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
  });

  it("still requires authentication first — an anonymous request is 401, not 403", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(buildGatedApp()).get("/settings");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
