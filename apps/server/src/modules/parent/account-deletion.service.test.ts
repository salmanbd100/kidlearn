/**
 * See the note at the top of `shared/middleware/require-parent.test.ts`: no test
 * database exists yet, so `config/prisma.js` is stubbed. That limits what this
 * suite can prove — it asserts the *order and scope* of the deletes and that
 * they all run inside one transaction, but the cascade from `ChildProfile` to
 * the eight child-owned tables is a database guarantee (declared in
 * `schema.prisma`) that only a real-database test can verify. Rewrite these as
 * row-count assertions when the test-database harness lands.
 */
import type { Parent } from "@kidlearn/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  parentUpdate: vi.fn(),
  childProfileDeleteMany: vi.fn(),
  parentDelete: vi.fn(),
  parentUpdateMany: vi.fn(),
  userDelete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    parent: { update: db.parentUpdate, delete: db.parentDelete },
    childProfile: { deleteMany: db.childProfileDeleteMany },
    user: { delete: db.userDelete },
    $transaction: db.transaction,
  },
}));

const { ApiError } = await import("../../shared/errors/errors.js");
const { confirmAccountDeletion, requestAccountDeletion } = await import(
  "./account-deletion.service.js"
);

function parentRow(overrides: Partial<Parent> = {}): Parent {
  return {
    id: "parent_1",
    userId: "user_1",
    googleId: "google_profile_1",
    email: "parent@example.com",
    name: "Parent One",
    avatarUrl: null,
    consentGivenAt: null,
    consentVersion: null,
    deleteToken: null,
    deleteTokenExpiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** The transaction client the mocked `$transaction` hands to the callback. */
const tx = {
  childProfile: { deleteMany: db.childProfileDeleteMany },
  parent: { delete: db.parentDelete, updateMany: db.parentUpdateMany },
  user: { delete: db.userDelete },
};

describe("requestAccountDeletion", () => {
  beforeEach(() => {
    db.parentUpdate.mockReset();
    db.parentUpdate.mockResolvedValue(parentRow());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("issues a high-entropy token and stores it with a 15-minute expiry", async () => {
    const before = Date.now();

    const { confirmationToken, expiresAt } =
      await requestAccountDeletion("parent_1");

    // 32 random bytes, hex-encoded.
    expect(confirmationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 14 * 60_000);
    expect(db.parentUpdate).toHaveBeenCalledWith({
      where: { id: "parent_1" },
      data: { deleteToken: confirmationToken, deleteTokenExpiresAt: expiresAt },
    });
  });

  it("issues a different token every time, so an old one cannot be replayed", async () => {
    const first = await requestAccountDeletion("parent_1");
    const second = await requestAccountDeletion("parent_1");

    expect(first.confirmationToken).not.toBe(second.confirmationToken);
  });
});

describe("confirmAccountDeletion", () => {
  const VALID_TOKEN = "a".repeat(64);

  beforeEach(() => {
    db.childProfileDeleteMany.mockReset().mockResolvedValue({ count: 2 });
    db.parentDelete.mockReset().mockResolvedValue(parentRow());
    db.parentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    db.userDelete.mockReset().mockResolvedValue({ id: "user_1" });
    db.transaction
      .mockReset()
      .mockImplementation((run: (client: typeof tx) => Promise<void>) =>
        run(tx),
      );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets only one of two concurrent confirmations erase the account", async () => {
    // Both pass the in-memory token check against the same loaded row; the
    // conditional claim inside the transaction is what separates them.
    db.parentUpdateMany.mockResolvedValue({ count: 0 });
    const parent = parentRow({
      deleteToken: VALID_TOKEN,
      deleteTokenExpiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      confirmAccountDeletion(parent, VALID_TOKEN),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(db.parentUpdateMany).toHaveBeenCalledWith({
      where: { id: "parent_1", deleteToken: VALID_TOKEN },
      data: { deleteToken: null, deleteTokenExpiresAt: null },
    });
    expect(db.childProfileDeleteMany).not.toHaveBeenCalled();
    expect(db.parentDelete).not.toHaveBeenCalled();
  });

  it("gives the erasure transaction more than Prisma's 5 s default", async () => {
    const parent = parentRow({
      deleteToken: VALID_TOKEN,
      deleteTokenExpiresAt: new Date(Date.now() + 60_000),
    });

    await confirmAccountDeletion(parent, VALID_TOKEN);

    const options = db.transaction.mock.calls[0][1] as { timeout: number };
    expect(options.timeout).toBeGreaterThan(5_000);
  });

  it("refuses when no deletion was ever requested", async () => {
    const parent = parentRow({ deleteToken: null });

    await expect(
      confirmAccountDeletion(parent, VALID_TOKEN),
    ).rejects.toBeInstanceOf(ApiError);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses a token that does not match the stored one", async () => {
    const parent = parentRow({
      deleteToken: VALID_TOKEN,
      deleteTokenExpiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      confirmAccountDeletion(parent, "b".repeat(64)),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses a token of the wrong length without leaking a timing difference", async () => {
    const parent = parentRow({
      deleteToken: VALID_TOKEN,
      deleteTokenExpiresAt: new Date(Date.now() + 60_000),
    });

    await expect(confirmAccountDeletion(parent, "short")).rejects.toMatchObject(
      { statusCode: 403 },
    );
  });

  it("refuses an expired token", async () => {
    const parent = parentRow({
      deleteToken: VALID_TOKEN,
      deleteTokenExpiresAt: new Date(Date.now() - 1_000),
    });

    await expect(
      confirmAccountDeletion(parent, VALID_TOKEN),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("erases children, the parent row and the identity in one transaction", async () => {
    const parent = parentRow({
      deleteToken: VALID_TOKEN,
      deleteTokenExpiresAt: new Date(Date.now() + 60_000),
    });

    await confirmAccountDeletion(parent, VALID_TOKEN);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.childProfileDeleteMany).toHaveBeenCalledWith({
      where: { parentId: "parent_1" },
    });
    expect(db.parentDelete).toHaveBeenCalledWith({ where: { id: "parent_1" } });
    // Removing the better-auth user cascades Session and Account, which is what
    // invalidates the cookie the caller is still holding.
    expect(db.userDelete).toHaveBeenCalledWith({ where: { id: "user_1" } });
  });

  it("deletes the children before the parent, so no orphan rows can survive", async () => {
    const parent = parentRow({
      deleteToken: VALID_TOKEN,
      deleteTokenExpiresAt: new Date(Date.now() + 60_000),
    });

    await confirmAccountDeletion(parent, VALID_TOKEN);

    const childOrder = db.childProfileDeleteMany.mock.invocationCallOrder[0];
    const parentOrder = db.parentDelete.mock.invocationCallOrder[0];
    const userOrder = db.userDelete.mock.invocationCallOrder[0];
    expect(childOrder).toBeLessThan(parentOrder);
    expect(parentOrder).toBeLessThan(userOrder);
  });
});
