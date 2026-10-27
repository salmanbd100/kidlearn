import type {
  AIJobStatus,
  AIJobType,
  ContentStatus,
  GradeLevel,
  Prisma,
} from "@kidlearn/db";
import type { McpDraftStatus } from "@kidlearn/types";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import { buildLessonContext } from "../admin/ai/generators/quiz.js";
import { linkedEntitiesByJob } from "../admin/ai/review/job.js";

/**
 * Every read the MCP tools make. Curriculum, worlds, characters and the caller's own jobs only: nothing here
 * reaches a parent, a child or their progress (file 41, Req. 9).
 */

export interface CurriculumListing {
  subjects: Array<{
    id: string;
    name: string;
    status: ContentStatus;
    gradeLevels: GradeLevel[];
    topics: Array<{
      id: string;
      name: string;
      status: ContentStatus;
      gradeLevels: GradeLevel[];
      lessonCount: number;
    }>;
  }>;
  worlds: Array<{
    id: string;
    slug: string;
    name: string;
    status: ContentStatus;
  }>;
}

export async function listCurriculum(
  subjectId?: string,
): Promise<CurriculumListing> {
  const [subjects, worlds] = await Promise.all([
    prisma.subject.findMany({
      where: subjectId === undefined ? {} : { id: subjectId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        gradeLevels: true,
        topics: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            status: true,
            gradeLevels: true,
            _count: { select: { lessons: true } },
          },
        },
      },
    }),
    prisma.world.findMany({
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, status: true },
    }),
  ]);

  return {
    subjects: subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      status: subject.status,
      gradeLevels: subject.gradeLevels,
      topics: subject.topics.map(({ _count, ...topic }) => ({
        ...topic,
        lessonCount: _count.lessons,
      })),
    })),
    worlds,
  };
}

export interface LessonForAuthoring {
  id: string;
  internalTitle: string;
  status: ContentStatus;
  gradeLevels: GradeLevel[];
  topic: { id: string; name: string };
  translations: Array<{ language: string; title: string; introScript: string }>;
  whatItTaught: string;
  quiz: {
    id: string;
    status: ContentStatus;
    questions: Array<{
      id: string;
      format: string;
      prompt: Record<string, string> | null;
    }>;
  } | null;
}

export async function readLessonForAuthoring(
  lessonId: string,
): Promise<LessonForAuthoring> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      status: true,
      gradeLevels: true,
      aiJobId: true,
      topic: { select: { id: true, name: true } },
      translations: {
        select: { language: true, title: true, introScript: true },
      },
      quiz: {
        select: {
          id: true,
          status: true,
          questions: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, format: true, definition: true },
          },
        },
      },
    },
  });
  if (!lesson) throw ApiError.notFound("No such lesson");

  return {
    id: lesson.id,
    internalTitle: lesson.title,
    status: lesson.status,
    gradeLevels: lesson.gradeLevels,
    topic: lesson.topic,
    translations: lesson.translations,
    whatItTaught: await buildLessonContext(lesson),
    quiz:
      lesson.quiz === null
        ? null
        : {
            id: lesson.quiz.id,
            status: lesson.quiz.status,
            questions: lesson.quiz.questions.map((question) => ({
              id: question.id,
              format: question.format,
              prompt: readPrompt(question.definition),
            })),
          },
  };
}

export interface CharacterSheetListing {
  id: string;
  slug: string;
  name: string;
  worldId: string | null;
  description: string;
}

export async function listCharacterSheets(
  worldId?: string,
): Promise<CharacterSheetListing[]> {
  return prisma.characterSheet.findMany({
    where: worldId === undefined ? {} : { worldId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      worldId: true,
      description: true,
    },
  });
}

/** The subject a topic sits in, or `""` for an unknown topic — `prepareLesson` then raises its own 404. */
export async function topicSubjectId(topicId: string): Promise<string> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { subjectId: true },
  });
  return topic?.subjectId ?? "";
}

const DRAFT_SELECT = {
  id: true,
  type: true,
  status: true,
  reviewNote: true,
  createdAt: true,
  reviewedAt: true,
} satisfies Prisma.AIGenerationJobSelect;

type DraftRow = Prisma.AIGenerationJobGetPayload<{
  select: typeof DRAFT_SELECT;
}>;

function ownDraft(
  adminId: string,
  where: Prisma.AIGenerationJobWhereInput,
): Prisma.AIGenerationJobWhereInput {
  return { ...where, source: "mcp", requestedById: adminId };
}

// Another admin's job is "no such draft": its id is not something to confirm.
const noSuchDraft = (): ApiError => ApiError.notFound("No such draft");

export async function readOwnDraft(
  adminId: string,
  jobId: string,
): Promise<McpDraftStatus> {
  const job = await prisma.aIGenerationJob.findFirst({
    where: ownDraft(adminId, { id: jobId }),
    select: DRAFT_SELECT,
  });
  if (!job) throw noSuchDraft();

  const entities = await linkedEntitiesByJob([job.id], prisma);
  return toDraftStatus(job, entities);
}

export async function listOwnDrafts(
  adminId: string,
  options: { status?: AIJobStatus; limit: number },
): Promise<McpDraftStatus[]> {
  const jobs = await prisma.aIGenerationJob.findMany({
    where: ownDraft(
      adminId,
      options.status === undefined ? {} : { status: options.status },
    ),
    orderBy: { createdAt: "desc" },
    take: options.limit,
    select: DRAFT_SELECT,
  });

  const entities = await linkedEntitiesByJob(
    jobs.map((job) => job.id),
    prisma,
  );
  return jobs.map((job) => toDraftStatus(job, entities));
}

function toDraftStatus(
  job: DraftRow,
  entities: Map<string, McpDraftStatus["entities"]>,
): McpDraftStatus {
  return {
    jobId: job.id,
    type: job.type,
    status: job.status,
    rejectionReason: job.status === "rejected" ? job.reviewNote : null,
    entities: entities.get(job.id) ?? [],
    createdAt: job.createdAt.toISOString(),
    reviewedAt: job.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * What `persist*` recorded for one of the caller's own drafts — the rows narration can be recorded for. Only while the
 * draft awaits review: a rejected draft's rows are refused content, and an approved one's are live, so neither may
 * spend the shared audio budget from a draft-only token (the I5 rule for illustrations, applied to narration).
 */
export async function readOwnDraftOutput(
  adminId: string,
  jobId: string,
): Promise<{ type: AIJobType; rawOutput: Prisma.JsonValue | null }> {
  const job = await prisma.aIGenerationJob.findFirst({
    where: ownDraft(adminId, { id: jobId }),
    select: { type: true, status: true, rawOutput: true },
  });
  if (!job) throw noSuchDraft();
  if (job.status !== "awaiting_review") {
    throw ApiError.conflict(
      `That draft is ${job.status.replaceAll("_", " ")}, so its narration is changed in the CMS, not from an assistant.`,
    );
  }
  return { type: job.type, rawOutput: job.rawOutput };
}

/**
 * Illustrations are drawn only for a story one of the caller's own MCP drafts created. A token may not spend the
 * shared image budget on, or queue pictures against, a story someone else wrote or one that is already live.
 */
export async function assertOwnStoryDraft(
  adminId: string,
  storyId: string,
): Promise<void> {
  const job = await prisma.aIGenerationJob.findFirst({
    where: ownDraft(adminId, {
      type: "story",
      rawOutput: { path: ["entities", "storyId"], equals: storyId },
    }),
    select: { id: true },
  });
  if (!job) throw ApiError.notFound("No such story among your drafts");

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { status: true },
  });
  if (!story) throw ApiError.notFound("No such story among your drafts");
  if (story.status === "published") {
    throw ApiError.conflict(
      "That story is already published; its pictures are changed in the CMS, not from an assistant.",
    );
  }
}

/** Kept here, not exported from the payload package: only a summary needs it, and a malformed row still lists. */
function readPrompt(definition: unknown): Record<string, string> | null {
  if (typeof definition !== "object" || definition === null) return null;
  // JSONB boundary: narrowed to "an object", whose `prompt` is still checked below.
  const prompt = (definition as { prompt?: unknown }).prompt;
  if (typeof prompt !== "object" || prompt === null) return null;
  const entries = Object.entries(prompt).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return Object.fromEntries(entries);
}
