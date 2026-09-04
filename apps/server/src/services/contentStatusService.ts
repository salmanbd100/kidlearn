import type { ContentStatus } from "@kidlearn/db";
import {
  ALLOWED_CONTENT_TRANSITIONS,
  CONTENT_STATUSES,
  isContentEditable,
  nextContentStatuses,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

// The publishing workflow (file 32, FR-CMS-06) — one matrix, one authority.

/**
 * Prisma's `ContentStatus` as an array, which the generated enum object is not.
 */
export const CONTENT_STATUS_VALUES =
  CONTENT_STATUSES satisfies readonly ContentStatus[];

/**
 * The matrix itself lives in `@kidlearn/types`, because the CMS renders its
 * transition buttons from the same table — one definition rather than a mirror
 * that can drift into offering a hop the server refuses.
 */
export const ALLOWED_TRANSITIONS: Record<
  ContentStatus,
  readonly ContentStatus[]
> = ALLOWED_CONTENT_TRANSITIONS;

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** The legal next states for a status, as a fresh array. */
export function nextStatuses(from: ContentStatus): ContentStatus[] {
  return nextContentStatuses(from);
}

/** Throws unless the hop is legal. */
export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (canTransition(from, to)) return;

  throw ApiError.conflict(`Invalid status transition ${from} → ${to}`, {
    code: "INVALID_TRANSITION",
    from,
    to,
    allowed: nextStatuses(from),
  });
}

/** The shortest legal route from one status to another, as the hops to walk. */
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

/** Every job answerable for what a quiz puts in front of a child. */
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
