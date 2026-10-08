import type { GradeLevel, Prisma } from "@kidlearn/db";
import { type Locale, safeParseQuizQuestion } from "@kidlearn/types";
import { prisma } from "../../../../config/prisma.js";
import { ApiError } from "../../../../shared/errors/errors.js";
import { slugify } from "../../../../shared/utils/slug.js";
import { generateStructured } from "../gemini-text.js";
import {
  generateQuestions,
  planQuestionFormats,
} from "../generate-questions.js";
import { withPlaceholderAssets } from "../placeholder-assets.js";
import {
  buildLessonQuestionUserPrompt,
  buildLessonUserPrompt,
  KIDLEARN_SYSTEM_PROMPT,
} from "../prompts/lesson.js";
import { runGenerationJob } from "../run-generation-job.js";
import {
  buildLessonBodyOutputSchema,
  buildLessonGenerationOutputSchema,
  LESSON_QUESTION_COUNT,
  type LessonGenerationOutput,
} from "../schemas/lesson.js";

export interface GenerateLessonInput {
  gradeLevel: GradeLevel;
  subjectId: string;
  topicId: string;
  lessonFocus: string;
  languages: Locale[];
  worldId?: string;
}

export interface GenerateLessonResult {
  jobId: string;
  status: "awaiting_review" | "failed";
}

export async function generateLesson(
  input: GenerateLessonInput,
): Promise<GenerateLessonResult> {
  const topic = await prisma.topic.findUnique({
    where: { id: input.topicId },
    select: {
      id: true,
      name: true,
      subjectId: true,
      subject: { select: { name: true } },
    },
  });
  if (!topic) throw ApiError.notFound("No such topic");
  if (topic.subjectId !== input.subjectId) {
    throw ApiError.conflict("That topic does not belong to that subject");
  }

  const worldId = await resolveWorldId(input);

  const schema = buildLessonGenerationOutputSchema(input.languages);
  const bodySchema = buildLessonBodyOutputSchema(input.languages);
  const promptInput = {
    gradeLevel: input.gradeLevel,
    subjectName: topic.subject.name,
    topicName: topic.name,
    lessonFocus: input.lessonFocus,
    languages: input.languages,
  };
  const userPrompt = buildLessonUserPrompt(promptInput);
  const formats = planQuestionFormats(LESSON_QUESTION_COUNT);

  return runGenerationJob<LessonGenerationOutput>({
    type: "lesson",
    // Params and resolved prompt: the prompt builder will have changed by the time a reviewer reads this.
    input: {
      gradeLevel: input.gradeLevel,
      subjectId: input.subjectId,
      subjectName: topic.subject.name,
      topicId: input.topicId,
      topicName: topic.name,
      worldId,
      lessonFocus: input.lessonFocus,
      languages: input.languages,
      systemPrompt: KIDLEARN_SYSTEM_PROMPT,
      userPrompt,
      questionPrompts: formats.map((format, index) =>
        buildLessonQuestionUserPrompt({
          ...promptInput,
          format,
          position: index + 1,
          total: formats.length,
        }),
      ),
    },
    schema,
    generate: async (retryFeedback) => {
      const body = await generateStructured({
        system: KIDLEARN_SYSTEM_PROMPT,
        // Retry feedback is a second user message, not a replayed model turn: replaying the rejected answer doubles the retry's tokens.
        messages:
          retryFeedback === undefined
            ? [{ role: "user", content: userPrompt }]
            : [
                { role: "user", content: userPrompt },
                { role: "user", content: retryFeedback },
              ],
        outputSchema: bodySchema,
      });

      // A short body means the questions would be written for narration that does not exist.
      if (body.stopReason === "refusal" || body.stopReason === "max_tokens") {
        return body;
      }

      const quiz = await generateQuestions({
        system: KIDLEARN_SYSTEM_PROMPT,
        formats,
        buildPrompt: (format, position) =>
          buildLessonQuestionUserPrompt({
            ...promptInput,
            format,
            position,
            total: formats.length,
          }),
        ...(retryFeedback === undefined ? {} : { retryFeedback }),
      });

      return {
        raw: assemble(body.raw, quiz.questions),
        usage: {
          inputTokens: body.usage.inputTokens + quiz.usage.inputTokens,
          outputTokens: body.usage.outputTokens + quiz.usage.outputTokens,
        },
        stopReason: quiz.stopReason,
        ...(quiz.refusal === undefined ? {} : { refusal: quiz.refusal }),
      };
    },
    persist: (parsed, jobId, tx) =>
      persistLesson({ input, parsed, jobId, tx, topicId: topic.id, worldId }),
  });
}

// A non-object body is left unwrapped so the reviewer sees what the model actually answered.
function assemble(body: unknown, quizQuestions: unknown[]): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return body;
  }
  return { ...body, quizQuestions };
}

async function resolveWorldId(input: GenerateLessonInput): Promise<string> {
  if (input.worldId !== undefined) {
    const world = await prisma.world.findUnique({
      where: { id: input.worldId },
      select: { id: true },
    });
    if (!world) throw ApiError.notFound("No such world");
    return world.id;
  }

  const sibling = await prisma.lesson.findFirst({
    where: { topicId: input.topicId },
    orderBy: { sortOrder: "asc" },
    select: { worldId: true },
  });
  if (!sibling) {
    throw ApiError.conflict(
      "This topic has no lessons yet, so there is no world to inherit. Choose one.",
    );
  }
  return sibling.worldId;
}

async function persistLesson({
  input,
  parsed,
  jobId,
  tx,
  topicId,
  worldId,
}: {
  input: GenerateLessonInput;
  parsed: LessonGenerationOutput;
  jobId: string;
  tx: Prisma.TransactionClient;
  topicId: string;
  worldId: string;
}): Promise<Prisma.JsonObject> {
  // The focus line names the row and supplies the slug; the child reads parsed.title, per locale.
  const internalTitle = input.lessonFocus.trim();
  const slug = await uniqueSlug(tx, topicId, internalTitle);
  const sortOrder = await nextLessonSortOrder(tx, topicId);

  const quiz = await tx.quiz.create({
    data: { title: internalTitle, aiJobId: jobId },
    select: { id: true },
  });

  const questionIds: string[] = [];
  for (const [index, question] of parsed.quizQuestions.entries()) {
    const definition = withPlaceholderAssets(question);

    // Defence in depth: re-parsed against the shared union just before it becomes a JSONB row.
    const checked = safeParseQuizQuestion(definition);
    if (!checked.success) {
      throw new Error(
        `Quiz question ${index + 1} did not survive placeholder rewriting: ${checked.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }

    const row = await tx.quizQuestion.create({
      data: {
        quizId: quiz.id,
        format: checked.data.type,
        definition: checked.data,
        schemaVersion: checked.data.schemaVersion,
        sortOrder: index + 1,
        aiJobId: jobId,
      },
      select: { id: true },
    });
    questionIds.push(row.id);
  }

  const lesson = await tx.lesson.create({
    data: {
      topicId,
      worldId,
      slug,
      title: internalTitle,
      sortOrder,
      gradeLevels: [input.gradeLevel],
      quizId: quiz.id,
      aiJobId: jobId,
      translations: {
        create: input.languages.map((language) => ({
          language,
          // The schema requires both keys per locale; these fall back only if that is loosened.
          title: parsed.title[language] ?? internalTitle,
          introScript: parsed.introScript[language] ?? "",
        })),
      },
    },
    select: { id: true },
  });

  return { lessonId: lesson.id, quizId: quiz.id, questionIds };
}

async function uniqueSlug(
  tx: Prisma.TransactionClient,
  topicId: string,
  title: string,
): Promise<string> {
  const base = slugify(title) || "lesson";

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const taken = await tx.lesson.findUnique({
      where: { topicId_slug: { topicId, slug: candidate } },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error(`Could not find a free slug for "${title}" in this topic`);
}

async function nextLessonSortOrder(
  tx: Prisma.TransactionClient,
  topicId: string,
): Promise<number> {
  const last = await tx.lesson.findFirst({
    where: { topicId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1;
}
