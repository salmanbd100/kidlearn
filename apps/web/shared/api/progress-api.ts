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

export function getLessonProgress(
  lessonId: string,
): Promise<ApiResult<{ progress: LessonProgressResponse | null }>> {
  return apiFetch(`/api/progress/lessons/${lessonId}`);
}

export function reportStep(
  lessonId: string,
  report: LessonStepReport,
): Promise<ApiResult<{ progress: LessonProgressResponse }>> {
  return apiFetch(`/api/progress/lessons/${lessonId}/step`, {
    method: "POST",
    body: JSON.stringify(report),
    // Safe to retry: idempotent by construction (`currentStep` never moves back, `completedAt` is never rewritten).
    isIdempotent: true,
  });
}

export function completeLesson(
  lessonId: string,
): Promise<ApiResult<LessonCompletionResponse>> {
  return apiFetch(`/api/progress/lessons/${lessonId}/complete`, {
    method: "POST",
    // Replay-safe: every grant is guarded by the ledger's unique index.
    isIdempotent: true,
  });
}

export function completeStory(
  storyId: string,
): Promise<ApiResult<StoryCompletionResponse>> {
  return apiFetch(`/api/progress/stories/${storyId}/complete`, {
    method: "POST",
    // Same guard as the lesson completion: `skipDuplicates` over a unique index.
    isIdempotent: true,
  });
}

export function getRewardsSummary(): Promise<ApiResult<RewardSummaryResponse>> {
  return apiFetch("/api/me/rewards/summary");
}

export function getMyCharacters(): Promise<
  ApiResult<{ characters: CharacterUnlockResponse[] }>
> {
  return apiFetch("/api/me/characters");
}

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
    // No retries: a failed event is already superseded by the next tap, and stale retries would reorder the timeline.
    retries: 0,
  }).then((result) => {
    if (!result.ok) {
      console.warn(
        `[kidlearn] session event ${event.type} not recorded: ${result.error.code}`,
      );
    }
  });
}

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
