import type { AdminIdentity, PlatformOverview } from "@kidlearn/types";
import {
  type ApiFetchInit,
  type ApiResult,
  apiBaseUrl,
  apiFetch,
  signOut,
} from "@/shared/api/api-client";

/** Who am I. `403` here means a signed-in *parent*, not a broken session. */
export function fetchAdminMe(
  init: ApiFetchInit = {},
): Promise<ApiResult<AdminIdentity>> {
  return apiFetch<AdminIdentity>("/api/admin/me", init);
}

export function fetchPlatformOverview(
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<PlatformOverview>> {
  return apiFetch<PlatformOverview>("/api/admin/analytics/overview", {
    onColdStart: options.onColdStart,
  });
}

export async function adminSignIn(
  email: string,
  password: string,
): Promise<{ ok: boolean }> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/sign-in/email`, {
      method: "POST",
      // better-auth sets the session cookie on the API origin, as in the parent flow.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    return { ok: response.ok };
  } catch {
    // Never reached the server; the caller shows the same line either way.
    return { ok: false };
  }
}

export const adminSignOut = signOut;
