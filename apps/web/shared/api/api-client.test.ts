import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, RETRY_BACKOFF_MS, signOut } from "./api-client";

/**
 * `fetch` is the only thing stubbed here — the envelope handling, the retry
 * schedule and the cold-start signal are the behaviour under test, so nothing
 * about them is mocked.
 */
function stubFetch(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (next === undefined)
      throw new Error("fetch called more times than stubbed");
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("unwraps the success envelope into the data payload", async () => {
    stubFetch(jsonResponse(200, { data: { id: "child_1", name: "Mim" } }));

    const result = await apiFetch<{ id: string; name: string }>(
      "/api/children/child_1",
    );

    expect(result).toEqual({ ok: true, data: { id: "child_1", name: "Mim" } });
  });

  it("prefixes the path with NEXT_PUBLIC_API_URL and sends session cookies", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.kidlearn.test");
    const fetchMock = stubFetch(jsonResponse(200, { data: null }));

    await apiFetch("/api/health");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.kidlearn.test/api/health");
    expect(init?.credentials).toBe("include");
  });

  it("sets a JSON content type for a string body", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: null }));

    await apiFetch("/api/children", {
      method: "POST",
      body: JSON.stringify({ name: "Mim" }),
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("returns the server error code so callers can branch on it", async () => {
    const fetchMock = stubFetch(
      jsonResponse(403, {
        error: { code: "CONSENT_REQUIRED", message: "Consent required" },
      }),
    );

    const result = await apiFetch("/api/children");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONSENT_REQUIRED",
        message: "Consent required",
        status: 403,
      },
    });
    // A 4xx is the server's answer, not a hiccup — it must not be retried.
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries a 503 and resolves once the server has woken up", async () => {
    const fetchMock = stubFetch(
      jsonResponse(503, { error: { code: "INTERNAL", message: "starting" } }),
      jsonResponse(200, { data: { status: "ok" } }),
    );
    const onColdStart = vi.fn();

    const pending = apiFetch<{ status: string }>("/api/health", {
      onColdStart,
    });
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]);

    await expect(pending).resolves.toEqual({
      ok: true,
      data: { status: "ok" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fires onColdStart once, before the first retry", async () => {
    stubFetch(
      new TypeError("Failed to fetch"),
      new TypeError("Failed to fetch"),
      jsonResponse(200, { data: { status: "ok" } }),
    );
    const onColdStart = vi.fn();

    const pending = apiFetch("/api/health", { onColdStart });
    await vi.advanceTimersByTimeAsync(0);
    expect(onColdStart).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(
      RETRY_BACKOFF_MS[0] + RETRY_BACKOFF_MS[1],
    );
    await pending;
    expect(onColdStart).toHaveBeenCalledOnce();
  });

  it("gives up after the configured retries and reports a network failure", async () => {
    const fetchMock = stubFetch(
      new TypeError("Failed to fetch"),
      new TypeError("Failed to fetch"),
      new TypeError("Failed to fetch"),
    );

    const pending = apiFetch("/api/health");
    await vi.advanceTimersByTimeAsync(
      RETRY_BACKOFF_MS[0] + RETRY_BACKOFF_MS[1],
    );
    const result = await pending;

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.error.code).toBe("NETWORK_ERROR");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honours a retries override of 0", async () => {
    const fetchMock = stubFetch(new TypeError("Failed to fetch"));

    const result = await apiFetch("/api/health", { retries: 0 });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never retries a POST — the write may already have landed", async () => {
    // The regression this pins. Every method used to retry a dropped connection
    // and a 5xx, so `POST /api/children` that committed before the response was
    // lost was sent again and made a second child profile. A dropped response is
    // indistinguishable from a dropped request here, so the safe reading is that
    // the write happened.
    const fetchMock = stubFetch(new TypeError("Failed to fetch"));

    const result = await apiFetch("/api/children", {
      method: "POST",
      body: JSON.stringify({ firstName: "Ava" }),
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never retries a POST on a 5xx either", async () => {
    const fetchMock = stubFetch(
      jsonResponse(503, { error: { code: "INTERNAL", message: "starting" } }),
      jsonResponse(200, { data: { id: "child_1" } }),
    );

    const result = await apiFetch("/api/children", { method: "POST" });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries a POST that opts in with isIdempotent", async () => {
    const fetchMock = stubFetch(
      new TypeError("Failed to fetch"),
      jsonResponse(200, { data: { recorded: true } }),
    );

    const pending = apiFetch("/api/progress/lessons/lesson_1/complete", {
      method: "POST",
      isIdempotent: true,
    });
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]);

    await expect(pending).resolves.toEqual({
      ok: true,
      data: { recorded: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a DELETE without an opt-in — the method is idempotent already", async () => {
    const fetchMock = stubFetch(
      new TypeError("Failed to fetch"),
      jsonResponse(200, { data: { deleted: true } }),
    );

    const pending = apiFetch("/api/children/child_1", { method: "DELETE" });
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]);

    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a malformed body rather than handing back undefined data", async () => {
    stubFetch(jsonResponse(200, { child: { id: "child_1" } }));

    const result = await apiFetch("/api/children/child_1");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "MALFORMED_RESPONSE",
        message: expect.stringContaining("envelope"),
        status: 200,
      },
    });
  });

  it("treats a 204 as a successful empty response", async () => {
    stubFetch(new Response(null, { status: 204 }));

    const result = await apiFetch<undefined>("/api/children/child_1", {
      method: "DELETE",
    });

    expect(result).toEqual({ ok: true, data: undefined });
  });
});

describe("signOut", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports success only when the server confirms the revocation", async () => {
    stubFetch(jsonResponse(200, {}));

    await expect(signOut()).resolves.toBe(true);
  });

  it("reports failure on a server error, because the cookie is still live", async () => {
    stubFetch(jsonResponse(500, {}));

    // The caller must not navigate on this: `resolveParentRedirect` sends a
    // still-signed-in parent from the login page straight back to the dashboard,
    // so a silent `true` here would look like a sign-out that did nothing.
    await expect(signOut()).resolves.toBe(false);
  });

  it("reports failure when the request never reached the server", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    await expect(signOut()).resolves.toBe(false);
  });
});
