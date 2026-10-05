import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { ApiError } from "../errors/errors.js";

/** Nothing here renders, so the CSP allows nothing. CORP is `same-site`, not helmet's `same-origin`: web and API are different origins on one site. */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
});

/** The one HTML page this origin serves: Scalar loads its bundle from jsDelivr; `connect-src 'self'` is what **Send** needs. */
export const docsSecurityHeaders: RequestHandler = helmet.contentSecurityPolicy(
  {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
);

/** Counters live in process memory (fine for the single API container); `req.ip` is the client's only because `trust proxy` is set, see `app.ts`. */
export function apiRateLimit(limitPerMinute: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new ApiError(
          429,
          "RATE_LIMITED",
          "Too many requests — try again in a minute",
        ),
      );
    },
  });
}
