import type {
  AvatarCharacterResponse,
  CharacterUnlockResponse,
  ChildProfileCreate,
  ChildProfileResponse,
  ChildProfileUpdate,
  ParentSummaryResponse,
} from "@kidlearn/types";
import { CONSENT_VERSION } from "@kidlearn/types";
import {
  type ApiResult,
  apiBaseUrl,
  apiFetch,
} from "../../shared/api/api-client";

// Typed wrappers over the parent-facing API.

export type AuthMe = {
  parent: ParentSummaryResponse;
  activeChildProfileId: string | null;
};

/** Who am I. Also what provisions the `Parent` row on a brand-new account. */
export function fetchAuthMe(): Promise<ApiResult<AuthMe>> {
  return apiFetch<AuthMe>("/api/auth/me");
}

/** Where the browser goes to start the Google round-trip (FR-AUTH-02). */
export function googleSignInUrl(): string {
  return `${apiBaseUrl()}/api/auth/google`;
}

/** Records COPPA consent (FR-AUTH-03). */
export function submitConsent(): Promise<ApiResult<unknown>> {
  return apiFetch("/api/parent/consent", {
    method: "POST",
    body: JSON.stringify({ accepted: true, version: CONSENT_VERSION }),
    // Re-posting the current version refreshes the timestamp and nothing else —
    // `recordParentConsent` is explicitly idempotent.
    isIdempotent: true,
  });
}

/** The starter avatars a profile may wear. Ids are `Character` row ids. */
export function listAvatars(): Promise<ApiResult<AvatarCharacterResponse[]>> {
  return apiFetch<AvatarCharacterResponse[]>("/api/characters");
}

/** FR-GAM-05 — the avatars for one existing child, locked ones included. */
export function listChildCharacters(
  childId: string,
): Promise<ApiResult<{ characters: CharacterUnlockResponse[] }>> {
  return apiFetch(`/api/children/${childId}/characters`);
}

/** Every profile belonging to the signed-in parent, oldest first. */
export function listChildren(
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<ChildProfileResponse[]>> {
  return apiFetch<ChildProfileResponse[]>("/api/children", {
    onColdStart: options.onColdStart,
  });
}

export function createChild(
  values: ChildProfileCreate,
): Promise<ApiResult<ChildProfileResponse>> {
  return apiFetch<ChildProfileResponse>("/api/children", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export function updateChild(
  id: string,
  values: ChildProfileUpdate,
): Promise<ApiResult<ChildProfileResponse>> {
  return apiFetch<ChildProfileResponse>(`/api/children/${id}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
}

export function deleteChild(id: string): Promise<ApiResult<{ deleted: true }>> {
  return apiFetch(`/api/children/${id}`, { method: "DELETE" });
}

/**
 * Points the session at a child, which is what makes `/api/content/*` answer
 * (FR-AUTH-06).
 */
export function activateChild(
  id: string,
): Promise<ApiResult<{ activeChildProfileId: string }>> {
  // Points the session at a child — writing the same id twice is the same
  // outcome, so a dropped response is safe to retry.
  return apiFetch(`/api/children/${id}/activate`, {
    method: "POST",
    isIdempotent: true,
  });
}
