import type { ContentStatus } from "@kidlearn/db";
import {
  ALLOWED_CONTENT_TRANSITIONS,
  CONTENT_STATUSES,
  isContentEditable,
  nextContentStatuses,
} from "@kidlearn/types";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";

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
 * for why `in_review`, `approved` and `published` refuse one.
 */
export function assertEditable(status: ContentStatus): void {
  if (isContentEditable(status)) return;

  throw ApiError.conflict(
    `A ${status} row cannot be edited — move it back to draft first`,
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

/**
 * What a publish hop has to clear for one quiz or activity: every job answerable
 * for what it puts in front of a child, and any asset URL the media library does
 * not hold.
 */
export type ContentsGuard = { aiJobIds: string[]; unregisteredUrls: string[] };

/** The publish guard's view of a quiz, through its questions. */
export async function readQuizGuard(
  quizId: string,
  tx: Pick<typeof prisma, "quizQuestion" | "mediaAsset"> = prisma,
): Promise<ContentsGuard> {
  const questions = await tx.quizQuestion.findMany({
    where: { quizId },
    select: { aiJobId: true, definition: true },
  });

  const assets = await readPayloadAssets(
    questions.map((question) => question.definition),
    tx,
  );

  return {
    aiJobIds: distinctIds([
      ...questions.map((question) => question.aiJobId),
      ...assets.aiJobIds,
    ]),
    unregisteredUrls: assets.unregisteredUrls,
  };
}

/** The publish guard's view of an activity. */
export async function readActivityGuard(
  activityId: string,
  tx: Pick<typeof prisma, "activity" | "mediaAsset"> = prisma,
): Promise<ContentsGuard> {
  const activity = await tx.activity.findUnique({
    where: { id: activityId },
    select: { aiJobId: true, definition: true },
  });
  if (!activity) return { aiJobIds: [], unregisteredUrls: [] };

  const assets = await readPayloadAssets([activity.definition], tx);

  return {
    aiJobIds: distinctIds([activity.aiJobId, ...assets.aiJobIds]),
    unregisteredUrls: assets.unregisteredUrls,
  };
}

function distinctIds(ids: readonly (string | null)[]): string[] {
  return [...new Set(ids)].filter((id) => typeof id === "string");
}

/**
 * Every `url` an asset ref carries, however deep the payload schema nests it —
 * the same key `withPlaceholderAssets` rewrites, so the two cannot disagree on
 * what counts as an asset.
 */
export function collectAssetUrls(
  value: unknown,
  into = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetUrls(item, into);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "url" && typeof child === "string") into.add(child);
      else collectAssetUrls(child, into);
    }
  }
  return into;
}

/** Resolves a payload's asset URLs against the media library. */
async function readPayloadAssets(
  definitions: readonly unknown[],
  tx: Pick<typeof prisma, "mediaAsset">,
): Promise<ContentsGuard> {
  const urls = new Set<string>();
  for (const definition of definitions) collectAssetUrls(definition, urls);
  if (urls.size === 0) return { aiJobIds: [], unregisteredUrls: [] };

  const assets = await tx.mediaAsset.findMany({
    where: { url: { in: [...urls] } },
    select: { url: true, aiJobId: true },
  });
  const known = new Set(assets.map((asset) => asset.url));

  return {
    aiJobIds: distinctIds(assets.map((asset) => asset.aiJobId)),
    unregisteredUrls: [...urls].filter((url) => !known.has(url)),
  };
}

/**
 * Refuses a publish whose payload links to media outside the library.
 *
 * The payload schema accepts any https URL, so this is where a link to a host
 * nobody reviewed — a third-party tracker, a generated image's raw model URL — is
 * stopped. It sits on the publish hop rather than on save because a draft may
 * legitimately point at a placeholder until its job's assets are attached, and
 * the editors only ever pick from the library: a refusal here means the payload
 * was written some other way.
 */
export function assertAssetsRegistered(unregisteredUrls: readonly string[]) {
  if (unregisteredUrls.length === 0) return;

  throw ApiError.conflict(
    "Content links to media that is not in the media library — pick it from the library before publishing",
    { code: "UNREGISTERED_ASSET", urls: unregisteredUrls },
  );
}
