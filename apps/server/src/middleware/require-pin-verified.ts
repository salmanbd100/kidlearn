import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { authContext } from "./require-parent.js";

/**
 * The parental gate (FR-AUTH-04). Mount it *after* `requireParent` on every
 * parent-dashboard and settings route (files 28–30) — never on a student-portal
 * route, because FR-AUTH-06 keeps profile switching PIN-free.
 *
 * It is an app-level check on top of the session, not a second auth system: the
 * grant is `Session.pinVerifiedUntil`, written by `POST /api/parent/pin/verify`
 * and expiring 15 minutes later.
 *
 * The two failure codes are deliberately distinct — the client's next screen
 * differs. `PIN_REQUIRED` means "this account has no PIN, open setup";
 * `PIN_VERIFICATION_REQUIRED` means "we have a PIN, open the PIN pad".
 */
export const requirePinVerified: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const { parent, session } = authContext(req);

    if (!parent.pinHash) {
      throw new ApiError(403, "PIN_REQUIRED", "Set a parental PIN first");
    }

    const until = session.pinVerifiedUntil;
    if (!until || new Date(until).getTime() <= Date.now()) {
      throw new ApiError(
        403,
        "PIN_VERIFICATION_REQUIRED",
        "Enter your parental PIN to continue",
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
