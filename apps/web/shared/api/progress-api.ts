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
  StoryCompletionResponse,
} from "@kidlearn/types";
import { type ApiResult, apiFetch } from "./api-client";

/**
 * Typed wrappers over `/api/progress` — where the lesson player records what a
 * child has done (FR-LSN-06..07).
 */

/** FR-LSN-06 — where the child left off, or `null` if they never started. */
export function getLessonProgress(
  lessonId: string,
): Promise<ApiResult<{ progress: LessonProgressResponse | null }>> {
  return apiFetch(`/api/progress/lessons/${lessonId}`);
}

/** FR-LSN-06 — reports one finished step. */
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

/** FR-LSN-05 — finishes the lesson and asks what it was worth. */
export function completeLesson(
  lessonId: string,
): Promise<ApiResult<LessonCompletionResponse>> {
  return apiFetch(`/api/progress/lessons/${lessonId}/complete`, {
    method: "POST",
  });
}

/**
 * FR-STORY-07 — reports that a story was read to the end, and asks what it was
 * worth.
 */
export function completeStory(
  storyId: string,
): Promise<ApiResult<StoryCompletionResponse>> {
  return apiFetch(`/api/progress/stories/${storyId}/complete`, {
    method: "POST",
  });
}

/** FR-GAM-06 — the active child's running totals, for the home screen strip. */
export function getRewardsSummary(): Promise<ApiResult<RewardSummaryResponse>> {
  return apiFetch("/api/me/rewards/summary");
}

/** FR-GAM-05 — every published character, flagged with what this child has. */
export function getMyCharacters(): Promise<
  ApiResult<{ characters: CharacterUnlockResponse[] }>
> {
  return apiFetch("/api/me/characters");
}

/**
 * FR-LSN-07 — appends one event to the log file 27 aggregates learning time from.
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

/** FR-QUIZ-08 — posts the whole finished quiz, once. */
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
