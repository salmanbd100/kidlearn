import { app } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(env.PORT, () => {
  logger.info(`kidlearn-api listening on http://localhost:${env.PORT}`);
});

// Free-tier hosts stop instances with a signal rather than a hard kill: drain
// in-flight requests, then release the database connections before exiting.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Shutting down");
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  });
}
