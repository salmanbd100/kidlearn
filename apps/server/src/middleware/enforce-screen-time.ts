import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { evaluateStartForChild } from "../services/screenTimeService.js";
import { activeChild } from "./require-active-child.js";

/**
 * The parental gate on *starting* content (FR-TIME-02..04). Mount it after
 * `requireActiveChild`, on content-detail reads only.
 *
 * ## Why the gate is here rather than on the client
 *
 * A limit the browser applied is a limit a refresh lifts. The minutes it is
 * compared against are already derived server-side from rows the server stamped
 * (file 27), so enforcing anywhere else would put a number a child cannot forge
 * behind a check they can.
 *
 * ## Why only these two routes
 *
 * The gate is on the *start* of a lesson and the *start* of a story, and
 * deliberately on nothing else:
 *
 *  - **`POST /api/progress/lessons/:id/step` is never gated.** A lesson already
 *    under way must always be finishable (FR-TIME-03), and a child cut off between
 *    the quiz and the reward screen loses the work they just did. The exemption
 *    below is the same rule for the read.
 *
 *    It is also why the exemption is time-bounded rather than "any incomplete
 *    row": this endpoint writes the row the exemption reads, so an unbounded
 *    version would let one abandoned lesson stand as a permanent hole in both
 *    rules. See `LESSON_RESUME_GRACE_MS`.
 *  - **`/api/events/*` is never gated.** Time keeps being recorded while a child
 *    finishes (FR-TIME-06); a gate there would stop the clock at exactly the
 *    moment the limit was hit and make the recorded total permanently short.
 *  - **List endpoints are never gated.** A blocked child browsing worlds sees a
 *    friendly screen from the status read, not a wall of errors — and the tile
 *    they tap is where the refusal belongs.
 *
 * `423 Locked` rather than `403`: the request is well-formed and the caller is
 * exactly who they claim to be — the *resource* is unavailable for a reason that
 * will pass on its own. A `403` would be indistinguishable from the PIN gate's,
 * and the client branches on the code for two different mascot screens.
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
