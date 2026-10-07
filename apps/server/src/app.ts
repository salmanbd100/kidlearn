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
import {
  apiRateLimit,
  rejectCrossOriginWrites,
  securityHeaders,
} from "./shared/middleware/security.js";

/** Middleware order is load-bearing: the rate limit follows CORS so a browser can read the 429. */
export function buildApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  // Behind Caddy `req.protocol` is `http`, so better-auth would not set a `Secure` cookie. One hop,
  // not `true`: trusting the whole chain lets a client forge `req.ip` via `X-Forwarded-For`.
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
  // The API's own origin is what Scalar's **Send** on `/docs` posts from.
  app.use(rejectCrossOriginWrites([env.WEB_ORIGIN, env.BETTER_AUTH_URL]));
  app.use("/api", apiRateLimit(env.API_RATE_LIMIT_PER_MINUTE));

  app.use("/api/auth", authRouter);
  // better-auth reads the raw request stream, so it must be mounted *before*
  // express.json() — with a JSON parser in front, its client calls hang.
  // `{*any}` is Express 5's named-wildcard syntax; a bare `*` no longer matches.

  app.all("/api/auth/{*any}", toNodeHandler(auth));

  // Editors send one item per request; stated explicitly so the 100 KB default is not raised by accident.
  app.use(express.json({ limit: "100kb" }));

  app.use(healthRouter);

  if (isDocsEnabled(env)) {
    app.use(docsRouter);
  }

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = buildApp();
