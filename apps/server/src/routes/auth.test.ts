/**
 * See the note at the top of `middleware/require-parent.test.ts` about stubbing
 * `lib/prisma.js` in the absence of a test database. No test here drives the real
 * Google round-trip: `auth.api.getSession` is stubbed, and the one test that does
 * exercise better-auth for real (`/api/auth/google`) only makes it build an
 * authorization URL — no network call, no database read.
 */
import type { Parent } from "@kidlearn/db";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  accountFindFirst: vi.fn(),
  userCreate: vi.fn(),
  userFindFirst: vi.fn(),
  verificationCreate: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique, upsert: db.parentUpsert },
    account: { findFirst: db.accountFindFirst },
    // Present so the email/password test can assert nothing was written.
    user: { create: db.userCreate, findFirst: db.userFindFirst },
    // better-auth defaults to `storeStateStrategy: "database"` whenever a
    // database adapter is configured: it persists the OAuth state as a
    // `verification` row and cross-checks it against a signed cookie on the
    // callback. That is why the migration must create this table even though
    // kidlearn never reads it directly.
    verification: { create: db.verificationCreate },
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

function mockSession(activeChildProfileId: string | null = null) {
  // Narrowed at this boundary: `getSession` returns a deep better-auth type and
  // the route only reads the fields set here.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: { id: "session_1", userId: SESSION_USER.id, activeChildProfileId },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    db.parentFindUnique.mockReset();
    db.parentUpsert.mockReset();
    db.accountFindFirst.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a 401 UNAUTHORIZED envelope when no session cookie is sent", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  });

  it("returns the parent payload and active child profile for a valid session", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        parent: {
          id: "parent_1",
          email: SESSION_USER.email,
          hasPin: false,
          consentGivenAt: null,
        },
        activeChildProfileId: null,
      },
    });
  });

  it("reports hasPin without ever exposing the hash", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: "$argon2id$v=19$m=65536,t=3,p=4$secret" }),
    );

    const res = await request(app).get("/api/auth/me");

    expect(res.body.data.parent.hasPin).toBe(true);
    // Grep the raw body, not the parsed object: catches the hash appearing under
    // any key, at any depth.
    expect(res.text).not.toContain("pinHash");
    expect(res.text).not.toContain("argon2id");
  });

  it("surfaces the session's activeChildProfileId so the client can resume the right profile", async () => {
    mockSession("child_7");
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app).get("/api/auth/me");

    expect(res.body.data.activeChildProfileId).toBe("child_7");
  });

  it("is reachable — the better-auth wildcard mounted after it does not swallow it", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app).get("/api/auth/me");

    // A 404/405 here would mean better-auth's `/api/auth/{*any}` won the match.
    expect(res.status).toBe(200);
  });
});

describe("Google-only sign-in", () => {
  beforeEach(() => {
    db.userCreate.mockReset();
    db.verificationCreate.mockReset();
    db.verificationCreate.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: "verification_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to Google's consent screen with our client id and callback", async () => {
    const res = await request(app).get("/api/auth/google");

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    // Host only — the exact authorize path is Google's to change.
    expect(location.host).toBe("accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe(
      process.env.GOOGLE_CLIENT_ID,
    );
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/api/auth/callback/google",
    );
  });

  it("forwards better-auth's OAuth state cookie, without which the callback would fail", async () => {
    const res = await request(app).get("/api/auth/google");

    // Supertest types every header as `string`, but Node hands back an array
    // for set-cookie — normalise before asserting.
    const setCookie: string | string[] = res.headers["set-cookie"] ?? [];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.join("; ")).toContain("state");
  });

  it("does not create a user through the email/password sign-up endpoint", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email: "sneaky@example.com", password: "hunter2hunter2" })
      .set("Content-Type", "application/json");

    // `emailAndPassword: { enabled: false }` means better-auth never registers
    // the route, so it 404s. Either way, no identity may be written.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(db.userCreate).not.toHaveBeenCalled();
  });
});

describe("session cookie hardening", () => {
  it("issues the session cookie HttpOnly, SameSite=Lax, and scoped to 30 days", async () => {
    const context = await auth.$context;
    const { attributes } = context.authCookies.sessionToken;

    expect(attributes.httpOnly).toBe(true);
    expect(attributes.sameSite).toBe("lax");
    expect(attributes.maxAge).toBe(60 * 60 * 24 * 30);
    // `secure` is switched on by NODE_ENV=production; the suite runs as `test`.
    expect(attributes.secure).toBe(false);
  });
});
