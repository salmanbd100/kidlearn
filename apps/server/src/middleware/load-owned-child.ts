import type { ChildProfile } from "@kidlearn/db";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { ChildIdParamsSchema } from "../schemas/children.js";
import { findOwnedChildProfile } from "../services/childProfileService.js";
import { authContext } from "./require-parent.js";

/**
 * Ownership gate for every `/:id` route that addresses a child profile
 * (FR-PROF-07, NFR-SAFE-02). Mount it after `requireParent`.
 */
export const loadOwnedChild: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const { parent } = authContext(req);
    // Express 5 types a route param as `string | string[]` (wildcards can
    // repeat), so the id is narrowed through the same schema the route mounts
    // rather than asserted. It also means this middleware is safe on a route
    // that forgot `validate({ params })`.
    const { id } = ChildIdParamsSchema.parse(req.params);
    const child = await findOwnedChildProfile(id, parent.id);
    if (!child) {
      throw ApiError.notFound("Child profile not found");
    }
    req.child = child;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Reads the child `loadOwnedChild` attached. Use this instead of `req.child!`:
 * the property is optional on the Express `Request` because it does not exist
 * before the middleware runs, and this narrows it without an assertion.
 */
export function ownedChild(req: Request): ChildProfile {
  const { child } = req;
  if (!child) {
    // Reaching here means the route was mounted without `loadOwnedChild`. Fail
    // closed rather than serving an unscoped request.
    throw ApiError.notFound("Child profile not found");
  }
  return child;
}
