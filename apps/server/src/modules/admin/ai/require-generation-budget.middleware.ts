import type { AIJobType } from "@kidlearn/db";
import type { RequestHandler } from "express";
import { assertWithinDailyCap } from "./rate-guard.js";

/**
 * Refuses a generation request whose cost bucket has no budget left today
 * (file 36).
 */
export function requireGenerationBudget(type: AIJobType): RequestHandler {
  return async (_req, _res, next) => {
    try {
      await assertWithinDailyCap(type);
      next();
    } catch (error) {
      next(error);
    }
  };
}
