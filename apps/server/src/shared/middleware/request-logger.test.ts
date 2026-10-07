import express from "express";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { describe, expect, it } from "vitest";
import request from "../testing/request.js";
import {
  redactAuthQuery,
  requestIdFrom,
  requestLogger,
} from "./request-logger.js";

/** Exercised through a real pino-http instance: the serializer receives pino's already-serialised request. */
async function logLineFor(path: string): Promise<string> {
  const lines: string[] = [];
  const app = express();
  app.use(
    pinoHttp({
      logger: pino({}, { write: (line: string) => lines.push(line) }),
      serializers: { req: redactAuthQuery },
    }),
  );
  app.use((_req, res) => {
    res.status(204).end();
  });

  await request(app).get(path);
  return lines.join("");
}

describe("request log", () => {
  it("drops the Google callback's code and state", async () => {
    const line = await logLineFor(
      "/api/auth/callback/google?code=4%2F0AVG-live-code&state=live-state",
    );

    expect(line).not.toContain("live-code");
    expect(line).not.toContain("live-state");
    expect(JSON.parse(line).req.url).toBe(
      "/api/auth/callback/google?[redacted]",
    );
  });

  it("drops a token on any other better-auth link", async () => {
    const line = await logLineFor("/api/auth/verify-email?token=live-token");

    expect(line).not.toContain("live-token");
  });

  it("keeps the query string on the app's own routes", async () => {
    const line = await logLineFor("/api/admin/activities?includeArchived=true");

    expect(JSON.parse(line).req.url).toBe(
      "/api/admin/activities?includeArchived=true",
    );
  });
});

describe("request id", () => {
  const UUID = "3f2c8a1e-4b5d-4c6e-8f70-9a1b2c3d4e5f";

  function echoed() {
    const app = express();
    app.use(requestLogger);
    app.use((_req, res) => {
      res.status(204).end();
    });
    return app;
  }

  it("keeps a UUID a proxy assigned", async () => {
    const res = await request(echoed()).get("/").set("x-request-id", UUID);

    expect(res.headers["x-request-id"]).toBe(UUID);
  });

  it("replaces a client-chosen id that is not a UUID", async () => {
    const res = await request(echoed())
      .get("/")
      .set("x-request-id", "admin-login-ok");

    // Otherwise a caller could make its requests share an id with someone else's, or plant text in every log line.
    expect(res.headers["x-request-id"]).not.toBe("admin-login-ok");
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it.each([
    ["an oversized value", `${UUID}${"x".repeat(4096)}`],
    ["a UUID with trailing text", `${UUID}\nfake log line`],
    ["an empty header", ""],
    ["no header", undefined],
  ])("generates a fresh id for %s", (_label, inbound) => {
    const id = requestIdFrom(inbound);

    expect(id).not.toBe(inbound);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
