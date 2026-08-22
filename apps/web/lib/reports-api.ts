import type { WeeklyReportList } from "@kidlearn/types";
import type { ApiResult } from "./api-client";
import { apiFetch } from "./api-client";

/**
 * The weekly report screen's one data call (FR-DASH-05..06).
 *
 * PIN-gated — wrap it in `useParentGate().guard` so a lapsed grant re-opens the
 * PIN pad rather than showing a parent an error they cannot act on.
 *
 * A `GET` that may write on the server: if last week has no report yet, the
 * endpoint generates it before answering. Nothing about that is visible here, and
 * deliberately so — the client's job is to ask for the reports, not to know that
 * the free tier has no worker to build them in advance.
 *
 * `WeeklyReportList` comes from `@kidlearn/types`, the same schema the route test
 * asserts real bodies against, so no shape is redeclared here (`backend.md §7`).
 */
export function getWeeklyReports(
  childId: string,
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<WeeklyReportList>> {
  return apiFetch<WeeklyReportList>(`/api/children/${childId}/reports`, {
    onColdStart: options.onColdStart,
  });
}
