import type { AdminUser } from "@kidlearn/db";
import {
  AdminAccessTokenListResponseSchema,
  AdminAccessTokenResponseSchema,
  CreatedAdminAccessTokenResponseSchema,
  MAX_ACTIVE_ACCESS_TOKENS,
} from "@kidlearn/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../../app.js";
import { auth } from "../../../config/auth.js";
import { prisma } from "../../../config/prisma.js";
import { assertContract } from "../../../openapi/assert-contract.js";
import {
  createParent,
  createSignedInAdmin,
} from "../../../shared/testing/factories.js";
import request from "../../../shared/testing/request.js";
import {
  createAccessToken,
  hashAccessToken,
  revokeAllAccessTokens,
} from "./access-tokens.service.js";

const BASE = "/api/admin/access-tokens";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

let admin: AdminUser;

/** Real rows behind the session; only the cookie lookup is skipped. */
function signedInAs(userId: string) {
  // Only the fields the guards read are supplied; the deep better-auth return type is narrowed here.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: { id: userId },
    session: { id: `session-${userId}`, userId, createdAt: new Date() },
  } as unknown as AuthSession);
}

beforeEach(async () => {
  admin = await createSignedInAdmin();
  signedInAs(admin.authUserId ?? "");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/access-tokens", () => {
  it("returns the secret once and stores only its hash", async () => {
    const res = await request(app)
      .post(BASE)
      .send({ name: "Claude Desktop — laptop" });

    expect(res.status).toBe(201);
    assertContract(
      CreatedAdminAccessTokenResponseSchema,
      res.body,
      "POST /api/admin/access-tokens",
    );
    expect(res.headers["cache-control"]).toBe("no-store");

    const { secret, token } = res.body.data;
    expect(secret).toMatch(/^klat_[A-Za-z0-9_-]{43}$/);
    expect(secret.startsWith(token.prefix)).toBe(true);

    const row = await prisma.adminAccessToken.findUniqueOrThrow({
      where: { id: token.id },
    });
    expect(row.tokenHash).toBe(hashAccessToken(secret));
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(row.scopes).toEqual(["mcp:drafts"]);
  });

  it("defaults to seven days and refuses more than thirty", async () => {
    const res = await request(app).post(BASE).send({ name: "Cursor" });
    const days =
      (new Date(res.body.data.token.expiresAt).getTime() - Date.now()) /
      86_400_000;
    expect(Math.round(days)).toBe(7);

    const tooLong = await request(app)
      .post(BASE)
      .send({ name: "Cursor", expiresInDays: 31 });
    expect(tooLong.status).toBe(400);
  });

  it("409s an admin already holding the maximum of active tokens, counting revoked and expired ones out", async () => {
    const row = (suffix: string, extra: object = {}) => ({
      adminId: admin.id,
      name: suffix,
      prefix: "klat_abcdefg",
      tokenHash: suffix.padEnd(64, "0"),
      scopes: ["mcp:drafts"],
      expiresAt: new Date(Date.now() + 86_400_000),
      ...extra,
    });
    await prisma.adminAccessToken.createMany({
      data: [
        ...Array.from({ length: MAX_ACTIVE_ACCESS_TOKENS - 1 }, (_, i) =>
          row(`active${i}`),
        ),
        row("revoked", { revokedAt: new Date() }),
        row("expired", { expiresAt: new Date(Date.now() - 1000) }),
      ],
    });

    const last = await request(app).post(BASE).send({ name: "Last one" });
    expect(last.status).toBe(201);

    const over = await request(app).post(BASE).send({ name: "One too many" });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("CONFLICT");
  });

  it("holds the ceiling against parallel requests", async () => {
    const results = await Promise.all(
      Array.from({ length: MAX_ACTIVE_ACCESS_TOKENS + 5 }, (_, i) =>
        request(app)
          .post(BASE)
          .send({ name: `Parallel ${i}` }),
      ),
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(
      MAX_ACTIVE_ACCESS_TOKENS,
    );
    expect(results.every((res) => [201, 409].includes(res.status))).toBe(true);
    expect(
      await prisma.adminAccessToken.count({ where: { adminId: admin.id } }),
    ).toBe(MAX_ACTIVE_ACCESS_TOKENS);
  });

  it("403s a parent session", async () => {
    const parent = await createParent();
    signedInAs(parent.userId);

    const res = await request(app).post(BASE).send({ name: "x" });

    expect(res.status).toBe(403);
    expect(await prisma.adminAccessToken.count()).toBe(0);
  });
});

describe("GET /api/admin/access-tokens", () => {
  it("lists the caller's own tokens, never another admin's and never a secret", async () => {
    await request(app).post(BASE).send({ name: "Mine" });
    const other = await createSignedInAdmin();
    await prisma.adminAccessToken.create({
      data: {
        adminId: other.id,
        name: "Theirs",
        prefix: "klat_abcdefg",
        tokenHash: "x".repeat(64),
        scopes: ["mcp:drafts"],
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const res = await request(app).get(BASE);

    assertContract(
      AdminAccessTokenListResponseSchema,
      res.body,
      "GET /api/admin/access-tokens",
    );
    expect(
      res.body.data.tokens.map((one: { name: string }) => one.name),
    ).toEqual(["Mine"]);
  });
});

describe("DELETE /api/admin/access-tokens/:id", () => {
  it("revokes the caller's token", async () => {
    const created = await request(app).post(BASE).send({ name: "Mine" });

    const res = await request(app).delete(
      `${BASE}/${created.body.data.token.id}`,
    );

    expect(res.status).toBe(200);
    assertContract(
      AdminAccessTokenResponseSchema,
      res.body,
      "DELETE /api/admin/access-tokens/{id}",
    );
    expect(res.body.data.revokedAt).not.toBeNull();
  });

  it("404s another admin's token and leaves it working", async () => {
    const other = await createSignedInAdmin();
    const theirs = await prisma.adminAccessToken.create({
      data: {
        adminId: other.id,
        name: "Theirs",
        prefix: "klat_abcdefg",
        tokenHash: "y".repeat(64),
        scopes: ["mcp:drafts"],
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const res = await request(app).delete(`${BASE}/${theirs.id}`);

    expect(res.status).toBe(404);
    expect(
      (
        await prisma.adminAccessToken.findUniqueOrThrow({
          where: { id: theirs.id },
        })
      ).revokedAt,
    ).toBeNull();
  });
});

describe("an access token outside /mcp", () => {
  // Req. 4 rests the 7–30-day lifetime on this: a token cannot reach `/api/admin/*`, so it cannot mint another token
  // or approve a draft.
  it("is not a session for /api/admin", async () => {
    const { secret } = await createAccessToken(admin.id, {
      name: "Claude Code",
      expiresInDays: 7,
    });
    vi.restoreAllMocks();

    const mint = await request(app)
      .post(BASE)
      .set("Authorization", `Bearer ${secret}`)
      .send({ name: "Minted from a token" });
    const approve = await request(app)
      .post("/api/admin/ai/jobs/66666666-6666-4666-8666-666666666666/approve")
      .set("Authorization", `Bearer ${secret}`);

    expect(mint.status).toBe(401);
    expect(approve.status).toBe(401);
    expect(await prisma.adminAccessToken.count()).toBe(1);
  });
});

describe("revokeAllAccessTokens", () => {
  it("revokes every live token of one identity and leaves other admins' and earlier revocations alone", async () => {
    const other = await createSignedInAdmin();
    const earlier = new Date(Date.now() - 86_400_000);
    const row = (adminId: string, suffix: string, extra: object = {}) => ({
      adminId,
      name: suffix,
      prefix: "klat_abcdefg",
      tokenHash: suffix.padEnd(64, "0"),
      scopes: ["mcp:drafts"],
      expiresAt: new Date(Date.now() + 86_400_000),
      ...extra,
    });
    await prisma.adminAccessToken.createMany({
      data: [
        row(admin.id, "mine1"),
        row(admin.id, "mine2"),
        row(admin.id, "gone", { revokedAt: earlier }),
        row(other.id, "theirs"),
      ],
    });

    expect(await revokeAllAccessTokens(admin.authUserId ?? "")).toBe(2);

    const rows = await prisma.adminAccessToken.findMany({
      select: { name: true, revokedAt: true },
    });
    const revokedAt = Object.fromEntries(
      rows.map((r) => [r.name, r.revokedAt]),
    );
    expect(revokedAt.mine1).not.toBeNull();
    expect(revokedAt.mine2).not.toBeNull();
    expect(revokedAt.gone).toEqual(earlier);
    expect(revokedAt.theirs).toBeNull();
  });
});
