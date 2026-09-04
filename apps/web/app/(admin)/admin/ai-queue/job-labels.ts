import type { AiJobStatus, AiJobType, AiReviewDecision } from "@kidlearn/types";
import { formatRelative } from "@/lib/relative-time";

/**
 * How the review queue names a job (file 37, FR-CMS-05).
 *
 * A module of plain data next to the two screens that render it, matching
 * `lib/admin-labels.ts`'s reasoning at a smaller scale: the list and the detail
 * page both label a job's type, and two copies is how "Narration" and "Audio"
 * end up on adjacent screens of the same tool.
 *
 * English only, under the recorded `(admin)` exception in `frontend.md §3`.
 */

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

/**
 * What each decision *means*, not what the enum is called.
 *
 * `edit_then_approve` is the one worth spelling out: it is the only record that
 * the words a child now reads are not the words the model wrote, and "Edited"
 * alone would leave a reader guessing whether it was published.
 */
const AI_DECISION_LABELS: Record<AiReviewDecision, string> = {
  approve: "Approved as generated",
  edit_then_approve: "Edited by a reviewer, then approved",
  reject: "Rejected",
};

/**
 * The decision, read together with the status that qualifies it.
 *
 * `edit_then_approve` is written by the file-33 editors the moment a reviewer
 * saves — *before* any approval, and on a job that is still `awaiting_review` and
 * still unpublishable. Labelling from the decision alone read "Edited by a
 * reviewer, then approved" on a job nobody had approved, which is the one
 * sentence that would get a second admin to skip it.
 */
export function decisionLabel(
  decision: AiReviewDecision,
  status: AiJobStatus,
): string {
  if (decision === "edit_then_approve" && status === "awaiting_review") {
    return "Edited by a reviewer — not yet approved";
  }
  return AI_DECISION_LABELS[decision];
}

/**
 * How long a job has been waiting.
 *
 * Reuses the parent dashboard's formatter rather than a second one — the queue
 * asks the same question its activity feed does. Fixed to `en` because this is
 * the CMS (see the exception above), and `now` is passed in by the caller for
 * the reason that function's own comment gives.
 */
export function formatRelativeAge(
  isoTimestamp: string,
  now: Date = new Date(),
): string {
  return formatRelative(new Date(isoTimestamp), "en", now);
}
