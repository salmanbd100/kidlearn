import type { WeeklyReportJobAccepted } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { requireCronSecret } from "../../shared/middleware/require-cron-secret.js";
import { startWeeklyReportsJob } from "./weekly-reports-job.service.js";

export const jobsRouter = Router();

jobsRouter.use(requireCronSecret);

// 202 before the work: a run over every child outlasts any scheduler's request timeout.
jobsRouter.post("/weekly-reports", (_req, res) => {
  const payload: SuccessEnvelope<WeeklyReportJobAccepted> = {
    data: startWeeklyReportsJob(),
  };
  res.status(202).json(payload);
});
