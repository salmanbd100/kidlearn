import type { ErrorCode } from "@kidlearn/types";

/**
 * The single door to `apps/server`.
 *
 * Two things it is deliberately responsible for:
 *
 *  - **Unwrapping the envelope.** Every route answers `{ data }` or
 *    `{ error: { code, message } }` (see `@kidlearn/types` → `api/envelope`).
 *    Callers get a discriminated `ApiResult` instead of a raw `Response`, so a
 *    forgotten `res.ok` check cannot render an error object as content.
 *  - **Surviving a cold start.** The API is deployed on a free tier that sleeps;
 *    the first request after idle either fails to connect or answers 5xx for a
 *    few seconds. Those are retried with backoff, and `onColdStart` lets the UI
 *    put the mascot on screen instead of an error (NFR-PERF-04).
 *
 * Never branch on `error.message` — it is a developer hint and may be reworded.
 * `error.code` is the contract: behind a single 403 sit `CONSENT_REQUIRED`,
 * `PIN_REQUIRED` and `PIN_VERIFICATION_REQUIRED`, which are three screens.
 */

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
}

/** Base URL of `apps/server`. Overridden per environment at build time. */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
}

export async function apiFetch<T>(
  path: string,
  init: ApiFetchInit = {},
): Promise<ApiResult<T>> {
  const { retries = DEFAULT_RETRIES, onColdStart, ...requestInit } = init;
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

    const outcome = await attemptRequest<T>(url, requestInit);
    if (outcome.kind === "settled") return outcome.result;
    lastFailure = outcome.failure;
  }

  return { ok: false, error: lastFailure };
}

type Attempt<T> =
  | { kind: "settled"; result: ApiResult<T> }
  | { kind: "retryable"; failure: ApiFailure };

async function attemptRequest<T>(
  url: string,
  requestInit: RequestInit,
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
    return {
      kind: "retryable",
      failure: {
        code: "NETWORK_ERROR",
        message: `Could not reach ${url}.`,
      },
    };
  }

  if (response.status === 204) {
    // A no-content response has no envelope to unwrap; `T` is `undefined` here.
    return { kind: "settled", result: { ok: true, data: undefined as T } };
  }

  const body = await readJson(response);

  if (!response.ok) {
    const failure = toFailure(response.status, body);
    // 5xx is the cold-start signature; 4xx is a decision and stands.
    return response.status >= 500
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
