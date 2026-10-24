import type { ContentStatus, Prisma } from "@kidlearn/db";
import type {
  AiEntityResource,
  AiJobClient,
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
import { asRecord, readString } from "../../../../shared/utils/json-record.js";
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

/**
 * The entities `linkedContentRows` would list for each job, for a page of jobs in five reads rather than five per
 * job. Labels and statuses only: no publish guard, so it serves a listing, never a decision.
 */
export async function linkedEntitiesByJob(
  jobIds: string[],
  client: Pick<
    ReviewWriter,
    "lesson" | "quiz" | "activity" | "story" | "quizQuestion"
  >,
): Promise<Map<string, AiJobEntity[]>> {
  const byJob = new Map<string, AiJobEntity[]>(jobIds.map((id) => [id, []]));
  if (jobIds.length === 0) return byJob;

  const where = { aiJobId: { in: jobIds } };
  const order = { createdAt: "asc" } as const;
  const [lessons, quizzes, activities, stories, questions] = await Promise.all([
    client.lesson.findMany({
      where,
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: order,
    }),
    client.quiz.findMany({
      where,
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: order,
    }),
    client.activity.findMany({
      where,
      select: { id: true, type: true, status: true, aiJobId: true },
      orderBy: order,
    }),
    client.story.findMany({
      where,
      select: { id: true, title: true, status: true, aiJobId: true },
      orderBy: order,
    }),
    client.quizQuestion.findMany({
      where,
      select: {
        aiJobId: true,
        quiz: { select: { id: true, title: true, status: true } },
      },
    }),
  ]);

  const add = (jobId: string | null, entity: AiJobEntity): void => {
    if (jobId === null) return;
    const list = byJob.get(jobId);
    if (list === undefined) return;
    if (
      list.some(
        (one) => one.resource === entity.resource && one.id === entity.id,
      )
    ) {
      return;
    }
    list.push(entity);
  };

  for (const row of lessons) {
    add(row.aiJobId, {
      resource: "lessons",
      id: row.id,
      label: row.title,
      status: row.status,
    });
  }
  for (const row of quizzes) {
    add(row.aiJobId, {
      resource: "quizzes",
      id: row.id,
      label: row.title ?? UNTITLED_QUIZ,
      status: row.status,
    });
  }
  for (const row of activities) {
    add(row.aiJobId, {
      resource: "activities",
      id: row.id,
      label: row.type,
      status: row.status,
    });
  }
  for (const row of stories) {
    add(row.aiJobId, {
      resource: "stories",
      id: row.id,
      label: row.title,
      status: row.status,
    });
  }
  for (const row of questions) {
    add(row.aiJobId, {
      resource: "quizzes",
      id: row.quiz.id,
      label: row.quiz.title ?? UNTITLED_QUIZ,
      status: row.quiz.status,
    });
  }

  return byJob;
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

/** `client` is whatever the MCP client said about itself; only a string name survives into the label. */
export function readClient(value: Prisma.JsonValue | null): AiJobClient | null {
  const record = asRecord(value);
  const name = readString(record, "name");
  if (name === undefined) return null;
  return { name, version: readString(record, "version") ?? null };
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
  source: true,
  client: true,
  requestedBy: { select: { name: true } },
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
