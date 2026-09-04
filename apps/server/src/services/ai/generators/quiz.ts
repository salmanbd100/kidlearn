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

/**
 * The AI Quiz Generator (FR-AI-03).
 *
 * An admin picks a lesson and a question count; this grounds the prompt in what
 * that lesson actually taught, runs it through `runGenerationJob`, and appends the
 * questions to the lesson's quiz as drafts.
 *
 * **The published-quiz refusal is the structural half of FR-AI-07 here.** A
 * `QuizQuestion` has no `status` of its own — its visibility is entirely its parent
 * `Quiz`'s — so appending generated questions to a *published* quiz would put
 * unreviewed content in front of a child the moment the row landed, with no draft
 * state to hold it back and no transition for a reviewer to refuse. There is no
 * way to make that safe at the row level, so the endpoint refuses: `409` with
 * `details.code = "QUIZ_PUBLISHED"`, and the admin withdraws the quiz to draft
 * first (file 32's transitions). The check runs **before** `runGenerationJob`, so a
 * refused request creates no job row and bills nothing.
 *
 * **And it runs again inside the write transaction, because the first check is a
 * snapshot tens of seconds old.** Generation is awaited inline; an administrator
 * who publishes the quiz while the model is writing would otherwise have the
 * questions appended to a live quiz and served to a child the moment the insert
 * committed — `contentService` serves every question of a visible quiz, there
 * being no per-question status to filter on. The second read is under the same
 * transaction as the inserts, so nothing lands: the job is failed with the reason
 * in its audit record, and the admin still gets the `409` that tells them what to
 * do about it (`details.jobId` names the job, which unlike the pre-flight refusal
 * does exist).
 *
 * **The prompt is grounded in the lesson, not in its title.** A quiz asking about
 * things the lesson never taught is worse than no quiz: the child fails a question
 * about material they were never shown. Where the lesson itself came from a file-34
 * generation, its objectives and narration script are read back out of that job's
 * `rawOutput` — the actual teaching text. Otherwise the lesson's intro scripts are
 * the only record of its content this schema holds, so those are used and the
 * prompt says which it got.
 *
 * **Every question is parsed twice.** Once as part of the generation output, and
 * again against the shared union immediately before insert, after the asset URLs
 * have been rewritten onto the placeholder host. The two checks are cheap and the
 * failure they guard is a question a child cannot answer.
 */

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
 *
 * Only asked of a quiz that already existed: one this generation creates is a
 * draft by construction, and there is no id to read before `persistQuestions`
 * makes it. A missing row is not published — it was deleted mid-generation, and
 * the insert that follows fails on the foreign key, which is the right outcome
 * for a different reason.
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

/**
 * What the lesson taught, in the model's own words where they exist.
 *
 * The file-34 job's `rawOutput.parsed` holds the objectives and the narration
 * script — the teaching text itself, which is never a column: file 34 left it in
 * the job deliberately, because the column it eventually needs is an audio asset
 * reference. Reading it back here is the whole reason a generated lesson produces a
 * better quiz than a hand-authored one.
 *
 * The fallback is the intro scripts, and it says so in the text. An intro is a
 * greeting rather than a lesson, so a quiz grounded only in one is thinner — naming
 * that in the prompt is what stops the model inventing content to fill the gap, and
 * it is visible to whoever later reads the job's `input` and wonders why.
 */
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

/**
 * The two fields this generator reads out of a lesson job's audit record.
 *
 * Narrowed by hand rather than by importing the lesson generator's schema: what is
 * being read is a JSONB column written by a *previous* version of this codebase, so
 * the honest contract is "these keys, if they are there and are the right shape",
 * not the current schema's whole object. A job written before a prompt change must
 * not make a quiz generation fail.
 */
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
