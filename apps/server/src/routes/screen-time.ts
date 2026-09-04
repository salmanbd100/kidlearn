import type { ScreenTimeStatusResponse } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { activeChild } from "../middleware/require-active-child.js";
import { getScreenTimeStatus } from "../services/screenTimeService.js";

/**
 * `/api/screen-time` — the student surface's own view of its allowance
 * (FR-TIME-02, FR-TIME-04).
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
