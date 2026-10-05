import type { AdminIdentity, PlatformOverview } from "@kidlearn/types";
import {
  type ApiResult,
  apiBaseUrl,
  apiFetch,
  signOut,
} from "@/shared/api/api-client";

/**
 * The CMS's own session and its overview counters, plus the two better-auth
 * calls it makes. The rest of `/api/admin/*` is split by resource, as the
 * server's routes are: `content-api`, `editors-api`, `media-api`, `ai-api`.
 */

/** Who am I. `403` here means a signed-in *parent*, not a broken session. */
export function fetchAdminMe(): Promise<ApiResult<AdminIdentity>> {
  return apiFetch<AdminIdentity>("/api/admin/me");
}

/** The four platform counters (FR-CMS-07, basic tier). */
export function fetchPlatformOverview(
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<PlatformOverview>> {
  return apiFetch<PlatformOverview>("/api/admin/analytics/overview", {
    onColdStart: options.onColdStart,
  });
}

/** Sign in with email and password — the only password login in the product. */
export async function adminSignIn(
  email: string,
  password: string,
): Promise<{ ok: boolean }> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/sign-in/email`, {
      method: "POST",
      // The session cookie is set by better-auth on the API origin, matching the
      // parent flow.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    return { ok: response.ok };
  } catch {
    // Never reached the server — the caller shows the same "check your details"
    // line either way, because there is nothing an admin can do differently.
    return { ok: false };
  }
}

/** Revoke the session. One endpoint serves both principals (file 29). */
export const adminSignOut = signOut;
