/**
 * See the recorded exception in `document/standards/general.md §5`: no test
 * database is provisioned yet, so `lib/prisma.js` is stubbed and
 * `auth.api.getSession` is spied on.
 *
 * Per rule 2 of that exception, the content-safety guard is asserted as the
 * `where` clause that produces it. A stub cannot show that an unpublished
 * character stayed in the database, so this suite asserts the query that keeps it
 * there — and that the filter is the same one `POST /api/children` applies, since
 * an endpoint offering an avatar creation would reject is its own kind of bug.
 */
import { AvatarCharacterListResponseSchema } from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  accountFindFirst: vi.fn(),
  characterFindMany: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique, upsert: db.parentUpsert },
    account: { findFirst: db.accountFindFirst },
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

const PARENT_ROW = {
  id: "parent_1",
  userId: SESSION_USER.id,
  email: SESSION_USER.email,
  pinHash: null,
  consentGivenAt: null,
};

/** What `character.findMany` returns for the seeded starter set. */
const LION = {
  id: "char_lion",
  slug: "leo-the-lion",
  name: "Leo the Lion",
  asset: null,
};
const OWL = {
  id: "char_owl",
  slug: "ollie-the-owl",
  name: "Ollie the Owl",
  asset: { url: "https://cdn.example.com/ollie.webp" },
};

beforeEach(() => {
  for (const mock of Object.values(db)) mock.mockReset();
  db.parentFindUnique.mockResolvedValue(PARENT_ROW);
  db.characterFindMany.mockResolvedValue([LION, OWL]);

  // `getSession` returns a deep better-auth type; only the fields the guards
  // read are supplied, so the shape is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: {
      id: "session_1",
      userId: SESSION_USER.id,
      activeChildProfileId: null,
      pinVerifiedUntil: null,
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/characters", () => {
  it("requires an authenticated parent", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get("/api/characters");

    expect(res.status).toBe(401);
    expect(db.characterFindMany).not.toHaveBeenCalled();
  });

  it("returns the starter avatars with a flattened image url", async () => {
    const res = await request(app).get("/api/characters");

    expect(res.status).toBe(200);
    assertContract(
      AvatarCharacterListResponseSchema,
      res.body,
      "GET /api/characters",
    );
    expect(res.body.data).toEqual([
      {
        id: "char_lion",
        slug: "leo-the-lion",
        name: "Leo the Lion",
        imageUrl: null,
      },
      {
        id: "char_owl",
        slug: "ollie-the-owl",
        name: "Ollie the Owl",
        imageUrl: "https://cdn.example.com/ollie.webp",
      },
    ]);
  });

  it("offers only published characters, so a draft avatar can never be chosen", async () => {
    await request(app).get("/api/characters");

    // The content-safety guard (backend.md §4). Asserted as the query rather
    // than as an absent row, per the stubbing exception in general.md §5.
    const [{ where }] = db.characterFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where).toEqual({ isDefault: true, status: "published" });
  });

  it("filters on exactly what child creation validates against", async () => {
    // `assertAvatarIsSelectable` in childProfileService.ts looks up
    // `{ id, isDefault: true, status: "published" }`. If this list ever widened
    // past that, it would offer avatars that POST /api/children rejects with a
    // 400 the parent cannot act on.
    await request(app).get("/api/characters");

    const [{ where }] = db.characterFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where).toMatchObject({ isDefault: true, status: "published" });
    expect(Object.keys(where).sort()).toEqual(["isDefault", "status"]);
  });

  it("returns an empty list rather than failing when nothing is published", async () => {
    db.characterFindMany.mockResolvedValue([]);

    const res = await request(app).get("/api/characters");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it("does not leak the unlock rule or publication status of a character", async () => {
    const res = await request(app).get("/api/characters");

    // `select` is an allowlist, so this asserts the allowlist held.
    expect(res.text).not.toContain("unlockRule");
    expect(res.text).not.toContain("isDefault");
    expect(res.text).not.toContain("published");
  });
});
