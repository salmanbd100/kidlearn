import type {
  ScreenTimeSettingResponse,
  ScreenTimeStatusResponse,
  ScreenTimeUpdate,
} from "@kidlearn/types";
import { SCREEN_TIME_BLOCK_CODES } from "@kidlearn/types";
import type { ApiFailure, ApiResult } from "@/shared/api/api-client";
import { apiFetch } from "@/shared/api/api-client";

export function getScreenTimeStatus(
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<ScreenTimeStatusResponse>> {
  return apiFetch<ScreenTimeStatusResponse>("/api/screen-time/status", {
    onColdStart: options.onColdStart,
  });
}

export function getScreenTime(
  childId: string,
): Promise<ApiResult<ScreenTimeSettingResponse>> {
  return apiFetch<ScreenTimeSettingResponse>(
    `/api/children/${childId}/screen-time`,
  );
}

export function updateScreenTime(
  childId: string,
  values: ScreenTimeUpdate,
): Promise<ApiResult<ScreenTimeSettingResponse>> {
  return apiFetch<ScreenTimeSettingResponse>(
    `/api/children/${childId}/screen-time`,
    { method: "PATCH", body: JSON.stringify(values) },
  );
}

export function isScreenTimeBlock(
  error: ApiFailure,
): error is ApiFailure & { code: (typeof SCREEN_TIME_BLOCK_CODES)[number] } {
  return SCREEN_TIME_BLOCK_CODES.some((code) => code === error.code);
}

export function windowStartFromError(error: ApiFailure): string | undefined {
  const { details } = error;
  if (typeof details !== "object" || details === null) return undefined;

  const { windowStart } = details as { windowStart?: unknown };
  return typeof windowStart === "string" ? windowStart : undefined;
}
