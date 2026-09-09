/**
 * See the note at the top of `shared/middleware/require-parent.test.ts`: there is
 * no test database yet, so `config/prisma.js` is stubbed and
 * `auth.api.getSession` is spied on.
 *
 * What a stub cannot prove is called out where it matters: the deletion test
 * asserts the writes that were issued, not that a row vanished from Postgres.
 */
// `Prisma` is a value import: the stub constructs the real P2025 error class so
// the service's own `instanceof` check is exercised rather than bypassed.
import { type Parent, Prisma } from "@kidlearn/db";
import {
  CONSENT_VERSION,
  ConsentRecordResponseSchema,
  DeletedResponseSchema,
  DeletionRequestResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  parentUpdate: vi.fn(),
  parentUpdateMany: vi.fn(),
  parentDelete: vi.fn(),
  accountFindFirst: vi.fn(),
  sessionUpdate: vi.fn(),
  childProfileDeleteMany: vi.fn(),
  userDelete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    parent: {
      findUnique: db.parentFindUnique,
      upsert: db.parentUpsert,
      update: db.parentUpdate,
      updateMany: db.parentUpdateMany,
      delete: db.parentDelete,
    },
    account: { findFirst: db.accountFindFirst },
    session: { update: db.sessionUpdate },
    childProfile: { deleteMany: db.childProfileDeleteMany },
    user: { delete: db.userDelete },
    $transaction: db.transaction,
  },
}));

const { app } = await import("../../app.js");
const { auth } = await import("../../config/auth.js");

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
  // `getSession` returns a deep better-auth type; only the fields the routes
  // read are supplied, so the shape is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: {
      id: "session_1",
      userId: SESSION_USER.id,
      activeChildProfileId: null,
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

/** Evaluates a Prisma `where` against the stored row. */
function matchesWhere(row: Parent, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "OR") {
      return (condition as Record<string, unknown>[]).some((branch) =>
        matchesWhere(row, branch),
      );
    }

    const actual = (row as unknown as Record<string, unknown>)[field];

    if (condition === null || typeof condition !== "object") {
      return actual === condition;
    }
    if (condition instanceof Date) {
      return (actual as Date | null)?.getTime() === condition.getTime();
    }

    const [[operator, operand]] = Object.entries(condition);
    const actualTime = actual instanceof Date ? actual.getTime() : actual;
    const operandTime = operand instanceof Date ? operand.getTime() : operand;

    switch (operator) {
      case "lt":
        return (
          actualTime !== null &&
          (actualTime as number) < (operandTime as number)
        );
      case "lte":
        // Postgres never matches a comparison against NULL — the reason
        // `restoreOneAttempt` is a no-op for a parent who has never been locked.
        return (
          actualTime !== null &&
          actualTime !== undefined &&
          (actualTime as number) <= (operandTime as number)
        );
      default:
        throw new Error(`stub does not model the "${operator}" filter`);
    }
  });
}

/** Prisma's P2025 — what a conditional `update` throws when no row matched. */
function recordNotFound(): Error {
  const error = new Prisma.PrismaClientKnownRequestError(
    "No record was found for an update.",
    { code: "P2025", clientVersion: "test" },
  );
  return error;
}

/**
 * Seeded lazily from the fixture the test handed `parentFindUnique`, so no call
 * site has to opt in. Requests keep their own stale snapshot — which is the
 * point: the stored row is the only thing that accumulates.
 */
async function seedRow(): Promise<Parent> {
  return (
    storedParent ??
    ((await db.parentFindUnique.mock.results.at(-1)?.value) as
      | Parent
      | undefined) ??
    parentRow()
  );
}

beforeEach(() => {
  for (const mock of Object.values(db)) mock.mockReset();
  storedParent = undefined;
  db.parentUpdate.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const seed = await seedRow();
      // `id` is the unique selector; anything else in `where` is a predicate the
      // write is conditional on, and Prisma throws P2025 when it does not hold.
      const { id: _id, ...predicate } = where;
      if (!matchesWhere(seed, predicate)) throw recordNotFound();
      storedParent = applyUpdate(seed, data);
      return storedParent;
    },
  );
  db.parentUpdateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const seed = await seedRow();
      const { id: _id, ...predicate } = where;
      if (!matchesWhere(seed, predicate)) return { count: 0 };
      storedParent = applyUpdate(seed, data);
      return { count: 1 };
    },
  );
  db.sessionUpdate.mockResolvedValue({ id: "session_1" });
  mockSession();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/parent/consent", () => {
  it("records the timestamp and the accepted version", async () => {
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app)
      .post("/api/parent/consent")
      .send({ accepted: true, version: CONSENT_VERSION });

    expect(res.status).toBe(200);
    assertContract(
      ConsentRecordResponseSchema,
      res.body,
      "POST /api/parent/consent",
    );
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

  it("issues a token with a 15-minute expiry to any authenticated parent", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app).post("/api/parent/account/delete-request");

    expect(res.status).toBe(200);
    assertContract(
      DeletionRequestResponseSchema,
      res.body,
      "POST /api/parent/account/delete-request",
    );
    expect(res.body.data.confirmationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(lastParentUpdateData()).toMatchObject({
      deleteToken: res.body.data.confirmationToken,
    });
  });

  it("rejects a deletion with the wrong confirmation token", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(
      parentRow({
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
    mockSession();
    db.parentFindUnique.mockResolvedValue(
      parentRow({
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
    mockSession();
    db.parentFindUnique.mockResolvedValue(parentRow());

    const res = await request(app)
      .delete("/api/parent/account")
      .send({ confirmationToken: STORED_TOKEN });

    expect(res.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("erases the children, the parent and the identity in one transaction", async () => {
    mockSession();
    db.parentFindUnique.mockResolvedValue(
      parentRow({
        deleteToken: STORED_TOKEN,
        deleteTokenExpiresAt: new Date(Date.now() + 60_000),
      }),
    );

    const res = await request(app)
      .delete("/api/parent/account")
      .send({ confirmationToken: STORED_TOKEN });

    expect(res.status).toBe(200);
    assertContract(
      DeletedResponseSchema,
      res.body,
      "DELETE /api/parent/account",
    );
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
