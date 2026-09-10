import type { WeeklyReportList } from "@kidlearn/types";
import type { ApiResult } from "../../shared/api/api-client";
import { apiFetch } from "../../shared/api/api-client";

/** The weekly report screen's one data call (FR-DASH-05..06). */
export function getWeeklyReports(
  childId: string,
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<WeeklyReportList>> {
  return apiFetch<WeeklyReportList>(`/api/children/${childId}/reports`, {
    onColdStart: options.onColdStart,
  });
}
