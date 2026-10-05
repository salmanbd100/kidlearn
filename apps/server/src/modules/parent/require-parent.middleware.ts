import type { Parent } from "@kidlearn/db";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../../config/auth.js";
import { ApiError } from "../../shared/errors/errors.js";
import { findOrCreateParentForUser } from "./parent.service.js";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

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

/** Use instead of `req.parent` / `req.session`: they are optional on `Request`, and this narrows them without a non-null assertion. */
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
