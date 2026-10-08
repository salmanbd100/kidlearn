import { hasCurrentConsent } from "@kidlearn/types";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { authContext } from "../../modules/parent/require-parent.middleware.js";
import { ApiError } from "../errors/errors.js";

/** The COPPA gate (FR-AUTH-03, NFR-SAFE-03): mount after `requireParent` on every route that expands a child's data footprint. */
export const requireConsent: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const { parent } = authContext(req);

    // `recordParentConsent` insists on the version, so the gate must too.
    if (!hasCurrentConsent(parent)) {
      throw new ApiError(
        403,
        "CONSENT_REQUIRED",
        "Parental consent to the current terms is required",
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
