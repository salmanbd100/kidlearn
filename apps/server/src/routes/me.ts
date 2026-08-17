import type { RewardSummaryResponse } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { activeChild } from "../middleware/require-active-child.js";
import { getRewardSummary } from "../services/rewardService.js";

/**
 * `/api/me` — what the *signed-in child* has, as opposed to what the curriculum
 * holds or what a parent administers.
 *
 * A resource of its own rather than a path on `/children/{id}`, and the missing
 * id is the point: the child is the session's active profile, so there is no
 * parameter here a client could change to read another child's totals. Mounted
 * behind the same two guards as `/api/content/*` and `/api/progress/*` in
 * `routes/index.ts`, so a route added here later inherits them.
 */
export const meRouter = Router();

meRouter.get("/rewards/summary", async (req, res, next) => {
  try {
    const summary = await getRewardSummary(activeChild(req).id);
    const body: SuccessEnvelope<RewardSummaryResponse> = { data: summary };
    res.json(body);
  } catch (error) {
    next(error);
  }
});
