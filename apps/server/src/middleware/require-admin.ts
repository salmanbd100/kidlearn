import type { AdminUser } from "@kidlearn/db";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

/**
 * Gate for every `/api/admin/*` route the CMS serves (spec §4.3, FR-CMS-01).
 *
 * The `AdminUser` lookup **is** the separation of principals. Admins and parents
 * share one better-auth instance and one `user` table (see the note on
 * `emailAndPassword` in `lib/auth.ts` for why), so "is this an admin" cannot be
 * answered by the session alone. It is answered by whether a domain row claims
 * that identity — and because a Google sign-in never writes one, every parent
 * session fails here, however valid it is.
 *
 * The reverse direction holds without any code here: `requireParent` refuses to
 * provision a `Parent` for a user with no Google account, so an admin session is
 * rejected by every parent route. `admin.test.ts` asserts both directions.
 *
 * Unlike `requireParent`, this never provisions anything. An admin exists because
 * `scripts/seed-admin.ts` created one; a session with no matching row is a
 * mistake, not a new account.
 */
export const requireAdmin: RequestHandler = async (
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

    const admin = await prisma.adminUser.findUnique({
      where: { authUserId: authenticated.user.id },
    });
    // 403, not 404: the session is real and the caller knows who they are — what
    // they lack is authorisation. A parent lands here.
    if (!admin) {
      throw ApiError.forbidden("Admin access required");
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Reads the row `requireAdmin` attached, narrowing away the optional. Same
 * fail-closed reasoning as `authContext`: reaching here without the middleware is
 * a wiring mistake, and answering it unauthenticated would be worse than a 401.
 */
export function adminContext(req: Request): AdminUser {
  const { admin } = req;
  if (!admin) {
    throw ApiError.unauthorized();
  }
  return admin;
}
