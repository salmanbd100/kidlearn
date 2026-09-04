import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { evaluateStartForChild } from "../services/screenTimeService.js";
import { activeChild } from "./require-active-child.js";

/**
 * The parental gate on *starting* content (FR-TIME-02..04). Mount it after
 * `requireActiveChild`, on content-detail reads only.
 */
export function enforceScreenTime(kind: "lesson" | "story"): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const child = activeChild(req);
      // Only a lesson can be resumed. Express 5 types a param as
      // `string | string[]`, and this middleware may run before `validate()`, so a
      // non-string id is treated as "no lesson to be part-way through" — the
      // route's own validation rejects it a moment later.
      const lessonId =
        kind === "lesson" && typeof req.params.id === "string"
          ? req.params.id
          : undefined;

      const decision = await evaluateStartForChild(child.id, lessonId);
      if (decision.allowed) return next();

      throw new ApiError(
        423,
        decision.code,
        decision.code === "TIME_LIMIT_REACHED"
          ? "Today's learning time is used up"
          : "Outside the allowed access window",
        // The client cannot recompute any of this — it has no access to the
        // settings and no trustworthy clock — and the window screen has to name
        // the hour to come back at.
        {
          minutesToday: decision.details.minutesToday,
          dailyLimitMinutes: decision.details.dailyLimitMinutes,
          windowStart: decision.details.windowStart,
          windowEnd: decision.details.windowEnd,
        },
      );
    } catch (error) {
      next(error);
    }
  };
}
