import express from "express";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { describe, expect, it } from "vitest";
import request from "../testing/request.js";
import { redactAuthQuery } from "./request-logger.js";

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
