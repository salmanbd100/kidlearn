import { pino } from "pino";
import { env } from "./env.js";

/** The credentials that must never reach the log stream. */
export const REDACTED_LOG_PATHS = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'res.headers["set-cookie"]',
  ],
  censor: "[redacted]",
} as const;

/** `pino-pretty` is a devDependency, so pretty output is dev-only; production and test emit NDJSON. */
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
