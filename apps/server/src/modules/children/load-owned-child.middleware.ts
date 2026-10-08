import type { ChildProfile } from "@kidlearn/db";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../../shared/errors/errors.js";
import { authContext } from "../parent/require-parent.middleware.js";
import { findOwnedChildProfile } from "./child-profile.service.js";
import { ChildIdParamsSchema } from "./children.schema.js";

// Ownership gate for every `/:id` child route (FR-PROF-07, NFR-SAFE-02);
// mount after `requireParent`.
export const loadOwnedChild: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const { parent } = authContext(req);
    // Express 5 types params as `string | string[]`; parse through the schema instead
    // of asserting, which also keeps this safe on a route missing `validate({ params })`.
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

// Use instead of `req.child!`: the property is optional on `Request`.
export function ownedChild(req: Request): ChildProfile {
  const { child } = req;
  if (!child) {
    // Mounted without `loadOwnedChild`: fail closed.
    throw ApiError.notFound("Child profile not found");
  }
  return child;
}
