import type {
  AvatarCharacterResponse,
  CharacterUnlockResponse,
  ChildProfileCreate,
  ChildProfileResponse,
  ChildProfileUpdate,
  GateStatusResponse,
  ParentSummaryResponse,
} from "@kidlearn/types";
import { CONSENT_VERSION } from "@kidlearn/types";
import { type ApiResult, apiBaseUrl, apiFetch } from "./api-client";

/**
 * Typed wrappers over the parent-facing API.
 *
 * Every response type is imported from `@kidlearn/types` — the same schema the
 * route tests assert the real body against — so no shape is redeclared here
 * (`backend.md §7`). What this module adds on top of `apiFetch` is one place where
 * each path and method is written down, so a route rename is one edit rather than
 * a search through components.
 *
 * These run in the browser, not on the Next server. That is forced, not chosen:
 * the session cookie belongs to the API origin, so a Server Component fetching
 * `/api/auth/me` would send no credentials and get a 401. See the note in
 * `app/(parent)/ParentSessionGate.tsx`.
 */

export type AuthMe = {
  parent: ParentSummaryResponse;
  activeChildProfileId: string | null;
};

/** Who am I. Also what provisions the `Parent` row on a brand-new account. */
export function fetchAuthMe(): Promise<ApiResult<AuthMe>> {
  return apiFetch<AuthMe>("/api/auth/me");
}

/** Is the parent area open right now (FR-AUTH-04). */
export function fetchGateStatus(): Promise<ApiResult<GateStatusResponse>> {
  return apiFetch<GateStatusResponse>("/api/parent/gate-status");
}

/**
 * Where the browser goes to start the Google round-trip (FR-AUTH-02).
 *
 * A plain URL for an `<a href>`, not a fetch: the flow is a series of
 * cross-origin redirects, so it has to be a real navigation. The server owns the
 * post-login destination (`PARENT_POST_LOGIN_PATH`), which is why no callback URL
 * is passed from here.
 */
export function googleSignInUrl(): string {
  return `${apiBaseUrl()}/api/auth/google`;
}

/**
 * Records COPPA consent (FR-AUTH-03).
 *
 * `version` is sent, and the server rejects anything but the current one with a
 * `409` — that is the mechanism for re-consenting when the text changes. It is a
 * shared constant rather than a client guess so the version recorded always names
 * the text the parent actually read.
 */
export function submitConsent(): Promise<ApiResult<unknown>> {
  return apiFetch("/api/parent/consent", {
    method: "POST",
    body: JSON.stringify({ accepted: true, version: CONSENT_VERSION }),
  });
}

/**
 * Sets the first PIN. Changing an existing one needs `currentPin` (file 29).
 *
 * Answers with the grant the write opened, so the caller must hand it to
 * `useParentGate().unlock` — the very next onboarding screen is PIN-gated on the
 * server (`POST /api/children`), and a client that discarded this expiry would
 * show the PIN pad one screen after the parent chose their PIN.
 */
export function setPin(
  pin: string,
): Promise<ApiResult<{ hasPin: true; pinVerifiedUntil: string }>> {
  return apiFetch("/api/parent/pin", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

/** Opens the 15-minute parent-area grant on this session. */
export function verifyPin(
  pin: string,
): Promise<ApiResult<{ pinVerifiedUntil: string }>> {
  return apiFetch("/api/parent/pin/verify", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

/** The starter avatars a profile may wear. Ids are `Character` row ids. */
export function listAvatars(): Promise<ApiResult<AvatarCharacterResponse[]>> {
  return apiFetch<AvatarCharacterResponse[]>("/api/characters");
}

/**
 * FR-GAM-05 — the avatars for one existing child, locked ones included.
 *
 * `listAvatars` above cannot answer this: it lists the starter set with no child
 * in scope, so a character this child has *earned* never appears in it, while
 * `PATCH /api/children/{id}` would have accepted it. The edit form uses this one
 * and the create form uses that one, because a profile that does not exist yet
 * has nothing unlocked to show.
 */
export function listChildCharacters(
  childId: string,
): Promise<ApiResult<{ characters: CharacterUnlockResponse[] }>> {
  return apiFetch(`/api/children/${childId}/characters`);
}

/**
 * Every profile belonging to the signed-in parent, oldest first.
 *
 * `onColdStart` is optional because only one caller needs it: `/select-profile`
 * is often the first request a device makes after the API has been idle, and a
 * child waiting on it should see the mascot waking up rather than a blank screen
 * (NFR-PERF-04).
 */
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
 *
 * Deliberately not PIN-gated, on the server as well as here: a five-year-old
 * handing the tablet to a sibling must not meet a parental gate, and the switch
 * can only ever land on a profile the already-authenticated parent owns. The PIN
 * guards `/parent/*`, not who is playing.
 */
export function activateChild(
  id: string,
): Promise<ApiResult<{ activeChildProfileId: string }>> {
  return apiFetch(`/api/children/${id}/activate`, { method: "POST" });
}
