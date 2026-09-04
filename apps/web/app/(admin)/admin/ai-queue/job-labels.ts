import type { AiJobStatus, AiJobType, AiReviewDecision } from "@kidlearn/types";
import { formatRelative } from "@/lib/relative-time";

// How the review queue names a job (file 37, FR-CMS-05).

/**
 * The enum values are the *cost buckets* the generators were built around;
 * these are what the work is. "Audio" says nothing about whether a clip is a
 * lesson intro or a story page — "Narration" does.
 */
export const AI_JOB_TYPE_LABELS: Record<AiJobType, string> = {
  lesson: "Lesson",
  story: "Story",
  quiz: "Quiz",
  audio: "Narration",
  image: "Illustration",
};

export const AI_JOB_STATUS_LABELS: Record<AiJobStatus, string> = {
  pending: "Pending",
  generating: "Generating",
  awaiting_review: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
};

/** What each decision *means*, not what the enum is called. */
const AI_DECISION_LABELS: Record<AiReviewDecision, string> = {
  approve: "Approved as generated",
  edit_then_approve: "Edited by a reviewer, then approved",
  reject: "Rejected",
};

/** The decision, read together with the status that qualifies it. */
export function decisionLabel(
  decision: AiReviewDecision,
  status: AiJobStatus,
): string {
  if (decision === "edit_then_approve" && status === "awaiting_review") {
    return "Edited by a reviewer — not yet approved";
  }
  return AI_DECISION_LABELS[decision];
}

/** How long a job has been waiting. */
export function formatRelativeAge(
  isoTimestamp: string,
  now: Date = new Date(),
): string {
  return formatRelative(new Date(isoTimestamp), "en", now);
}
