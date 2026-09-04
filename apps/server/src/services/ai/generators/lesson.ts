import type { GradeLevel, Prisma } from "@kidlearn/db";
import { type Locale, safeParseQuizQuestion } from "@kidlearn/types";
import { ApiError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { slugify } from "../../../lib/slug.js";
import { generateStructured } from "../gemini-text.js";
import { withPlaceholderAssets } from "../placeholder-assets.js";
import {
  buildLessonUserPrompt,
  KIDLEARN_SYSTEM_PROMPT,
} from "../prompts/lesson.js";
import { runGenerationJob } from "../run-generation-job.js";
import {
  buildLessonGenerationOutputSchema,
  type LessonGenerationOutput,
} from "../schemas/lesson.js";

// The AI Lesson Generator (FR-AI-01).

export interface GenerateLessonInput {
  gradeLevel: GradeLevel;
  subjectId: string;
  topicId: string;
  lessonFocus: string;
  languages: Locale[];
  /** Optional — otherwise inherited from the topic's existing lessons. */
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
  const userPrompt = buildLessonUserPrompt({
    gradeLevel: input.gradeLevel,
    subjectName: topic.subject.name,
    topicName: topic.name,
    lessonFocus: input.lessonFocus,
    languages: input.languages,
  });

  return runGenerationJob<LessonGenerationOutput>({
    type: "lesson",
    // The admin's parameters *and* the resolved prompt. A reviewer reading a
    // generation months later needs the words the model actually saw, and the
    // prompt builder will have changed by then (FR-AI-08).
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
    },
    schema,
    generate: (retryFeedback) =>
      generateStructured({
        system: KIDLEARN_SYSTEM_PROMPT,
        // The retry is a second *user* message rather than a model turn carrying
        // the rejected answer, because that answer is not something to echo back:
        // the model produced it, it is quoted in the feedback by way of its
        // validation errors, and replaying it would double the tokens the second
        // call costs to tell the model what it already said. `gemini-text.ts`
        // sends both messages as parts of one user turn.
        messages:
          retryFeedback === undefined
            ? [{ role: "user", content: userPrompt }]
            : [
                { role: "user", content: userPrompt },
                { role: "user", content: retryFeedback },
              ],
        outputSchema: schema,
      }),
    persist: (parsed, jobId, tx) =>
      persistLesson({ input, parsed, jobId, tx, topicId: topic.id, worldId }),
  });
}

/** Which world the lesson is themed from. */
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
  // The focus line names the row for the CMS and supplies the slug; what a child
  // reads is `parsed.title`, written per locale. See `schemas/lesson.ts`.
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

    // Defence in depth: the payload already parsed as part of the generation
    // output, and it is parsed again against the shared union immediately before
    // it becomes a JSONB row. The two checks are cheap and the failure they guard
    // is a question a child cannot answer.
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
          // The schema requires both keys for every requested locale, so these
          // fall back only if that contract is ever loosened.
          title: parsed.title[language] ?? internalTitle,
          introScript: parsed.introScript[language] ?? "",
        })),
      },
    },
    select: { id: true },
  });

  return { lessonId: lesson.id, quizId: quiz.id, questionIds };
}

/** Slugified focus, suffixed until it is free within the topic. */
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
