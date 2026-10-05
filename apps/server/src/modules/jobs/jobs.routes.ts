import type { WeeklyReportJobResult } from "@kidlearn/types";
import { Router } from "express";
import { ApiError, type SuccessEnvelope } from "../../shared/errors/errors.js";
import { requireCronSecret } from "../../shared/middleware/require-cron-secret.js";
import { generateLastCompletedWeekForAllChildren } from "../children/weekly-report.service.js";
import { pruneSessionEvents } from "../progress/session-event-retention.service.js";

/** `/api/admin/jobs` — the endpoints an external scheduler calls (file 30). */
export const jobsRouter = Router();

jobsRouter.use(requireCronSecret);

/**
 * The run in flight, if any. A request arriving mid-run joins it rather than
 * starting a second pass: the caller's own retry after its `--max-time` would
 * otherwise walk every child again alongside the first run. One API process per
 * environment, so module state is enough.
 */
let inFlight: Promise<WeeklyReportJobResult> | undefined;

/**
 * Retention rides on this run rather than a cron entry of its own: weekly is
 * often enough, the scheduler and its heartbeat already exist, and pruning
 * *after* the reports means the week just reported is read before anything
 * is deleted.
 */
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

/** Generates last week's report for every child (FR-DASH-05). */
jobsRouter.post("/weekly-reports", async (_req, res, next) => {
  try {
    const result = await runWeeklyReportsOnce();

    // A 200 here is what the cron script's `curl --fail` and heartbeat read as
    // success, so a run where any child failed must not answer one. The run
    // still finished every other child; the details say how many failed.
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
