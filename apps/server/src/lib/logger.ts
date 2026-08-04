import { pino } from "pino";
import { env } from "./env.js";

/**
 * Process-wide logger. `pino-pretty` is a devDependency, so the human-readable
 * transport is only wired up in development — production and test emit plain
 * NDJSON to stdout.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }
    : {}),
});
