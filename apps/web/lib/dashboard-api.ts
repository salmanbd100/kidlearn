import type { DashboardData } from "@kidlearn/types";
import type { ApiResult } from "./api-client";
import { apiFetch } from "./api-client";

/**
 * The parent dashboard's one data call (FR-DASH-01).
 *
 * PIN-gated — wrap it in `useParentGate().guard` so a lapsed grant re-opens the
 * PIN pad rather than showing a parent an error they cannot act on.
 *
 * `DashboardData` comes from `@kidlearn/types`, the same schema the route test
 * asserts real bodies against, so no shape is redeclared here (`backend.md §7`).
 */
export function getDashboard(
  childId: string,
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<DashboardData>> {
  return apiFetch<DashboardData>(`/api/children/${childId}/dashboard`, {
    onColdStart: options.onColdStart,
  });
}
