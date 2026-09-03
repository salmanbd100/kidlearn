import type { AIJobType } from "@kidlearn/db";
import type { RequestHandler } from "express";
import { assertWithinDailyCap } from "../services/ai/rate-guard.js";

/**
 * Refuses a generation request whose cost bucket has no budget left today
 * (file 36).
 *
 * On the route rather than inside each generator, so the guard is visible where
 * the endpoints are declared and cannot be forgotten by a generator written next
 * year. It delegates immediately — the arithmetic, the buckets and the day
 * boundary are `services/ai/rate-guard.ts`'s, callable without HTTP
 * (`backend.md §2`).
 *
 * **`pending: 1`, deliberately, even on the batch endpoints.** How many jobs a
 * batch will create is not knowable until the missing pairs have been computed,
 * which needs the entity loaded — so this is the cheap up-front refusal for a
 * bucket that is already exhausted, and the batch services call
 * `assertWithinDailyCap` again with the real count before they spend anything.
 * Two counts on a batch request; one `SELECT count(*)` is not the expensive part
 * of asking a model for sixteen audio clips.
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
