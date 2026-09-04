/**
 * See the note at the top of `require-parent.test.ts` about stubbing
 * `lib/prisma.js` in the absence of a test database.
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
const { requireConsent } = await import("./require-consent.js");

const SESSION_USER = {
  id: "user_1",
  email: "parent@example.com",
  name: "Parent One",
  image: null,
};

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
    pinLockoutStrikes: 0,
    pinLockedUntil: null,
    deleteToken: null,
    deleteTokenExpiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function mockSession() {
  // Narrowed at this boundary — only the fields the guards read are supplied.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: { id: "session_1", userId: SESSION_USER.id },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

/** Simulates file 11's `POST /api/children`. */
function buildChildCreateApp(): Express {
  const app = express();
  app.post("/children", requireParent, requireConsent, (_req, res) => {
    res.status(201).json({ data: { id: "child_1" } });
  });
  app.use(errorHandler);
  return app;
}

describe("requireConsent", () => {
  beforeEach(() => {
    db.parentFindUnique.mockReset();
    mockSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks child-profile creation until COPPA consent is recorded", async () => {
    db.parentFindUnique.mockResolvedValue(parentRow({ consentGivenAt: null }));

    const res = await request(buildChildCreateApp()).post("/children");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CONSENT_REQUIRED");
  });

  it("allows child-profile creation once consent exists", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({
        consentGivenAt: new Date("2026-07-01T00:00:00.000Z"),
        consentVersion: "2026-06-v1",
      }),
    );

    const res = await request(buildChildCreateApp()).post("/children");

    expect(res.status).toBe(201);
  });
});
