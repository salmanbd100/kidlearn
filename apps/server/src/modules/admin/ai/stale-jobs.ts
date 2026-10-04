import { prisma } from "../../../config/prisma.js";

// Recovery for jobs whose process died mid-run (file 36).

/**
 * Longer than any job can legitimately take: a lesson is at most ten provider
 * calls, each bounded by `PROVIDER_TIMEOUT_MS`, so a row still `pending` or
 * `generating` after this is not running — its process was killed (a deploy, an
 * out-of-memory) before it could record an outcome.
 */
export const STALE_JOB_AFTER_MS = 15 * 60_000;

/**
 * Fails every job stranded in `pending` or `generating`. Without it such a row
 * is permanent: the narration and illustration batches skip a pair that has a
 * live job, and a job that is not `awaiting_review` cannot be rejected, so the
 * pair could never be generated again.
 *
 * Run before anything that reads job state rather than on a timer, so there is
 * no scheduler to forget to deploy. A reaped job keeps counting against the
 * day's budget — how many provider calls it made before it died is unknown, and
 * undercounting would let a crash loop spend past the cap.
 */
export async function failStaleJobs(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.aIGenerationJob.updateMany({
    where: {
      status: { in: ["pending", "generating"] },
      updatedAt: { lt: new Date(now.getTime() - STALE_JOB_AFTER_MS) },
    },
    data: {
      status: "failed",
      rawOutput: {
        error:
          "The job did not finish — its process stopped before recording a result. Generate it again.",
      },
    },
  });

  return count;
}
