/**
 * See the note at the top of `middleware/require-parent.test.ts`: there is no
 * test database yet, so `lib/prisma.js` is stubbed and `auth.api.getSession` is
 * spied on. Argon2 hashing is *not* stubbed — these tests hash and verify for
 * real, which is the point of the PIN suite.
 *
 * What a stub cannot prove is called out where it matters: the deletion test
 * asserts the writes that were issued, not that a row vanished from Postgres.
 */
import type { Parent } from "@kidlearn/db";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  parentUpdate: vi.fn(),
  parentDelete: vi.fn(),
  accountFindFirst: vi.fn(),
  sessionUpdate: vi.fn(),
  childProfileDeleteMany: vi.fn(),
  userDelete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: {
      findUnique: db.parentFindUnique,
      upsert: db.parentUpsert,
      update: db.parentUpdate,
      delete: db.parentDelete,
    },
    account: { findFirst: db.accountFindFirst },
    session: { update: db.sessionUpdate },
    childProfile: { deleteMany: db.childProfileDeleteMany },
    user: { delete: db.userDelete },
    $transaction: db.transaction,
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../lib/auth.js");
const { CONSENT_VERSION } = await import("../lib/consent.js");
const { hashPin } = await import("../lib/pin.js");

const SESSION_USER = {
  id: "user_1",
  email: "parent@example.com",
  name: "Parent One",
  image: null,
};

const CORRECT_PIN = "4821";
const WRONG_PIN = "1111";

/** Hashed once — argon2 is deliberately slow. */
let correctPinHash: string;

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
  // `getSession` returns a deep better-auth type; only the fields the routes
  // read are supplied, so the shape is narrowed at this boundary.
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

/** The `data` written by the most recent `prisma.parent.update`. */
function lastParentUpdateData(): Record<string, unknown> {
  const calls = db.parentUpdate.mock.calls;
  const [{ data }] = calls[calls.length - 1] as [
    { data: Record<string, unknown> },
  ];
  return data;
}

/**
 * The row `prisma.parent.update` writes to: seeded from whatever the test told
 * `parentFindUnique` to return, then carried across every write in the test.
 *
 * A stub that returned a fixed row would hide what this suite now has to guard.
 * The PIN counter is written with Prisma's atomic `{ increment: 1 }`, and only
 * a stub that applies the increment to *stored* state can tell that apart from
 * the lost-update version that computed `snapshot + 1` in this process — where
 * parallel guesses all read the same snapshot and the lockout never trips.
 */
let storedParent: Parent | undefined;

function applyUpdate(row: Parent, data: Record<string, unknown>): Parent {
  const next: Record<string, unknown> = { ...row };
  for (const [field, value] of Object.entries(data)) {
    const isIncrement =
      typeof value === "object" && value !== null && "increment" in value;
    next[field] = isIncrement
      ? Number(next[field] ?? 0) + (value as { increment: number }).increment
      : value;
  }
  // Every key came from a `Parent` column, so the widened record is a `Parent`
  // again; TypeScript cannot follow that through `Object.entries`.
  return next as Parent;
}

beforeEach(async () => {
  correctPinHash ??= await hashPin(CORRECT_PIN);
  for (const mock of Object.values(db)) mock.mockReset();
  storedParent = undefined;
  db.parentUpdate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      // Seeded lazily from the fixture the test handed `parentFindUnique`, so
      // no call site has to opt in. Requests keep their own stale snapshot —
      // which is the point: the stored row is the only thing that accumulates.
      const seed =
        storedParent ??
        ((await db.parentFindUnique.mock.results.at(-1)?.value) as
          | Parent
          | undefined) ??
        parentRow();
      storedParent = applyUpdate(seed, data);
      return storedParent;
    },
  );
  db.sessionUpdate.mockResolvedValue({ id: "session_1" });
  mockSession();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/parent/pin", () => {
  it("requires an authenticated parent", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app)
      .post("/api/parent/pin")
      .send({ pin: CORRECT_PIN });

    expect(res.status).toBe(401);
    expect(db.parentUpdate).not.toHaveBeenCalled();
  });

  it("rejects a PIN that is not exactly four digits", async () => {
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app)
      .post("/api/parent/pin")
      .send({ pin: "12a4" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(db.parentUpdate).not.toHaveBeenCalled();
  });

  it("stores only an argon2id hash, never the PIN itself", async () => {
    db.parentFindUnique.mockResolvedValue(parentRow({ pinHash: null }));

    const res = await request(app)
      .post("/api/parent/pin")
      .send({ pin: CORRECT_PIN });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { hasPin: true } });
    const { pinHash } = lastParentUpdateData();
    expect(typeof pinHash).toBe("string");
    expect(String(pinHash).startsWith("$argon2id$")).toBe(true);
    expect(String(pinHash)).not.toContain(CORRECT_PIN);
    // Nothing PIN-shaped comes back in the body either.
    expect(res.text).not.toContain(CORRECT_PIN);
  });

  it("refuses to replace an existing PIN without the current one", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );

    const res = await request(app)
      .post("/api/parent/pin")
      .send({ pin: "9999" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.parentUpdate).not.toHaveBeenCalled();
  });

  it("refuses to replace an existing PIN when the current one is wrong", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );

    const res = await request(app)
      .post("/api/parent/pin")
      .send({ pin: "9999", currentPin: WRONG_PIN });

    expect(res.status).toBe(403);
    // The failed attempt is counted — the change endpoint is a guessing oracle
    // too, so it shares the brute-force guard.
    expect(lastParentUpdateData()).toMatchObject({
      pinFailedCount: { increment: 1 },
    });
    expect(storedParent?.pinFailedCount).toBe(1);
  });

  it("replaces the PIN when the current one is correct", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );

    const res = await request(app)
      .post("/api/parent/pin")
      .send({ pin: "9999", currentPin: CORRECT_PIN });

    expect(res.status).toBe(200);
    const { pinHash } = lastParentUpdateData();
    expect(String(pinHash).startsWith("$argon2id$")).toBe(true);
    expect(pinHash).not.toBe(correctPinHash);
  });
});

describe("POST /api/parent/pin/verify", () => {
  it("opens a 15-minute grant on the session for the correct PIN", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );
    const before = Date.now();

    const res = await request(app)
      .post("/api/parent/pin/verify")
      .send({ pin: CORRECT_PIN });

    expect(res.status).toBe(200);
    const grantedUntil = new Date(res.body.data.pinVerifiedUntil).getTime();
    expect(grantedUntil).toBeGreaterThanOrEqual(before + 14 * 60_000);
    expect(grantedUntil).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    // The grant lives on the session row, so signing out revokes it.
    expect(db.sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session_1" },
      data: { pinVerifiedUntil: new Date(grantedUntil) },
    });
  });

  it("rejects a wrong PIN with PIN_INVALID and grants nothing", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );

    const res = await request(app)
      .post("/api/parent/pin/verify")
      .send({ pin: WRONG_PIN });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_INVALID");
    expect(db.sessionUpdate).not.toHaveBeenCalled();
    // Counted by the database, not by this process — see `applyUpdate`.
    expect(lastParentUpdateData()).toEqual({
      pinFailedCount: { increment: 1 },
    });
    expect(storedParent?.pinFailedCount).toBe(1);
    expect(storedParent?.pinLockedUntil).toBeNull();
  });

  it("tells a parent with no PIN to set one instead of failing the comparison", async () => {
    db.parentFindUnique.mockResolvedValue(parentRow({ pinHash: null }));

    const res = await request(app)
      .post("/api/parent/pin/verify")
      .send({ pin: CORRECT_PIN });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_REQUIRED");
  });

  it("locks the account for 60 seconds on the fifth consecutive wrong PIN", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash, pinFailedCount: 4 }),
    );
    const before = Date.now();

    const res = await request(app)
      .post("/api/parent/pin/verify")
      .send({ pin: WRONG_PIN });

    expect(res.status).toBe(403);
    const lockedUntil = storedParent?.pinLockedUntil;
    expect(lockedUntil?.getTime()).toBeGreaterThanOrEqual(before + 59_000);
    expect(lockedUntil?.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("keeps counting past the fifth failure, so each cool-off is longer than the last", async () => {
    // The counter used to be zeroed as the lockout started, which handed the
    // attacker a fresh five-per-minute allowance forever: 10,000 PINs in about
    // 33 hours. It now survives the lockout — only a correct PIN clears it.
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash, pinFailedCount: 4 }),
    );

    await request(app).post("/api/parent/pin/verify").send({ pin: WRONG_PIN });
    const firstLockout = storedParent?.pinLockedUntil?.getTime() ?? 0;
    expect(storedParent?.pinFailedCount).toBe(5);

    // The cool-off has passed; the counter has not been forgiven.
    const afterCoolOff = parentRow({
      pinHash: correctPinHash,
      pinFailedCount: 5,
      pinLockedUntil: new Date(Date.now() - 1_000),
    });
    db.parentFindUnique.mockResolvedValue(afterCoolOff);
    storedParent = afterCoolOff;
    const before = Date.now();

    await request(app).post("/api/parent/pin/verify").send({ pin: WRONG_PIN });

    expect(storedParent?.pinFailedCount).toBe(6);
    // Sixth failure → double the window, so ~2 minutes rather than ~1.
    expect(storedParent?.pinLockedUntil?.getTime()).toBeGreaterThanOrEqual(
      before + 119_000,
    );
    expect(firstLockout).toBeLessThan(
      storedParent?.pinLockedUntil?.getTime() ?? 0,
    );
  });

  it("counts a parallel burst of wrong PINs atomically, so the lockout still trips", async () => {
    // The regression this guards: every one of these requests reads the same
    // `pinFailedCount: 0` snapshot in `requireParent`. Computing the next count
    // from that snapshot means all six write 1 and the account never locks —
    // a 4-digit PIN falls in a single burst. The write has to be an atomic
    // `{ increment: 1 }` so the database, not this process, does the counting.
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash, pinFailedCount: 0 }),
    );

    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app).post("/api/parent/pin/verify").send({ pin: WRONG_PIN }),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(403);
    }
    expect(storedParent?.pinFailedCount).toBe(6);
    expect(storedParent?.pinLockedUntil).toBeInstanceOf(Date);
    expect(storedParent?.pinLockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns 429 PIN_LOCKED while the cool-off is running, even for the right PIN", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({
        pinHash: correctPinHash,
        pinLockedUntil: new Date(Date.now() + 30_000),
      }),
    );

    const res = await request(app)
      .post("/api/parent/pin/verify")
      .send({ pin: CORRECT_PIN });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("PIN_LOCKED");
    expect(db.sessionUpdate).not.toHaveBeenCalled();
  });

  it("accepts the correct PIN once the cool-off has passed and clears the guard", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({
        pinHash: correctPinHash,
        pinFailedCount: 4,
        pinLockedUntil: new Date(Date.now() - 1_000),
      }),
    );

    const res = await request(app)
      .post("/api/parent/pin/verify")
      .send({ pin: CORRECT_PIN });

    expect(res.status).toBe(200);
    expect(lastParentUpdateData()).toEqual({
      pinFailedCount: 0,
      pinLockedUntil: null,
    });
  });

  it("never echoes the submitted PIN back to the client", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );

    const res = await request(app)
      .post("/api/parent/pin/verify")
      .send({ pin: WRONG_PIN });

    expect(res.text).not.toContain(WRONG_PIN);
    expect(res.text).not.toContain("pinHash");
  });
});

describe("POST /api/parent/consent", () => {
  it("records the timestamp and the accepted version", async () => {
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app)
      .post("/api/parent/consent")
      .send({ accepted: true, version: CONSENT_VERSION });

    expect(res.status).toBe(200);
    expect(res.body.data.consentVersion).toBe(CONSENT_VERSION);
    expect(new Date(res.body.data.consentGivenAt).getTime()).toBeGreaterThan(0);
    expect(lastParentUpdateData()).toMatchObject({
      consentVersion: CONSENT_VERSION,
    });
  });

  it("rejects a stale consent version with a 409 rather than recording it", async () => {
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app)
      .post("/api/parent/consent")
      .send({ accepted: true, version: "2024-01-v0" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.details).toEqual({ currentVersion: CONSENT_VERSION });
    expect(db.parentUpdate).not.toHaveBeenCalled();
  });

  it("refuses a declined checkbox — `accepted: false` is not a consent record", async () => {
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app)
      .post("/api/parent/consent")
      .send({ accepted: false, version: CONSENT_VERSION });

    expect(res.status).toBe(400);
    expect(db.parentUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent — re-consenting refreshes the record instead of failing", async () => {
    db.parentFindUnique.mockResolvedValue(
      parentRow({
        consentGivenAt: new Date("2026-07-01T00:00:00.000Z"),
        consentVersion: CONSENT_VERSION,
      }),
    );

    const res = await request(app)
      .post("/api/parent/consent")
      .send({ accepted: true, version: CONSENT_VERSION });

    expect(res.status).toBe(200);
    expect(new Date(res.body.data.consentGivenAt).getTime()).toBeGreaterThan(
      new Date("2026-07-01T00:00:00.000Z").getTime(),
    );
  });
});

describe("account deletion", () => {
  const STORED_TOKEN = "c".repeat(64);
  const livePinGrant = () => new Date(Date.now() + 10 * 60_000);

  beforeEach(() => {
    db.childProfileDeleteMany.mockResolvedValue({ count: 2 });
    db.parentDelete.mockResolvedValue(parentRow());
    db.userDelete.mockResolvedValue({ id: SESSION_USER.id });
    db.transaction.mockImplementation(
      (run: (client: unknown) => Promise<void>) =>
        run({
          childProfile: { deleteMany: db.childProfileDeleteMany },
          parent: { delete: db.parentDelete },
          user: { delete: db.userDelete },
        }),
    );
  });

  it("refuses to issue a deletion token without a live PIN grant", async () => {
    mockSession(null);
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );

    const res = await request(app).post("/api/parent/account/delete-request");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PIN_VERIFICATION_REQUIRED");
    expect(db.parentUpdate).not.toHaveBeenCalled();
  });

  it("issues a token with a 15-minute expiry behind the PIN gate", async () => {
    mockSession(livePinGrant());
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );

    const res = await request(app).post("/api/parent/account/delete-request");

    expect(res.status).toBe(200);
    expect(res.body.data.confirmationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(lastParentUpdateData()).toMatchObject({
      deleteToken: res.body.data.confirmationToken,
    });
  });

  it("rejects a deletion with the wrong confirmation token", async () => {
    mockSession(livePinGrant());
    db.parentFindUnique.mockResolvedValue(
      parentRow({
        pinHash: correctPinHash,
        deleteToken: STORED_TOKEN,
        deleteTokenExpiresAt: new Date(Date.now() + 60_000),
      }),
    );

    const res = await request(app)
      .delete("/api/parent/account")
      .send({ confirmationToken: "d".repeat(64) });

    expect(res.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects a deletion with an expired confirmation token", async () => {
    mockSession(livePinGrant());
    db.parentFindUnique.mockResolvedValue(
      parentRow({
        pinHash: correctPinHash,
        deleteToken: STORED_TOKEN,
        deleteTokenExpiresAt: new Date(Date.now() - 1_000),
      }),
    );

    const res = await request(app)
      .delete("/api/parent/account")
      .send({ confirmationToken: STORED_TOKEN });

    expect(res.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects a deletion when no token was ever requested", async () => {
    mockSession(livePinGrant());
    db.parentFindUnique.mockResolvedValue(
      parentRow({ pinHash: correctPinHash }),
    );

    const res = await request(app)
      .delete("/api/parent/account")
      .send({ confirmationToken: STORED_TOKEN });

    expect(res.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("erases the children, the parent and the identity in one transaction", async () => {
    mockSession(livePinGrant());
    db.parentFindUnique.mockResolvedValue(
      parentRow({
        pinHash: correctPinHash,
        deleteToken: STORED_TOKEN,
        deleteTokenExpiresAt: new Date(Date.now() + 60_000),
      }),
    );

    const res = await request(app)
      .delete("/api/parent/account")
      .send({ confirmationToken: STORED_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { deleted: true } });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.childProfileDeleteMany).toHaveBeenCalledWith({
      where: { parentId: "parent_1" },
    });
    expect(db.parentDelete).toHaveBeenCalledWith({ where: { id: "parent_1" } });
    expect(db.userDelete).toHaveBeenCalledWith({
      where: { id: SESSION_USER.id },
    });
  });
});
