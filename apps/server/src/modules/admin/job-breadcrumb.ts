import type { Request, Response } from "express";
import { logger } from "../../config/logger.js";
import { adminContext } from "../../shared/middleware/require-admin.js";
import { optionalValidatedQuery } from "../../shared/middleware/validate.js";
import type { JobBreadcrumbQuery } from "./admin-ai.schema.js";
import { recordEditDecision } from "./ai/review.js";

/**
 * Edit-then-approve, as a breadcrumb the queue puts in a URL (file 37,
 * requirement 5, FR-AI-07).
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
