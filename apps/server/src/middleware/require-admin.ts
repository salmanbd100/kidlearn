import type { AdminUser } from "@kidlearn/db";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

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
