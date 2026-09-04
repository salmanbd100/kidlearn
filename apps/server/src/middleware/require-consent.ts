import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { authContext } from "./require-parent.js";

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

    if (!parent.consentGivenAt) {
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
