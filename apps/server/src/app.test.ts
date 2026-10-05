import {
  HealthResponseSchema,
  ServiceIdentityResponseSchema,
} from "@kidlearn/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { assertContract } from "./openapi/assert-contract.js";
import request from "./shared/testing/request.js";

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
  // NODE_ENV is `test`, so docs are mounted; the production-off branch is tested in document.test.ts.
  it("serves the raw spec at /docs.json", async () => {
    const res = await request(app).get("/docs.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.info.title).toBe("kidlearn API");
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(0);
  });

  it("serves the Scalar reference at /docs", async () => {
    const res = await request(app).get("/docs");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("kidlearn API");
    // Inlining the ~730 KB spec into every page load is what this prevents.
    expect(res.text).toContain("/docs.json");
    expect(res.text.length).toBeLessThan(50_000);
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

describe("trust proxy", () => {
  // Caddy terminates TLS; without trust proxy better-auth refuses to set a `Secure` session cookie.
  async function buildWith(nodeEnv: "production" | "test") {
    vi.resetModules();
    vi.doMock("./config/env.js", async () => {
      const actual =
        await vi.importActual<typeof import("./config/env.js")>(
          "./config/env.js",
        );
      return { ...actual, env: { ...actual.env, NODE_ENV: nodeEnv } };
    });
    const { buildApp } = await import("./app.js");
    return buildApp();
  }

  afterEach(() => {
    vi.doUnmock("./config/env.js");
    vi.resetModules();
  });

  it("trusts exactly one proxy hop in production", async () => {
    const production = await buildWith("production");

    expect(production.get("trust proxy")).toBe(1);
  });

  it("trusts no proxy outside production, so req.ip cannot be forged", async () => {
    const outsideProduction = await buildWith("test");

    expect(outsideProduction.get("trust proxy")).toBe(false);
  });
});

describe("security headers", () => {
  it("sends a CSP that allows nothing on an API response", async () => {
    const res = await request(app).get("/health");

    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-site");
  });

  it("lets the Scalar reference load its CDN bundle and call this origin", async () => {
    const res = await request(app).get("/docs");

    const csp = res.headers["content-security-policy"];
    expect(csp).toContain(
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    );
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("default-src 'none'");
    // The CSP allows this bundle URL; if Scalar moves CDN this fails rather than the page blanking.
    expect(res.text).toContain('src="https://cdn.jsdelivr.net/');
  });
});

describe("JSON body limit", () => {
  it("answers a body over 100 KB with a 413 envelope", async () => {
    const res = await request(app)
      .post("/api/does-not-matter")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ blob: "x".repeat(101 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("/api rate limit", () => {
  async function buildWithLimit(limit: number) {
    vi.resetModules();
    vi.doMock("./config/env.js", async () => {
      const actual =
        await vi.importActual<typeof import("./config/env.js")>(
          "./config/env.js",
        );
      return {
        ...actual,
        env: { ...actual.env, API_RATE_LIMIT_PER_MINUTE: limit },
      };
    });
    const { buildApp } = await import("./app.js");
    return buildApp();
  }

  afterEach(() => {
    vi.doUnmock("./config/env.js");
    vi.resetModules();
  });

  it("answers past the limit with a 429 envelope the web origin can read", async () => {
    const limited = await buildWithLimit(2);

    await request(limited).get("/api/not-a-resource");
    await request(limited).get("/api/not-a-resource");
    const res = await request(limited)
      .get("/api/not-a-resource")
      .set("Origin", env.WEB_ORIGIN);

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests — try again in a minute",
      },
    });
    expect(res.headers["access-control-allow-origin"]).toBe(env.WEB_ORIGIN);
    expect(res.headers.ratelimit).toBeDefined();
  });

  it("covers the better-auth routes too", async () => {
    const limited = await buildWithLimit(1);

    await request(limited).get("/api/auth/get-session");
    const res = await request(limited).get("/api/auth/get-session");

    expect(res.status).toBe(429);
  });

  it("leaves /health alone, so an uptime check cannot be throttled", async () => {
    const limited = await buildWithLimit(1);

    await request(limited).get("/health");
    const res = await request(limited).get("/health");

    expect(res.status).toBe(200);
  });
});
