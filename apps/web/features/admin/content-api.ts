import type {
  AdminLesson,
  AdminSubject,
  AdminTopic,
  AdminWorld,
  ContentResourceName,
  ContentStatusValue,
  OrderableContentResourceName,
  ReorderedIds,
} from "@kidlearn/types";
import {
  CONTENT_BASE,
  type ListOptions,
  listQuery,
} from "@/features/admin/admin-url";
import { type ApiResult, apiFetch } from "@/shared/api/api-client";

/** `onColdStart` is on this call only: the four lists load together, so wiring all four would fire the message four times. */
export function fetchWorlds(
  options: ListOptions & { onColdStart?: () => void } = {},
): Promise<ApiResult<AdminWorld[]>> {
  const { onColdStart, ...query } = options;
  return apiFetch<AdminWorld[]>(`${CONTENT_BASE}/worlds${listQuery(query)}`, {
    onColdStart,
  });
}

export function fetchSubjects(
  options: ListOptions = {},
): Promise<ApiResult<AdminSubject[]>> {
  return apiFetch<AdminSubject[]>(
    `${CONTENT_BASE}/subjects${listQuery(options)}`,
  );
}

export function fetchTopics(
  options: ListOptions & { subjectId?: string } = {},
): Promise<ApiResult<AdminTopic[]>> {
  return apiFetch<AdminTopic[]>(`${CONTENT_BASE}/topics${listQuery(options)}`);
}

export function fetchLessons(
  options: ListOptions & { topicId?: string } = {},
): Promise<ApiResult<AdminLesson[]>> {
  return apiFetch<AdminLesson[]>(
    `${CONTENT_BASE}/lessons${listQuery(options)}`,
  );
}

export type ContentDraft = Record<string, unknown>;

export function createContent<TResult>(
  resource: ContentResourceName,
  body: ContentDraft,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** `jobId` marks edit-then-approve: the server records `edit_then_approve` on that job in the same request. Omit elsewhere. */
export function updateContent<TResult>(
  resource: ContentResourceName,
  id: string,
  body: ContentDraft,
  jobId?: string,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(
    `${CONTENT_BASE}/${resource}/${id}${listQuery({ jobId })}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function transitionContent<TResult>(
  resource: ContentResourceName,
  id: string,
  to: ContentStatusValue,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}/${id}/transition`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ to }),
  });
}

/** `orderedIds` must be exactly the siblings shown; the server rejects anything else rather than applying it partially. */
export function reorderContent(
  resource: OrderableContentResourceName,
  orderedIds: string[],
  parentId?: string,
  includeArchived?: boolean,
): Promise<ApiResult<ReorderedIds>> {
  return apiFetch<ReorderedIds>(`${CONTENT_BASE}/${resource}/reorder`, {
    method: "PATCH",
    retries: 0,
    body: JSON.stringify({
      orderedIds,
      ...(parentId ? { parentId } : {}),
      ...(includeArchived ? { includeArchived } : {}),
    }),
  });
}
