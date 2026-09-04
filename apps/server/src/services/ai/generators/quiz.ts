import type { Prisma } from "@kidlearn/db";
import { type Locale, safeParseQuizQuestion } from "@kidlearn/types";
import { ApiError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { generateStructured } from "../gemini-text.js";
import { withPlaceholderAssets } from "../placeholder-assets.js";
import { KIDLEARN_SYSTEM_PROMPT } from "../prompts/lesson.js";
import { buildQuizUserPrompt } from "../prompts/quiz.js";
import { runGenerationJob } from "../run-generation-job.js";
import {
  buildQuizGenerationOutputSchema,
  type QuizGenerationOutput,
} from "../schemas/quiz.js";

// The AI Quiz Generator (FR-AI-03).

/** The spec's default: four questions, the middle of the 3–5 range. */
export const DEFAULT_QUESTION_COUNT = 4;

const PUBLISHED_QUIZ_MESSAGE =
  "Unpublish the lesson's quiz before generating questions — a quiz question has no status of its own, so a new one would be live immediately";

export interface GenerateQuizInput {
  lessonId: string;
  count?: number;
  languages: Locale[];
}

export interface GenerateQuizResult {
  jobId: string;
  status: "awaiting_review" | "failed";
}

export async function generateQuiz(
  input: GenerateQuizInput,
): Promise<GenerateQuizResult> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: input.lessonId },
    select: {
      id: true,
      title: true,
      gradeLevels: true,
      aiJobId: true,
      quiz: { select: { id: true, status: true } },
      translations: {
        select: { language: true, title: true, introScript: true },
      },
    },
  });
  if (!lesson) throw ApiError.notFound("No such lesson");

  if (lesson.quiz?.status === "published") {
    throw ApiError.conflict(PUBLISHED_QUIZ_MESSAGE, { code: "QUIZ_PUBLISHED" });
  }

  const count = input.count ?? DEFAULT_QUESTION_COUNT;
  const lessonContext = await buildLessonContext(lesson);

  const schema = buildQuizGenerationOutputSchema(count);
  const userPrompt = buildQuizUserPrompt({
    lessonTitle: lesson.title,
    gradeLevels: lesson.gradeLevels,
    lessonContext,
    languages: input.languages,
    count,
  });

  // Set by `persist` when the re-read below finds the quiz published, and read
  // after the job has landed. A flag rather than a thrown `ApiError`, because
  // `runGenerationJob` turns any `persist` failure into a failed job by design —
  // the audit record is the point — so the reason has to be carried out of the
  // closure rather than through it.
  let publishedMidGeneration = false;

  const result = await runGenerationJob<QuizGenerationOutput>({
    type: "quiz",
    input: {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      quizId: lesson.quiz?.id ?? null,
      count,
      languages: input.languages,
      lessonContext,
      systemPrompt: KIDLEARN_SYSTEM_PROMPT,
      userPrompt,
    },
    schema,
    generate: (retryFeedback) =>
      generateStructured({
        system: KIDLEARN_SYSTEM_PROMPT,
        // A second *user* turn rather than replaying the rejected attempt as an
        // assistant turn — see `generators/lesson.ts` for why.
        messages:
          retryFeedback === undefined
            ? [{ role: "user", content: userPrompt }]
            : [
                { role: "user", content: userPrompt },
                { role: "user", content: retryFeedback },
              ],
        outputSchema: schema,
      }),
    persist: async (parsed, jobId, tx) => {
      if (await isPublished(tx, lesson.quiz?.id)) {
        publishedMidGeneration = true;
        throw new Error(
          "The lesson's quiz was published while the questions were being written, so nothing was added.",
        );
      }

      return persistQuestions({
        parsed,
        jobId,
        tx,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        existingQuizId: lesson.quiz?.id,
      });
    },
  });

  if (publishedMidGeneration) {
    throw ApiError.conflict(PUBLISHED_QUIZ_MESSAGE, {
      code: "QUIZ_PUBLISHED",
      jobId: result.jobId,
    });
  }

  return result;
}

/**
 * The quiz's status as of *this transaction*, not as of the pre-flight check.
 */
async function isPublished(
  tx: Prisma.TransactionClient,
  quizId: string | undefined,
): Promise<boolean> {
  if (quizId === undefined) return false;

  const quiz = await tx.quiz.findUnique({
    where: { id: quizId },
    select: { status: true },
  });
  return quiz?.status === "published";
}

/** What the lesson taught, in the model's own words where they exist. */
async function buildLessonContext(lesson: {
  aiJobId: string | null;
  title: string;
  translations: Array<{ language: string; title: string; introScript: string }>;
}): Promise<string> {
  const generated =
    lesson.aiJobId === null
      ? undefined
      : await readGeneratedContext(lesson.aiJobId);
  if (generated !== undefined) return generated;

  const intros = lesson.translations
    .map((one) => `- (${one.language}) ${one.title}: ${one.introScript}`)
    .join("\n");

  return [
    "Only the lesson's introduction is recorded, not its full teaching script, so keep the questions",
    "to what the title and this introduction plainly cover — do not invent material.",
    intros === "" ? `- ${lesson.title}` : intros,
  ].join("\n");
}

async function readGeneratedContext(
  aiJobId: string,
): Promise<string | undefined> {
  const job = await prisma.aIGenerationJob.findUnique({
    where: { id: aiJobId },
    select: { rawOutput: true },
  });
  const parsed = readParsedLesson(job?.rawOutput);
  if (parsed === undefined) return undefined;

  const objectives = parsed.learningObjectives
    .map((one) => `- ${one}`)
    .join("\n");
  const narration = Object.entries(parsed.narrationScript)
    .map(([language, text]) => `(${language}) ${text}`)
    .join("\n\n");

  const sections = [
    objectives === "" ? undefined : `Learning objectives:\n${objectives}`,
    narration === "" ? undefined : `Narration script:\n${narration}`,
  ].filter((one): one is string => one !== undefined);

  return sections.length === 0 ? undefined : sections.join("\n\n");
}

/** The two fields this generator reads out of a lesson job's audit record. */
function readParsedLesson(rawOutput: unknown):
  | {
      learningObjectives: string[];
      narrationScript: Record<string, string>;
    }
  | undefined {
  if (!isRecord(rawOutput)) return undefined;
  const parsed = rawOutput.parsed;
  if (!isRecord(parsed)) return undefined;

  const objectives = Array.isArray(parsed.learningObjectives)
    ? parsed.learningObjectives.filter(
        (one): one is string => typeof one === "string",
      )
    : [];

  const narration: Record<string, string> = {};
  if (isRecord(parsed.narrationScript)) {
    for (const [language, text] of Object.entries(parsed.narrationScript)) {
      if (typeof text === "string") narration[language] = text;
    }
  }

  if (objectives.length === 0 && Object.keys(narration).length === 0) {
    return undefined;
  }
  return { learningObjectives: objectives, narrationScript: narration };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function persistQuestions({
  parsed,
  jobId,
  tx,
  lessonId,
  lessonTitle,
  existingQuizId,
}: {
  parsed: QuizGenerationOutput;
  jobId: string;
  tx: Prisma.TransactionClient;
  lessonId: string;
  lessonTitle: string;
  existingQuizId?: string;
}): Promise<Prisma.JsonObject> {
  // A lesson without a quiz gets one, wired to it in the same transaction. The
  // alternative — refusing until an admin creates an empty quiz by hand — is a
  // scavenger hunt, and the new quiz is a draft like everything else here.
  const quizId =
    existingQuizId ??
    (
      await tx.quiz.create({
        data: {
          title: lessonTitle,
          aiJobId: jobId,
          lessons: { connect: { id: lessonId } },
        },
        select: { id: true },
      })
    ).id;

  // Appended after whatever is already there rather than numbered from one:
  // `@@unique([quizId, sortOrder])` would refuse a collision, and an admin who
  // wrote two questions by hand keeps them in front of the generated ones.
  const last = await tx.quizQuestion.findFirst({
    where: { quizId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let sortOrder = last?.sortOrder ?? 0;

  const questionIds: string[] = [];
  for (const [index, question] of parsed.questions.entries()) {
    const definition = withPlaceholderAssets(question);

    const checked = safeParseQuizQuestion(definition);
    if (!checked.success) {
      throw new Error(
        `Quiz question ${index + 1} did not survive placeholder rewriting: ${checked.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }

    sortOrder += 1;
    const row = await tx.quizQuestion.create({
      data: {
        quizId,
        format: checked.data.type,
        definition: checked.data,
        schemaVersion: checked.data.schemaVersion,
        sortOrder,
        aiJobId: jobId,
      },
      select: { id: true },
    });
    questionIds.push(row.id);
  }

  return { quizId, questionIds, lessonId };
}
