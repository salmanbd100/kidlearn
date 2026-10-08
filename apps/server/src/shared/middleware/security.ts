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

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF backstop for the session cookie: `sameSite=lax` still lets a sibling subdomain post with it. A browser always
 * sends `Origin` on these methods, so a missing one is a non-browser caller (curl, the cron job) with no cookie to ride.
 * `/api/auth` is left to better-auth, which checks the same origins through `trustedOrigins`.
 */
export function rejectCrossOriginWrites(
  allowedOrigins: readonly string[],
): RequestHandler {
  const allowed = new Set(allowedOrigins.map((url) => new URL(url).origin));
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (
      origin === undefined ||
      !STATE_CHANGING_METHODS.has(req.method) ||
      req.path.startsWith("/api/auth/") ||
      allowed.has(origin)
    ) {
      next();
      return;
    }
    next(ApiError.forbidden("Cross-origin request refused"));
  };
}

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
