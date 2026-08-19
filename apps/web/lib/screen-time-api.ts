import type {
  ScreenTimeSettingResponse,
  ScreenTimeStatusResponse,
  ScreenTimeUpdate,
} from "@kidlearn/types";
import { SCREEN_TIME_BLOCK_CODES } from "@kidlearn/types";
import type { ApiFailure, ApiResult } from "./api-client";
import { apiFetch } from "./api-client";

/**
 * Typed wrappers over the screen-time API (FR-TIME-01..05).
 *
 * Both surfaces are here because both are one feature, but they are used by
 * different people: `getScreenTimeStatus` is the child's own read of their
 * allowance, and the two settings calls are the parent's, behind the PIN gate.
 *
 * Every type comes from `@kidlearn/types` — the same schemas the route tests
 * assert real bodies against — so no shape is redeclared here (`backend.md §7`).
 * Nothing in this file decides anything: the verdict is the server's, and a client
 * that ignored it would simply meet the `423` one screen later.
 */

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

/**
 * Replaces one child's whole policy. PIN-gated.
 *
 * The body is total, not partial: all three fields are sent every time, so
 * switching something off is a value rather than an omission. `ScreenTimeUpdate`
 * is the type inferred from the schema the server validates with, so a payload
 * this function accepts is one the route accepts.
 */
export function updateScreenTime(
  childId: string,
  values: ScreenTimeUpdate,
): Promise<ApiResult<ScreenTimeSettingResponse>> {
  return apiFetch<ScreenTimeSettingResponse>(
    `/api/children/${childId}/screen-time`,
    { method: "PATCH", body: JSON.stringify(values) },
  );
}

/**
 * Whether a failed call was the screen-time gate rather than a real error.
 *
 * A type guard rather than a status check, because the code is the contract and
 * the status is not: `423` is what the two content-start routes answer with today,
 * and a client matching on the number would break if a proxy ever rewrote it. The
 * two codes it narrows to are the two mascot screens.
 */
export function isScreenTimeBlock(
  error: ApiFailure,
): error is ApiFailure & { code: (typeof SCREEN_TIME_BLOCK_CODES)[number] } {
  return SCREEN_TIME_BLOCK_CODES.some((code) => code === error.code);
}

/**
 * The window start carried on a `423`, when there is one.
 *
 * `details` is deliberately `unknown` on `ApiFailure` (a client must not depend on
 * its shape), so this narrows it in the one place that needs to — the lock screen,
 * which has nothing else to say "see you at…" from. A malformed or missing value
 * simply yields `undefined` and the screen falls back to its generic line.
 */
export function windowStartFromError(error: ApiFailure): string | undefined {
  const { details } = error;
  if (typeof details !== "object" || details === null) return undefined;

  const { windowStart } = details as { windowStart?: unknown };
  return typeof windowStart === "string" ? windowStart : undefined;
}
