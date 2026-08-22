/**
 * `seedAdmin()` — the only way an administrator comes into existence (file 31).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5`. Rule 1
 * (stub state, not answers) is the whole point here: `store.admins` is a table and
 * the stubbed `upsert` matches on `email`, so "running twice leaves one row" is a
 * row count rather than a mock told to return the same object twice.
 *
 * better-auth's side is spied on `auth.$context` rather than stubbed as a module,
 * because what is under test is that this script writes the *same* three things
 * `sign-up/email` writes — a hashed password, a user, and a `credential` account —
 * and a hand-rolled fake of the internal adapter could agree with a wrong order.
 *
 * Rule 4 — what neither can prove: that `AdminUser.email` and
 * `AdminUser.authUserId` are actually unique in Postgres. Asserted against
 * `schema.prisma` at the bottom, until a real database can be pointed at it.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EMAIL = "reviewer@kidlearn.test";
const PASSWORD = "a-long-enough-admin-password";
const NAME = "Reviewer One";
const AUTH_USER_ID = "user_admin_1";

type AdminRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  authUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AccountRow = { providerId: string; password?: string };

const store = vi.hoisted(() => ({
  admins: [] as AdminRow[],
  nextAdminId: 1,
}));

const db = vi.hoisted(() => ({
  adminFindUnique: vi.fn(),
  adminUpsert: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    adminUser: { findUnique: db.adminFindUnique, upsert: db.adminUpsert },
  },
}));

const { auth } = await import("../lib/auth.js");
const { seedAdmin } = await import("./seed-admin.js");
const context = await auth.$context;

/** The better-auth `user` + `account` rows, as an in-memory pair of tables. */
const identity = {
  users: [] as Array<{ id: string; email: string; name: string }>,
  accounts: new Map<string, AccountRow[]>(),
};

beforeEach(() => {
  store.admins = [];
  store.nextAdminId = 1;
  identity.users = [];
  identity.accounts = new Map();
  db.adminFindUnique.mockReset();
  db.adminUpsert.mockReset();

  db.adminFindUnique.mockImplementation(
    async ({ where }: { where: { email: string } }) =>
      store.admins.find((row) => row.email === where.email) ?? null,
  );

  db.adminUpsert.mockImplementation(
    async (args: {
      where: { email: string };
      update: { authUserId: string; name: string };
      create: { email: string; name: string; authUserId: string };
    }) => {
      const existing = store.admins.find(
        (row) => row.email === args.where.email,
      );
      if (existing) {
        existing.authUserId = args.update.authUserId;
        existing.name = args.update.name;
        existing.updatedAt = new Date("2026-08-22T00:00:00.000Z");
        return existing;
      }
      const created: AdminRow = {
        id: `admin_${store.nextAdminId++}`,
        email: args.create.email,
        name: args.create.name,
        role: "admin",
        authUserId: args.create.authUserId,
        createdAt: new Date("2026-08-22T00:00:00.000Z"),
        updatedAt: new Date("2026-08-22T00:00:00.000Z"),
      };
      store.admins.push(created);
      return created;
    },
  );

  vi.spyOn(context.password, "hash").mockImplementation(
    async (plain: string) => `hashed:${plain}`,
  );

  vi.spyOn(context.internalAdapter, "findUserByEmail").mockImplementation(
    // The real signature returns better-auth's full user shape; the fake supplies
    // only the fields `seedAdmin` reads, so it is narrowed at this boundary.
    (async (email: string) => {
      const user = identity.users.find((row) => row.email === email);
      if (!user) return null;
      return { user, accounts: identity.accounts.get(user.id) ?? [] };
    }) as unknown as typeof context.internalAdapter.findUserByEmail,
  );

  vi.spyOn(context.internalAdapter, "createUser").mockImplementation(
    (async (user: { email: string; name: string }) => {
      const created = { id: AUTH_USER_ID, email: user.email, name: user.name };
      identity.users.push(created);
      return created;
    }) as unknown as typeof context.internalAdapter.createUser,
  );

  vi.spyOn(context.internalAdapter, "linkAccount").mockImplementation(
    (async (account: {
      userId: string;
      providerId: string;
      password?: string;
    }) => {
      const rows = identity.accounts.get(account.userId) ?? [];
      rows.push({ providerId: account.providerId, password: account.password });
      identity.accounts.set(account.userId, rows);
      return account;
    }) as unknown as typeof context.internalAdapter.linkAccount,
  );

  vi.spyOn(context.internalAdapter, "updatePassword").mockImplementation(
    async (userId: string, password: string) => {
      const rows = identity.accounts.get(userId) ?? [];
      for (const row of rows) {
        if (row.providerId === "credential") row.password = password;
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("seedAdmin", () => {
  it("creates the credential identity and the linked AdminUser row", async () => {
    const { admin, isCreated } = await seedAdmin({
      email: EMAIL,
      password: PASSWORD,
      name: NAME,
    });

    expect(isCreated).toBe(true);
    expect(admin.email).toBe(EMAIL);
    expect(admin.authUserId).toBe(AUTH_USER_ID);
    // The same three writes `sign-up/email` makes, in the same order: a hashed
    // password, a user, then a `credential` account carrying the hash.
    expect(context.password.hash).toHaveBeenCalledWith(PASSWORD);
    expect(identity.accounts.get(AUTH_USER_ID)).toEqual([
      { providerId: "credential", password: `hashed:${PASSWORD}` },
    ]);
  });

  it("marks the user verified so no internal account waits on an email nobody sends", async () => {
    await seedAdmin({ email: EMAIL, password: PASSWORD, name: NAME });

    expect(context.internalAdapter.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerified: true }),
    );
  });

  it("is idempotent — running twice leaves exactly one admin and one account", async () => {
    await seedAdmin({ email: EMAIL, password: PASSWORD, name: NAME });
    const second = await seedAdmin({
      email: EMAIL,
      password: PASSWORD,
      name: NAME,
    });

    // What makes `pnpm --filter server seed:admin` safe to re-run, which is also
    // the recovery path for a forgotten password at MVP.
    expect(second.isCreated).toBe(false);
    expect(store.admins).toHaveLength(1);
    expect(identity.users).toHaveLength(1);
    expect(identity.accounts.get(AUTH_USER_ID)).toHaveLength(1);
    expect(context.internalAdapter.createUser).toHaveBeenCalledTimes(1);
  });

  it("re-running with a new password replaces the credential hash", async () => {
    await seedAdmin({ email: EMAIL, password: PASSWORD, name: NAME });
    await seedAdmin({
      email: EMAIL,
      password: "a-different-long-password",
      name: NAME,
    });

    expect(identity.accounts.get(AUTH_USER_ID)).toEqual([
      {
        providerId: "credential",
        password: "hashed:a-different-long-password",
      },
    ]);
  });

  it("links a credential account to a user left without one", async () => {
    // The state an earlier run that died between `createUser` and `linkAccount`
    // leaves behind: an identity that can never sign in.
    identity.users.push({ id: AUTH_USER_ID, email: EMAIL, name: NAME });
    identity.accounts.set(AUTH_USER_ID, []);

    await seedAdmin({ email: EMAIL, password: PASSWORD, name: NAME });

    expect(identity.accounts.get(AUTH_USER_ID)).toEqual([
      { providerId: "credential", password: `hashed:${PASSWORD}` },
    ]);
  });

  it("re-asserts the link on an AdminUser row whose identity was cleared", async () => {
    store.admins.push({
      id: "admin_existing",
      email: EMAIL,
      name: "Old Name",
      role: "admin",
      // What `ON DELETE SET NULL` leaves when the identity is deleted: a row that
      // keeps its review history but cannot sign in.
      authUserId: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const { admin } = await seedAdmin({
      email: EMAIL,
      password: PASSWORD,
      name: NAME,
    });

    expect(admin.id).toBe("admin_existing");
    expect(admin.authUserId).toBe(AUTH_USER_ID);
    expect(admin.name).toBe(NAME);
  });

  it("lower-cases the email so a capitalised ADMIN_EMAIL cannot make a second admin", async () => {
    await seedAdmin({ email: EMAIL, password: PASSWORD, name: NAME });
    await seedAdmin({
      email: "Reviewer@KidLearn.Test",
      password: PASSWORD,
      name: NAME,
    });

    // better-auth stores every email lower-cased, so the domain row has to match
    // or the second run would create a user it could not find next time.
    expect(store.admins).toHaveLength(1);
    expect(store.admins[0].email).toBe(EMAIL);
  });

  it("refuses a password shorter than the floor, before touching anything", async () => {
    await expect(
      seedAdmin({ email: EMAIL, password: "short", name: NAME }),
    ).rejects.toThrow(/at least 12 characters/);

    expect(context.internalAdapter.createUser).not.toHaveBeenCalled();
    expect(db.adminUpsert).not.toHaveBeenCalled();
  });
});

describe("what the stub cannot prove (general.md §5, rule 4)", () => {
  const schema = readFileSync(
    new URL("../../../../packages/db/prisma/schema.prisma", import.meta.url),
    "utf8",
  );

  it("declares AdminUser.email and AdminUser.authUserId unique", () => {
    // Idempotency above rests on both: a stubbed table matches on email because
    // Postgres will, and the link is one-to-one because `authUserId` is unique.
    // A real test replaces this once the test-database harness exists.
    const model = schema.slice(
      schema.indexOf("model AdminUser {"),
      schema.indexOf("}", schema.indexOf("model AdminUser {")),
    );
    expect(model).toMatch(/email\s+String\s+@unique/);
    expect(model).toMatch(/authUserId String\?\s+@unique/);
  });

  it("keeps a revoked admin's review history by setting the link null, not cascading", () => {
    const model = schema.slice(
      schema.indexOf("model AdminUser {"),
      schema.indexOf("}", schema.indexOf("model AdminUser {")),
    );
    // `Cascade` here would delete the AdminUser row with the identity and take
    // `AIGenerationJob.reviewer` with it (FR-AI-08).
    expect(model).toContain("onDelete: SetNull");
  });
});
