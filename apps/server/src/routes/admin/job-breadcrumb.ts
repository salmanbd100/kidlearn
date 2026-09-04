import type { Request, Response } from "express";
import { logger } from "../../lib/logger.js";
import { adminContext } from "../../middleware/require-admin.js";
import { optionalValidatedQuery } from "../../middleware/validate.js";
import type { JobBreadcrumbQuery } from "../../schemas/admin-ai.js";
import { recordEditDecision } from "../../services/ai/review.js";

/**
 * Edit-then-approve, as a breadcrumb the queue puts in a URL (file 37,
 * requirement 5, FR-AI-07).
 *
 * The review screen's Edit button deep-links into the file-33 editors and the
 * lesson form carrying `?jobId=…`. Saving there records `edit_then_approve` on
 * that job, so publishing afterwards says *a human rewrote this* rather than *a
 * human read this and let it through* — two different facts about the same
 * lesson, and only one of them is recoverable after the event (FR-AI-08).
 *
 * **Why it rides on the save request rather than following it.** A client that
 * saved and then posted the decision separately can crash between the two, and
 * what it leaves behind is a rewritten lesson whose audit trail says nobody
 * rewrote it. One request, one fact.
 *
 * **Why it runs after the write and not as middleware.** Middleware runs before
 * the handler, and a save that was then refused — a published row, a duplicate
 * slug — must not leave a decision claiming an edit that did not happen.
 *
 * **Why a failure here is swallowed rather than thrown.** By the time this runs
 * the save has committed. Rethrowing would answer a successful `POST
 * /quizzes/:id/questions` with a `500`, and that endpoint appends — so the admin
 * who retries ends up with the question twice. The breadcrumb is an audit
 * nicety; the content write is the request. Logged so the loss is visible.
 *
 * Every caller keeps `validate({ query: JobBreadcrumbQuerySchema })` on its
 * route; without it `optionalValidatedQuery` reads nothing and this is a silent
 * no-op.
 */
export async function noteJobEdit(req: Request, res: Response): Promise<void> {
  const jobId = optionalValidatedQuery<JobBreadcrumbQuery>(res)?.jobId;
  if (jobId === undefined) return;

  try {
    await recordEditDecision(jobId, adminContext(req).id);
  } catch (err) {
    (req.log ?? logger).error(
      { err, jobId },
      "Failed to record edit-then-approve breadcrumb",
    );
  }
}
