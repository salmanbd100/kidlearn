import type {
  LessonProgressResponse,
  LessonStep,
  LessonStepReport,
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
