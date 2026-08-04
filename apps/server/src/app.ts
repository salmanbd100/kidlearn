import cors from "cors";
import express, { type Express } from "express";
import { env } from "./lib/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { healthRouter } from "./routes/health.js";
import { apiRouter } from "./routes/index.js";

/**
 * Builds the Express application without binding a port, so tests can drive it
 * through Supertest. Middleware order is load-bearing: logging first (so every
 * request is recorded, including rejected ones), then CORS, then body parsing,
 * then routes, then the two terminal handlers.
 */
export function buildApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestLogger);
  app.use(
    cors({
      // The array form matters: given a bare string, the `cors` package echoes
      // that origin back on every response regardless of who asked. The array
      // form checks the request's Origin and omits the header when it does not
      // match, which is what NFR-SAFE-07 requires.
      origin: [env.WEB_ORIGIN],
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use(healthRouter);
  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = buildApp();
