import type { DashboardData } from "@kidlearn/types";
import type { ApiResult } from "@/shared/api/api-client";
import { apiFetch } from "@/shared/api/api-client";

export function getDashboard(
  childId: string,
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<DashboardData>> {
  return apiFetch<DashboardData>(`/api/children/${childId}/dashboard`, {
    onColdStart: options.onColdStart,
  });
}
