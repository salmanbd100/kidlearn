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
import {
  assertWithinClientEventBudget,
  recordServerObservedBeat,
} from "./session-event.service.js";

/** Position in the ordered flow. `-1` for a value outside it, which cannot occur. */
function stepIndex(step: LessonStep): number {
  return LESSON_STEPS.indexOf(step);
}

function laterStep(a: LessonStep, b: LessonStep): LessonStep {
  return stepIndex(a) >= stepIndex(b) ? a : b;
}

/**
 * How far one report may move `currentStep`. `next` is the player's own pace — one step past the last finished, so a client cannot
 * post `activity` into a fresh row and be paid for a lesson it never played. `completion` is `completeLesson`'s report, which may
 * cross the quiz: that report is sent as the reward step mounts and may have been dropped.
 */
type StepAdvance = "next" | "completion";

function assertReachable(
  existing: LessonStep | null,
  reported: LessonStep,
  advance: StepAdvance,
): void {
  if (advance === "completion") return;
  // A re-post of a passed step is a retry or a replay and stays a no-op, so only a forward jump is refused.
  const furthest = existing === null ? 0 : stepIndex(existing) + 1;
  if (stepIndex(reported) > furthest) {
    throw ApiError.conflict("Lesson steps must be reported in order", {
      code: "STEP_OUT_OF_ORDER",
      currentStep: existing,
    });
  }
}

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

export async function getLessonProgress(
  child: ChildProfile,
  lessonId: string,
): Promise<LessonProgress | null> {
  await requireVisibleLessonId(child, lessonId);

  return prisma.lessonProgress.findUnique({
    where: { childId_lessonId: { childId: child.id, lessonId } },
  });
}

export function reportLessonStep(
  child: ChildProfile,
  lessonId: string,
  report: LessonStepReport,
): Promise<LessonProgress> {
  return writeLessonStep(child, lessonId, report, "next");
}

async function writeLessonStep(
  child: ChildProfile,
  lessonId: string,
  report: LessonStepReport,
  advance: StepAdvance,
): Promise<LessonProgress> {
  const visibleLessonId = await requireVisibleLessonId(child, lessonId);

  await assertMayOpenLesson(child.id, visibleLessonId);
  await recordServerObservedBeat(
    child.id,
    advance === "completion" ? "lesson_complete" : "lesson_step",
  );

  return withSerializationRetry(() =>
    reportLessonStepOnce(child.id, visibleLessonId, report, advance),
  );
}

/**
 * The first step report creates the progress row, and a row under the resume grace makes the content read allow the lesson even when
 * the day's limit is spent, so a report that would create the row is held to the same decision; continuing a lesson is not.
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
  advance: StepAdvance,
): Promise<LessonProgress> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.lessonProgress.findUnique({
        where: { childId_lessonId: { childId, lessonId } },
      });

      assertReachable(existing?.currentStep ?? null, report.step, advance);

      const currentStep =
        existing === null
          ? report.step
          : laterStep(existing.currentStep, report.step);

      // Already-set completion is never rewritten.
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

export async function completeLesson(
  child: ChildProfile,
  lessonId: string,
): Promise<CompletionRewards> {
  await assertPlayedThrough(child, lessonId);

  const progress = await writeLessonStep(
    child,
    lessonId,
    { step: "reward", completed: true },
    "completion",
  );

  return grantLessonCompletion(child, progress.lessonId);
}

/** The last step a completion requires; not `quiz`, whose report is sent as the reward step mounts, and a dropped request should not cost the child the celebration. */
const STEP_BEFORE_COMPLETION: LessonStep = "activity";

/** Completion pays stars, coins and streak, so it is refused for a lesson never played through. A replay of a finished lesson passes. */
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

export async function recordSessionEvent(
  child: ChildProfile,
  event: SessionEventReport,
): Promise<SessionEvent> {
  const lessonId = await requireVisibleLessonId(child, event.lessonId);
  await assertWithinClientEventBudget(child.id);

  const payload: Prisma.InputJsonObject = {
    lessonId,
    ...(event.step === undefined ? {} : { step: event.step }),
    ...(event.fallback === undefined ? {} : { fallback: event.fallback }),
  };

  return prisma.sessionEvent.create({
    data: { childId: child.id, type: event.type, payload },
  });
}

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
  // `quiz` is nullable on the row though the filter cannot match without one; the narrowing is the compiler's, not a second guard.
  if (lesson === null || lesson.quiz === null) {
    throw ApiError.notFound("Quiz not found");
  }

  // Recording responses creates the progress row, so it is held to the same gate as the first step report.
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
    // `questions.has` was just checked for every response; this is a lost narrowing, not an unchecked claim.
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

/** Structural subset of `pino`'s logger so the service stays callable without HTTP; mirrors `ContentLogger`. */
export type QuizLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
};

type GradedResponse = QuizResponsesSubmit["responses"][number] & {
  isCorrect: boolean;
};

/**
 * The server's verdict on one answer (FR-QUIZ-08, `backend.md §8`). `isCorrect` means right first time (`attempts === 1`), not right
 * eventually: a quiz has no fail state, so "ever correct" would be constant `true`, and rewards, badges and the report read the distinction.
 * A definition that no longer parses grades as incorrect and is logged, so a content bug never pays out.
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
          // Zod gives a string or `{ pairs }`, both valid JSON, but `InputJsonValue` is a recursive type
          // Prisma cannot infer a union into; asserted here.
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

      // A replay keeps the best: lowering it would let a more tired run erase the first, and a parent's report reads this row.
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
