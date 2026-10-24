import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { app } from "../../app.js";
import { auth } from "../../config/auth.js";
import { createSignedInAdmin } from "../../shared/testing/factories.js";
import request from "../../shared/testing/request.js";

/** `MCP_ENABLED` at its production default. Its own file because `env` is read once at import. */
vi.hoisted(() => {
  process.env.MCP_ENABLED = "false";
});

beforeEach(async () => {
  const admin = await createSignedInAdmin();
  // Signed in, so a 404 below is the missing mount and not `requireAdmin` refusing first.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: { id: admin.authUserId },
    session: {
      id: "session-1",
      userId: admin.authUserId,
      createdAt: new Date(),
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("does not mount /mcp", async () => {
  const res = await request(app)
    .post("/mcp")
    .set("Authorization", "Bearer klat_anything")
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

  expect(res.status).toBe(404);
});

it("does not mount the access-token routes, so no token can be minted", async () => {
  const create = await request(app)
    .post("/api/admin/access-tokens")
    .send({ name: "Cursor" });
  const list = await request(app).get("/api/admin/access-tokens");

  expect(create.status).toBe(404);
  expect(list.status).toBe(404);
});
