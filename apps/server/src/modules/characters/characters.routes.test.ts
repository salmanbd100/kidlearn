/**
 * Stubs `config/prisma.js` per the stub exception in `document/standards/general.md §5`; rule 2 applies,
 * so the content-safety guard is asserted as the `where` clause.
 */
import { AvatarCharacterListResponseSchema } from "@kidlearn/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";
import request from "../../shared/testing/request.js";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  parentUpsert: vi.fn(),
  accountFindFirst: vi.fn(),
  characterFindMany: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique, upsert: db.parentUpsert },
    account: { findFirst: db.accountFindFirst },
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

const PARENT_ROW = {
  id: "parent_1",
  userId: SESSION_USER.id,
  email: SESSION_USER.email,
  consentGivenAt: null,
};

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

  // Narrowed: `getSession` returns a deep better-auth type; only the fields the guards read are supplied.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: {
      id: "session_1",
      userId: SESSION_USER.id,
      activeChildProfileId: null,
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

    // Content-safety guard (backend.md §4), asserted as the query per the stub exception.
    const [{ where }] = db.characterFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where).toEqual({ isDefault: true, status: "published" });
  });

  it("filters on exactly what child creation validates against", async () => {
    // Must match `assertAvatarIsSelectable`'s lookup, or the picker offers avatars POST /api/children rejects.
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
