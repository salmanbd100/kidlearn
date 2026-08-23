import type { AdminIdentity, PlatformOverview } from "@kidlearn/types";
import { type ApiResult, apiBaseUrl, apiFetch } from "./api-client";

/**
 * Typed wrappers over `/api/admin/*` and the two better-auth calls the CMS makes.
 *
 * Every response type is imported from `@kidlearn/types` — the same schema the
 * route tests assert real bodies against — so no shape is redeclared here
 * (`backend.md §7`). Files 32–37 extend this module rather than calling `apiFetch`
 * from a component.
 *
 * These run in the browser, not on the Next server, for the same reason
 * `parent-api.ts` does: the session cookie belongs to the API origin, so a Server
 * Component fetching `/api/admin/me` would send no credentials and get a 401.
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

/**
 * Sign in with email and password — the only password login in the product.
 *
 * **Deliberately not `apiFetch`.** better-auth's endpoints answer with their own
 * bodies (`{ token, user }`, `{ success }`), not kidlearn's `{ data }` envelope, so
 * `apiFetch` would unwrap nothing and report `MALFORMED_RESPONSE` on a successful
 * sign-in. The retry behaviour is unwanted here too: replaying a rejected password
 * three times is how an account gets locked out once file 38 adds rate limiting.
 *
 * A wrong password and an unknown email both surface as `false` because the server
 * makes them indistinguishable on purpose — telling them apart would confirm which
 * addresses belong to administrators.
 */
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

/**
 * Revoke the session. Same reasoning as `adminSignIn` for bypassing `apiFetch`.
 *
 * Resolves rather than throws on failure: the caller navigates to the login screen
 * regardless, and a failed sign-out that left the admin looking at the CMS would be
 * worse than one that sent them to a page their stale cookie cannot open.
 */
export async function adminSignOut(): Promise<void> {
  try {
    await fetch(`${apiBaseUrl()}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    // Intentionally swallowed — see above.
  }
}
