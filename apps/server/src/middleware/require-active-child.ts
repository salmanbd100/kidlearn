import type { ChildProfile } from "@kidlearn/db";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { authContext } from "./require-parent.js";

/**
 * Resolves *which child is learning* for every `/api/content/*` request
 * (FR-PROF-03). Runs after `requireParent`.
 *
 * The id comes from `session.activeChildProfileId` — the server-side session
 * column better-auth owns (FR-AUTH-06) — and the row is re-read under the
 * signed-in parent's ownership on every request. Grade and preferred language
 * are then read from that row and from nowhere else, so no query string, body
 * field, or header can widen what a child is allowed to see.
 *
 * A session pointing at a child of a different parent is treated exactly like
 * no active child at all: a 403 that says nothing about whether the id exists.
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
