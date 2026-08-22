/**
 * What the log stream is not allowed to contain (file 30).
 *
 * `pino-http` logs the serialised request, and `pino-std-serializers.req` includes
 * the entire header map — so the default configuration prints every credential the
 * caller sent. The `CRON_SECRET` bearer token is the whole of the authorisation on
 * `/api/admin/jobs/*`, which makes this a test about an exposure rather than about
 * tidy output.
 *
 * Asserted against a real `pino` instance built from the same exported paths the
 * process logger uses, writing to a stream this file can read. Reading the process
 * logger's own output is not possible here: pino writes to fd 1 through sonic-boom,
 * which does not pass through `process.stdout.write`.
 */
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { REDACTED_LOG_PATHS } from "./logger.js";

const SECRET = "a-real-looking-cron-secret";

function captureLine(payload: object): string {
  const lines: string[] = [];
  const log = pino(
    {
      redact: {
        ...REDACTED_LOG_PATHS,
        paths: [...REDACTED_LOG_PATHS.paths],
      },
    },
    { write: (line: string) => lines.push(line) },
  );

  log.info(payload, "request completed");
  return lines.join("");
}

describe("logger redaction", () => {
  it("keeps the job secret out of the request log", () => {
    const line = captureLine({
      req: {
        method: "POST",
        url: "/api/admin/jobs/weekly-reports",
        headers: {
          authorization: `Bearer ${SECRET}`,
          "user-agent": "cron-job.org",
        },
      },
    });

    expect(line).not.toContain(SECRET);
    expect(JSON.parse(line).req.headers.authorization).toBe("[redacted]");
    // Only the credential — an operator still needs the rest of the request to
    // tell a failed cron call from one that never arrived.
    expect(JSON.parse(line).req.headers["user-agent"]).toBe("cron-job.org");
  });

  it("keeps the session cookie out of the request log", () => {
    const line = captureLine({
      req: { headers: { cookie: "better-auth.session_token=live-token" } },
    });

    expect(line).not.toContain("live-token");
    expect(JSON.parse(line).req.headers.cookie).toBe("[redacted]");
  });

  it("keeps a freshly issued session cookie out of the response log", () => {
    const line = captureLine({
      res: { headers: { "set-cookie": "better-auth.session_token=new-token" } },
    });

    expect(line).not.toContain("new-token");
  });
});
