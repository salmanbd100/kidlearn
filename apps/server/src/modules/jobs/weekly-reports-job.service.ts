import type {
  WeeklyReportJobAccepted,
  WeeklyReportJobResult,
} from "@kidlearn/types";
import { logger } from "../../config/logger.js";
import { generateLastCompletedWeekForAllChildren } from "../children/weekly-report.service.js";
import { pruneSessionEvents } from "../progress/session-event-retention.service.js";

type Run = { startedAt: Date; done: Promise<void> };

/** One API process per environment, so module state is enough to stop two runs walking every child at once. */
let inFlight: Run | undefined;

/** Retention rides on this run; pruning after the reports means the week just reported is read before anything is deleted. */
async function runWeeklyJob(): Promise<WeeklyReportJobResult> {
  const reports = await generateLastCompletedWeekForAllChildren();
  const sessionEventsPruned = await pruneSessionEvents();
  return { ...reports, sessionEventsPruned };
}

/** Nobody awaits the run, so its outcome is only ever in the log; a failure is logged at `error` for the alert to find. */
async function runAndLog(): Promise<void> {
  try {
    const result = await runWeeklyJob();
    if (result.childrenFailed > 0) {
      logger.error(
        result,
        `Weekly reports failed for ${result.childrenFailed} of ${result.childrenProcessed} children`,
      );
    } else {
      logger.info(result, "Weekly report job finished");
    }
  } catch (error) {
    logger.error({ err: error }, "Weekly report job failed");
  }
}

export function startWeeklyReportsJob(): WeeklyReportJobAccepted {
  if (inFlight !== undefined) {
    return {
      status: "alreadyRunning",
      startedAt: inFlight.startedAt.toISOString(),
    };
  }

  const startedAt = new Date();
  const done = runAndLog().finally(() => {
    inFlight = undefined;
  });
  inFlight = { startedAt, done };
  return { status: "started", startedAt: startedAt.toISOString() };
}

/** The run in flight, if any; the route never waits on it, a test does. */
export function weeklyReportsJobInFlight(): Promise<void> | undefined {
  return inFlight?.done;
}
