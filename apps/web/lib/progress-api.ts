import type {
  CharacterUnlockResponse,
  LessonCompletionResponse,
  LessonProgressResponse,
  LessonStep,
  LessonStepReport,
  QuizResponseRecord,
  QuizScoreResponse,
  RewardSummaryResponse,
  SessionEventRecordResponse,
  SessionEventReport,
} from "@kidlearn/types";
import { type ApiResult, apiFetch } from "./api-client";

/**
 * Typed wrappers over `/api/progress` — where the lesson player records what a
 * child has done (FR-LSN-06..07).
 *
 * Request and response types both come from `@kidlearn/types`: the same objects the
 * route validates with and the route tests assert real bodies against, so no shape
 * is redeclared here (`backend.md §7`). Which child the progress belongs to is
 * absent from every signature below, and that is the contract — the server reads it
 * from the session (FR-PROF-03), so there is nothing a client could pass to write
 * into somebody else's row.
 */

/** FR-LSN-06 — where the child left off, or `null` if they never started. */
export function getLessonProgress(
  lessonId: string,
): Promise<ApiResult<{ progress: LessonProgressResponse | null }>> {
  return apiFetch(`/api/progress/lessons/${lessonId}`);
}

/**
 * FR-LSN-06 — reports one finished step.
 *
 * `completed` is only accepted with `step: "reward"`; the shared schema enforces the
 * pairing on both sides, so a caller cannot express the invalid combination without
 * the compiler and then the server both objecting.
 */
export function reportStep(
  lessonId: string,
  report: LessonStepReport,
): Promise<ApiResult<{ progress: LessonProgressResponse }>> {
  return apiFetch(`/api/progress/lessons/${lessonId}/step`, {
    method: "POST",
    body: JSON.stringify(report),
    // A step report is a write. Retrying it on a 5xx is safe — the endpoint is
    // idempotent by construction, since `currentStep` never moves backwards.
  });
}

/**
 * FR-LSN-05 — finishes the lesson and asks what it was worth.
 *
 * **Replaces** `reportStep(lessonId, { step: "reward", completed: true })`: this
 * endpoint performs that same step report itself, and adds the grants. There is
 * no body, and nothing here computes a reward — stars and coins are the server's
 * arithmetic over rows it holds, which is what leaves no client-side surface for
 * a reward to be claimed through (FR-GAM-08).
 *
 * Retries are left at the default. A replay grants nothing, so a retry that
 * lands twice costs a duplicate request and never a duplicate star.
 */
export function completeLesson(
  lessonId: string,
): Promise<ApiResult<LessonCompletionResponse>> {
  return apiFetch(`/api/progress/lessons/${lessonId}/complete`, {
    method: "POST",
  });
}

/** FR-GAM-06 — the active child's running totals, for the home screen strip. */
export function getRewardsSummary(): Promise<ApiResult<RewardSummaryResponse>> {
  return apiFetch("/api/me/rewards/summary");
}

/**
 * FR-GAM-05 — every published character, flagged with what this child has.
 *
 * The locked ones come back too, on purpose: a picker showing only what a child
 * already has cannot show them what there is to earn. Nothing here decides which
 * is which — `isUnlocked` is the server's, computed from the same rule the
 * profile-update route enforces.
 */
export function getMyCharacters(): Promise<
  ApiResult<{ characters: CharacterUnlockResponse[] }>
> {
  return apiFetch("/api/me/characters");
}

/**
 * FR-LSN-07 — appends one event to the log file 27 aggregates learning time from.
 *
 * **Fire-and-forget.** Nothing a child sees waits on this, and a failure is
 * swallowed with a console warning rather than surfaced: a missing analytics row is
 * not worth interrupting a lesson for. Callers do not await it.
 *
 * `clientTs` is stamped here and discarded by the server, which keeps its own time
 * (FR-TIME-06). It is sent anyway so the two can be compared for clock skew.
 */
export function sendSessionEvent(
  event: Omit<SessionEventReport, "clientTs"> & { step?: LessonStep },
): void {
  const body: SessionEventReport = {
    ...event,
    clientTs: new Date().toISOString(),
  };

  void apiFetch<{ event: SessionEventRecordResponse }>("/api/progress/events", {
    method: "POST",
    body: JSON.stringify(body),
    // No retries: an event that failed once has already been superseded by the
    // child's next tap, and a queue of stale retries would report a lesson's
    // timeline out of order.
    retries: 0,
  }).then((result) => {
    if (!result.ok) {
      console.warn(
        `[kidlearn] session event ${event.type} not recorded: ${result.error.code}`,
      );
    }
  });
}

/**
 * FR-QUIZ-08 — posts the whole finished quiz, once.
 *
 * The score comes back but is not what the child is shown: the score screen
 * draws its stars from the same records this sends, which is what lets the
 * celebration render before — and regardless of whether — this resolves. The
 * caller is expected to fire it alongside that screen and never to block on it
 * (see `QuizStep`).
 *
 * `retries: 0` for the reason `sendSessionEvent` gives, plus one of its own: by
 * the time a retry landed the child would be in the reward step, and a duplicate
 * that *did* succeed would write a second set of `QuizResponse` rows for one
 * sitting.
 */
export function submitQuizResponses(
  quizId: string,
  responses: readonly QuizResponseRecord[],
): Promise<ApiResult<QuizScoreResponse>> {
  return apiFetch(`/api/progress/quizzes/${quizId}/responses`, {
    method: "POST",
    body: JSON.stringify({ responses }),
    retries: 0,
  });
}
