import type { AdminUser } from "@kidlearn/db";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../../config/auth.js";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../errors/errors.js";

/**
 * How long an admin may act on one sign-in. Measured from the session's
 * `createdAt`, which better-auth never moves, so — unlike the 30-day expiry
 * shared with parents, which every request slides forward — activity cannot
 * extend it. An admin can publish to children; a cookie lifted from a shared
 * machine should not carry that for a month.
 */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Fails closed: a session without a readable `createdAt` counts as expired, so
 * a better-auth upgrade that renamed the field locks admins out rather than
 * silently lifting the limit.
 */
export function isAdminSessionExpired(
  session: { createdAt?: Date | string | null },
  now = Date.now(),
): boolean {
  const createdAt = session.createdAt
    ? new Date(session.createdAt).getTime()
    : Number.NaN;
  if (Number.isNaN(createdAt)) return true;
  return now - createdAt > ADMIN_SESSION_MAX_AGE_MS;
}

/**
 * Gate for every `/api/admin/*` route the CMS serves (spec §4.3, FR-CMS-01).
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

    if (isAdminSessionExpired(authenticated.session)) {
      // Revoked rather than only refused: the row would otherwise stay valid
      // for better-auth's own endpoints until its 30-day expiry. `deleteMany`
      // so a concurrent request that already removed it is not an error.
      await prisma.session.deleteMany({
        where: { id: authenticated.session.id },
      });
      throw ApiError.unauthorized("Admin session expired");
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
