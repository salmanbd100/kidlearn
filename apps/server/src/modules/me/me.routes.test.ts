/**
 * Stubs `config/prisma.js` under the stub exception in `general.md §5`. The stub holds ledger rows and does the grouping itself (rule 1);
 * the character list's `where` clause keeps drafts out of the picker (rule 2); whether Postgres's `groupBy` agrees is unproven (rule 4).
 */
import type { ChildProfile, Parent } from "@kidlearn/db";
import {
  CharacterUnlockListResponseSchema,
  RewardSummaryResponseSchema,
} from "@kidlearn/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";
import request from "../../shared/testing/request.js";

const CHILD_ID = "child_1";

type LedgerRow = {
  childId: string;
  rewardType: "star" | "coin" | "badge";
  amount: number;
};

const store = vi.hoisted(() => ({ ledger: [] as unknown[] }));

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  childFindFirst: vi.fn(),
  ledgerGroupBy: vi.fn(),
  streakFindUnique: vi.fn(),
  characterFindMany: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    rewardLedger: { groupBy: db.ledgerGroupBy },
    streak: { findUnique: db.streakFindUnique },
    character: { findMany: db.characterFindMany },
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

const PARENT = {
  id: "parent_1",
  userId: SESSION_USER.id,
  googleId: "google_profile_1",
  email: SESSION_USER.email,
  name: SESSION_USER.name,
  avatarUrl: null,
  consentGivenAt: null,
  consentVersion: null,
  deleteToken: null,
  deleteTokenExpiresAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} satisfies Parent;

const CHILD = {
  id: CHILD_ID,
  firstName: "Ava",
  age: 4,
  gradeLevel: "NURSERY",
  preferredLanguage: "en",
  avatarCharacterId: null,
  parentId: PARENT.id,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} satisfies ChildProfile;

function signInAs(child: ChildProfile | null) {
  // Narrowed: `getSession` returns a deep better-auth type; only the fields the middleware reads are supplied.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: {
      id: "session_1",
      userId: SESSION_USER.id,
      activeChildProfileId: child?.id ?? null,
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
  db.parentFindUnique.mockResolvedValue(PARENT);
  db.childFindFirst.mockResolvedValue(child);
}

function getSummary() {
  return request(app).get("/api/me/rewards/summary");
}

beforeEach(() => {
  store.ledger = [];
  for (const fn of Object.values(db)) fn.mockReset();

  db.ledgerGroupBy.mockImplementation(
    async ({ where }: { where: { childId: string } }) => {
      const totals = new Map<string, { sum: number; count: number }>();
      for (const row of store.ledger as LedgerRow[]) {
        if (row.childId !== where.childId) continue;
        const entry = totals.get(row.rewardType) ?? { sum: 0, count: 0 };
        totals.set(row.rewardType, {
          sum: entry.sum + row.amount,
          count: entry.count + 1,
        });
      }
      return [...totals].map(([rewardType, entry]) => ({
        rewardType,
        _sum: { amount: entry.sum },
        _count: { _all: entry.count },
      }));
    },
  );

  // No streak row until a child has finished something — the honest zero.
  db.streakFindUnique.mockResolvedValue(null);
  db.characterFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/me/rewards/summary", () => {
  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await getSummary();

    expect(res.status).toBe(401);
    expect(db.ledgerGroupBy).not.toHaveBeenCalled();
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    signInAs(null);

    const res = await getSummary();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.ledgerGroupBy).not.toHaveBeenCalled();
  });

  it("answers with zeros for a child who has earned nothing", async () => {
    signInAs(CHILD);

    const res = await getSummary();

    expect(res.status).toBe(200);
    assertContract(
      RewardSummaryResponseSchema,
      res.body,
      "GET /api/me/rewards/summary",
    );
    // A brand-new profile is not an error or an empty body: the reward strip renders the same shape on day one.
    expect(res.body.data).toEqual({
      stars: 0,
      coins: 0,
      badgeCount: 0,
      currentStreak: 0,
    });
  });

  it("sums the ledger per reward type", async () => {
    signInAs(CHILD);
    store.ledger = [
      { childId: CHILD_ID, rewardType: "star", amount: 2 },
      { childId: CHILD_ID, rewardType: "star", amount: 1 },
      { childId: CHILD_ID, rewardType: "coin", amount: 6 },
      { childId: CHILD_ID, rewardType: "coin", amount: 5 },
    ];

    const res = await getSummary();

    // Balances are SUM(amount) over rows, never a stored counter, so they are unspoofable (database-design.md).
    expect(res.body.data).toMatchObject({ stars: 3, coins: 11, badgeCount: 0 });
  });

  it("counts badge rows rather than summing them", async () => {
    signInAs(CHILD);
    store.ledger = [
      { childId: CHILD_ID, rewardType: "badge", amount: 1 },
      { childId: CHILD_ID, rewardType: "badge", amount: 1 },
    ];

    const res = await getSummary();

    // A badge is had or not; its `amount` of 1 exists only because the ledger is one table.
    expect(res.body.data.badgeCount).toBe(2);
  });

  it("reads the session's child, not one named in the request", async () => {
    signInAs(CHILD);
    store.ledger = [
      { childId: CHILD_ID, rewardType: "coin", amount: 5 },
      { childId: "another_child", rewardType: "coin", amount: 500 },
    ];

    const res = await request(app).get(
      "/api/me/rewards/summary?childId=another_child",
    );

    expect(res.body.data.coins).toBe(5);
    expect(db.ledgerGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { childId: CHILD_ID } }),
    );
  });

  it("reports the stored streak (FR-GAM-06)", async () => {
    signInAs(CHILD);
    db.streakFindUnique.mockResolvedValue({
      current: 4,
      lastActivityDate: new Date(),
    });

    const res = await getSummary();

    expect(res.body.data.currentStreak).toBe(4);
    expect(db.streakFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { childId: CHILD_ID } }),
    );
  });

  it("reports a lapsed streak as zero rather than the stale stored number", async () => {
    signInAs(CHILD);
    // `current` resets only on the next activity, so a child who last played a week ago still has 4.
    db.streakFindUnique.mockResolvedValue({
      current: 4,
      lastActivityDate: new Date(Date.now() - 7 * 24 * 60 * 60_000),
    });

    const res = await getSummary();

    expect(res.body.data.currentStreak).toBe(0);
  });

  it("reads the streak without advancing it", async () => {
    signInAs(CHILD);
    db.streakFindUnique.mockResolvedValue({
      current: 4,
      lastActivityDate: new Date(),
    });

    const res = await getSummary();

    // Opening the home screen must not extend a streak. The stub offers only `streak.findUnique`, so a write would throw.
    expect(res.status).toBe(200);
    expect(db.streakFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/me/characters", () => {
  function getCharacters() {
    return request(app).get("/api/me/characters");
  }

  function characterRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "character_1",
      slug: "leo-the-lion",
      name: "Leo the Lion",
      isDefault: true,
      asset: null,
      unlocks: [],
      ...overrides,
    };
  }

  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await getCharacters();

    expect(res.status).toBe(401);
    expect(db.characterFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    signInAs(null);

    const res = await getCharacters();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.characterFindMany).not.toHaveBeenCalled();
  });

  it("marks every starter character unlocked", async () => {
    signInAs(CHILD);
    db.characterFindMany.mockResolvedValue([characterRow()]);

    const res = await getCharacters();

    expect(res.status).toBe(200);
    assertContract(
      CharacterUnlockListResponseSchema,
      res.body,
      "GET /api/me/characters",
    );
    expect(res.body.data.characters).toEqual([
      {
        id: "character_1",
        slug: "leo-the-lion",
        name: "Leo the Lion",
        imageUrl: null,
        isDefault: true,
        isUnlocked: true,
      },
    ]);
  });

  it("returns locked characters rather than hiding them (FR-GAM-05)", async () => {
    signInAs(CHILD);
    db.characterFindMany.mockResolvedValue([
      characterRow(),
      characterRow({
        id: "character_2",
        slug: "mia-the-monkey",
        name: "Mia the Monkey",
        isDefault: false,
      }),
    ]);

    const res = await getCharacters();

    // The silhouette is the progression: a picker showing only owned characters hides what there is to earn.
    expect(res.body.data.characters).toHaveLength(2);
    expect(res.body.data.characters[1]).toMatchObject({
      slug: "mia-the-monkey",
      isDefault: false,
      isUnlocked: false,
    });
  });

  it("flags an earned character as unlocked", async () => {
    signInAs(CHILD);
    db.characterFindMany.mockResolvedValue([
      characterRow({
        id: "character_2",
        slug: "mia-the-monkey",
        name: "Mia the Monkey",
        isDefault: false,
        unlocks: [{ id: "child_character_1" }],
      }),
    ]);

    const res = await getCharacters();

    expect(res.body.data.characters[0].isUnlocked).toBe(true);
  });

  it("resolves imageUrl from the character's media asset", async () => {
    signInAs(CHILD);
    db.characterFindMany.mockResolvedValue([
      characterRow({ asset: { url: "/dev/leo.png" } }),
    ]);

    const res = await getCharacters();

    expect(res.body.data.characters[0].imageUrl).toBe("/dev/leo.png");
  });

  /** Content-safety half (`backend.md §4`): asserts the `where` clause and the scoping of `unlocks`, which stops the flag reading another child's row. */
  it("asks Prisma only for published characters, scoped to this child's unlocks", async () => {
    signInAs(CHILD);

    await getCharacters();

    expect(db.characterFindMany).toHaveBeenCalledWith({
      where: { status: "published" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        isDefault: true,
        asset: { select: { url: true } },
        unlocks: { where: { childId: CHILD_ID }, select: { id: true } },
      },
    });
  });

  it("takes the child from the session, not from the request", async () => {
    signInAs(CHILD);

    await request(app).get("/api/me/characters?childId=another_child");

    const [args] = db.characterFindMany.mock.calls[0] as [
      { select: { unlocks: { where: { childId: string } } } },
    ];
    expect(args.select.unlocks.where.childId).toBe(CHILD_ID);
  });
});
