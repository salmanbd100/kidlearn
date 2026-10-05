import type { AdminUser } from "@kidlearn/db";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../../config/auth.js";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../errors/errors.js";

/** Measured from the session's `createdAt`, which better-auth never moves, so activity cannot extend it (parents' 30-day expiry slides). */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Fails closed: an unreadable `createdAt` counts as expired, so a renamed better-auth field locks admins out rather than lifting the limit. */
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
    // 403, not 404: the session is real, the caller just lacks authorisation (e.g. a parent).
    if (!admin) {
      throw ApiError.forbidden("Admin access required");
    }

    if (isAdminSessionExpired(authenticated.session)) {
      // Revoked, not just refused: the row would stay valid for better-auth's own endpoints. `deleteMany` tolerates a concurrent removal.
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

/** Fails closed like `authContext`: reaching here without the middleware is a wiring mistake. */
export function adminContext(req: Request): AdminUser {
  const { admin } = req;
  if (!admin) {
    throw ApiError.unauthorized();
  }
  return admin;
}
