import type { NextFunction, Request, RequestHandler, Response } from "express";
import { activeChild } from "../../shared/middleware/require-active-child.js";
import {
  evaluateStartForChild,
  screenTimeBlockedError,
} from "./screen-time.service.js";

/** Mount after `requireActiveChild`, on content-detail reads only (FR-TIME-02..04). */
export function enforceScreenTime(kind: "lesson" | "story"): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const child = activeChild(req);
      // Only a lesson can be resumed. Express 5 types a param as `string | string[]` and this may run before
      // `validate()`, so a non-string id means no lesson to be part-way through.
      const lessonId =
        kind === "lesson" && typeof req.params.id === "string"
          ? req.params.id
          : undefined;

      const decision = await evaluateStartForChild(child.id, lessonId);
      if (decision.allowed) return next();

      throw screenTimeBlockedError(decision);
    } catch (error) {
      next(error);
    }
  };
}
