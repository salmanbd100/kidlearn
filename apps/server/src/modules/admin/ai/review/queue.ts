import type { Prisma } from "@kidlearn/db";
import type { AiJobCount } from "@kidlearn/types";
import { prisma } from "../../../../config/prisma.js";
import { ApiError } from "../../../../shared/errors/errors.js";
import type { AiJobListQuery } from "../../admin-ai.schema.js";
import { readJobAssets } from "./attach.js";
import { readBlockers } from "./blockers.js";
import {
  type AiJobDetailDto,
  type AiJobListDto,
  type AiJobSummaryDto,
  asRecord,
  JOB_SELECT,
  type JobRow,
  type LinkedRow,
  linkedContentRows,
  type ReviewWriter,
  readGradeLevels,
  readLanguages,
  readString,
  toEntity,
  UNTITLED_QUIZ,
} from "./job.js";

// The human gate FR-AI-07 makes a hard requirement (FR-CMS-05..06).

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

export async function buildDetail(
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

export async function countAwaitingReview(): Promise<AiJobCount> {
  return {
    awaitingReview: await prisma.aIGenerationJob.count({
      where: { status: "awaiting_review" },
    }),
  };
}
