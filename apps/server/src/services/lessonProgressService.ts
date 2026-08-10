import type { ChildProfile, LessonProgress, SessionEvent } from "@kidlearn/db";
import { Prisma } from "@kidlearn/db";
import {
  LESSON_STEPS,
  type LessonStep,
  type LessonStepReport,
  type SessionEventReport,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  publishedForChild,
  publishedRelation,
} from "../lib/published-for-child.js";

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

/** Postgres aborted a Serializable transaction rather than let it interleave. */
function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
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
 */
async function requireVisibleLessonId(
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

  try {
    return await reportLessonStepOnce(child.id, visibleLessonId, report);
  } catch (error) {
    if (!isSerializationFailure(error)) throw error;
    return reportLessonStepOnce(child.id, visibleLessonId, report);
  }
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
 * FR-LSN-07, FR-TIME-06 — appends one lesson-flow event.
 *
 * The row is what file 27 aggregates learning time from, so two things are the
 * server's and not the client's: `occurredAt` (the column default, never
 * `clientTs`) and which lesson the event may name (`requireVisibleLessonId`).
 *
 * `step` rides in `payload` rather than in a column of its own. `SessionEvent` is
 * a single append-only log for heartbeats, lessons and stories alike; a
 * lesson-step column would be null on most of its rows.
 */
export async function recordSessionEvent(
  child: ChildProfile,
  event: SessionEventReport,
): Promise<SessionEvent> {
  const lessonId = await requireVisibleLessonId(child, event.lessonId);

  const payload: Prisma.InputJsonObject = {
    lessonId,
    ...(event.step === undefined ? {} : { step: event.step }),
  };

  return prisma.sessionEvent.create({
    data: { childId: child.id, type: event.type, payload },
  });
}
