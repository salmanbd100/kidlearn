import type { WeeklyReportJobResult } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { requireCronSecret } from "../middleware/require-cron-secret.js";
import { generateLastCompletedWeekForAllChildren } from "../services/weeklyReportService.js";

export const jobsRouter = Router();

jobsRouter.use(requireCronSecret);

jobsRouter.post("/weekly-reports", async (_req, res, next) => {
  try {
    const result = await generateLastCompletedWeekForAllChildren();

    const payload: SuccessEnvelope<WeeklyReportJobResult> = { data: result };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});
