import {
  HealthResponseSchema,
  ServiceIdentityResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { assertContract } from "./openapi/assert-contract.js";

describe("GET /health", () => {
  it("returns the ok envelope without touching the database", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    assertContract(HealthResponseSchema, res.body, "GET /health");
    expect(res.body.data.status).toBe("ok");
    expect(typeof res.body.data.uptime).toBe("number");
    expect(res.body).not.toHaveProperty("error");
  });
});

describe("GET /", () => {
  it("returns the service name in the success envelope", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    assertContract(ServiceIdentityResponseSchema, res.body, "GET /");
    expect(res.body).toEqual({ data: { name: "kidlearn-api" } });
  });
});

describe("API documentation", () => {
  // NODE_ENV is `test` here, so the docs are mounted (see `isDocsEnabled`). The
  // production-off branch is covered in `openapi/document.test.ts`, which can
  // test the predicate directly rather than rebuilding the app.
  it("serves the raw spec at /docs.json", async () => {
    const res = await request(app).get("/docs.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.info.title).toBe("kidlearn API");
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(0);
  });

  it("serves Swagger UI at /docs", async () => {
    // swagger-ui-express redirects /docs to /docs/ before serving the page.
    const res = await request(app).get("/docs/");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("kidlearn API");
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
