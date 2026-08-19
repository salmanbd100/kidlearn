import type { ScreenTimeStatusResponse } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { activeChild } from "../middleware/require-active-child.js";
import { getScreenTimeStatus } from "../services/screenTimeService.js";

/**
 * `/api/screen-time` — the student surface's own view of its allowance
 * (FR-TIME-02, FR-TIME-04).
 *
 * Mounted in `routes/index.ts` behind `requireParent` + `requireActiveChild`, the
 * same pair `/api/content/*` carries, so the child is the session's and no request
 * can name whose allowance is being read.
 *
 * **Deliberately not PIN-gated.** This is a student-portal read: the home screen
 * calls it on load and before every tile tap, so that a blocked child meets a
 * mascot saying "time's up" instead of getting excited about a lesson and then
 * being refused. A parental gate in front of it would put the PIN pad between a
 * five-year-old and their own home screen. It reports minutes and a policy the
 * parent set — nothing about what was learned, and nothing a child could change.
 *
 * The settings themselves are written on `/api/children/{id}/screen-time`, which
 * *is* PIN-gated: reading your own allowance and setting somebody else's are
 * different acts by different people.
 */
export const screenTimeRouter = Router();

screenTimeRouter.get("/status", async (req, res, next) => {
  try {
    const status = await getScreenTimeStatus(activeChild(req).id);

    const body: SuccessEnvelope<ScreenTimeStatusResponse> = { data: status };
    res.json(body);
  } catch (error) {
    next(error);
  }
});
