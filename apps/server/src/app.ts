import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express } from "express";
import { auth } from "./config/auth.js";
import { env, isDocsEnabled } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { docsRouter } from "./modules/docs/docs.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { apiRouter } from "./modules/index.js";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middleware/error-handler.js";
import { requestLogger } from "./shared/middleware/request-logger.js";
import { apiRateLimit, securityHeaders } from "./shared/middleware/security.js";

/**
 * Builds the Express application without binding a port, so tests can drive it
 * through Supertest. Middleware order is load-bearing: logging first (so every
 * request is recorded, including rejected ones), then security headers and
 * CORS, then the rate limit (after CORS, so a browser can read the 429), then
 * the auth routes, then body parsing, then routes, then the two terminal
 * handlers.
 */
export function buildApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  // Caddy terminates TLS and reverse-proxies to this container, so `req.protocol`
  // is `http` here unless Express is told to read `X-Forwarded-Proto` — and
  // better-auth declines to set a `Secure` cookie over what it believes is plain
  // HTTP. Exactly one hop, so `1` rather than `true`: trusting the whole chain
  // would let a client forge `req.ip` by sending its own `X-Forwarded-For`.
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(
    cors({
      origin: [env.WEB_ORIGIN],
      credentials: true,
    }),
  );
  app.use("/api", apiRateLimit(env.API_RATE_LIMIT_PER_MINUTE));

  app.use("/api/auth", authRouter);
  // better-auth reads the raw request stream, so it must be mounted *before*
  // express.json() — with a JSON parser in front, its client calls hang.
  // `{*any}` is Express 5's named-wildcard syntax; a bare `*` no longer matches.

  app.all("/api/auth/{*any}", toNodeHandler(auth));

  // Editors send one activity, question or badge per request, and the whole seed
  // curriculum is ~27 KB of source — so Express's own 100 KB default, stated here
  // so nobody raises it by accident. An oversized body is a 413 envelope.
  app.use(express.json({ limit: "100kb" }));

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
