import type { DashboardData } from "@kidlearn/types";
import type { ApiResult } from "./api-client";
import { apiFetch } from "./api-client";

/** The parent dashboard's one data call (FR-DASH-01). */
export function getDashboard(
  childId: string,
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<DashboardData>> {
  return apiFetch<DashboardData>(`/api/children/${childId}/dashboard`, {
    onColdStart: options.onColdStart,
  });
}
