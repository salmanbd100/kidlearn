import type {
  AdminActivity,
  AdminBadge,
  AdminQuiz,
  AdminQuizDetail,
  AdminQuizQuestion,
  ContentStatusValue,
  EditorContentResourceName,
  QuestionDeleted,
  QuizQuestionType,
} from "@kidlearn/types";
import {
  CONTENT_BASE,
  type ListOptions,
  listQuery,
} from "@/features/admin/admin-url";
import type { ContentDraft } from "@/features/admin/content-api";
import { type ApiResult, apiFetch } from "@/shared/api/api-client";

export function fetchQuiz(quizId: string): Promise<ApiResult<AdminQuizDetail>> {
  return apiFetch<AdminQuizDetail>(`${CONTENT_BASE}/quizzes/${quizId}`);
}

export function fetchQuizzes(
  options: ListOptions = {},
): Promise<ApiResult<AdminQuiz[]>> {
  return apiFetch<AdminQuiz[]>(`${CONTENT_BASE}/quizzes${listQuery(options)}`);
}

export function createQuiz(
  title: string | null,
): Promise<ApiResult<AdminQuiz>> {
  return apiFetch<AdminQuiz>(`${CONTENT_BASE}/quizzes`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

/** `jobId`: the edit-then-approve breadcrumb — see `updateContent`. */
export function createQuestion(
  quizId: string,
  body: { format: QuizQuestionType; definition: unknown },
  jobId?: string,
): Promise<ApiResult<AdminQuizQuestion>> {
  return apiFetch<AdminQuizQuestion>(
    `${CONTENT_BASE}/quizzes/${quizId}/questions${listQuery({ jobId })}`,
    { method: "POST", retries: 0, body: JSON.stringify(body) },
  );
}

export function replaceQuestion(
  quizId: string,
  questionId: string,
  body: { format: QuizQuestionType; definition: unknown },
  jobId?: string,
): Promise<ApiResult<AdminQuizQuestion>> {
  return apiFetch<AdminQuizQuestion>(
    `${CONTENT_BASE}/quizzes/${quizId}/questions/${questionId}${listQuery({ jobId })}`,
    { method: "PATCH", retries: 0, body: JSON.stringify(body) },
  );
}

/** `retries: 0`: a delete renumbers the survivors, so a replay would be judged against a moved list. */
export function deleteQuestion(
  quizId: string,
  questionId: string,
  jobId?: string,
): Promise<ApiResult<QuestionDeleted>> {
  return apiFetch<QuestionDeleted>(
    `${CONTENT_BASE}/quizzes/${quizId}/questions/${questionId}${listQuery({ jobId })}`,
    { method: "DELETE", retries: 0 },
  );
}

export function fetchActivity(id: string): Promise<ApiResult<AdminActivity>> {
  return apiFetch<AdminActivity>(`${CONTENT_BASE}/activities/${id}`);
}

export function fetchActivities(
  options: ListOptions = {},
): Promise<ApiResult<AdminActivity[]>> {
  return apiFetch<AdminActivity[]>(
    `${CONTENT_BASE}/activities${listQuery(options)}`,
  );
}

export function createActivity(body: {
  type: string;
  definition: unknown;
}): Promise<ApiResult<AdminActivity>> {
  return apiFetch<AdminActivity>(`${CONTENT_BASE}/activities`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function updateActivity(
  id: string,
  body: { type: string; definition: unknown },
): Promise<ApiResult<AdminActivity>> {
  return apiFetch<AdminActivity>(`${CONTENT_BASE}/activities/${id}`, {
    method: "PATCH",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function fetchBadges(
  options: ListOptions = {},
): Promise<ApiResult<AdminBadge[]>> {
  return apiFetch<AdminBadge[]>(`${CONTENT_BASE}/badges${listQuery(options)}`);
}

export function createBadge(
  body: ContentDraft,
): Promise<ApiResult<AdminBadge>> {
  return apiFetch<AdminBadge>(`${CONTENT_BASE}/badges`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function updateBadge(
  id: string,
  body: ContentDraft,
): Promise<ApiResult<AdminBadge>> {
  return apiFetch<AdminBadge>(`${CONTENT_BASE}/badges/${id}`, {
    method: "PATCH",
    retries: 0,
    body: JSON.stringify(body),
  });
}

/** Separate from `transitionContent` because the resource unions are separate (see `EDITOR_CONTENT_RESOURCES`); `retries: 0` likewise. */
export function transitionEditorContent<TResult>(
  resource: EditorContentResourceName,
  id: string,
  to: ContentStatusValue,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}/${id}/transition`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ to }),
  });
}
