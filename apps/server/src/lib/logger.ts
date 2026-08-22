import { pino } from "pino";
import { env } from "./env.js";

/**
 * The credentials that must never reach the log stream.
 *
 * `pino-http` serialises the whole header map by default (`pino-std-serializers`),
 * so without this every request prints its own credentials at `info`: the
 * better-auth session cookie, and — since file 30 — the `CRON_SECRET` bearer
 * token, which is the entire authorisation on `/api/admin/jobs/*`. On Render
 * stdout is the retained log stream, readable from the dashboard and by any log
 * drain added later, so an unredacted header is a live credential sitting in a
 * place nobody treats as secret.
 *
 * Exported so `logger.test.ts` can assert the paths against a real pino instance
 * rather than restating them. Redaction runs before the transport, so the
 * development pretty-printer never sees the values either.
 */
export const REDACTED_LOG_PATHS = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'res.headers["set-cookie"]',
  ],
  censor: "[redacted]",
} as const;

/**
 * Process-wide logger. `pino-pretty` is a devDependency, so the human-readable
 * transport is only wired up in development — production and test emit plain
 * NDJSON to stdout.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { ...REDACTED_LOG_PATHS, paths: [...REDACTED_LOG_PATHS.paths] },
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }
    : {}),
});
