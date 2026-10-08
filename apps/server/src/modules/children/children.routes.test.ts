/**
 * Stubs `config/prisma.js` with an in-memory store (general.md §5 stub exception).
 * The `ON DELETE CASCADE` a stub cannot prove is asserted against the Prisma schema at the bottom.
 */
import { readFileSync } from "node:fs";
import { type ChildProfile, type Parent, Prisma } from "@kidlearn/db";
import {
  ActiveChildResponseSchema,
  CharacterUnlockListResponseSchema,
  ChildProfileListResponseSchema,
  ChildProfileResponseSchema,
  CONSENT_VERSION,
  DeletedResponseSchema,
} from "@kidlearn/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";
import request from "../../shared/testing/request.js";

type CharacterRow = {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  status: string;
};
type SessionRow = {
  id: string;
  userId: string;
  activeChildProfileId: string | null;
};

type StubState = {
  children: ChildProfile[];
  sessions: Map<string, SessionRow>;
  unlocks: { childId: string; characterId: string }[];
  ledger: { childId: string; rewardType: string; amount: number }[];
  streaks: Map<string, number>;
  nextChildId: number;
};

const state = vi.hoisted(
  (): StubState => ({
    children: [],
    sessions: new Map(),
    unlocks: [],
    ledger: [],
    streaks: new Map(),
    nextChildId: 0,
  }),
);

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  accountFindFirst: vi.fn(),
  childCount: vi.fn(),
  childCreate: vi.fn(),
  childFindFirst: vi.fn(),
  childFindMany: vi.fn(),
  childUpdate: vi.fn(),
  childDelete: vi.fn(),
  characterFindFirst: vi.fn(),
  characterFindMany: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  rewardLedgerGroupBy: vi.fn(),
  streakFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => {
  const client = {
    parent: { findUnique: db.parentFindUnique },
    account: { findFirst: db.accountFindFirst },
    childProfile: {
      count: db.childCount,
      create: db.childCreate,
      findFirst: db.childFindFirst,
      findMany: db.childFindMany,
      update: db.childUpdate,
      delete: db.childDelete,
    },
    character: {
      findFirst: db.characterFindFirst,
      findMany: db.characterFindMany,
    },
    session: { update: db.sessionUpdate, updateMany: db.sessionUpdateMany },
    rewardLedger: { groupBy: db.rewardLedgerGroupBy },
    streak: { findMany: db.streakFindMany },
    // The callback gets the same stubbed client. Rollback is not simulated; the
    // limit test asserts `create` was never reached.
    $transaction: db.transaction,
  };
  return { prisma: client };
});

const { app } = await import("../../app.js");
const { auth } = await import("../../config/auth.js");

const TEST_PARENT_HEADER = "x-test-parent";

type ParentFixture = {
  key: string;
  user: { id: string; email: string; name: string; image: null };
  parent: Parent;
  sessionId: string;
};

const CONSENTED_AT = new Date("2026-01-02T00:00:00.000Z");

function makeParentFixture(key: string): ParentFixture {
  const user = {
    id: `user_${key}`,
    email: `parent-${key}@example.com`,
    name: `Parent ${key.toUpperCase()}`,
    image: null,
  };
  return {
    key,
    user,
    sessionId: `session_${key}`,
    parent: {
      id: `parent_${key}`,
      userId: user.id,
      googleId: `google_${key}`,
      email: user.email,
      name: user.name,
      avatarUrl: null,
      // Consented by default: `POST /api/children` sits behind `requireConsent`.
      // `beforeEach` restores this; the consent tests clear it deliberately.
      consentGivenAt: CONSENTED_AT,
      consentVersion: CONSENT_VERSION,
      deleteToken: null,
      deleteTokenExpiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  };
}

const PARENT_A = makeParentFixture("a");
const PARENT_B = makeParentFixture("b");
const FIXTURES = new Map([
  [PARENT_A.key, PARENT_A],
  [PARENT_B.key, PARENT_B],
]);

// `character_default` is the only row a new profile may pick; the other two
// prove the query filters on both `isDefault` and `status`.
const CHARACTERS: CharacterRow[] = [
  {
    id: "character_default",
    slug: "leo-the-lion",
    name: "Leo the Lion",
    isDefault: true,
    status: "published",
  },
  {
    id: "character_unlockable",
    slug: "mia-the-monkey",
    name: "Mia the Monkey",
    isDefault: false,
    status: "published",
  },
  {
    id: "character_draft",
    slug: "nia-the-newt",
    name: "Nia the Newt",
    isDefault: true,
    status: "draft",
  },
];

const VALID_BODY = {
  firstName: "Ayaan",
  age: 4,
  gradeLevel: "KG1",
  preferredLanguage: "bn",
  avatarCharacterId: "character_default",
};

const NOT_FOUND_ENVELOPE = {
  error: { code: "NOT_FOUND", message: "Child profile not found" },
};

function seedChild(
  fixture: ParentFixture,
  overrides: Partial<ChildProfile> = {},
): ChildProfile {
  state.nextChildId += 1;
  const child: ChildProfile = {
    id: `child_${state.nextChildId}`,
    firstName: "Ayaan",
    age: 4,
    gradeLevel: "KG1",
    preferredLanguage: "bn",
    avatarCharacterId: "character_default",
    parentId: fixture.parent.id,
    createdAt: new Date(2026, 0, state.nextChildId),
    updatedAt: new Date(2026, 0, state.nextChildId),
    ...overrides,
  };
  state.children.push(child);
  return child;
}

// Two of these coexist in the ownership tests: the cross-parent 404s are the
// security-critical assertions in this file.
function authedAgentFor(fixture: ParentFixture) {
  const agent = request(app);
  const { key } = fixture;
  return {
    get: (url: string) => agent.get(url).set(TEST_PARENT_HEADER, key),
    post: (url: string) => agent.post(url).set(TEST_PARENT_HEADER, key),
    patch: (url: string) => agent.patch(url).set(TEST_PARENT_HEADER, key),
    delete: (url: string) => agent.delete(url).set(TEST_PARENT_HEADER, key),
  };
}

function anonymousAgent() {
  return request(app);
}

type ChildWhere = { id?: string; parentId?: string };

type AvatarWhere = {
  id: string;
  status: string;
  OR?: {
    isDefault?: boolean;
    unlocks?: { some: { childId: string } };
  }[];
};

function matches(child: ChildProfile, where: ChildWhere): boolean {
  if (where.id !== undefined && child.id !== where.id) return false;
  if (where.parentId !== undefined && child.parentId !== where.parentId) {
    return false;
  }
  return true;
}

beforeEach(() => {
  state.children = [];
  state.unlocks = [];
  state.ledger = [];
  state.streaks.clear();
  state.nextChildId = 0;
  state.sessions.clear();
  for (const fixture of FIXTURES.values()) {
    state.sessions.set(fixture.sessionId, {
      id: fixture.sessionId,
      userId: fixture.user.id,
      activeChildProfileId: null,
    });
    // Fixture parents are module-level, so revoked consent would leak into later tests.
    fixture.parent.consentGivenAt = CONSENTED_AT;
    fixture.parent.consentVersion = CONSENT_VERSION;
  }

  for (const spy of Object.values(db)) spy.mockReset();

  db.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const { prisma } = await import("../../config/prisma.js");
      return fn(prisma);
    },
  );

  db.parentFindUnique.mockImplementation(
    async ({ where }: { where: { userId: string } }) =>
      [...FIXTURES.values()].find((f) => f.user.id === where.userId)?.parent ??
      null,
  );

  // Sums the modelled ledger like Postgres so `stats` derives from rows (stub
  // rule 1); a badge is counted, not summed, as in `readTotals`.
  db.rewardLedgerGroupBy.mockImplementation(
    async ({ where }: { where: { childId: { in: string[] } } }) => {
      const scoped = state.ledger.filter((row) =>
        where.childId.in.includes(row.childId),
      );
      const groups = new Map<
        string,
        { childId: string; rewardType: string; sum: number; count: number }
      >();
      for (const row of scoped) {
        const key = `${row.childId}|${row.rewardType}`;
        const group = groups.get(key) ?? {
          childId: row.childId,
          rewardType: row.rewardType,
          sum: 0,
          count: 0,
        };
        group.sum += row.amount;
        group.count += 1;
        groups.set(key, group);
      }
      return [...groups.values()].map((group) => ({
        childId: group.childId,
        rewardType: group.rewardType,
        _sum: { amount: group.sum },
        _count: { _all: group.count },
      }));
    },
  );

  db.streakFindMany.mockImplementation(
    async ({ where }: { where: { childId: { in: string[] } } }) =>
      [...state.streaks.entries()]
        .filter(([childId]) => where.childId.in.includes(childId))
        .map(([childId, current]) => ({
          childId,
          current,
          lastActivityDate: new Date(),
        })),
  );

  // Models the real `where`: status gate unconditional, selectable = starter OR
  // unlocked by this child. Distinguishes the update path's rule from create's.
  db.characterFindFirst.mockImplementation(
    async ({ where }: { where: AvatarWhere }) => {
      const unlockedChildId = where.OR?.find(
        (branch) => branch.unlocks !== undefined,
      )?.unlocks?.some.childId;
      const allowsStarters =
        where.OR?.some((branch) => branch.isDefault === true) ?? false;

      return (
        CHARACTERS.find((character) => {
          if (character.id !== where.id) return false;
          if (character.status !== where.status) return false;
          if (allowsStarters && character.isDefault) return true;
          return (
            unlockedChildId !== undefined &&
            state.unlocks.some(
              (unlock) =>
                unlock.childId === unlockedChildId &&
                unlock.characterId === character.id,
            )
          );
        }) ?? null
      );
    },
  );

  // The status gate is applied here as Postgres would, so a draft character is
  // shown to stay out of the response, not only the `where` clause (rule 3).
  db.characterFindMany.mockImplementation(
    async ({
      where,
      select,
    }: {
      where: { status: string };
      select: { unlocks: { where: { childId: string } } };
    }) =>
      CHARACTERS.filter((character) => character.status === where.status)
        .map((character) => ({
          id: character.id,
          slug: character.slug,
          name: character.name,
          isDefault: character.isDefault,
          asset: null,
          unlocks: state.unlocks.filter(
            (unlock) =>
              unlock.childId === select.unlocks.where.childId &&
              unlock.characterId === character.id,
          ),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
  );

  db.childFindFirst.mockImplementation(
    async ({ where }: { where: ChildWhere }) =>
      state.children.find((c) => matches(c, where)) ?? null,
  );

  db.childFindMany.mockImplementation(
    async ({ where }: { where: ChildWhere }) =>
      state.children
        .filter((c) => matches(c, where))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  );

  db.childCount.mockImplementation(
    async ({ where }: { where: ChildWhere }) =>
      state.children.filter((c) => matches(c, where)).length,
  );

  db.childCreate.mockImplementation(
    async ({ data }: { data: Omit<ChildProfile, keyof ChildProfile> }) => {
      const fixture = [...FIXTURES.values()].find(
        (f) => f.parent.id === (data as unknown as ChildProfile).parentId,
      );
      if (!fixture) throw new Error("unknown parentId in test create");
      return seedChild(fixture, data as unknown as Partial<ChildProfile>);
    },
  );

  db.childUpdate.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ChildProfile>;
    }) => {
      const index = state.children.findIndex((c) => c.id === where.id);
      if (index === -1) throw new Error("update on missing child");
      const updated = {
        ...state.children[index],
        ...data,
        updatedAt: new Date(),
      } as ChildProfile;
      state.children[index] = updated;
      return updated;
    },
  );

  db.childDelete.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const index = state.children.findIndex((c) => c.id === where.id);
      if (index === -1) throw new Error("delete on missing child");
      const [removed] = state.children.splice(index, 1);
      // What the ON DELETE SET NULL on `session_activeChildProfileId_fkey` does in Postgres.
      for (const row of state.sessions.values()) {
        if (row.activeChildProfileId === where.id) {
          row.activeChildProfileId = null;
        }
      }
      return removed;
    },
  );

  db.sessionUpdate.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { activeChildProfileId: string | null };
    }) => {
      const row = state.sessions.get(where.id);
      if (!row) throw new Error("update on missing session");
      row.activeChildProfileId = data.activeChildProfileId;
      return row;
    },
  );

  db.sessionUpdateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { activeChildProfileId: string };
      data: { activeChildProfileId: string | null };
    }) => {
      let count = 0;
      for (const row of state.sessions.values()) {
        if (row.activeChildProfileId === where.activeChildProfileId) {
          row.activeChildProfileId = data.activeChildProfileId;
          count += 1;
        }
      }
      return { count };
    },
  );

  // Returns the live session row so a write through `session.update` is visible
  // to the next request.
  vi.spyOn(auth.api, "getSession").mockImplementation(async (context) => {
    const key = context?.headers?.get(TEST_PARENT_HEADER) ?? "";
    const fixture = FIXTURES.get(key);
    if (!fixture) return null;
    return {
      user: fixture.user,
      session: state.sessions.get(fixture.sessionId),
      // Narrowed here: `getSession` returns a deep better-auth type of which only these fields are read.
    } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authentication on /api/children", () => {
  it.each([
    ["get", "/api/children"],
    ["get", "/api/children/child_1"],
    ["post", "/api/children"],
    ["patch", "/api/children/child_1"],
    ["delete", "/api/children/child_1"],
    ["post", "/api/children/child_1/activate"],
  ])("rejects an unauthenticated %s %s with 401", async (method, url) => {
    const agent = anonymousAgent();
    const res = await (method === "get"
      ? agent.get(url)
      : method === "post"
        ? agent.post(url).send(VALID_BODY)
        : method === "patch"
          ? agent.patch(url).send({ firstName: "Nabila" })
          : agent.delete(url));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  });
});

describe("POST /api/children", () => {
  it("creates a profile and returns the dto with zeroed stats", async () => {
    const res = await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    assertContract(ChildProfileResponseSchema, res.body, "POST /api/children");
    expect(res.body.data).toMatchObject({
      firstName: "Ayaan",
      age: 4,
      gradeLevel: "KG1",
      preferredLanguage: "bn",
      avatarCharacterId: "character_default",
      stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
    });
    expect(res.body.data.id).toEqual(expect.any(String));
    expect(res.body.data.createdAt).toEqual(expect.any(String));
    expect(state.children).toHaveLength(1);
  });

  it("scopes the new profile to the session's parent and never echoes parentId", async () => {
    const res = await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send(VALID_BODY);

    expect(state.children[0].parentId).toBe(PARENT_A.parent.id);
    expect(res.body.data).not.toHaveProperty("parentId");
    expect(res.text).not.toContain("parentId");
  });

  it("trims the first name before persisting it", async () => {
    await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send({ ...VALID_BODY, firstName: "  Ayaan  " });

    expect(state.children[0].firstName).toBe("Ayaan");
  });

  it.each([
    ["an out-of-range age", { age: 7 }],
    ["a fractional age", { age: 4.5 }],
    ["an unknown gradeLevel", { gradeLevel: "grade1" }],
    ["an unsupported preferredLanguage", { preferredLanguage: "ar" }],
    ["a blank firstName", { firstName: "   " }],
    ["an over-long firstName", { firstName: "a".repeat(51) }],
    ["a spoofed parentId", { parentId: "parent_b" }],
  ])("rejects %s with 400 VALIDATION_FAILED", async (_label, patch) => {
    const res = await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send({ ...VALID_BODY, ...patch });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(state.children).toHaveLength(0);
  });

  it.each([
    ["an id that matches no character", "character_missing"],
    ["a character that is not a default avatar", "character_unlockable"],
    ["a default character that is not published yet", "character_draft"],
  ])("rejects %s with 400 VALIDATION_FAILED", async (_label, avatarId) => {
    const res = await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send({ ...VALID_BODY, avatarCharacterId: avatarId });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details).toMatchObject({
      field: "avatarCharacterId",
    });
    expect(state.children).toHaveLength(0);
  });

  it("refuses the sixth profile with 409 CONFLICT and leaves exactly five", async () => {
    for (let i = 0; i < 5; i += 1) {
      const created = await authedAgentFor(PARENT_A)
        .post("/api/children")
        .send({ ...VALID_BODY, firstName: `Child${i}` });
      expect(created.status).toBe(201);
    }

    const res = await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: "CONFLICT", message: "Profile limit reached (5)" },
    });
    expect(state.children).toHaveLength(5);
  });

  it("counts only the calling parent's profiles towards the limit", async () => {
    for (let i = 0; i < 5; i += 1) seedChild(PARENT_B);

    const res = await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send(VALID_BODY);

    expect(res.status).toBe(201);
  });

  it("counts inside the same transaction as the create", async () => {
    await authedAgentFor(PARENT_A).post("/api/children").send(VALID_BODY);

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("runs that transaction at Serializable, which is what makes the cap hold", async () => {
    // An interactive transaction runs at READ COMMITTED, where two concurrent
    // creates both count four and both commit. A stub cannot reproduce that, so
    // assert the isolation level the guarantee rests on.
    await authedAgentFor(PARENT_A).post("/api/children").send(VALID_BODY);

    const [, options] = db.transaction.mock.calls[0] as [
      unknown,
      { isolationLevel?: string } | undefined,
    ];
    expect(options?.isolationLevel).toBe("Serializable");
  });

  it("retries once when Postgres aborts the transaction to prevent an interleave", async () => {
    const serializationFailure = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict or a deadlock",
      { code: "P2034", clientVersion: "6" },
    );
    const realTransaction = db.transaction.getMockImplementation();
    db.transaction.mockRejectedValueOnce(serializationFailure);

    const res = await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(state.children).toHaveLength(1);
    expect(realTransaction).toBeDefined();
  });

  it("surfaces a non-serialization database error instead of silently retrying", async () => {
    const other = new Prisma.PrismaClientKnownRequestError("Unique violation", {
      code: "P2002",
      clientVersion: "6",
    });
    db.transaction.mockRejectedValueOnce(other);

    const res = await authedAgentFor(PARENT_A)
      .post("/api/children")
      .send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(state.children).toHaveLength(0);
  });

  describe("COPPA consent gate (FR-AUTH-03)", () => {
    it("refuses creation with 403 CONSENT_REQUIRED before consent is given", async () => {
      PARENT_A.parent.consentGivenAt = null;
      PARENT_A.parent.consentVersion = null;

      const res = await authedAgentFor(PARENT_A)
        .post("/api/children")
        .send(VALID_BODY);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: {
          code: "CONSENT_REQUIRED",
          message: "Parental consent to the current terms is required",
        },
      });
      expect(state.children).toHaveLength(0);
    });

    it("accepts creation with 201 once consent is recorded", async () => {
      const res = await authedAgentFor(PARENT_A)
        .post("/api/children")
        .send(VALID_BODY);

      expect(res.status).toBe(201);
      expect(state.children).toHaveLength(1);
    });

    // The gate runs before body parsing, so an unconsented parent cannot tell a valid payload from an invalid one.
    it("gates before validation, so an invalid body still answers 403", async () => {
      PARENT_A.parent.consentGivenAt = null;

      const res = await authedAgentFor(PARENT_A)
        .post("/api/children")
        .send({ firstName: "", age: 99 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CONSENT_REQUIRED");
    });

    it("gates creation only — reads and updates stay open without consent", async () => {
      const child = seedChild(PARENT_A);
      PARENT_A.parent.consentGivenAt = null;

      const list = await authedAgentFor(PARENT_A).get("/api/children");
      const detail = await authedAgentFor(PARENT_A).get(
        `/api/children/${child.id}`,
      );
      const patch = await authedAgentFor(PARENT_A)
        .patch(`/api/children/${child.id}`)
        .send({ firstName: "Nabila" });

      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
      expect(patch.status).toBe(200);
    });
  });
});

describe("write verbs need only an authenticated parent", () => {
  const WRITE_ROUTES = [
    ["post", "/api/children", VALID_BODY],
    ["patch", "/api/children/:id", { firstName: "Nabila" }],
    ["delete", "/api/children/:id", undefined],
  ] as const;

  it.each(
    WRITE_ROUTES,
  )("answers %s %s without a 403", async (method, path, body) => {
    const child = seedChild(PARENT_A);

    const url = path.replace(":id", child.id);
    const request_ = authedAgentFor(PARENT_A)[method](url);
    const res = await (body === undefined ? request_ : request_.send(body));

    expect(res.status).toBeLessThan(400);
  });

  it("leaves reads and activate open — the Student Portal calls them (FR-AUTH-06)", async () => {
    const child = seedChild(PARENT_A);

    const list = await authedAgentFor(PARENT_A).get("/api/children");
    const detail = await authedAgentFor(PARENT_A).get(
      `/api/children/${child.id}`,
    );
    const activate = await authedAgentFor(PARENT_A).post(
      `/api/children/${child.id}/activate`,
    );

    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(activate.status).toBe(200);
  });

  it("answers 404 for another parent's child, never 403", async () => {
    // A cross-parent probe must not learn that the row is real (NFR-SAFE-02).
    const theirChild = seedChild(PARENT_B);

    const res = await authedAgentFor(PARENT_A).delete(
      `/api/children/${theirChild.id}`,
    );

    expect(res.status).toBe(404);
    expect(state.children).toHaveLength(1);
  });
});

describe("GET /api/children", () => {
  it("returns only the calling parent's children, oldest first", async () => {
    const second = seedChild(PARENT_A, { firstName: "Zara" });
    const first = seedChild(PARENT_A, {
      firstName: "Ayaan",
      createdAt: new Date(2025, 0, 1),
    });
    seedChild(PARENT_B, { firstName: "Other" });

    const res = await authedAgentFor(PARENT_A).get("/api/children");

    expect(res.status).toBe(200);
    assertContract(
      ChildProfileListResponseSchema,
      res.body,
      "GET /api/children",
    );
    expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(res.text).not.toContain("Other");
  });

  it("ignores a parentId query parameter — the session is the only scope", async () => {
    seedChild(PARENT_A, { firstName: "Ayaan" });
    seedChild(PARENT_B, { firstName: "Other" });

    const res = await authedAgentFor(PARENT_A).get(
      `/api/children?parentId=${PARENT_B.parent.id}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].firstName).toBe("Ayaan");
  });

  it("returns an empty list for a parent with no children", async () => {
    const res = await authedAgentFor(PARENT_A).get("/api/children");

    expect(res.body).toEqual({ data: [] });
  });
});

describe("GET /api/children/:id", () => {
  it("returns the profile the parent owns", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A).get(`/api/children/${child.id}`);

    expect(res.status).toBe(200);
    assertContract(
      ChildProfileResponseSchema,
      res.body,
      "GET /api/children/{id}",
    );
    expect(res.body.data.id).toBe(child.id);
    expect(res.body.data.stats).toEqual({
      stars: 0,
      coins: 0,
      badges: 0,
      currentStreak: 0,
    });
  });

  it("reports the stars, coins, badges and streak the child has actually earned", async () => {
    const child = seedChild(PARENT_A);
    state.ledger.push(
      { childId: child.id, rewardType: "star", amount: 2 },
      { childId: child.id, rewardType: "star", amount: 1 },
      { childId: child.id, rewardType: "coin", amount: 5 },
      { childId: child.id, rewardType: "badge", amount: 1 },
      { childId: child.id, rewardType: "badge", amount: 1 },
    );
    state.streaks.set(child.id, 4);

    const res = await authedAgentFor(PARENT_A).get(`/api/children/${child.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.stats).toEqual({
      stars: 3,
      coins: 5,
      badges: 2,
      currentStreak: 4,
    });
  });

  it("scopes each child's stats to that child on the list endpoint", async () => {
    const first = seedChild(PARENT_A);
    const second = seedChild(PARENT_A);
    state.ledger.push(
      { childId: first.id, rewardType: "star", amount: 7 },
      { childId: second.id, rewardType: "star", amount: 1 },
    );
    state.streaks.set(second.id, 2);

    const res = await authedAgentFor(PARENT_A).get("/api/children");

    expect(res.status).toBe(200);
    expect(
      res.body.data.map((child: { stats: unknown }) => child.stats),
    ).toEqual([
      { stars: 7, coins: 0, badges: 0, currentStreak: 0 },
      { stars: 1, coins: 0, badges: 0, currentStreak: 2 },
    ]);
  });

  it("answers 404 — never 403 — for another parent's child, indistinguishably from a nonexistent id", async () => {
    const child = seedChild(PARENT_A);

    const foreign = await authedAgentFor(PARENT_B).get(
      `/api/children/${child.id}`,
    );
    const nonexistent = await authedAgentFor(PARENT_B).get(
      "/api/children/child_does_not_exist",
    );

    expect(foreign.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND_ENVELOPE);
    expect(foreign.text).toBe(nonexistent.text);
  });

  it("looks the child up by id and parentId in a single query", async () => {
    const child = seedChild(PARENT_A);

    await authedAgentFor(PARENT_A).get(`/api/children/${child.id}`);

    expect(db.childFindFirst).toHaveBeenCalledTimes(1);
    expect(db.childFindFirst).toHaveBeenCalledWith({
      where: { id: child.id, parentId: PARENT_A.parent.id },
    });
  });
});

describe("PATCH /api/children/:id", () => {
  it("applies a partial update and leaves the other fields untouched", async () => {
    const child = seedChild(PARENT_A, { firstName: "Ayaan", age: 4 });

    const res = await authedAgentFor(PARENT_A)
      .patch(`/api/children/${child.id}`)
      .send({ firstName: "Nabila" });

    expect(res.status).toBe(200);
    assertContract(
      ChildProfileResponseSchema,
      res.body,
      "PATCH /api/children/{id}",
    );
    expect(res.body.data).toMatchObject({
      firstName: "Nabila",
      age: 4,
      gradeLevel: "KG1",
    });
    expect(state.children[0].firstName).toBe("Nabila");
  });

  it("rejects an empty body with 400", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A)
      .patch(`/api/children/${child.id}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an attempt to move the child to another parent", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A)
      .patch(`/api/children/${child.id}`)
      .send({ parentId: PARENT_B.parent.id });

    expect(res.status).toBe(400);
    expect(state.children[0].parentId).toBe(PARENT_A.parent.id);
  });

  it("refuses a non-starter character this child has not unlocked", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A)
      .patch(`/api/children/${child.id}`)
      .send({ avatarCharacterId: "character_unlockable" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  // The update path may not reuse creation's rule: an existing profile may wear
  // anything it has earned, not only a starter.
  it("accepts a non-starter character this child has unlocked", async () => {
    const child = seedChild(PARENT_A);
    state.unlocks.push({
      childId: child.id,
      characterId: "character_unlockable",
    });

    const res = await authedAgentFor(PARENT_A)
      .patch(`/api/children/${child.id}`)
      .send({ avatarCharacterId: "character_unlockable" });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarCharacterId).toBe("character_unlockable");
  });

  it("does not let one child wear another child's unlock", async () => {
    const mine = seedChild(PARENT_A);
    const sibling = seedChild(PARENT_A);
    state.unlocks.push({
      childId: sibling.id,
      characterId: "character_unlockable",
    });

    const res = await authedAgentFor(PARENT_A)
      .patch(`/api/children/${mine.id}`)
      .send({ avatarCharacterId: "character_unlockable" });

    expect(res.status).toBe(400);
  });

  it("still refuses an unpublished character even when unlocked", async () => {
    // The status gate is unconditional: an unlock is not a publication.
    const child = seedChild(PARENT_A);
    state.unlocks.push({ childId: child.id, characterId: "character_draft" });

    const res = await authedAgentFor(PARENT_A)
      .patch(`/api/children/${child.id}`)
      .send({ avatarCharacterId: "character_draft" });

    expect(res.status).toBe(400);
  });

  it("answers 404 for another parent's child without touching the row", async () => {
    const child = seedChild(PARENT_A, { firstName: "Ayaan" });

    const res = await authedAgentFor(PARENT_B)
      .patch(`/api/children/${child.id}`)
      .send({ firstName: "Hacked" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_ENVELOPE);
    expect(state.children[0].firstName).toBe("Ayaan");
    expect(db.childUpdate).not.toHaveBeenCalled();
  });
});

describe("GET /api/children/:id/characters", () => {
  it("returns every published character, locked ones included", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A).get(
      `/api/children/${child.id}/characters`,
    );

    expect(res.status).toBe(200);
    assertContract(
      CharacterUnlockListResponseSchema,
      res.body,
      "GET /api/children/{id}/characters",
    );
    expect(res.body.data.characters).toEqual([
      {
        id: "character_default",
        slug: "leo-the-lion",
        name: "Leo the Lion",
        imageUrl: null,
        isDefault: true,
        isUnlocked: true,
      },
      {
        id: "character_unlockable",
        slug: "mia-the-monkey",
        name: "Mia the Monkey",
        imageUrl: null,
        isDefault: false,
        isUnlocked: false,
      },
    ]);
  });

  it("flags a character this child has unlocked", async () => {
    const child = seedChild(PARENT_A);
    state.unlocks.push({
      childId: child.id,
      characterId: "character_unlockable",
    });

    const res = await authedAgentFor(PARENT_A).get(
      `/api/children/${child.id}/characters`,
    );

    expect(res.body.data.characters[1]).toMatchObject({
      id: "character_unlockable",
      isUnlocked: true,
    });
  });

  it("does not flag another child's unlock", async () => {
    const mine = seedChild(PARENT_A);
    const sibling = seedChild(PARENT_A);
    state.unlocks.push({
      childId: sibling.id,
      characterId: "character_unlockable",
    });

    const res = await authedAgentFor(PARENT_A).get(
      `/api/children/${mine.id}/characters`,
    );

    expect(res.body.data.characters[1].isUnlocked).toBe(false);
  });

  it("never lists an unpublished character (backend.md §4)", async () => {
    const child = seedChild(PARENT_A);
    state.unlocks.push({ childId: child.id, characterId: "character_draft" });

    const res = await authedAgentFor(PARENT_A).get(
      `/api/children/${child.id}/characters`,
    );

    // An unlock is not a publication: a draft stays out of the picker.
    expect(
      res.body.data.characters.some(
        (character: { id: string }) => character.id === "character_draft",
      ),
    ).toBe(false);
    expect(db.characterFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "published" } }),
    );
  });

  it("answers 404 for another parent's child", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_B).get(
      `/api/children/${child.id}/characters`,
    );

    // 404 not 403, so a probe cannot confirm the profile exists (NFR-SAFE-02).
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_ENVELOPE);
    expect(db.characterFindMany).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    const child = seedChild(PARENT_A);

    const res = await anonymousAgent().get(
      `/api/children/${child.id}/characters`,
    );

    expect(res.status).toBe(401);
    expect(db.characterFindMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/children/:id", () => {
  it("removes the profile and reports deleted:true", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A).delete(
      `/api/children/${child.id}`,
    );

    expect(res.status).toBe(200);
    assertContract(
      DeletedResponseSchema,
      res.body,
      "DELETE /api/children/{id}",
    );
    expect(res.body).toEqual({ data: { deleted: true } });
    expect(state.children).toHaveLength(0);
  });

  it("issues a single delete and lets the database cascade the child's data", async () => {
    const child = seedChild(PARENT_A);

    await authedAgentFor(PARENT_A).delete(`/api/children/${child.id}`);

    expect(db.childDelete).toHaveBeenCalledTimes(1);
    expect(db.childDelete).toHaveBeenCalledWith({ where: { id: child.id } });
  });

  it("runs no interactive transaction, so a heavy profile cannot time out", async () => {
    // Prisma's interactive transactions time out at 5s by default.
    const child = seedChild(PARENT_A);

    await authedAgentFor(PARENT_A).delete(`/api/children/${child.id}`);

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("clears activeChildProfileId so the session stops pointing at a deleted profile", async () => {
    const child = seedChild(PARENT_A);
    await authedAgentFor(PARENT_A).post(`/api/children/${child.id}/activate`);

    await authedAgentFor(PARENT_A).delete(`/api/children/${child.id}`);

    const me = await authedAgentFor(PARENT_A).get("/api/auth/me");
    expect(me.body.data.activeChildProfileId).toBeNull();
  });

  it("leaves a sibling profile active when a different child is deleted", async () => {
    const active = seedChild(PARENT_A);
    const other = seedChild(PARENT_A);
    await authedAgentFor(PARENT_A).post(`/api/children/${active.id}/activate`);

    await authedAgentFor(PARENT_A).delete(`/api/children/${other.id}`);

    const me = await authedAgentFor(PARENT_A).get("/api/auth/me");
    expect(me.body.data.activeChildProfileId).toBe(active.id);
  });

  it("answers 404 for another parent's child and deletes nothing", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_B).delete(
      `/api/children/${child.id}`,
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_ENVELOPE);
    expect(state.children).toHaveLength(1);
    expect(db.childDelete).not.toHaveBeenCalled();
  });
});

describe("POST /api/children/:id/activate", () => {
  it("writes the child id into the session and reports it back", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A).post(
      `/api/children/${child.id}/activate`,
    );

    expect(res.status).toBe(200);
    assertContract(
      ActiveChildResponseSchema,
      res.body,
      "POST /api/children/{id}/activate",
    );
    expect(res.body).toEqual({ data: { activeChildProfileId: child.id } });
    expect(state.sessions.get(PARENT_A.sessionId)?.activeChildProfileId).toBe(
      child.id,
    );
  });

  it("is visible to GET /api/auth/me on the next request", async () => {
    const child = seedChild(PARENT_A);

    await authedAgentFor(PARENT_A).post(`/api/children/${child.id}/activate`);
    const me = await authedAgentFor(PARENT_A).get("/api/auth/me");

    expect(me.body.data.activeChildProfileId).toBe(child.id);
  });

  it("switches between profiles without re-authenticating (FR-AUTH-06)", async () => {
    const first = seedChild(PARENT_A);
    const second = seedChild(PARENT_A);

    await authedAgentFor(PARENT_A).post(`/api/children/${first.id}/activate`);
    const res = await authedAgentFor(PARENT_A).post(
      `/api/children/${second.id}/activate`,
    );

    expect(res.status).toBe(200);
    expect(state.sessions.get(PARENT_A.sessionId)?.activeChildProfileId).toBe(
      second.id,
    );
  });

  it("answers 404 for another parent's child and leaves both sessions alone", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_B).post(
      `/api/children/${child.id}/activate`,
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_ENVELOPE);
    expect(db.sessionUpdate).not.toHaveBeenCalled();
    expect(state.sessions.get(PARENT_B.sessionId)?.activeChildProfileId).toBe(
      null,
    );
  });
});

describe("ownership leaks nothing (NFR-SAFE-02)", () => {
  it("answers every cross-parent verb with bytes identical to a nonexistent id, and never 403", async () => {
    const child = seedChild(PARENT_A);
    const missing = "child_does_not_exist";

    const responses = await Promise.all([
      authedAgentFor(PARENT_B).get(`/api/children/${child.id}`),
      authedAgentFor(PARENT_B)
        .patch(`/api/children/${child.id}`)
        .send({ firstName: "Hacked" }),
      authedAgentFor(PARENT_B).delete(`/api/children/${child.id}`),
      authedAgentFor(PARENT_B).post(`/api/children/${child.id}/activate`),
    ]);
    const control = await authedAgentFor(PARENT_B).get(
      `/api/children/${missing}`,
    );

    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
      expect(res.text).toBe(control.text);
    }
  });
});

describe("cascade-delete contract", () => {
  // Postgres removes the child's rows on delete; a stub cannot show that, so assert the declaration it rests on.
  it("declares onDelete: Cascade on every relation pointing at ChildProfile", () => {
    const schema = readFileSync(
      new URL(
        "../../../../../packages/db/prisma/schema.prisma",
        import.meta.url,
      ),
      "utf8",
    );

    const relations = schema
      .split("\n")
      .filter((line) => /^\s*child\s+ChildProfile\b/.test(line));

    expect(relations).toHaveLength(8);
    for (const relation of relations) {
      expect(relation).toContain("onDelete: Cascade");
    }
  });

  it("declares onDelete: SetNull on the session's active-child pointer", () => {
    const schema = readFileSync(
      new URL(
        "../../../../../packages/db/prisma/schema.prisma",
        import.meta.url,
      ),
      "utf8",
    );

    const pointer = schema
      .split("\n")
      .find((line) => /^\s*activeChildProfile\s+ChildProfile\?/.test(line));

    expect(pointer).toContain("onDelete: SetNull");
  });
});
