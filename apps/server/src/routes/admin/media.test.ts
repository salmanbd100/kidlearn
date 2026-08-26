/**
 * `/api/admin/media` — signed direct uploads and the asset library (file 33,
 * FR-CMS-02).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* One `mediaAsset` array, and the stub applies the
 *     route's real `where` and `orderBy` to it. The filter tests read back rows a
 *     registration wrote.
 *  2. *Assert the query, not just the result.* The `?language=bn` case asserts
 *     that a language-neutral image is **excluded**, which is a claim about the
 *     `where` the service builds rather than about the response shape.
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here is
 *     content-gated. A `MediaAsset` has no status — the entities that point at one
 *     carry it.
 *  4. *Name what the stub cannot prove.* Two things, both stated where they are
 *     relevant: that Cloudinary actually accepts the signature (asserted against
 *     the documented algorithm instead — see the signing test), and that the
 *     browser really does bypass this server, which is a claim about
 *     `apps/web/lib/admin-api.ts` and is covered there.
 */

import { createHash } from "node:crypto";
import {
  MediaAssetListResponseSchema,
  MediaAssetResponseSchema,
  UploadSignatureResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";

const BASE = "/api/admin/media";

const ADMIN_USER_ID = "user_admin_1";
const PARENT_USER_ID = "user_parent_1";

/** Must match `vitest.setup.ts`, which is where env.ts reads them from. */
const CLOUD_NAME = "test-cloud";
const API_KEY = "test-api-key";
const API_SECRET = "test-api-secret";

const DELIVERY_BASE = `https://res.cloudinary.com/${CLOUD_NAME}`;

/** A fixed clock, so the signature below is reproducible. */
const FIXED_NOW_MS = 1_767_225_600_000;
const FIXED_TIMESTAMP = Math.round(FIXED_NOW_MS / 1000);

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  admins: [] as Array<Record<string, unknown> & { authUserId: string | null }>,
  assets: [] as Row[],
}));

const db = vi.hoisted(() => ({ adminFindUnique: vi.fn() }));

vi.mock("../../lib/prisma.js", () => {
  const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([column, value]) => row[column] === value);

  const client = {
    adminUser: { findUnique: db.adminFindUnique },
    mediaAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = {
          id: `asset-${store.assets.length + 1}`,
          createdAt: new Date(
            `2026-08-2${store.assets.length + 1}T00:00:00.000Z`,
          ),
          language: null,
          ...data,
        };
        store.assets.push(row);
        return row;
      },
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt?: "asc" | "desc" };
      }) => {
        const found = store.assets.filter((row) => matches(row, where));
        const direction = orderBy?.createdAt === "desc" ? -1 : 1;
        return [...found].sort(
          (left, right) =>
            direction *
            ((left.createdAt as Date).getTime() -
              (right.createdAt as Date).getTime()),
        );
      },
    },
    // Present so a stray parent-provisioning read fails loudly: no admin route
    // may create a Parent row.
    parent: { findUnique: vi.fn(), upsert: vi.fn() },
    account: { findFirst: vi.fn() },
  };

  return { prisma: client };
});

const { app } = await import("../../app.js");
const { auth } = await import("../../lib/auth.js");

function mockSession(userId: string) {
  // Only the fields the guards read are supplied, so the deep better-auth return
  // type is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: { id: userId, email: "someone@example.com", name: "Someone" },
    session: { id: `session_${userId}`, userId },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

beforeEach(() => {
  store.admins = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      email: "reviewer@kidlearn.test",
      name: "Reviewer One",
      role: "admin",
      authUserId: ADMIN_USER_ID,
    },
  ];
  store.assets = [];
  db.adminFindUnique.mockReset();
  db.adminFindUnique.mockImplementation(
    async ({ where }: { where: { authUserId?: string } }) =>
      store.admins.find((row) => row.authUserId === where.authUserId) ?? null,
  );
  mockSession(ADMIN_USER_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the admin guard covers every media path", () => {
  const PROBES = [
    { method: "post" as const, path: `${BASE}/sign` },
    { method: "post" as const, path: BASE },
    { method: "get" as const, path: BASE },
  ];

  it.each(PROBES)("401 unauthenticated: $method $path", async ({
    method,
    path,
  }) => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(store.assets).toEqual([]);
  });

  it.each(PROBES)("403 for a signed-in parent: $method $path", async ({
    method,
    path,
  }) => {
    // A Google sign-in never writes an AdminUser row, and that absence *is* the
    // authorisation check (spec §4.3).
    mockSession(PARENT_USER_ID);

    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(store.assets).toEqual([]);
  });
});

describe("POST /api/admin/media/sign", () => {
  const OPERATION = "POST /api/admin/media/sign";

  it("signs the timestamp and folder with Cloudinary's documented algorithm", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);

    const res = await request(app).post(`${BASE}/sign`).send({ kind: "image" });

    expect(res.status).toBe(200);
    assertContract(UploadSignatureResponseSchema, res.body, OPERATION);

    // Recomputed here rather than by calling the same helper the route used:
    // sorted `key=value` pairs, `&`-joined, secret appended, SHA-1. Asserting it
    // this way is what makes the test evidence that Cloudinary will accept the
    // signature, which no stub can prove directly.
    const expected = createHash("sha1")
      .update(`folder=kidlearn/image&timestamp=${FIXED_TIMESTAMP}${API_SECRET}`)
      .digest("hex");

    expect(res.body.data).toEqual({
      timestamp: FIXED_TIMESTAMP,
      folder: "kidlearn/image",
      signature: expected,
      apiKey: API_KEY,
      cloudName: CLOUD_NAME,
    });
  });

  it("folders each kind separately", async () => {
    const res = await request(app).post(`${BASE}/sign`).send({ kind: "audio" });

    expect(res.body.data.folder).toBe("kidlearn/audio");
  });

  it("never returns the API secret", async () => {
    const res = await request(app).post(`${BASE}/sign`).send({ kind: "video" });

    expect(res.text).not.toContain(API_SECRET);
  });

  it("rejects a kind that is not one of the three", async () => {
    const res = await request(app).post(`${BASE}/sign`).send({ kind: "pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("POST /api/admin/media", () => {
  const OPERATION = "POST /api/admin/media";

  it("registers a delivery URL for this cloud", async () => {
    const res = await request(app)
      .post(BASE)
      .send({
        url: `${DELIVERY_BASE}/video/upload/v1/kidlearn/video/letter-a.mp4`,
        kind: "video",
        language: "en",
      });

    expect(res.status).toBe(201);
    assertContract(MediaAssetResponseSchema, res.body, OPERATION);
    expect(res.body.data).toMatchObject({ kind: "video", language: "en" });
    expect(store.assets).toHaveLength(1);
  });

  it("stores an omitted language as an explicit null", async () => {
    const res = await request(app)
      .post(BASE)
      .send({
        url: `${DELIVERY_BASE}/image/upload/v1/kidlearn/image/apple.png`,
        kind: "image",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.language).toBeNull();
  });

  it("rejects a URL on another host", async () => {
    // The client is the only party that knows the URL, because the upload never
    // touched this server. Without this check the endpoint would write any address
    // on the internet into a row a child's lesson later plays.
    const res = await request(app).post(BASE).send({
      url: "https://evil.example.com/video/upload/v1/nasty.mp4",
      kind: "video",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(store.assets).toEqual([]);
  });

  it("rejects a delivery URL for a different Cloudinary cloud", async () => {
    const res = await request(app).post(BASE).send({
      url: "https://res.cloudinary.com/someone-else/image/upload/v1/x.png",
      kind: "image",
    });

    expect(res.status).toBe(400);
    expect(store.assets).toEqual([]);
  });

  it("rejects a prefix that only looks like ours", async () => {
    // `startsWith` on the cloud name alone would accept `test-cloud-evil`.
    const res = await request(app)
      .post(BASE)
      .send({
        url: `https://res.cloudinary.com/${CLOUD_NAME}-evil/image/upload/v1/x.png`,
        kind: "image",
      });

    expect(res.status).toBe(400);
    expect(store.assets).toEqual([]);
  });

  it("rejects an unknown field rather than dropping it", async () => {
    const res = await request(app)
      .post(BASE)
      .send({
        url: `${DELIVERY_BASE}/image/upload/v1/x.png`,
        kind: "image",
        publicId: "x",
      });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/media", () => {
  const OPERATION = "GET /api/admin/media";

  async function seedThree() {
    await request(app)
      .post(BASE)
      .send({ url: `${DELIVERY_BASE}/a.png`, kind: "image" });
    await request(app)
      .post(BASE)
      .send({ url: `${DELIVERY_BASE}/b.mp3`, kind: "audio", language: "en" });
    await request(app)
      .post(BASE)
      .send({ url: `${DELIVERY_BASE}/c.mp3`, kind: "audio", language: "bn" });
  }

  it("lists every asset newest first", async () => {
    await seedThree();

    const res = await request(app).get(BASE);

    expect(res.status).toBe(200);
    assertContract(MediaAssetListResponseSchema, res.body, OPERATION);
    expect(res.body.data.map((asset: { url: string }) => asset.url)).toEqual([
      `${DELIVERY_BASE}/c.mp3`,
      `${DELIVERY_BASE}/b.mp3`,
      `${DELIVERY_BASE}/a.png`,
    ]);
  });

  it("filters by kind", async () => {
    await seedThree();

    const res = await request(app).get(`${BASE}?kind=audio`);

    expect(res.body.data).toHaveLength(2);
  });

  it("excludes language-neutral assets when a language is asked for", async () => {
    await seedThree();

    const res = await request(app).get(`${BASE}?kind=audio&language=bn`);

    expect(res.body.data.map((asset: { url: string }) => asset.url)).toEqual([
      `${DELIVERY_BASE}/c.mp3`,
    ]);
  });

  it("rejects an unknown filter", async () => {
    const res = await request(app).get(`${BASE}?kind=audio&mood=cheerful`);

    expect(res.status).toBe(400);
  });
});
