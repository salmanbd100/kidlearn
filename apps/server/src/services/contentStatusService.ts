import type { ContentStatus } from "@kidlearn/db";
import {
  ALLOWED_CONTENT_TRANSITIONS,
  CONTENT_STATUSES,
  isContentEditable,
  nextContentStatuses,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

/**
 * The publishing workflow (file 32, FR-CMS-06) — one matrix, one authority.
 *
 * **Why this is a service and not a check inside the route.** Four resources
 * transition here, stories transition through it in file 35, and file 37 layers
 * the AI-review rule on top of it. Every one of those is a chance to write "can
 * this be published?" slightly differently, and the version that gets it wrong
 * puts unreviewed content in front of a five-year-old. There is exactly one
 * function that answers the question, it takes no Express types, and it is
 * testable without an HTTP layer (`backend.md §2`).
 *
 * **What the matrix encodes**, beyond the individual cells:
 *
 *  - *Publishing requires approval.* `published` is reachable from `approved` and
 *    nowhere else, so no path exists that skips a human.
 *  - *Rejection means re-review.* `rejected` leads only to `draft` or `archived`.
 *    Getting rejected work published takes `draft → in_review → approved →
 *    published` — four hops, all of them through a reviewer. An author cannot
 *    undo a rejection.
 *  - *Unpublishing is not deletion.* `published → draft` withdraws content from
 *    students immediately (file 12's queries filter `status = published`) while
 *    keeping the row and its progress history.
 *  - *The diagonal is empty.* A status cannot transition to itself: a no-op would
 *    re-stamp `updatedBy` and `updatedAt`, leaving an audit trail that claims a
 *    review step somebody never performed.
 */

/**
 * Prisma's `ContentStatus` as an array, which the generated enum object is not.
 *
 * The members come from `@kidlearn/types` rather than a third handwritten list —
 * the `satisfies` clause is what makes the borrowing safe, because a status added
 * to `schema.prisma` and not to `CONTENT_STATUSES` (or the reverse) fails
 * `pnpm typecheck` on this line.
 */
export const CONTENT_STATUS_VALUES =
  CONTENT_STATUSES satisfies readonly ContentStatus[];

/**
 * The matrix itself lives in `@kidlearn/types`, because the CMS renders its
 * transition buttons from the same table — one definition rather than a mirror
 * that can drift into offering a hop the server refuses.
 *
 * Re-typed here against Prisma's `ContentStatus` rather than re-imported as-is,
 * and that is a second guard rather than a formality: `Record<ContentStatus, …>`
 * demands a row per Prisma status, so a status added to `schema.prisma` and not
 * to `CONTENT_STATUSES` — or the reverse — fails to compile on this line.
 */
export const ALLOWED_TRANSITIONS: Record<
  ContentStatus,
  readonly ContentStatus[]
> = ALLOWED_CONTENT_TRANSITIONS;

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * The legal next states for a status, as a fresh array.
 *
 * Delegates to the shared helper rather than repeating its body: it already
 * returns a copy, for the reason its own comment gives.
 */
export function nextStatuses(from: ContentStatus): ContentStatus[] {
  return nextContentStatuses(from);
}

/**
 * Throws unless the hop is legal.
 *
 * `409`, not `400`: the request is well-formed and the target status is a real
 * one — what is wrong is the state the row happens to be in, which is a conflict
 * and may not be wrong a moment later (`backend.md §5`). `details.code` is
 * `INVALID_TRANSITION` so a client can tell this apart from the other conflicts
 * on the API, and `allowed` is included so the CMS can refresh its buttons from
 * the rejection instead of guessing.
 */
export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (canTransition(from, to)) return;

  throw ApiError.conflict(`Invalid status transition ${from} → ${to}`, {
    code: "INVALID_TRANSITION",
    from,
    to,
    allowed: nextStatuses(from),
  });
}

/**
 * The shortest legal route from one status to another, as the hops to walk.
 *
 * **Why a search rather than a written-down chain.** File 37 needs to drive a row
 * to `published` or to `rejected` from wherever an admin has left it, and a
 * hard-coded `["in_review", "rejected"]` is only correct for a row still sitting
 * at `draft`. A row somebody approved or published by hand has no `→ in_review`
 * edge, so the chain throws `INVALID_TRANSITION` and the whole rejection rolls
 * back — leaving the one job most likely to need rejecting the one job that
 * cannot be rejected. Reading the route out of the matrix means the matrix stays
 * the single authority and the caller stops having to know its shape.
 *
 * Breadth-first over `ALLOWED_TRANSITIONS`, so the route is the shortest one and
 * every hop in it is a legal transition with a real audit stamp. Neighbours are
 * visited in matrix order, which makes the choice between two equally short
 * routes deterministic rather than incidental.
 *
 * Returns `[]` when the row is already there — the diagonal is empty in the
 * matrix precisely so an audit trail cannot claim a review step nobody performed.
 */
export function routeToStatus(
  from: ContentStatus,
  to: ContentStatus,
): ContentStatus[] {
  if (from === to) return [];

  const cameFrom = new Map<ContentStatus, ContentStatus>();
  const queue: ContentStatus[] = [from];
  const seen = new Set<ContentStatus>([from]);

  while (queue.length > 0) {
    const current = queue.shift() as ContentStatus;

    for (const next of ALLOWED_TRANSITIONS[current]) {
      if (seen.has(next)) continue;
      seen.add(next);
      cameFrom.set(next, current);

      if (next === to) {
        const route: ContentStatus[] = [];
        for (let at: ContentStatus = to; at !== from; ) {
          route.unshift(at);
          at = cameFrom.get(at) as ContentStatus;
        }
        return route;
      }

      queue.push(next);
    }
  }

  throw ApiError.conflict(`No legal route from ${from} to ${to}`, {
    code: "INVALID_TRANSITION",
    from,
    to,
    allowed: nextStatuses(from),
  });
}

/**
 * Throws unless the row's content may be rewritten — see `isContentEditable`
 * for why `published` refuses one.
 *
 * `409` for the same reason `assertTransition` uses it: the body is well formed
 * and it is the state the row happens to be in that refuses, which may not be
 * true a moment later. `details.code` is `EDIT_REQUIRES_UNPUBLISH` so a client
 * can tell it from `DUPLICATE_SLUG` on the same status code, and `allowed`
 * carries the hops that clear the way rather than leaving an admin to guess that
 * withdrawing is the first of them.
 */
export function assertEditable(status: ContentStatus): void {
  if (isContentEditable(status)) return;

  throw ApiError.conflict(
    "A published row cannot be edited — withdraw it to draft first",
    {
      code: "EDIT_REQUIRES_UNPUBLISH",
      status,
      allowed: nextStatuses(status),
    },
  );
}

/**
 * The FR-AI-07 invariant: AI-generated content cannot be published without a
 * recorded human review decision (file 37).
 *
 * **Why this is separate from the matrix and not a cell in it.** The matrix
 * answers "is this hop legal for content?" from the status alone, and by that
 * measure an AI draft walked `draft → in_review → approved → published` by hand
 * is perfectly legal — four correct hops that never involved anybody reading what
 * the model wrote. The status column cannot express the difference, because the
 * difference is not in the row: it is in whether the job that created it was
 * decided. So the invariant reads the job.
 *
 * **Both halves of the job are checked, and the second is load-bearing.** A
 * decision of `edit_then_approve` is written by the file-33 editors the moment a
 * reviewer saves an edit, which is *before* the approval — so a decision test on
 * its own would let an edited-but-undecided draft through the generic
 * `/transition` endpoint, which is the exact hole this function exists to close.
 * Requiring `status = approved` as well means only `approveJob` can open the
 * door, and it writes both in the same transaction before walking any hop.
 *
 * **Human-authored content passes immediately.** An empty list is the normal
 * case and costs no query: file 32's rules are the whole of the story there.
 *
 * **A list rather than one id, because a row can answer to more than one job.**
 * A quiz job run against a lesson that already had a quiz stamps `aiJobId` on the
 * *questions* and leaves the quiz row's own `aiJobId` null — so reading the one
 * column would publish model-written questions nobody reviewed. Every job that
 * wrote any part of what is about to go live has to have been approved, not just
 * the one that created the container.
 *
 * `409` rather than `403`, matching `assertTransition`: the request is well
 * formed and the caller is entitled to make it — what is wrong is the state of a
 * row, which may not be wrong a moment later. `details.code` is
 * `AI_REVIEW_REQUIRED` so a client can tell it from `INVALID_TRANSITION` on the
 * same status code and send the admin to the queue rather than to the matrix.
 */
export async function assertAiPublishable(
  jobIds: readonly (string | null)[],
  tx: Pick<typeof prisma, "aIGenerationJob"> = prisma,
): Promise<void> {
  const pending = [...new Set(jobIds.filter((id) => id !== null))];
  if (pending.length === 0) return;

  const jobs = await tx.aIGenerationJob.findMany({
    where: { id: { in: pending } },
    select: { id: true, status: true, decision: true },
  });
  const byId = new Map(jobs.map((job) => [job.id, job]));

  for (const jobId of pending) {
    // A missing job with a set `aiJobId` cannot happen through the foreign key,
    // but "cannot happen" is not a reason to publish unreviewed content if it does.
    const job = byId.get(jobId);
    const isApproved =
      job?.status === "approved" &&
      (job.decision === "approve" || job.decision === "edit_then_approve");

    if (isApproved) continue;

    throw ApiError.conflict(
      "AI-generated content requires an approved review decision before publishing (FR-AI-07)",
      {
        code: "AI_REVIEW_REQUIRED",
        jobId,
        jobStatus: job?.status ?? null,
        decision: job?.decision ?? null,
      },
    );
  }
}

/**
 * Every job answerable for what a quiz puts in front of a child.
 *
 * The quiz's own `aiJobId` names the job that *created* it, which is null
 * whenever the generator appended to a quiz an admin had already made. The
 * questions carry the job that wrote them, and a question has no status of its
 * own — it is published by its parent. So the parent's publish guard has to ask
 * the questions.
 */
export async function readQuizAiJobIds(
  quizId: string,
  tx: Pick<typeof prisma, "quizQuestion"> = prisma,
): Promise<string[]> {
  const questions = await tx.quizQuestion.findMany({
    where: { quizId, aiJobId: { not: null } },
    select: { aiJobId: true },
    distinct: ["aiJobId"],
  });

  return questions
    .map((one) => one.aiJobId)
    .filter((id): id is string => id !== null);
}
