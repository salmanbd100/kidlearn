import { CONSENT_VERSION } from "@kidlearn/types";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { authContext } from "../../modules/parent/require-parent.middleware.js";
import { ApiError } from "../errors/errors.js";

/**
 * The COPPA gate (FR-AUTH-03, NFR-SAFE-03). Mount it after `requireParent` on
 * every route that creates or expands a child's data footprint — file 11 puts
 * it on `POST /api/children`.
 */
export const requireConsent: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const { parent } = authContext(req);

    // A parent who consented to an older text has not consented to this one: the
    // version is what `recordParentConsent` insists on, so the gate must too.
    if (!parent.consentGivenAt || parent.consentVersion !== CONSENT_VERSION) {
      throw new ApiError(
        403,
        "CONSENT_REQUIRED",
        "Parental consent is required before adding a child",
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
