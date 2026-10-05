import type { WeeklyReportJobResult } from "@kidlearn/types";
import { Router } from "express";
import { ApiError, type SuccessEnvelope } from "../../shared/errors/errors.js";
import { requireCronSecret } from "../../shared/middleware/require-cron-secret.js";
import { generateLastCompletedWeekForAllChildren } from "../children/weekly-report.service.js";
import { pruneSessionEvents } from "../progress/session-event-retention.service.js";

export const jobsRouter = Router();

jobsRouter.use(requireCronSecret);

/**
 * The run in flight: a request arriving mid-run joins it rather than starting a second pass
 * (one API process per environment, so module state suffices).
 */
let inFlight: Promise<WeeklyReportJobResult> | undefined;

/** Retention rides on this run; pruning after the reports means the week just reported is read before anything is deleted. */
async function runWeeklyJob(): Promise<WeeklyReportJobResult> {
  const reports = await generateLastCompletedWeekForAllChildren();
  const sessionEventsPruned = await pruneSessionEvents();
  return { ...reports, sessionEventsPruned };
}

function runWeeklyReportsOnce(): Promise<WeeklyReportJobResult> {
  inFlight ??= runWeeklyJob().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

jobsRouter.post("/weekly-reports", async (_req, res, next) => {
  try {
    const result = await runWeeklyReportsOnce();

    // A 200 reads as success to the cron script's `curl --fail`, so a run where any child failed must not answer one.
    if (result.childrenFailed > 0) {
      throw new ApiError(
        500,
        "INTERNAL",
        `Weekly reports failed for ${result.childrenFailed} of ${result.childrenProcessed} children`,
        result,
      );
    }

    const payload: SuccessEnvelope<WeeklyReportJobResult> = { data: result };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});
