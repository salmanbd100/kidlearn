import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { authContext } from "./require-parent.js";

/**
 * The COPPA gate (FR-AUTH-03, NFR-SAFE-03). Mount it after `requireParent` on
 * every route that creates or expands a child's data footprint — file 11 puts
 * it on `POST /api/children`.
 *
 * Enforced server-side on purpose: a consent checkbox the frontend can skip is
 * not verifiable consent. Only the presence of `Parent.consentGivenAt` counts.
 * Version drift is deliberately *not* checked here — a parent who consented to
 * an older text keeps working access; `POST /api/parent/consent` is where a new
 * version is captured.
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
