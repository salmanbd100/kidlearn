/**
 * See the recorded exception in `document/standards/general.md §5`: no test
 * database is provisioned yet, so `config/prisma.js` is stubbed. The stub cannot
 * show that a real database answers, so this suite asserts what `/ready` does
 * with an answer and with a failure — and that `/health` still never asks.
 */
import { HealthResponseSchema } from "@kidlearn/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";
import request from "../../shared/testing/request.js";

const db = vi.hoisted(() => ({ parentFindFirst: vi.fn() }));

vi.mock("../../config/prisma.js", () => ({
  prisma: { parent: { findFirst: db.parentFindFirst } },
}));

const { app } = await import("../../app.js");

beforeEach(() => {
  db.parentFindFirst.mockReset();
});

describe("GET /ready", () => {
  it("returns 200 once the database answers", async () => {
    db.parentFindFirst.mockResolvedValue(null);

    const res = await request(app).get("/ready");

    expect(res.status).toBe(200);
    assertContract(HealthResponseSchema, res.body, "GET /ready");
    expect(db.parentFindFirst).toHaveBeenCalledTimes(1);
  });

  it("returns a 500 envelope when the database cannot answer", async () => {
    db.parentFindFirst.mockRejectedValue(new Error("connection refused"));

    const res = await request(app).get("/ready");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.body).not.toHaveProperty("data");
  });
});

describe("GET /health", () => {
  it("never touches the database, so a sleeping database cannot fail liveness", async () => {
    db.parentFindFirst.mockRejectedValue(new Error("connection refused"));

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(db.parentFindFirst).not.toHaveBeenCalled();
  });
});
