import type { WeeklyReportJobResult } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { requireCronSecret } from "../../shared/middleware/require-cron-secret.js";
import { generateLastCompletedWeekForAllChildren } from "../children/weekly-report.service.js";

/** `/api/admin/jobs` — the endpoints an external scheduler calls (file 30). */
export const jobsRouter = Router();

jobsRouter.use(requireCronSecret);

/** Generates last week's report for every child (FR-DASH-05). */
jobsRouter.post("/weekly-reports", async (_req, res, next) => {
  try {
    const result = await generateLastCompletedWeekForAllChildren();

    const payload: SuccessEnvelope<WeeklyReportJobResult> = { data: result };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});
