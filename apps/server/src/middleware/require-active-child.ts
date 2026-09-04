import type { ChildProfile } from "@kidlearn/db";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { authContext } from "./require-parent.js";

/**
 * Resolves *which child is learning* for every `/api/content/*` request
 * (FR-PROF-03). Runs after `requireParent`.
 */
export const requireActiveChild: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const { parent, session } = authContext(req);
    const childProfileId = session.activeChildProfileId;
    if (!childProfileId) {
      throw ApiError.forbidden("No active child profile");
    }

    const child = await prisma.childProfile.findFirst({
      where: { id: childProfileId, parentId: parent.id },
    });
    if (!child) {
      throw ApiError.forbidden("No active child profile");
    }

    req.child = child;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Reads the profile `requireActiveChild` attached, narrowing away the optional
 * on `Request` without a non-null assertion. Mirrors `authContext` — a route
 * mounted without the middleware fails closed rather than serving content that
 * was never grade-filtered.
 */
export function activeChild(req: Request): ChildProfile {
  const { child } = req;
  if (!child) {
    throw ApiError.forbidden("No active child profile");
  }
  return child;
}
