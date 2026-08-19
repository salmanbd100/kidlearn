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
 *
 * Three invariants hold across this file:
 *
 *  1. **Nothing is recorded against a lesson the child cannot see.** Every write
 *     resolves the lesson through the same visibility rule the content API reads
 *     it with (`lib/published-for-child.ts`), so a draft or wrong-grade id is a
 *     404 here exactly as it is there. Without this the progress table — and the
 *     event stream file 27 aggregates screen time from — would accept any uuid a
 *     client cared to invent.
 *  2. **`currentStep` only ever moves forwards.** It is the last step the child
 *     *finished*, and a replay re-posts `intro` while the row already says
 *     `quiz`. Regressing on that would hand a resuming child the video again
 *     after they had reached the quiz.
 *  3. **Time is the server's.** `SessionEvent.occurredAt` is the database
 *     default; the `clientTs` in the request is discarded (FR-TIME-06).
 */

/** Position in the ordered flow. `-1` for a value outside it, which cannot occur. */
function stepIndex(step: LessonStep): number {
  return LESSON_STEPS.indexOf(step);
}

/** The later of two steps in flow order. */
function laterStep(a: LessonStep, b: LessonStep): LessonStep {
  return stepIndex(a) >= stepIndex(b) ? a : b;
}

/**
 * Resolves a lesson the child is actually allowed to be in, or throws 404.
 *
 * **404, not 403** — the same deliberate choice the content API makes: a 403 would
 * confirm the row exists, and unpublished content must not be discoverable by
 * probing (NFR-SAFE-02). The `world` gate is here for the same reason it is in
 * `contentService`: a published lesson in a draft world is not visible, so it must
 * not be recordable either, or a child could hold progress in a lesson that
 * `GET /api/content/lessons/:id` 404s.
 *
 * Exported for the same reason `storyService.requireVisibleStoryId` is: file 27's
 * activity events gate on *this* clause rather than on a copy of it, so the two
 * event endpoints cannot disagree about which lessons exist for a child.
 */
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

/**
 * FR-LSN-06 — where this child left off, or `null` if they never started.
 *
 * Visibility is enforced here too, so a lesson that was unpublished between two
 * sessions stops answering rather than quietly handing back a resume point into
 * content the child may no longer have.
 */
export async function getLessonProgress(
  child: ChildProfile,
  lessonId: string,
): Promise<LessonProgress | null> {
  await requireVisibleLessonId(child, lessonId);

  return prisma.lessonProgress.findUnique({
    where: { childId_lessonId: { childId: child.id, lessonId } },
  });
}

/**
 * FR-LSN-06 — records one finished step.
 *
 * `completed` stamps `completedAt` and is only accepted on `reward` (the schema
 * enforces the pairing). It is stamped **once**: a replay of a finished lesson
 * walks all five steps again and re-reports the reward, and overwriting
 * `completedAt` on that second pass would move a completion date forwards every
 * time a child re-watched something they had already done.
 *
 * Serializable, with one retry, for the reason `childProfileService` documents:
 * read-then-write under Postgres's default READ COMMITTED loses an update when two
 * requests interleave, and here that would mean a step report vanishing. Two taps
 * arriving together is not hypothetical on a surface built for a child who taps
 * everything.
 */
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
 *
 * Two steps rather than one transaction, and the split is the reason
 * `rewardService` owns its own: marking progress and granting rewards fail
 * independently and are separately idempotent. A grant that could not be written
 * must not un-finish a lesson the child finished, and a replay repeats both
 * halves harmlessly — `completedAt` is stamped once, and every grant is unique on
 * `(childId, rewardType, sourceType, sourceId)`.
 *
 * `reportLessonStep` does the marking, rather than a second copy of the upsert
 * here: this *is* a reward-step report, so it inherits the monotonic guard, the
 * write-once `completedAt` and the serialization retry unchanged. It also runs
 * the visibility check, so nothing below can grant a reward for a lesson the
 * child cannot see.
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

/**
 * FR-LSN-07, FR-TIME-06 — appends one lesson-flow event.
 *
 * The row is what file 27 aggregates learning time from, so two things are the
 * server's and not the client's: `occurredAt` (the column default, never
 * `clientTs`) and which lesson the event may name (`requireVisibleLessonId`).
 *
 * `step` and `fallback` ride in `payload` rather than in columns of their own.
 * `SessionEvent` is a single append-only log for heartbeats, lessons and stories
 * alike; either column would be null on most of its rows.
 *
 * `fallback` is written exactly as the client sent it, and is the one field here
 * that is not otherwise knowable server-side: it says which asset the *step*
 * consumed, not which one the lesson payload offered (file 17, FR-I18N-01).
 * Nothing a child sees depends on it, so a client that lies about it skews a
 * content report and nothing else.
 */
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
 *
 * The quiz is resolved *through its lesson*, not by id: `Quiz` carries a status
 * but no grade tags, so a quiz is visible exactly when some lesson the child can
 * see points at it. Reading it any other way would let a child post answers into
 * a quiz belonging to a grade or a world they have no access to — the same
 * probing hole `requireVisibleLessonId` closes, and answered with the same 404.
 *
 * **Scoring is over the quiz, not over the submission.** A client that posts
 * three of four records would otherwise score 100% for skipping the question it
 * got wrong, so the denominator is how many questions the quiz has.
 *
 * Serializable with one retry, like `reportLessonStep` and for the same reason:
 * the best-score guard is a read-then-write, and two submissions racing under
 * READ COMMITTED would lose the higher one.
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
