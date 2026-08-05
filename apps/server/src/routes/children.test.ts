/**
 * See the note at the top of `middleware/require-parent.test.ts`: `general.md §5`
 * wants service and route tests to run against a real test database, and there
 * is none wired up yet. Until that harness lands, these tests stub
 * `lib/prisma.js` with a small in-memory store so ownership, the five-profile
 * limit and the session bookkeeping are exercised against realistic query
 * behaviour rather than one-shot `mockResolvedValue`s.
 *
 * The one thing a stub genuinely cannot prove is the `ON DELETE CASCADE` that
 * `DELETE /api/children/:id` relies on, so that is asserted against the Prisma
 * schema itself at the bottom of this file.
 */
import { readFileSync } from "node:fs";
import type { ChildProfile, Parent } from "@kidlearn/db";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CharacterRow = { id: string; isDefault: boolean; status: string };
type SessionRow = {
  id: string;
  userId: string;
  activeChildProfileId: string | null;
};

const state = vi.hoisted(() => ({
  children: [] as ChildProfile[],
  sessions: new Map<string, SessionRow>(),
  nextChildId: 0,
}));

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
  sessionUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => {
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
    character: { findFirst: db.characterFindFirst },
    session: { update: db.sessionUpdate, updateMany: db.sessionUpdateMany },
    // Interactive transaction: the callback gets the same stubbed client, so
    // `tx.childProfile.count` and the real client's spy are one and the same.
    // Rollback is not simulated — the limit test asserts `create` was never
    // reached instead of asserting a rolled-back row.
    $transaction: db.transaction,
  };
  return { prisma: client };
});

const { app } = await import("../app.js");
const { auth } = await import("../lib/auth.js");

// --- Fixtures ---------------------------------------------------------------

/** Header the stubbed `getSession` reads to decide who is calling. */
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
      pinHash: null,
      // Consented by default: `POST /api/children` sits behind `requireConsent`,
      // so an unconsented fixture would 403 every creation test. `beforeEach`
      // restores this, and the consent tests clear it deliberately.
      consentGivenAt: CONSENTED_AT,
      consentVersion: "1.0",
      pinFailedCount: 0,
      pinLockedUntil: null,
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

/**
 * The catalogue a real `beforeAll` would seed. `character_default` is the only
 * row a new profile may pick: the other two exist to prove the query filters on
 * both `isDefault` and `status`.
 */
const CHARACTERS: CharacterRow[] = [
  { id: "character_default", isDefault: true, status: "published" },
  { id: "character_unlockable", isDefault: false, status: "published" },
  { id: "character_draft", isDefault: true, status: "draft" },
];

const VALID_BODY = {
  firstName: "Ayaan",
  age: 4,
  gradeLevel: "KG1",
  preferredLanguage: "bn",
  avatarCharacterId: "character_default",
};

/** The exact envelope every ownership failure must produce. */
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

/**
 * A Supertest wrapper that authenticates every request as `fixture`. Two of
 * these coexist in the ownership tests, which is the point: the cross-parent
 * 404s are the security-critical assertions in this file.
 */
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

/** An agent with no session at all. */
function anonymousAgent() {
  return request(app);
}

// --- Store-backed Prisma stubs ---------------------------------------------

type ChildWhere = { id?: string; parentId?: string };

function matches(child: ChildProfile, where: ChildWhere): boolean {
  if (where.id !== undefined && child.id !== where.id) return false;
  if (where.parentId !== undefined && child.parentId !== where.parentId) {
    return false;
  }
  return true;
}

beforeEach(() => {
  state.children = [];
  state.nextChildId = 0;
  state.sessions.clear();
  for (const fixture of FIXTURES.values()) {
    state.sessions.set(fixture.sessionId, {
      id: fixture.sessionId,
      userId: fixture.user.id,
      activeChildProfileId: null,
    });
    // The fixture parents are module-level objects, so a test that revokes
    // consent would otherwise leak into every test after it.
    fixture.parent.consentGivenAt = CONSENTED_AT;
    fixture.parent.consentVersion = "1.0";
  }

  for (const spy of Object.values(db)) spy.mockReset();

  db.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const { prisma } = await import("../lib/prisma.js");
      return fn(prisma);
    },
  );

  db.parentFindUnique.mockImplementation(
    async ({ where }: { where: { userId: string } }) =>
      [...FIXTURES.values()].find((f) => f.user.id === where.userId)?.parent ??
      null,
  );

  db.characterFindFirst.mockImplementation(
    async ({ where }: { where: CharacterRow }) =>
      CHARACTERS.find(
        (c) =>
          c.id === where.id &&
          c.isDefault === where.isDefault &&
          c.status === where.status,
      ) ?? null,
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

  // Resolves the caller from the test header, then hands back the live session
  // row so a write through `session.update` is visible to the next request —
  // which is how `GET /api/auth/me` can be used to verify activation.
  vi.spyOn(auth.api, "getSession").mockImplementation(async (context) => {
    const key = context?.headers?.get(TEST_PARENT_HEADER) ?? "";
    const fixture = FIXTURES.get(key);
    if (!fixture) return null;
    return {
      user: fixture.user,
      session: state.sessions.get(fixture.sessionId),
      // Narrowed at this boundary: `getSession` returns a deep better-auth type
      // and the server only reads the fields supplied here.
    } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests ------------------------------------------------------------------

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
          message: "Parental consent is required before adding a child",
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

    /**
     * The gate must run before the body is parsed, so an unconsented parent
     * cannot tell a valid payload from an invalid one — 403 either way.
     */
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
    expect(res.body.data.id).toBe(child.id);
    expect(res.body.data.stats).toEqual({
      stars: 0,
      coins: 0,
      badges: 0,
      currentStreak: 0,
    });
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

  it("re-validates a changed avatar against the default-character catalogue", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A)
      .patch(`/api/children/${child.id}`)
      .send({ avatarCharacterId: "character_unlockable" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
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

describe("DELETE /api/children/:id", () => {
  it("removes the profile and reports deleted:true", async () => {
    const child = seedChild(PARENT_A);

    const res = await authedAgentFor(PARENT_A).delete(
      `/api/children/${child.id}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { deleted: true } });
    expect(state.children).toHaveLength(0);
  });

  it("issues a single delete and lets the database cascade the child's data", async () => {
    const child = seedChild(PARENT_A);

    await authedAgentFor(PARENT_A).delete(`/api/children/${child.id}`);

    expect(db.childDelete).toHaveBeenCalledTimes(1);
    expect(db.childDelete).toHaveBeenCalledWith({ where: { id: child.id } });
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

  it("switches between profiles without any PIN step (FR-AUTH-06)", async () => {
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
  /**
   * `DELETE /api/children/:id` deletes one row and trusts Postgres to remove the
   * child's progress, rewards, streak and so on. A stubbed Prisma client cannot
   * demonstrate that, so this asserts the declaration the guarantee rests on.
   * Replace it with a real deletion test once the test-database harness exists.
   */
  it("declares onDelete: Cascade on every relation pointing at ChildProfile", () => {
    const schema = readFileSync(
      new URL("../../../../packages/db/prisma/schema.prisma", import.meta.url),
      "utf8",
    );

    const relations = schema
      .split("\n")
      .filter((line) => /^\s*child\s+ChildProfile\b/.test(line));

    // LessonProgress, QuizResponse, RewardLedger, ChildCharacter, Streak,
    // ScreenTimeSetting, SessionEvent, WeeklyReport.
    expect(relations).toHaveLength(8);
    for (const relation of relations) {
      expect(relation).toContain("onDelete: Cascade");
    }
  });
});
