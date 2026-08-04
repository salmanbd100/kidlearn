import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";
import { env } from "./lib/env.js";

describe("GET /health", () => {
  it("returns the ok envelope without touching the database", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(typeof res.body.data.uptime).toBe("number");
    expect(res.body).not.toHaveProperty("error");
  });
});

describe("GET /", () => {
  it("returns the service name in the success envelope", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { name: "kidlearn-api" } });
  });
});

describe("unmatched routes", () => {
  it("returns a 404 envelope with code NOT_FOUND", async () => {
    const res = await request(app).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  it("returns a 404 envelope for unmounted /api paths", async () => {
    const res = await request(app).get("/api/not-a-resource");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("CORS", () => {
  it("allows the configured web origin with credentials", async () => {
    const res = await request(app).get("/health").set("Origin", env.WEB_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(env.WEB_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("sends no allow-origin header to any other origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://not-kidlearn.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends no allow-origin header on a preflight from an unknown origin", async () => {
    const res = await request(app)
      .options("/health")
      .set("Origin", "https://not-kidlearn.example.com")
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
