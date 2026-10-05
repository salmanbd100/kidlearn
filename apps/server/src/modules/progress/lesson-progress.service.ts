import type { ChildProfile, LessonProgress, SessionEvent } from "@kidlearn/db";
import { Prisma } from "@kidlearn/db";
import {
  evaluateAnswer,
  LESSON_STEPS,
  type LessonStep,
  type LessonStepReport,
  type QuizResponsesSubmit,
  type QuizScoreResponse,
  readQuizQuestion,
  type SessionEventReport,
} from "@kidlearn/types";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import {
  publishedRelation,
  visibleLessonWhere,
} from "../../shared/utils/published-for-child.js";
import { withSerializationRetry } from "../../shared/utils/serializable-retry.js";
import {
  type CompletionRewards,
  grantLessonCompletion,
} from "../rewards/reward.service.js";
import {
  evaluateStartForChild,
  screenTimeBlockedError,
} from "../screen-time/screen-time.service.js";

/**
 * Per-child lesson progress and the lesson player's event log (FR-LSN-06..07).
 */

/** Position in the ordered flow. `-1` for a value outside it, which cannot occur. */
function stepIndex(step: LessonStep): number {
  return LESSON_STEPS.indexOf(step);
}

/** The later of two steps in flow order. */
function laterStep(a: LessonStep, b: LessonStep): LessonStep {
  return stepIndex(a) >= stepIndex(b) ? a : b;
}

/** Resolves a lesson the child is actually allowed to be in, or throws 404. */
export async function requireVisibleLessonId(
  child: ChildProfile,
  lessonId: string,
): Promise<string> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, ...visibleLessonWhere(child) },
    select: { id: true },
  });
  if (!lesson) {
    throw ApiError.notFound("Lesson not found");
  }
  return lesson.id;
}

/** FR-LSN-06 — where this child left off, or `null` if they never started. */
export async function getLessonProgress(
  child: ChildProfile,
  lessonId: string,
): Promise<LessonProgress | null> {
  await requireVisibleLessonId(child, lessonId);

  return prisma.lessonProgress.findUnique({
    where: { childId_lessonId: { childId: child.id, lessonId } },
  });
}

/** FR-LSN-06 — records one finished step. */
export async function reportLessonStep(
  child: ChildProfile,
  lessonId: string,
  report: LessonStepReport,
): Promise<LessonProgress> {
  const visibleLessonId = await requireVisibleLessonId(child, lessonId);

  await assertMayOpenLesson(child.id, visibleLessonId);

  return withSerializationRetry(() =>
    reportLessonStepOnce(child.id, visibleLessonId, report),
  );
}

/**
 * Opening a lesson is gated on the content read, but the first step report is
 * what creates the progress row, and a row less than the resume grace old makes
 * the read allow that lesson even when the day's limit is spent. So a report that
 * would create the row is held to the same decision; one that continues a lesson
 * already under way is not, because finishing what was started is the point of
 * the grace.
 */
async function assertMayOpenLesson(
  childId: string,
  lessonId: string,
): Promise<void> {
  const existing = await prisma.lessonProgress.findUnique({
    where: { childId_lessonId: { childId, lessonId } },
    select: { id: true },
  });
  if (existing !== null) return;

  const decision = await evaluateStartForChild(childId, undefined);
  if (!decision.allowed) throw screenTimeBlockedError(decision);
}

function reportLessonStepOnce(
  childId: string,
  lessonId: string,
  report: LessonStepReport,
): Promise<LessonProgress> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.lessonProgress.findUnique({
        where: { childId_lessonId: { childId, lessonId } },
      });

      const currentStep =
        existing === null
          ? report.step
          : laterStep(existing.currentStep, report.step);

      // Already-set completion is never rewritten — see the docstring above.
      const completedAt =
        existing?.completedAt ?? (report.completed ? new Date() : null);

      if (existing === null) {
        return tx.lessonProgress.create({
          data: { childId, lessonId, currentStep, completedAt },
        });
      }

      return tx.lessonProgress.update({
        where: { id: existing.id },
        data: { currentStep, completedAt },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * FR-LSN-05 — the whole of finishing a lesson: mark it done, then pay for it.
 */
export async function completeLesson(
  child: ChildProfile,
  lessonId: string,
): Promise<CompletionRewards> {
  await assertPlayedThrough(child, lessonId);

  const progress = await reportLessonStep(child, lessonId, {
    step: "reward",
    completed: true,
  });

  return grantLessonCompletion(child, progress.lessonId);
}

/**
 * The last step whose report a completion requires. Not `quiz`: that step's
 * report is sent as the reward step mounts, and a child should not lose the
 * celebration because that one request was dropped. Finishing the activity is
 * still well past "opened the lesson", which is what this rules out.
 */
const STEP_BEFORE_COMPLETION: LessonStep = "activity";

/**
 * Completion pays out stars, the day's coins and the streak, so it is refused for
 * a lesson the child never played through (R-06). A replay of a finished lesson
 * passes: its row is already complete.
 */
async function assertPlayedThrough(
  child: ChildProfile,
  lessonId: string,
): Promise<void> {
  const visibleLessonId = await requireVisibleLessonId(child, lessonId);
  const progress = await prisma.lessonProgress.findUnique({
    where: {
      childId_lessonId: { childId: child.id, lessonId: visibleLessonId },
    },
    select: { currentStep: true, completedAt: true },
  });

  const hasPlayedThrough =
    progress !== null &&
    (progress.completedAt !== null ||
      stepIndex(progress.currentStep) >= stepIndex(STEP_BEFORE_COMPLETION));
  if (!hasPlayedThrough) {
    throw ApiError.conflict("Lesson has not been played through", {
      code: "LESSON_NOT_PLAYED",
    });
  }
}

/** FR-LSN-07, FR-TIME-06 — appends one lesson-flow event. */
export async function recordSessionEvent(
  child: ChildProfile,
  event: SessionEventReport,
): Promise<SessionEvent> {
  const lessonId = await requireVisibleLessonId(child, event.lessonId);

  const payload: Prisma.InputJsonObject = {
    lessonId,
    ...(event.step === undefined ? {} : { step: event.step }),
    ...(event.fallback === undefined ? {} : { fallback: event.fallback }),
  };

  return prisma.sessionEvent.create({
    data: { childId: child.id, type: event.type, payload },
  });
}

/**
 * FR-QUIZ-08 — stores one `QuizResponse` per answered question and scores the
 * lesson from them.
 */
export async function recordQuizResponses(
  child: ChildProfile,
  quizId: string,
  submit: QuizResponsesSubmit,
  log: QuizLogger,
): Promise<QuizScoreResponse> {
  const lesson = await prisma.lesson.findFirst({
    where: {
      quizId,
      ...visibleLessonWhere(child),
      quiz: publishedRelation,
    },
    select: {
      id: true,
      quiz: {
        select: { questions: { select: { id: true, definition: true } } },
      },
    },
  });
  // `quiz` is nullable on the row even though the filter above cannot match
  // without one, so the narrowing is the compiler's, not a second guard.
  if (lesson === null || lesson.quiz === null) {
    throw ApiError.notFound("Quiz not found");
  }

  // Recording the responses creates the progress row when none exists, so it is
  // held to the same gate as the first step report.
  await assertMayOpenLesson(child.id, lesson.id);

  const questions = new Map(
    lesson.quiz.questions.map((question) => [question.id, question]),
  );
  const foreign = submit.responses.find(
    (response) => !questions.has(response.questionId),
  );
  if (foreign !== undefined) {
    throw new ApiError(
      400,
      "VALIDATION_FAILED",
      `questionId ${foreign.questionId} does not belong to quiz ${quizId}`,
    );
  }

  const graded = submit.responses.map((response) => ({
    ...response,
    // `questions.has` was just checked for every response, so this is a lost
    // narrowing rather than an unchecked claim.
    isCorrect: gradeResponse(
      questions.get(response.questionId)?.definition,
      response,
      log,
    ),
  }));

  const totalQuestions = lesson.quiz.questions.length;
  const correctCount = graded.filter((response) => response.isCorrect).length;
  const score = Math.round((100 * correctCount) / totalQuestions);

  await withSerializationRetry(() =>
    recordQuizResponsesOnce(child.id, lesson.id, graded, score),
  );

  return { lessonId: lesson.id, score, correctCount, totalQuestions };
}

/**
 * The subset of `pino`'s logger this module needs, declared structurally so the
 * service stays callable without an HTTP request (`backend.md §2`). Mirrors
 * `ContentLogger`.
 */
export type QuizLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
};

/** One response, graded against the stored payload rather than reported. */
type GradedResponse = QuizResponsesSubmit["responses"][number] & {
  isCorrect: boolean;
};

/**
 * The server's verdict on one answer (FR-QUIZ-08, `backend.md §8`).
 *
 * Two conditions, because `QuizResponse.isCorrect` has always meant *right first
 * time* rather than *right eventually*: a quiz here has no fail state — the child
 * retries until the answer is accepted (spec §5.7) — so the committed answer is
 * correct by construction and "ever answered correctly" would be a constant
 * `true`. `attempts === 1` is what carries the distinction the reward grant, the
 * `quiz_correct_in_topic` badge and the weekly report's accuracy all read.
 *
 * A definition that no longer parses grades as incorrect and is logged: the row
 * is a content bug on a *published* question, and paying out on a payload the
 * server cannot read would be paying out on nothing.
 */
function gradeResponse(
  definition: Prisma.JsonValue | undefined,
  response: QuizResponsesSubmit["responses"][number],
  log: QuizLogger,
): boolean {
  const parsed = readQuizQuestion(definition);
  if (!parsed.success) {
    log.error(
      { questionId: response.questionId, issues: parsed.error.issues },
      "corrupt published quiz question definition — grading the answer as incorrect",
    );
    return false;
  }

  return (
    response.attempts === 1 && evaluateAnswer(parsed.data, response.answer)
  );
}

function recordQuizResponsesOnce(
  childId: string,
  lessonId: string,
  graded: readonly GradedResponse[],
  score: number,
): Promise<void> {
  return prisma.$transaction(
    async (tx) => {
      await tx.quizResponse.createMany({
        data: graded.map((response) => ({
          childId,
          questionId: response.questionId,
          // Zod parsed this into a string or a `{ pairs }` object, both of which
          // are valid JSON — but `InputJsonValue` is a recursive type Prisma
          // cannot infer a union into, so the boundary is asserted here.
          answer: response.answer as Prisma.InputJsonValue,
          // `gradeResponse`'s verdict, never the request's.
          isCorrect: response.isCorrect,
          attempts: response.attempts,
        })),
      });

      const existing = await tx.lessonProgress.findUnique({
        where: { childId_lessonId: { childId, lessonId } },
      });

      if (existing === null) {
        await tx.lessonProgress.create({ data: { childId, lessonId, score } });
        return;
      }

      // A replay keeps the child's best. Lowering it would make a second, more
      // tired run erase what they did on the first — and the row is what a
      // parent's report reads (file 29).
      if (score > (existing.score ?? -1)) {
        await tx.lessonProgress.update({
          where: { id: existing.id },
          data: { score },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
