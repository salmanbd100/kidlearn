import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";

const server = app.listen(env.PORT, () => {
  logger.info(`kidlearn-api listening on http://localhost:${env.PORT}`);
});

/** Shorter than Docker's 10 s stop grace period, so we cut hanging connections ourselves rather than via SIGKILL. */
const SHUTDOWN_DEADLINE_MS = 8_000;

let isShuttingDown = false;

function shutdown(signal: string): void {
  // A second signal must not start a second drain.
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Shutting down");

  setTimeout(() => {
    logger.error("Shutdown deadline passed with requests still open; exiting");
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS).unref();

  // Free-tier hosts stop with a signal: drain requests, then release database connections.
  server.close(() => {
    prisma
      .$disconnect()
      // No argument: exits with `process.exitCode`, which a fault sets before calling here.
      .then(() => process.exit())
      .catch((error: unknown) => {
        logger.error({ err: error }, "Failed to disconnect from the database");
        process.exit(1);
      });
  });
  // Idle keep-alive sockets would otherwise hold `close` open until they time out.
  server.closeIdleConnections();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shutdown(signal));
}

// A listener replaces Node's default crash, so it must exit itself: an unhandled rejection is a fault to restart on,
// not to limp along in. Set before draining so a shutdown already under way still exits non-zero.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  process.exitCode = 1;
  shutdown("unhandledRejection");
});
