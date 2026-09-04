import type {
  ScreenTimeSettingResponse,
  ScreenTimeStatusResponse,
  ScreenTimeUpdate,
} from "@kidlearn/types";
import { SCREEN_TIME_BLOCK_CODES } from "@kidlearn/types";
import type { ApiFailure, ApiResult } from "./api-client";
import { apiFetch } from "./api-client";

// Typed wrappers over the screen-time API (FR-TIME-01..05).

/** May the active child start something new right now? */
export function getScreenTimeStatus(
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<ScreenTimeStatusResponse>> {
  return apiFetch<ScreenTimeStatusResponse>("/api/screen-time/status", {
    onColdStart: options.onColdStart,
  });
}

/** One child's stored policy. PIN-gated — wrap the call in `useParentGate().guard`. */
export function getScreenTime(
  childId: string,
): Promise<ApiResult<ScreenTimeSettingResponse>> {
  return apiFetch<ScreenTimeSettingResponse>(
    `/api/children/${childId}/screen-time`,
  );
}

/** Replaces one child's whole policy. PIN-gated. */
export function updateScreenTime(
  childId: string,
  values: ScreenTimeUpdate,
): Promise<ApiResult<ScreenTimeSettingResponse>> {
  return apiFetch<ScreenTimeSettingResponse>(
    `/api/children/${childId}/screen-time`,
    { method: "PATCH", body: JSON.stringify(values) },
  );
}

/** Whether a failed call was the screen-time gate rather than a real error. */
export function isScreenTimeBlock(
  error: ApiFailure,
): error is ApiFailure & { code: (typeof SCREEN_TIME_BLOCK_CODES)[number] } {
  return SCREEN_TIME_BLOCK_CODES.some((code) => code === error.code);
}

/** The window start carried on a `423`, when there is one. */
export function windowStartFromError(error: ApiFailure): string | undefined {
  const { details } = error;
  if (typeof details !== "object" || details === null) return undefined;

  const { windowStart } = details as { windowStart?: unknown };
  return typeof windowStart === "string" ? windowStart : undefined;
}
