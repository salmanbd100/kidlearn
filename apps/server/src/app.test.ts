import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// Mock the db package so the unit suite never needs a live database.
vi.mock("@kidlearn/db", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));

import { app } from "./app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /health/db", () => {
  it("returns ok when the database is reachable", async () => {
    const res = await request(app).get("/health/db");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "reachable" });
  });
});
