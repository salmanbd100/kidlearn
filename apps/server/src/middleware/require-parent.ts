import type { Parent } from "@kidlearn/db";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import { findOrCreateParentForUser } from "../services/parentService.js";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * Gate for every parent-authenticated route. Reads the better-auth session from
 * the request cookies, provisions the `Parent` domain row on first sight, and
 * attaches both to the request.
 *
 * This is the *authentication* layer only. Parent-area routes additionally need
 * `requirePinVerified` (file 10) layered on top; the student portal deliberately
 * does not, so a child switching profiles never faces a PIN prompt (FR-AUTH-06).
 */
export const requireParent: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const authenticated = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!authenticated) {
      throw ApiError.unauthorized();
    }

    req.parent = await findOrCreateParentForUser(authenticated.user);
    req.session = authenticated.session;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Reads the context `requireParent` attached. Use this instead of touching
 * `req.parent` / `req.session` directly: those are optional on the Express
 * `Request` (they do not exist before the middleware runs), and this narrows
 * them without a non-null assertion.
 */
export function authContext(req: Request): {
  parent: Parent;
  session: AuthSession["session"];
} {
  const { parent, session } = req;
  if (!parent || !session) {
    // Reaching here means the route was mounted without `requireParent`. Fail
    // closed rather than serving an unauthenticated request.
    throw ApiError.unauthorized();
  }
  return { parent, session };
}
