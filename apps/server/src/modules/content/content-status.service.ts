import type { ContentStatus } from "@kidlearn/db";
import {
  ALLOWED_CONTENT_TRANSITIONS,
  CONTENT_STATUSES,
  isContentEditable,
  nextContentStatuses,
} from "@kidlearn/types";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";

export const CONTENT_STATUS_VALUES =
  CONTENT_STATUSES satisfies readonly ContentStatus[];

// Lives in `@kidlearn/types` so the CMS renders its transition buttons from the same table.
export const ALLOWED_TRANSITIONS: Record<
  ContentStatus,
  readonly ContentStatus[]
> = ALLOWED_CONTENT_TRANSITIONS;

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: ContentStatus): ContentStatus[] {
  return nextContentStatuses(from);
}

export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (canTransition(from, to)) return;

  throw ApiError.conflict(`Invalid status transition ${from} → ${to}`, {
    code: "INVALID_TRANSITION",
    from,
    to,
    allowed: nextStatuses(from),
  });
}

export function routeToStatus(
  from: ContentStatus,
  to: ContentStatus,
): ContentStatus[] {
  if (from === to) return [];

  const cameFrom = new Map<ContentStatus, ContentStatus>();
  const queue: ContentStatus[] = [from];
  const seen = new Set<ContentStatus>([from]);

  for (
    let current = queue.shift();
    current !== undefined;
    current = queue.shift()
  ) {
    for (const next of ALLOWED_TRANSITIONS[current]) {
      if (seen.has(next)) continue;
      seen.add(next);
      cameFrom.set(next, current);

      if (next === to) {
        const route: ContentStatus[] = [];
        // Every reached status has a `cameFrom` entry; the `undefined` check satisfies the type.
        for (
          let at: ContentStatus | undefined = to;
          at !== undefined && at !== from;
          at = cameFrom.get(at)
        ) {
          route.unshift(at);
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

// FR-AI-07: AI-generated content cannot be published without a recorded human review decision.
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
    // "Cannot happen" via the foreign key, but not a reason to publish unreviewed content if it does.
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

// What a publish hop must clear: unreviewed AI jobs and asset URLs outside the media library.
export type ContentsGuard = { aiJobIds: string[]; unregisteredUrls: string[] };

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

// Same `url` key `withPlaceholderAssets` rewrites, so the two agree on what an asset is.
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

// The payload schema accepts any https URL, so this stops links to unreviewed
// hosts. It sits on publish, not save, because a draft may point at a
// placeholder until its assets are attached; editors only pick from the library.
export function assertAssetsRegistered(unregisteredUrls: readonly string[]) {
  if (unregisteredUrls.length === 0) return;

  throw ApiError.conflict(
    "Content links to media that is not in the media library — pick it from the library before publishing",
    { code: "UNREGISTERED_ASSET", urls: unregisteredUrls },
  );
}
