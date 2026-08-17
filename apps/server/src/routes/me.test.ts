/**
 * `GET /api/me/rewards/summary` and `GET /api/me/characters`.
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. Rule 1 applies in the shape that matters here: the stub
 * holds ledger *rows* and does the grouping itself, so the totals asserted below
 * are arithmetic over data rather than a canned answer. Rule 2 covers the
 * character list, where the `where` clause is what keeps a draft character out
 * of a picker. Rule 4 names what neither can show — whether Postgres's `groupBy`
 * returns what this one does.
 */
import type { ChildProfile, Parent } from "@kidlearn/db";
import {
  CharacterUnlockListResponseSchema,
  RewardSummaryResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";

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

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    rewardLedger: { groupBy: db.ledgerGroupBy },
    streak: { findUnique: db.streakFindUnique },
    character: { findMany: db.characterFindMany },
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

const PARENT = {
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
  // `getSession` returns a deep better-auth type; only the fields the middleware
  // reads are supplied, so the shape is narrowed at this boundary.
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
    // A brand-new profile, not an error and not an empty body — the reward strip
    // renders the same shape on day one as on day ninety.
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

    // Balances are SUM(amount) over the rows, never a stored counter — which is
    // what makes them unspoofable and reportable (database-design.md).
    expect(res.body.data).toMatchObject({ stars: 3, coins: 11, badgeCount: 0 });
  });

  it("counts badge rows rather than summing them", async () => {
    signInAs(CHILD);
    store.ledger = [
      { childId: CHILD_ID, rewardType: "badge", amount: 1 },
      { childId: CHILD_ID, rewardType: "badge", amount: 1 },
    ];

    const res = await getSummary();

    // A badge is a thing you have or do not; its `amount` is a 1 that exists
    // only because the ledger is one table.
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
    db.streakFindUnique.mockResolvedValue({ current: 4 });

    const res = await getSummary();

    expect(res.body.data.currentStreak).toBe(4);
    expect(db.streakFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { childId: CHILD_ID } }),
    );
  });

  it("reads the streak without advancing it", async () => {
    signInAs(CHILD);
    db.streakFindUnique.mockResolvedValue({ current: 4 });

    const res = await getSummary();

    // A streak counts days something was *finished*. If opening the home screen
    // could extend one, a child could keep a flame alive by never learning.
    // The stub above offers `streak.findUnique` and nothing else, so a write
    // here would be a TypeError rather than a passing test.
    expect(res.status).toBe(200);
    expect(db.streakFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/me/characters", () => {
  function getCharacters() {
    return request(app).get("/api/me/characters");
  }

  /** One published row as `listCharactersForChild` selects it. */
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

    // A picker showing only what a child already has cannot show them what
    // there is to earn — the silhouette *is* the progression.
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

  /**
   * The content-safety half (`backend.md §4`). A stub cannot show that a draft
   * character stayed out of the list, so the clause that keeps it out is
   * asserted — along with the scoping of `unlocks`, which is what stops the flag
   * reading another child's row.
   */
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
