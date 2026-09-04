import type { AIReviewDecision, ContentStatus } from "@kidlearn/db";
// Value import, not `import type`: `Prisma.PrismaClientKnownRequestError` is a
// runtime class the `P2025` check in `attachOrConflict` does an `instanceof` on.
import { Prisma } from "@kidlearn/db";
import type {
  AiEntityResource,
  AiJobAsset,
  AiJobCount,
  AiJobDetail,
  AiJobEntity,
  AiJobList,
  AiJobSummary,
  AiReviewResult,
  GradeLevelValue,
  Locale,
} from "@kidlearn/types";
import { GRADE_LEVELS, LOCALES } from "@kidlearn/types";
import { ApiError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { withSerializationRetry } from "../../lib/serializable-retry.js";
import type { AiJobListQuery } from "../../schemas/admin-ai.js";
import {
  assertAiPublishable,
  readQuizAiJobIds,
  routeToStatus,
} from "../contentStatusService.js";
import { PLACEHOLDER_ASSET_HOST } from "./placeholder-assets.js";

// The human gate FR-AI-07 makes a hard requirement (FR-CMS-05..06).

/**
 * The four content tables a job can create rows in, spelled as CMS path segments
 * so the review screen's "open in editor" links come from the payload.
 */
type EntityResource = AiEntityResource;

/** `Quiz.title` is nullable; the queue still has to call the row something. */
const UNTITLED_QUIZ = "Untitled quiz";

type LinkedRow = {
  resource: EntityResource;
  id: string;
  label: string;
  status: ContentStatus;
  /** Every job answerable for the row's contents — a quiz answers for its questions' jobs too. */
  aiJobIds: string[];
};

type ReviewWriter = Pick<
  typeof prisma,
  | "aIGenerationJob"
  | "lesson"
  | "quiz"
  | "quizQuestion"
  | "activity"
  | "story"
  | "lessonTranslation"
  | "storyPageTranslation"
  | "quizQuestionTranslation"
  | "storyPage"
  | "mediaAsset"
>;

/**
 * A quiz job run against a lesson that already had a quiz stamps `aiJobId` on the
 * *questions* only, because the quiz row predates the job. The questions have no
 * status, so approving them means publishing the quiz they belong to.
 */
async function linkedContentRows(
  jobId: string,
  tx: ReviewWriter,
): Promise<LinkedRow[]> {
  const [lessons, quizzes, activities, stories, questions] = await Promise.all([
    tx.lesson.findMany({
      where: { aiJobId: jobId },
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.quiz.findMany({
      where: { aiJobId: jobId },
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.activity.findMany({
      where: { aiJobId: jobId },
      select: { id: true, type: true, status: true, aiJobId: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.story.findMany({
      where: { aiJobId: jobId },
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.quizQuestion.findMany({
      where: { aiJobId: jobId },
      select: {
        quiz: {
          select: { id: true, title: true, status: true, aiJobId: true },
        },
      },
    }),
  ]);

  const rows: LinkedRow[] = [
    ...lessons.map((row) => ({
      resource: "lessons" as const,
      id: row.id,
      label: row.title,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
    })),
    ...quizzes.map((row) => ({
      resource: "quizzes" as const,
      id: row.id,
      label: row.title ?? UNTITLED_QUIZ,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
    })),
    ...activities.map((row) => ({
      resource: "activities" as const,
      id: row.id,
      label: row.type,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
    })),
    ...stories.map((row) => ({
      resource: "stories" as const,
      id: row.id,
      label: row.title,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
    })),
  ];

  const seen = new Set(rows.map((row) => `${row.resource}:${row.id}`));
  for (const { quiz } of questions) {
    if (seen.has(`quizzes:${quiz.id}`)) continue;
    seen.add(`quizzes:${quiz.id}`);
    rows.push({
      resource: "quizzes",
      id: quiz.id,
      label: quiz.title ?? UNTITLED_QUIZ,
      status: quiz.status,
      aiJobIds: idList(quiz.aiJobId),
    });
  }

  // A quiz publishes its questions, so the publish guard has to see their jobs —
  // including questions from a *different* job than the one being reviewed, which
  // a per-job read cannot find (FR-AI-07).
  for (const row of rows) {
    if (row.resource !== "quizzes") continue;
    row.aiJobIds = [
      ...new Set([...row.aiJobIds, ...(await readQuizAiJobIds(row.id, tx))]),
    ];
  }

  return rows;
}

function idList(id: string | null): string[] {
  return id === null ? [] : [id];
}

function toEntity(row: LinkedRow): AiJobEntity {
  return {
    resource: row.resource,
    id: row.id,
    label: row.label,
    status: row.status,
  };
}

/**
 * Both columns are JSONB Prisma types as `JsonValue`, and every field read out of
 * them below is re-checked before use: a job whose audit record predates a prompt
 * change must still render in the queue rather than throwing the list.
 */
function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  // The JSONB column boundary. Narrowed to "an object with unknown values",
  // which is exactly what the three guards above verify.
  return value as Record<string, unknown>;
}

/**
 * The lesson generator records one `gradeLevel`, the story generator a
 * `gradeLevels` array, and the media generators neither — folded into one array so
 * the queue has a single column to render and a single filter to apply.
 */
function readGradeLevels(input: Record<string, unknown>): GradeLevelValue[] {
  const values = Array.isArray(input.gradeLevels)
    ? input.gradeLevels
    : [input.gradeLevel];

  return GRADE_LEVELS.filter((grade) => values.includes(grade));
}

/**
 * `languages` for the text generators; `locale` for a narration clip, which has
 * exactly one. An illustration job has neither — a picture has no language.
 */
function readLanguages(input: Record<string, unknown>): Locale[] {
  const values = Array.isArray(input.languages)
    ? input.languages
    : [input.locale];

  return LOCALES.filter((locale) => values.includes(locale));
}

function readString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

const JOB_SELECT = {
  id: true,
  type: true,
  status: true,
  decision: true,
  input: true,
  rawOutput: true,
  reviewerId: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
} satisfies Prisma.AIGenerationJobSelect;

type JobRow = Prisma.AIGenerationJobGetPayload<{ select: typeof JOB_SELECT }>;

/**
 * `AiJobSummary` and `AiJobDetail` type their timestamps as ISO strings, which is
 * the wire format; the rows carry `Date`. `res.json()` does the conversion, so
 * the DTOs here are declared with `Date` in those positions — matching every
 * other admin service — and this is the one place the two descriptions meet.
 */
export type AiJobSummaryDto = Omit<AiJobSummary, "createdAt" | "reviewedAt"> & {
  createdAt: Date;
  reviewedAt: Date | null;
};

export type AiJobDetailDto = Omit<
  AiJobDetail,
  "createdAt" | "reviewedAt" | "updatedAt"
> & { createdAt: Date; reviewedAt: Date | null; updatedAt: Date };

export type AiJobListDto = Omit<AiJobList, "jobs"> & {
  jobs: AiJobSummaryDto[];
};

export type AiReviewResultDto = Omit<AiReviewResult, "job"> & {
  job: AiJobDetailDto;
};

function toSummary(row: JobRow, entityLabel: string | null): AiJobSummaryDto {
  const input = asRecord(row.input);

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    decision: row.decision,
    gradeLevels: readGradeLevels(input),
    languages: readLanguages(input),
    entityLabel,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

/** A page of the queue (FR-CMS-05). */
export async function listJobs(query: AiJobListQuery): Promise<AiJobListDto> {
  const where: Prisma.AIGenerationJobWhereInput = {
    status: query.status,
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(query.gradeLevel === undefined
      ? {}
      : {
          OR: [
            { input: { path: ["gradeLevel"], equals: query.gradeLevel } },
            {
              input: {
                path: ["gradeLevels"],
                array_contains: [query.gradeLevel],
              },
            },
          ],
        }),
    ...(query.language === undefined
      ? {}
      : {
          AND: [
            {
              OR: [
                { input: { path: ["locale"], equals: query.language } },
                {
                  input: {
                    path: ["languages"],
                    array_contains: [query.language],
                  },
                },
              ],
            },
          ],
        }),
  };

  const [rows, total] = await Promise.all([
    prisma.aIGenerationJob.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: query.take,
      skip: query.skip,
      select: JOB_SELECT,
    }),
    prisma.aIGenerationJob.count({ where }),
  ]);

  // Five reads for the whole page, not five per job: `linkedContentRows` fans out
  // across five tables, and calling it per row turned a 25-row page into 125
  // queries.
  const labels = await readEntityLabels(rows, prisma);

  return {
    jobs: rows.map((row) => toSummary(row, labels.get(row.id) ?? null)),
    total,
  };
}

/**
 * The first content row a job created, in the same lessons-first order
 * `linkedContentRows` uses, so a label does not depend on whether the job was read
 * alone or in a page. Falls back to what a media job has, and to nothing for a
 * `failed` job.
 */
async function readEntityLabels(
  rows: JobRow[],
  tx: ReviewWriter,
): Promise<Map<string, string>> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return new Map();

  const where = { aiJobId: { in: ids } };
  const order = { createdAt: "asc" } as const;
  const [lessons, quizzes, activities, stories, questions] = await Promise.all([
    tx.lesson.findMany({
      where,
      select: { aiJobId: true, title: true },
      orderBy: order,
    }),
    tx.quiz.findMany({
      where,
      select: { aiJobId: true, title: true },
      orderBy: order,
    }),
    tx.activity.findMany({
      where,
      select: { aiJobId: true, type: true },
      orderBy: order,
    }),
    tx.story.findMany({
      where,
      select: { aiJobId: true, title: true },
      orderBy: order,
    }),
    tx.quizQuestion.findMany({
      where,
      select: { aiJobId: true, quiz: { select: { title: true } } },
    }),
  ]);

  const labels = new Map<string, string>();
  const claim = (jobId: string | null, label: string): void => {
    if (jobId === null || labels.has(jobId)) return;
    labels.set(jobId, label);
  };

  for (const row of lessons) claim(row.aiJobId, row.title);
  for (const row of quizzes) claim(row.aiJobId, row.title ?? UNTITLED_QUIZ);
  for (const row of activities) claim(row.aiJobId, row.type);
  for (const row of stories) claim(row.aiJobId, row.title);
  for (const row of questions) {
    claim(row.aiJobId, row.quiz.title ?? UNTITLED_QUIZ);
  }

  for (const row of rows) {
    const input = asRecord(row.input);
    const fallback =
      readString(input, "text") ?? readString(input, "illustrationPrompt");
    if (fallback !== undefined) claim(row.id, fallback);
  }

  return labels;
}

function entityLabel(row: JobRow, linked: LinkedRow[]): string | null {
  if (linked.length > 0) return linked[0].label;

  const input = asRecord(row.input);
  return (
    readString(input, "text") ?? readString(input, "illustrationPrompt") ?? null
  );
}

export async function getJob(id: string): Promise<AiJobDetailDto> {
  const row = await prisma.aIGenerationJob.findUnique({
    where: { id },
    select: JOB_SELECT,
  });
  if (!row) throw ApiError.notFound("No such generation job");

  return buildDetail(row, prisma);
}

async function buildDetail(
  row: JobRow,
  tx: ReviewWriter,
): Promise<AiJobDetailDto> {
  const linked = await linkedContentRows(row.id, tx);
  const assets = await readJobAssets(row, tx);

  return {
    ...toSummary(row, entityLabel(row, linked)),
    input: row.input,
    rawOutput: row.rawOutput,
    reviewerId: row.reviewerId,
    reviewNote: row.reviewNote,
    updatedAt: row.updatedAt,
    entities: linked.map(toEntity),
    assets,
    blockers: await readBlockers(row, linked, tx),
  };
}

/**
 * The attach target is read from the job's `input`, not the asset row: a
 * `MediaAsset` holds a URL and a language, and which translation or story page it
 * belongs to is exactly the fact generation deliberately did not write (file 36).
 * `isAttached` checks the live foreign key, so a job re-opened after approval shows
 * the attachment rather than offering it again.
 */
async function readJobAssets(
  row: JobRow,
  tx: ReviewWriter,
): Promise<AiJobAsset[]> {
  const assets = await tx.mediaAsset.findMany({
    where: { aiJobId: row.id },
    select: { id: true, url: true, kind: true, language: true },
    orderBy: { createdAt: "asc" },
  });
  if (assets.length === 0) return [];

  const target = readAttachTarget(row);

  return Promise.all(
    assets.map(async (asset) => ({
      id: asset.id,
      url: asset.url,
      kind: asset.kind,
      language: asset.language,
      targetTable: target?.table ?? null,
      targetId: target?.id ?? null,
      sourceText:
        readString(asRecord(row.input), "text") ??
        readString(asRecord(row.input), "resolvedPrompt") ??
        null,
      isAttached: target === undefined ? false : await isAttached(target, tx),
    })),
  );
}

/** The four foreign keys a media approval can write (file 36). */
const ATTACH_TABLES = [
  "LessonTranslation",
  "StoryPageTranslation",
  "QuizQuestionTranslation",
  "StoryPage",
] as const;
type AttachTable = (typeof ATTACH_TABLES)[number];

type AttachTarget = { table: AttachTable; id: string; locale?: Locale };

/**
 * Read from `input` rather than `rawOutput.entities`: both carry it, but `input`
 * is written *before* the provider is called, so a job that failed mid-generation
 * still says what it was for. Every field is re-checked — the JSONB boundary.
 */
function readAttachTarget(row: JobRow): AttachTarget | undefined {
  const input = asRecord(row.input);
  const table = input.targetTable;
  const id = input.targetId;
  if (typeof table !== "string" || typeof id !== "string") return undefined;

  const known = ATTACH_TABLES.find((one) => one === table);
  if (known === undefined) return undefined;

  const locale = LOCALES.find((one) => one === input.locale);
  return { table: known, id, ...(locale === undefined ? {} : { locale }) };
}

async function isAttached(
  target: AttachTarget,
  tx: ReviewWriter,
): Promise<boolean> {
  switch (target.table) {
    case "LessonTranslation": {
      if (target.locale === undefined) return false;
      const row = await tx.lessonTranslation.findUnique({
        where: {
          lessonId_language: { lessonId: target.id, language: target.locale },
        },
        select: { introAudioAssetId: true },
      });
      return row?.introAudioAssetId != null;
    }
    case "StoryPageTranslation": {
      if (target.locale === undefined) return false;
      const row = await tx.storyPageTranslation.findUnique({
        where: {
          storyPageId_language: {
            storyPageId: target.id,
            language: target.locale,
          },
        },
        select: { narrationAudioAssetId: true },
      });
      return row?.narrationAudioAssetId != null;
    }
    case "QuizQuestionTranslation": {
      if (target.locale === undefined) return false;
      const row = await tx.quizQuestionTranslation.findUnique({
        where: {
          questionId_language: {
            questionId: target.id,
            language: target.locale,
          },
        },
        select: { audioAssetId: true },
      });
      return row?.audioAssetId != null;
    }
    case "StoryPage": {
      const row = await tx.storyPage.findUnique({
        where: { id: target.id },
        select: { illustrationAssetId: true },
      });
      return row?.illustrationAssetId != null;
    }
  }
}

/** Why this job cannot be approved right now. */
async function readBlockers(
  row: JobRow,
  linked: LinkedRow[],
  tx: ReviewWriter,
): Promise<string[]> {
  if (row.status !== "awaiting_review") return [];

  const blockers: string[] = [];

  const moved = linked.filter((one) => one.status !== "draft");
  for (const one of moved) {
    blockers.push(
      `${one.label} is ${one.status}, not draft — it has been changed since this job was generated.`,
    );
  }

  for (const label of await readPlaceholderQuestions(row.id, tx)) {
    blockers.push(
      `${label} still points at a generated placeholder asset that was never replaced.`,
    );
  }

  return blockers;
}

/**
 * Matched on `PLACEHOLDER_ASSET_HOST` rather than `pending://`: the scheme was
 * never viable because `AssetRefSchema.url` requires `https://`, so file 35 uses a
 * reserved `.invalid` host. One spelling, imported from the module that defines it.
 */
async function readPlaceholderQuestions(
  jobId: string,
  tx: ReviewWriter,
): Promise<string[]> {
  const questions = await tx.quizQuestion.findMany({
    where: { aiJobId: jobId },
    select: { id: true, sortOrder: true, definition: true },
    orderBy: { sortOrder: "asc" },
  });

  return questions
    .filter((one) =>
      JSON.stringify(one.definition).includes(PLACEHOLDER_ASSET_HOST),
    )
    .map((one) => `Question ${one.sortOrder}`);
}

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
      if (to === "published") await assertAiPublishable(row.aiJobIds, tx);
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

/**
 * Writes the foreign key an audio or image job recorded but deliberately did not
 * set (FR-CMS-05) — this is what "publish" means for a media job, since a
 * `MediaAsset` is reachable only through the row that points at it.
 */
async function attachAssets(
  tx: ReviewWriter,
  jobId: string,
): Promise<string[]> {
  const job = await tx.aIGenerationJob.findUnique({
    where: { id: jobId },
    select: JOB_SELECT,
  });
  if (!job) return [];

  const target = readAttachTarget(job);
  if (target === undefined) return [];

  const assets = await tx.mediaAsset.findMany({
    where: { aiJobId: jobId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (assets.length === 0) return [];

  // One asset per media job by construction (file 36), so the newest wins if that
  // ever changes.
  const assetId = assets[assets.length - 1].id;

  switch (target.table) {
    case "LessonTranslation": {
      const { locale } = target;
      if (locale === undefined) return [];
      await attachOrConflict(target, () =>
        tx.lessonTranslation.update({
          where: {
            lessonId_language: { lessonId: target.id, language: locale },
          },
          data: { introAudioAssetId: assetId },
        }),
      );
      break;
    }
    case "StoryPageTranslation": {
      const { locale } = target;
      if (locale === undefined) return [];
      await attachOrConflict(target, () =>
        tx.storyPageTranslation.update({
          where: {
            storyPageId_language: { storyPageId: target.id, language: locale },
          },
          data: { narrationAudioAssetId: assetId },
        }),
      );
      break;
    }
    case "QuizQuestionTranslation":
      if (target.locale === undefined) return [];
      await tx.quizQuestionTranslation.upsert({
        where: {
          questionId_language: {
            questionId: target.id,
            language: target.locale,
          },
        },
        create: {
          questionId: target.id,
          language: target.locale,
          audioAssetId: assetId,
        },
        update: { audioAssetId: assetId },
      });
      break;
    case "StoryPage":
      await attachOrConflict(target, () =>
        tx.storyPage.update({
          where: { id: target.id },
          data: { illustrationAssetId: assetId },
        }),
      );
      break;
  }

  return [assetId];
}

/**
 * Prisma raises `P2025` from the `update`, which would otherwise reach the error
 * handler as an unrecognised client error. The request is well formed; what is
 * wrong is a state an admin can fix by regenerating.
 */
async function attachOrConflict<T>(
  target: AttachTarget,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw ApiError.conflict(
        "The row this clip was generated for no longer exists, so there is nothing to attach it to",
        { code: "ATTACH_TARGET_MISSING", table: target.table, id: target.id },
      );
    }
    throw error;
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

export async function countAwaitingReview(): Promise<AiJobCount> {
  return {
    awaitingReview: await prisma.aIGenerationJob.count({
      where: { status: "awaiting_review" },
    }),
  };
}
