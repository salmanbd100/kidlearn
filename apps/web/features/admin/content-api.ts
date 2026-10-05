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

/**
 * `/api/admin/content/*`. Every payload type comes from `@kidlearn/types` — the
 * same schemas the route tests assert real bodies against — so the CMS cannot
 * drift from the server by redeclaring a shape (`backend.md §7`).
 */

/**
 * `onColdStart` is offered on this one call only. The CMS fetches all four lists
 * together on mount, so one of them is enough to notice the API waking up
 * (NFR-PERF-04) — wiring it to all four would fire the same message four times.
 */
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

/** Everything a create or edit body may carry. The server validates it. */
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

/**
 * `jobId` is the edit-then-approve breadcrumb (file 37, FR-AI-07): pass it when
 * the form was opened from the review queue and the server records
 * `edit_then_approve` on that job in the same request as the save. Omit it
 * everywhere else.
 */
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

/** The single door to a status change, matching the server. */
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

/**
 * Persists a whole sibling set's order. `orderedIds` must be exactly the
 * siblings the list is showing — the server rejects anything else rather than
 * applying it partially.
 */
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
