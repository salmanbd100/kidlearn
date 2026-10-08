import type { ContentStatus, Prisma } from "@kidlearn/db";
import type {
  AiEntityResource,
  AiJobDetail,
  AiJobEntity,
  AiJobList,
  AiJobSummary,
  AiReviewResult,
  GradeLevelValue,
  Locale,
} from "@kidlearn/types";
import { GRADE_LEVELS, LOCALES } from "@kidlearn/types";
import type { prisma } from "../../../../config/prisma.js";
import {
  type ContentsGuard,
  readActivityGuard,
  readQuizGuard,
} from "../../../content/content-status.service.js";

type EntityResource = AiEntityResource;

export const UNTITLED_QUIZ = "Untitled quiz";

export type LinkedRow = {
  resource: EntityResource;
  id: string;
  label: string;
  status: ContentStatus;
  aiJobIds: string[];
  unregisteredUrls: string[];
};

export type ReviewWriter = Pick<
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

// A quiz job on a lesson that already had a quiz stamps `aiJobId` on the questions only; they have no
// status, so approving them means publishing their quiz.
export async function linkedContentRows(
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
      unregisteredUrls: [],
    })),
    ...quizzes.map((row) => ({
      resource: "quizzes" as const,
      id: row.id,
      label: row.title ?? UNTITLED_QUIZ,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
      unregisteredUrls: [],
    })),
    ...activities.map((row) => ({
      resource: "activities" as const,
      id: row.id,
      label: row.type,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
      unregisteredUrls: [],
    })),
    ...stories.map((row) => ({
      resource: "stories" as const,
      id: row.id,
      label: row.title,
      status: row.status,
      aiJobIds: idList(row.aiJobId),
      unregisteredUrls: [],
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
      unregisteredUrls: [],
    });
  }

  // A quiz publishes its questions, so the publish guard must see their jobs, including those of a
  // different job than the one reviewed (FR-AI-07).
  for (const row of rows) {
    const contents: ContentsGuard =
      row.resource === "quizzes"
        ? await readQuizGuard(row.id, tx)
        : row.resource === "activities"
          ? await readActivityGuard(row.id, tx)
          : { aiJobIds: [], unregisteredUrls: [] };
    row.aiJobIds = [...new Set([...row.aiJobIds, ...contents.aiJobIds])];
    row.unregisteredUrls = contents.unregisteredUrls;
  }

  return rows;
}

function idList(id: string | null): string[] {
  return id === null ? [] : [id];
}

export function toEntity(row: LinkedRow): AiJobEntity {
  return {
    resource: row.resource,
    id: row.id,
    label: row.label,
    status: row.status,
  };
}

// Both columns are JSONB (`JsonValue`); every field is re-checked so a job from before a prompt change still renders.
export function asRecord(
  value: Prisma.JsonValue | null,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  // JSONB boundary: the guards above verify "an object with unknown values".
  return value as Record<string, unknown>;
}

// The lesson generator records `gradeLevel`, the story generator `gradeLevels`; folded into one array.
export function readGradeLevels(
  input: Record<string, unknown>,
): GradeLevelValue[] {
  const values = Array.isArray(input.gradeLevels)
    ? input.gradeLevels
    : [input.gradeLevel];

  return GRADE_LEVELS.filter((grade) => values.includes(grade));
}

// `languages` for text generators, `locale` for narration; an illustration has neither.
export function readLanguages(input: Record<string, unknown>): Locale[] {
  const values = Array.isArray(input.languages)
    ? input.languages
    : [input.locale];

  return LOCALES.filter((locale) => values.includes(locale));
}

export function readString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export const JOB_SELECT = {
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

export type JobRow = Prisma.AIGenerationJobGetPayload<{
  select: typeof JOB_SELECT;
}>;

// The DTOs declare `Date` where the summary/detail types say ISO string; `res.json()` does the conversion.
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
