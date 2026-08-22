import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../lib/env.js";
import { ApiError } from "../lib/errors.js";

/**
 * The guard on `/api/admin/jobs/*` — a shared secret in an `Authorization` header
 * (file 30).
 *
 * **Deliberately not an admin session.** Every other guard in this codebase resolves
 * a signed-in human; the caller here is cron-job.org, which has no browser, no
 * cookie jar and nobody to complete an OAuth round trip. A scheduler that cannot
 * authenticate is a scheduler that does not run, so the credential is a bearer
 * secret the operator pastes into the job's header field.
 *
 * That makes the secret the whole of the authorisation, which is why `env.ts`
 * requires at least 16 characters and why these endpoints must never grow a route
 * that *reads* per-child data. What they may do is what this job does: recompute
 * something the server already owns. The response says how many children were
 * processed and nothing about who they are.
 *
 * `401`, not `403`: a missing or wrong secret is a failure to authenticate, and
 * there is no identity here for a `403` to be about.
 */
export const requireCronSecret: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const header = req.get("authorization") ?? "";
  // RFC 7235 makes `auth-scheme` case-insensitive, and a scheduler configured with
  // `bearer <secret>` — or a proxy that normalises the scheme — would otherwise get
  // a 401 indistinguishable from a wrong secret. The credential itself stays
  // byte-exact.
  const separator = header.indexOf(" ");
  const scheme =
    separator === -1 ? "" : header.slice(0, separator).toLowerCase();

  if (scheme !== "bearer" || !isSecret(header.slice(separator + 1))) {
    next(ApiError.unauthorized("A valid job secret is required"));
    return;
  }

  next();
};

/**
 * Constant-time comparison, so a wrong secret cannot be narrowed a character at a
 * time by measuring how long the rejection took. `timingSafeEqual` throws on a
 * length mismatch, so the lengths are compared first — which does leak the
 * secret's length, and is the one thing about it that is not worth hiding.
 */
function isSecret(candidate: string): boolean {
  const expected = Buffer.from(env.CRON_SECRET, "utf8");
  const received = Buffer.from(candidate, "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
