import type {
  AdminIdentity,
  AdminLesson,
  AdminSubject,
  AdminTopic,
  AdminWorld,
  ContentResourceName,
  ContentStatusValue,
  OrderableContentResourceName,
  PlatformOverview,
  ReorderedIds,
} from "@kidlearn/types";
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

// --- Curriculum CMS (file 32, FR-CURR-04, FR-CMS-01, FR-CMS-06) -----------

/**
 * `/api/admin/content/*`. Every payload type comes from `@kidlearn/types` — the
 * same schemas the route tests assert real bodies against — so the CMS cannot
 * drift from the server by redeclaring a shape (`backend.md §7`).
 *
 * There is **no `updateStatus`** here, deliberately, and no wrapper that takes a
 * status alongside other fields. Status moves through `transitionContent` and
 * nothing else, mirroring the server, where an edit body carrying `status` is a
 * `400`. A convenience wrapper that hid the distinction on the client is how a
 * caller ends up believing an edit can publish.
 */

const CONTENT_BASE = "/api/admin/content";

type ListOptions = { includeArchived?: boolean };

function listQuery(
  options: ListOptions & Record<string, string | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === false) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * `onColdStart` is offered on this one call only. The CMS fetches all four lists
 * together on mount, so one of them is enough to notice the API waking up
 * (NFR-PERF-04) — wiring it to all four would fire the same message four times.
 */
export function fetchWorlds(
  options: ListOptions & { onColdStart?: () => void } = {},
): Promise<ApiResult<AdminWorld[]>> {
  const { onColdStart, ...query } = options;
  return apiFetch<AdminWorld[]>(`${CONTENT_BASE}/worlds${listQuery(query)}`, {
    onColdStart,
  });
}

export function fetchSubjects(
  options: ListOptions = {},
): Promise<ApiResult<AdminSubject[]>> {
  return apiFetch<AdminSubject[]>(
    `${CONTENT_BASE}/subjects${listQuery(options)}`,
  );
}

export function fetchTopics(
  options: ListOptions & { subjectId?: string } = {},
): Promise<ApiResult<AdminTopic[]>> {
  return apiFetch<AdminTopic[]>(`${CONTENT_BASE}/topics${listQuery(options)}`);
}

export function fetchLessons(
  options: ListOptions & { topicId?: string } = {},
): Promise<ApiResult<AdminLesson[]>> {
  return apiFetch<AdminLesson[]>(
    `${CONTENT_BASE}/lessons${listQuery(options)}`,
  );
}

/** Everything a create or edit body may carry. The server validates it. */
export type ContentDraft = Record<string, unknown>;

export function createContent<TResult>(
  resource: ContentResourceName,
  body: ContentDraft,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateContent<TResult>(
  resource: ContentResourceName,
  id: string,
  body: ContentDraft,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * The single door to a status change, matching the server.
 *
 * `retries: 0`, unlike every other call here. `apiFetch` retries a 5xx because
 * the API sleeps on its free tier, but a transition is not idempotent in the way
 * a read is: the first attempt may have succeeded and only its response been
 * lost, and the replay would then be judged against the status the first one
 * wrote and fail with a confusing `409`. One attempt, and the admin retries
 * deliberately.
 */
export function transitionContent<TResult>(
  resource: ContentResourceName,
  id: string,
  to: ContentStatusValue,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}/${id}/transition`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ to }),
  });
}

/**
 * Persists a whole sibling set's order. `orderedIds` must be exactly the
 * siblings the list is showing — the server rejects anything else rather than
 * applying it partially.
 *
 * `includeArchived` is therefore not optional decoration: it tells the server
 * which sibling set the payload is claiming to be, and has to match the flag the
 * list was fetched with. Omit it on a tree that hides archived rows and the
 * archived ids are neither expected nor sent; pass it on one that shows them and
 * they are ordered along with everything else.
 */
export function reorderContent(
  resource: OrderableContentResourceName,
  orderedIds: string[],
  parentId?: string,
  includeArchived?: boolean,
): Promise<ApiResult<ReorderedIds>> {
  return apiFetch<ReorderedIds>(`${CONTENT_BASE}/${resource}/reorder`, {
    method: "PATCH",
    retries: 0,
    body: JSON.stringify({
      orderedIds,
      ...(parentId ? { parentId } : {}),
      ...(includeArchived ? { includeArchived } : {}),
    }),
  });
}
