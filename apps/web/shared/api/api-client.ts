import type { ErrorCode } from "@kidlearn/types";

// The single door to `apps/server`.

const DEFAULT_API_URL = "http://localhost:4000";
const DEFAULT_RETRIES = 2;

/** Waits between retries. Attempt n uses index n-1, clamped to the last entry. */
export const RETRY_BACKOFF_MS = [1500, 4000] as const;

/**
 * Failures that never reached the server, so they have no server-issued code.
 * Kept disjoint from `ErrorCode` so a client cannot confuse "the API said no"
 * with "the API did not answer".
 */
export const CLIENT_ERROR_CODES = [
  "NETWORK_ERROR",
  "MALFORMED_RESPONSE",
] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type ApiErrorCode = ErrorCode | ClientErrorCode;

export interface ApiFailure {
  code: ApiErrorCode;
  message: string;
  /** HTTP status; absent when the request never got a response at all. */
  status?: number;
  /** Whatever the server attached — `ZodError.flatten()` on a 400, and so on. */
  details?: unknown;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure };

export interface ApiFetchInit extends RequestInit {
  /** Extra attempts after the first. Default 2 → 3 requests worst case. */
  retries?: number;
  /** Fired once, before the first retry, so the UI can show a waking-up state. */
  onColdStart?: () => void;
  /**
   * Opts a `POST` back into retrying. Set it only where a second identical
   * request provably changes nothing — `POST /progress/lessons/:id/step` upserts
   * a step that never moves backwards, so it qualifies; `POST /children` creates
   * a row, so it does not. Ignored for methods that are idempotent anyway.
   */
  isIdempotent?: boolean;
}

/** Base URL of `apps/server`. Overridden per environment at build time. */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
}

export async function apiFetch<T>(
  path: string,
  init: ApiFetchInit = {},
): Promise<ApiResult<T>> {
  const {
    retries = DEFAULT_RETRIES,
    onColdStart,
    isIdempotent = false,
    ...requestInit
  } = init;
  const canRetry = isIdempotent || isIdempotentMethod(requestInit);
  const url = `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  let hasSignalledColdStart = false;
  let lastFailure: ApiFailure = {
    code: "NETWORK_ERROR",
    message: "The request was never attempted.",
  };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      if (!hasSignalledColdStart) {
        hasSignalledColdStart = true;
        onColdStart?.();
      }
      await sleep(backoffFor(attempt));
    }

    const outcome = await attemptRequest<T>(url, requestInit, canRetry);
    if (outcome.kind === "settled") return outcome.result;
    lastFailure = outcome.failure;
  }

  return { ok: false, error: lastFailure };
}

type Attempt<T> =
  | { kind: "settled"; result: ApiResult<T> }
  | { kind: "retryable"; failure: ApiFailure };

/**
 * Methods a retry cannot duplicate anything with. `POST` is deliberately absent:
 * a `POST` that reached the server and committed before the connection dropped
 * looks identical, from here, to one that never arrived — and sending it again
 * creates a second row. `createChild` made two child profiles that way.
 *
 * A `POST` whose endpoint really is idempotent opts back in with `isIdempotent`.
 * That is the right default direction: forgetting to opt in costs one failed
 * request the caller can see and report, and forgetting to opt out costs a
 * duplicate nobody notices.
 */
const IDEMPOTENT_METHODS: readonly string[] = ["GET", "HEAD", "PUT", "DELETE"];

function isIdempotentMethod(requestInit: RequestInit): boolean {
  return IDEMPOTENT_METHODS.includes(
    (requestInit.method ?? "GET").toUpperCase(),
  );
}

async function attemptRequest<T>(
  url: string,
  requestInit: RequestInit,
  canRetry: boolean,
): Promise<Attempt<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      // The session cookie is set by better-auth on the API origin.
      credentials: "include",
      headers: buildHeaders(requestInit),
    });
  } catch {
    const failure: ApiFailure = {
      code: "NETWORK_ERROR",
      message: `Could not reach ${url}.`,
    };
    // The request may well have arrived and committed — a dropped response is
    // indistinguishable from a dropped request here.
    return canRetry
      ? { kind: "retryable", failure }
      : { kind: "settled", result: { ok: false, error: failure } };
  }

  if (response.status === 204) {
    // A no-content response has no envelope to unwrap; `T` is `undefined` here.
    return { kind: "settled", result: { ok: true, data: undefined as T } };
  }

  const body = await readJson(response);

  if (!response.ok) {
    const failure = toFailure(response.status, body);
    // 5xx is the cold-start signature; 4xx is a decision and stands. A 5xx on a
    // non-idempotent method is not retried for the same reason a dropped
    // connection is not: the write may already have landed before the handler
    // failed.
    return response.status >= 500 && canRetry
      ? { kind: "retryable", failure }
      : { kind: "settled", result: { ok: false, error: failure } };
  }

  if (!isSuccessEnvelope(body)) {
    return {
      kind: "settled",
      result: {
        ok: false,
        error: {
          code: "MALFORMED_RESPONSE",
          message: "Response body was not a { data } envelope.",
          status: response.status,
        },
      },
    };
  }

  // Verified external boundary: the payload is parsed JSON, and the shape is
  // guaranteed only by the OpenAPI contract the route tests assert against.
  return { kind: "settled", result: { ok: true, data: body.data as T } };
}

function backoffFor(attempt: number): number {
  const index = Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1);
  return RETRY_BACKOFF_MS[index];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(requestInit: RequestInit): Headers {
  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/json");
  // Only a serialised body implies JSON — FormData must keep its own boundary.
  if (typeof requestInit.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isSuccessEnvelope(body: unknown): body is { data: unknown } {
  return typeof body === "object" && body !== null && "data" in body;
}

function toFailure(status: number, body: unknown): ApiFailure {
  if (typeof body === "object" && body !== null && "error" in body) {
    const { error } = body as { error: unknown };
    if (typeof error === "object" && error !== null) {
      const { code, message, details } = error as Record<string, unknown>;
      if (typeof code === "string" && typeof message === "string") {
        // The server's own vocabulary — kept verbatim so callers can branch.
        return {
          code: code as ErrorCode,
          message,
          status,
          ...(details === undefined ? {} : { details }),
        };
      }
    }
  }

  // No envelope: the response came from something in front of the API (a proxy
  // or CDN error page), so the status is all there is to go on.
  return {
    code: STATUS_FALLBACK_CODES[status] ?? "INTERNAL",
    message: `Request failed with status ${status}.`,
    status,
  };
}

const STATUS_FALLBACK_CODES: Record<number, ErrorCode> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
};

/**
 * Revoke the session cookie. Bypasses `apiFetch` because better-auth answers
 * with its own body rather than kidlearn's envelope.
 *
 * Returns whether the server confirmed the revocation, and a caller must act on
 * a `false`: the cookie is still live, so navigating to the login page would
 * bounce straight back off `resolveParentRedirect`, which reads a signed-in
 * parent there as someone who has finished onboarding. Treating a failure as a
 * sign-out looks, from the parent's side, like the button did nothing.
 */
export async function signOut(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch {
    // Never reached the server, so the session is certainly still live.
    return false;
  }
}
