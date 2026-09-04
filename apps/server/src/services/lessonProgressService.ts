import type { ChildProfile, LessonProgress, SessionEvent } from "@kidlearn/db";
import { Prisma } from "@kidlearn/db";
import {
  LESSON_STEPS,
  type LessonStep,
  type LessonStepReport,
  type QuizResponsesSubmit,
  type QuizScoreResponse,
  type SessionEventReport,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  publishedForChild,
  publishedRelation,
} from "../lib/published-for-child.js";
import { withSerializationRetry } from "../lib/serializable-retry.js";
import {
  type CompletionRewards,
  grantLessonCompletion,
} from "./rewardService.js";

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
    where: {
      id: lessonId,
      ...publishedForChild(child),
      world: publishedRelation,
    },
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

  return withSerializationRetry(() =>
    reportLessonStepOnce(child.id, visibleLessonId, report),
  );
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
  const progress = await reportLessonStep(child, lessonId, {
    step: "reward",
    completed: true,
  });

  return grantLessonCompletion(child.id, progress.lessonId);
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
): Promise<QuizScoreResponse> {
  const lesson = await prisma.lesson.findFirst({
    where: {
      quizId,
      ...publishedForChild(child),
      world: publishedRelation,
      quiz: publishedRelation,
    },
    select: {
      id: true,
      quiz: { select: { questions: { select: { id: true } } } },
    },
  });
  // `quiz` is nullable on the row even though the filter above cannot match
  // without one, so the narrowing is the compiler's, not a second guard.
  if (lesson === null || lesson.quiz === null) {
    throw ApiError.notFound("Quiz not found");
  }

  const known = new Set(lesson.quiz.questions.map((question) => question.id));
  const foreign = submit.responses.find(
    (response) => !known.has(response.questionId),
  );
  if (foreign !== undefined) {
    throw new ApiError(
      400,
      "VALIDATION_FAILED",
      `questionId ${foreign.questionId} does not belong to quiz ${quizId}`,
    );
  }

  const totalQuestions = lesson.quiz.questions.length;
  const correctCount = submit.responses.filter(
    (response) => response.isCorrect,
  ).length;
  const score = Math.round((100 * correctCount) / totalQuestions);

  await withSerializationRetry(() =>
    recordQuizResponsesOnce(child.id, lesson.id, submit, score),
  );

  return { lessonId: lesson.id, score, correctCount, totalQuestions };
}

function recordQuizResponsesOnce(
  childId: string,
  lessonId: string,
  submit: QuizResponsesSubmit,
  score: number,
): Promise<void> {
  return prisma.$transaction(
    async (tx) => {
      await tx.quizResponse.createMany({
        data: submit.responses.map((response) => ({
          childId,
          questionId: response.questionId,
          // Zod parsed this into a string or a `{ pairs }` object, both of which
          // are valid JSON — but `InputJsonValue` is a recursive type Prisma
          // cannot infer a union into, so the boundary is asserted here.
          answer: response.answer as Prisma.InputJsonValue,
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
