import type {
  CharacterUnlockResponse,
  RewardSummaryResponse,
} from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { activeChild } from "../middleware/require-active-child.js";
import { listCharactersForChild } from "../services/achievementService.js";
import { getRewardSummary } from "../services/rewardService.js";

/**
 * `/api/me` — what the *signed-in child* has, as opposed to what the curriculum
 * holds or what a parent administers.
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

/**
 * FR-GAM-05 — every published character, flagged with whether this child has it.
 */
meRouter.get("/characters", async (req, res, next) => {
  try {
    const characters = await listCharactersForChild(activeChild(req).id);
    const body: SuccessEnvelope<{ characters: CharacterUnlockResponse[] }> = {
      data: { characters },
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
});
