import { prisma } from "../../../config/prisma.js";

// Longer than any job can take (ten provider calls, each bounded by `PROVIDER_TIMEOUT_MS`), so a row still
// `pending`/`generating` after this belongs to a killed process.
export const STALE_JOB_AFTER_MS = 15 * 60_000;

// Fails jobs stranded in `pending`/`generating`; otherwise they block regeneration and cannot be rejected.
// Run before reading job state rather than on a timer. Reaped jobs keep counting against the budget: their call count is unknown.
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
