import type { AiJobStatus, AiJobType, AiReviewDecision } from "@kidlearn/types";
import { formatRelative } from "@/shared/lib/relative-time";

/** Names what the work is rather than the cost-bucket enum ("Audio" hides intro vs story page). */
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

const AI_DECISION_LABELS: Record<AiReviewDecision, string> = {
  approve: "Approved as generated",
  edit_then_approve: "Edited by a reviewer, then approved",
  reject: "Rejected",
};

export function decisionLabel(
  decision: AiReviewDecision,
  status: AiJobStatus,
): string {
  if (decision === "edit_then_approve" && status === "awaiting_review") {
    return "Edited by a reviewer — not yet approved";
  }
  return AI_DECISION_LABELS[decision];
}

export function formatRelativeAge(
  isoTimestamp: string,
  now: Date = new Date(),
): string {
  return formatRelative(new Date(isoTimestamp), "en", now);
}
