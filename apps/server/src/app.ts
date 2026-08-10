import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express } from "express";
import { auth } from "./lib/auth.js";
import { env, isDocsEnabled } from "./lib/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { authRouter } from "./routes/auth.js";
import { docsRouter } from "./routes/docs.js";
import { healthRouter } from "./routes/health.js";
import { apiRouter } from "./routes/index.js";

/**
 * Builds the Express application without binding a port, so tests can drive it
 * through Supertest. Middleware order is load-bearing: logging first (so every
 * request is recorded, including rejected ones), then CORS, then the auth
 * routes, then body parsing, then routes, then the two terminal handlers.
 */
export function buildApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestLogger);
  app.use(
    cors({
      origin: [env.WEB_ORIGIN],
      credentials: true,
    }),
  );

  // --- Auth, before any body parser ----- //
  app.use("/api/auth", authRouter);
  // better-auth reads the raw request stream, so it must be mounted *before*
  // express.json() — with a JSON parser in front, its client calls hang.
  // `{*any}` is Express 5's named-wildcard syntax; a bare `*` no longer matches.

  app.all("/api/auth/{*any}", toNodeHandler(auth));

  app.use(express.json());

  app.use(healthRouter);

  // API documentation
  if (isDocsEnabled(env)) {
    app.use(docsRouter);
  }

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = buildApp();
