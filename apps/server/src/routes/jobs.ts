import type { WeeklyReportJobResult } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { requireCronSecret } from "../middleware/require-cron-secret.js";
import { generateLastCompletedWeekForAllChildren } from "../services/weeklyReportService.js";

/**
 * `/api/admin/jobs` — the endpoints an external scheduler calls (file 30).
 *
 * A router of its own rather than a path on an existing one, because its
 * authorisation model is unlike everything else here: `requireCronSecret` mounted
 * on the router covers every current and future job path by construction, so a
 * second job added later cannot forget the guard. That is the same reasoning
 * `routes/index.ts` gives for mounting `requireParent` at the `/content` mount.
 *
 * `admin` in the path is a statement about who may call it, not a claim that the
 * admin CMS (file 31) owns it. These routes deliberately predate admin auth and do
 * not use it — see `require-cron-secret.ts`.
 *
 * The rule for anything added here: a job may **recompute** what the server already
 * owns. It may not read per-child data out, because the credential is a static
 * secret in a third party's configuration field and the response has no human to
 * be scoped to.
 */
export const jobsRouter = Router();

jobsRouter.use(requireCronSecret);

/**
 * Generates last week's report for every child (FR-DASH-05).
 *
 * **Idempotent, so a retrying scheduler is harmless.** Every write is an upsert on
 * `(childId, weekStart)`, so running this twice on a Monday leaves the same number
 * of rows as running it once — which is what lets the job be retried on a cold
 * start without a lock or a run log (FR-DASH-06).
 *
 * No request body and no `weekStart` parameter: the week is derived from the
 * server's clock and `APP_TIMEZONE`. A parameter would let a mis-configured job
 * overwrite an arbitrary historical week, and there is nothing a scheduler knows
 * about which week it is that the server does not know better.
 *
 * Answers `200`, not `202`: the work is finished by the time it responds. The job
 * is sequential over children for the reason
 * `generateLastCompletedWeekForAllChildren` gives — nothing is waiting on it, and
 * a burst would take the connection pool away from requests that are.
 */
jobsRouter.post("/weekly-reports", async (_req, res, next) => {
  try {
    const result = await generateLastCompletedWeekForAllChildren();

    const payload: SuccessEnvelope<WeeklyReportJobResult> = { data: result };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});
