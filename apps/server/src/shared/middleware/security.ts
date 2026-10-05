import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { ApiError } from "../errors/errors.js";

/**
 * Response hardening for an origin that serves JSON. Nothing here is meant to
 * render, so the CSP allows nothing — a response that a browser is somehow
 * talked into treating as a document can neither run script nor be framed.
 *
 * Cross-Origin-Resource-Policy is `same-site` rather than helmet's `same-origin`:
 * the web app and the API are different origins on one site (`:3000`/`:4000` in
 * dev). CORP only governs `no-cors` loads, which nothing makes today, but this
 * keeps an `<img>` or `<audio>` pointed at the API from failing the day one does.
 */
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

/**
 * The one HTML page this origin serves. Scalar's Express integration renders a
 * shell that loads its bundle from jsDelivr and boots it with an inline script,
 * and the bundle injects its own styles and fonts. `connect-src 'self'` is what
 * **Send** needs: it fetches `/docs.json` and `/api/*` on this origin.
 */
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

/**
 * A per-IP flood guard on `/api/*`, answered in the usual error envelope so the
 * web client's error handling needs no special case. The counters live in
 * process memory: correct for the single API container this deploys as, and
 * reset by a restart. `req.ip` is only the client's address because
 * `trust proxy` is set in production — see `app.ts`.
 */
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
