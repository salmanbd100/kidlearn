import type { AIReviewDecision, ContentStatus } from "@kidlearn/db";
import type { AiJobEntity } from "@kidlearn/types";
import { prisma } from "../../../../config/prisma.js";
import { ApiError } from "../../../../shared/errors/errors.js";
import { withSerializationRetry } from "../../../../shared/utils/serializable-retry.js";
import {
  assertAiPublishable,
  assertAssetsRegistered,
  routeToStatus,
} from "../../../content/content-status.service.js";
import { attachAssets } from "./attach.js";
import { readBlockers } from "./blockers.js";
import {
  type AiReviewResultDto,
  JOB_SELECT,
  type JobRow,
  type LinkedRow,
  linkedContentRows,
  type ReviewWriter,
  toEntity,
} from "./job.js";
import { buildDetail } from "./queue.js";

/** Approve and publish, in one transaction (FR-CMS-06). */
export async function approveJob(
  jobId: string,
  reviewerId: string,
): Promise<AiReviewResultDto> {
  return withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const job = await readDecidableJob(tx, jobId);
        const linked = await linkedContentRows(jobId, tx);

        const blockers = await readBlockers(job, linked, tx);
        if (blockers.length > 0) {
          throw ApiError.conflict(
            "This job cannot be approved yet — see details.blockers",
            { code: "APPROVAL_BLOCKED", jobId, blockers },
          );
        }

        const decision: AIReviewDecision = job.decision ?? "approve";
        await tx.aIGenerationJob.update({
          where: { id: jobId },
          data: {
            status: "approved",
            decision,
            reviewerId,
            reviewedAt: new Date(),
          },
        });

        const published = await walkChain(tx, linked, "published", reviewerId);
        const attachedAssetIds = await attachAssets(tx, jobId);

        return finish(tx, jobId, {
          publishedEntities: published,
          rejectedEntities: [],
          attachedAssetIds,
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

/** Reject, with a mandatory reason (FR-AI-08). */
export async function rejectJob(
  jobId: string,
  reviewerId: string,
  reason: string,
): Promise<AiReviewResultDto> {
  return withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await readDecidableJob(tx, jobId);
        const linked = await linkedContentRows(jobId, tx);

        await tx.aIGenerationJob.update({
          where: { id: jobId },
          data: {
            status: "rejected",
            decision: "reject",
            reviewNote: reason,
            reviewerId,
            reviewedAt: new Date(),
          },
        });

        const rejected = await walkChain(tx, linked, "rejected", reviewerId);

        return finish(tx, jobId, {
          publishedEntities: [],
          rejectedEntities: rejected,
          attachedAssetIds: [],
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

async function readDecidableJob(
  tx: ReviewWriter,
  jobId: string,
): Promise<JobRow> {
  const job = await tx.aIGenerationJob.findUnique({
    where: { id: jobId },
    select: JOB_SELECT,
  });
  if (!job) throw ApiError.notFound("No such generation job");

  if (job.status !== "awaiting_review") {
    throw ApiError.conflict("This job is not awaiting review", {
      code: "JOB_NOT_AWAITING_REVIEW",
      jobId,
      status: job.status,
    });
  }
  return job;
}

/** Walks every linked row to a destination status, one legal hop at a time. */
async function walkChain(
  tx: ReviewWriter,
  rows: LinkedRow[],
  destination: ContentStatus,
  reviewerId: string,
): Promise<AiJobEntity[]> {
  const moved: AiJobEntity[] = [];

  for (const row of rows) {
    let status = row.status;
    for (const to of routeToStatus(status, destination)) {
      if (to === "published") {
        assertAssetsRegistered(row.unregisteredUrls);
        await assertAiPublishable(row.aiJobIds, tx);
      }
      await writeStatus(tx, row, to, reviewerId);
      status = to;
    }
    moved.push({ ...toEntity(row), status });
  }

  return moved;
}

/**
 * File 32 added `updatedBy` to the curriculum hierarchy; `Quiz`, `Activity` and
 * `Story` predate it, so their audit trail is the job's own `reviewerId`.
 */
async function writeStatus(
  tx: ReviewWriter,
  row: LinkedRow,
  status: ContentStatus,
  reviewerId: string,
): Promise<void> {
  switch (row.resource) {
    case "lessons":
      await tx.lesson.update({
        where: { id: row.id },
        data: { status, updatedBy: reviewerId },
      });
      return;
    case "quizzes":
      await tx.quiz.update({ where: { id: row.id }, data: { status } });
      return;
    case "activities":
      await tx.activity.update({ where: { id: row.id }, data: { status } });
      return;
    case "stories":
      await tx.story.update({ where: { id: row.id }, data: { status } });
      return;
  }
}

async function finish(
  tx: ReviewWriter,
  jobId: string,
  outcome: Omit<AiReviewResultDto, "job">,
): Promise<AiReviewResultDto> {
  const job = await tx.aIGenerationJob.findUniqueOrThrow({
    where: { id: jobId },
    select: JOB_SELECT,
  });

  return { job: await buildDetail(job, tx), ...outcome };
}

/** Records that a reviewer rewrote a job's content before deciding on it. */
export async function recordEditDecision(
  jobId: string,
  reviewerId: string,
): Promise<void> {
  await prisma.aIGenerationJob.updateMany({
    where: { id: jobId, status: "awaiting_review" },
    data: { decision: "edit_then_approve", reviewerId },
  });
}
