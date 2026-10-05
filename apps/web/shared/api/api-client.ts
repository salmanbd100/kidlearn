import type { ErrorCode } from "@kidlearn/types";

const DEFAULT_API_URL = "http://localhost:4000";
const DEFAULT_RETRIES = 2;

/** Per attempt: on a stalled connection `fetch` neither resolves nor rejects, so without a ceiling no retry fires. */
export const DEFAULT_TIMEOUT_MS = 20_000;

export const RETRY_BACKOFF_MS = [1500, 4000] as const;

/** Failures that never reached the server; disjoint from `ErrorCode` so "API said no" differs from "API did not answer". */
export const CLIENT_ERROR_CODES = [
  "NETWORK_ERROR",
  "MALFORMED_RESPONSE",
] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type ApiErrorCode = ErrorCode | ClientErrorCode;

export interface ApiFailure {
  code: ApiErrorCode;
  message: string;
  status?: number;
  details?: unknown;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure };

export interface ApiFetchInit extends RequestInit {
  retries?: number;
  onColdStart?: () => void;
  timeoutMs?: number;
  /** Opts a `POST` back into retrying; only where a repeat provably changes nothing (the step upsert, not `POST /children`). */
  isIdempotent?: boolean;
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Fires on any `401` so the session owner notices an expiry, not whichever screen was fetching. Returns the unsubscribe. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

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
    timeoutMs = DEFAULT_TIMEOUT_MS,
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

    const outcome = await attemptRequest<T>(
      url,
      requestInit,
      canRetry,
      timeoutMs,
    );
    if (outcome.kind === "settled") {
      if (!outcome.result.ok && outcome.result.error.status === 401) {
        for (const listener of unauthorizedListeners) listener();
      }
      return outcome.result;
    }
    lastFailure = outcome.failure;
  }

  return { ok: false, error: lastFailure };
}

type Attempt<T> =
  | { kind: "settled"; result: ApiResult<T> }
  | { kind: "retryable"; failure: ApiFailure };

/**
 * Methods a retry cannot duplicate. `POST` is absent: a committed-then-dropped `POST` looks like one that
 * never arrived, and resending made two child profiles. Idempotent endpoints opt back in with `isIdempotent`.
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
  timeoutMs: number,
): Promise<Attempt<T>> {
  // `AbortSignal.timeout`/`any` are missing on older tablets, so the ceiling is our own controller
  // with the caller's signal forwarded onto it.
  const controller = new AbortController();
  let hasTimedOut = false;
  const timer = setTimeout(() => {
    hasTimedOut = true;
    controller.abort();
  }, timeoutMs);
  const callerSignal = requestInit.signal;
  const forwardAbort = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  callerSignal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    return await settleAttempt<T>(
      url,
      requestInit,
      canRetry,
      controller,
      () => hasTimedOut,
    );
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

async function settleAttempt<T>(
  url: string,
  requestInit: RequestInit,
  canRetry: boolean,
  controller: AbortController,
  hasTimedOut: () => boolean,
): Promise<Attempt<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      signal: controller.signal,
      // The session cookie is set by better-auth on the API origin.
      credentials: "include",
      headers: buildHeaders(requestInit),
    });
  } catch {
    const failure: ApiFailure = {
      code: "NETWORK_ERROR",
      message: hasTimedOut()
        ? `Timed out waiting for ${url}.`
        : `Could not reach ${url}.`,
    };
    // The request may well have arrived and committed — a dropped response is
    // indistinguishable from a dropped request here.
    return canRetry
      ? { kind: "retryable", failure }
      : { kind: "settled", result: { ok: false, error: failure } };
  }

  if (response.status === 204) {
    return { kind: "settled", result: { ok: true, data: undefined as T } };
  }

  const body = await readJson(response);

  if (!response.ok) {
    const failure = toFailure(response.status, body);
    // 5xx is the cold-start signature; 4xx stands. A 5xx on a non-idempotent method isn't retried: the write may have landed.
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
 * Revoke the session cookie, bypassing `apiFetch` (better-auth answers with its own body). Callers must act on
 * `false`: the cookie is still live, so going to login bounces back off `resolveParentRedirect`.
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
