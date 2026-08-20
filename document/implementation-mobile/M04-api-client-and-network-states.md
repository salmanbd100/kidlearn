# M04 — API Client & Network States

> **Estimated effort:** 3–4 hours
> **Depends on:** M01
> **Requirement IDs:** spec §7.3, NFR-PERF-04, NFR-SAFE-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build `apps/mobile`'s single door to `apps/server`: a typed `apiFetch` that unwraps the `{ data } | { error }` envelope into a discriminated `ApiResult`, retries the free-tier cold start with backoff and signals it to the UI, distinguishes "no internet" from "server waking up", and types every response from `@kidlearn/types` rather than a hand-written interface. This is the file every later screen depends on, so it ships with tests and a real device check against a running server — not a mock.

## Context & Current State

- `apps/web/lib/api-client.ts` is the reference implementation and should be read in full before starting. Its shape is deliberate and is being reproduced, not redesigned:
  - `ApiResult<T>` = `{ ok: true; data: T } | { ok: false; error: ApiFailure }`.
  - `ApiFailure` = `{ code: ApiErrorCode; message: string; status?: number; details?: unknown }`.
  - `CLIENT_ERROR_CODES = ["NETWORK_ERROR", "MALFORMED_RESPONSE"]`, kept disjoint from the server's `ErrorCode` so "the API said no" is never confused with "the API did not answer".
  - `RETRY_BACKOFF_MS = [1500, 4000]`, two retries by default; **5xx and connection failures retry, 4xx settles immediately** (a 4xx is a decision, not a hiccup).
  - `204` short-circuits to `{ ok: true, data: undefined }` — there is no envelope to unwrap.
  - `onColdStart` fires once, before the first retry, so the UI can show the "mascot waking up" state (NFR-PERF-04).
- Every server route answers that envelope (`apps/server/src/lib/errors.ts`); response shapes live in `packages/types/src/api/` and are asserted in the route tests with `assertContract`. The mobile client therefore does not need runtime validation of every field — but see requirement 6 for where it does.
- Error codes are the contract, messages are developer hints. `apps/web/lib/api-client.ts` says it plainly: behind a single 403 sit `CONSENT_REQUIRED`, `PIN_REQUIRED` and `PIN_VERIFICATION_REQUIRED`, which are three different screens.
- **The one real difference from web:** `credentials: "include"` does nothing on React Native. The session cookie lives in SecureStore and is attached by the better-auth Expo client (M07). This file is written so that M07 can inject that behaviour without any screen changing.
- `lib/env.ts` (M01) exports `API_BASE_URL`.

## Detailed Requirements

1. **`lib/api-client.ts`** exporting `apiFetch<T>(path, init?)`, `ApiResult`, `ApiFailure`, `ApiErrorCode`, `CLIENT_ERROR_CODES`, `RETRY_BACKOFF_MS` and `apiBaseUrl()`. Names match the web app's deliberately: a developer moving between the two clients should not have to relearn the vocabulary.
2. **Behavioural parity with web.** Same envelope unwrapping, same retry policy (5xx and connection errors retry; 4xx settles), same `204` handling, same `onColdStart` semantics, same "never branch on `error.message`" rule stated in the file header.
3. **Pluggable auth header.** A module-level `setAuthHeaderProvider(fn: () => Promise<Record<string, string>>)` that `apiFetch` awaits on every request and merges into headers. M07 registers the better-auth cookie provider here. Default is a provider returning `{}` so this file is testable and usable before auth exists.
4. **Timeouts.** Every request gets an `AbortController` timeout (default 15s, overridable per call). A phone on a bad mobile network will otherwise hang a screen indefinitely — the web app gets away without this because browsers impose their own.
5. **Offline detection.** `lib/network.ts` wrapping `@react-native-community/netinfo` and exporting `useIsOnline()` plus `isOnline()`. `apiFetch` does **not** refuse to send when offline (the check can be stale, and a queued request may still succeed) — but it maps a connection failure while `isOnline()` is false to a `NETWORK_ERROR` whose message the UI shows as "no internet" rather than "server waking up".
6. **Response parsing where it earns its keep.** Do not Zod-parse every response — the contract is already tested server-side. Parse with `@kidlearn/types` schemas at exactly two boundaries: **content payloads** (`ActivityDefinitionSchema`, `QuizQuestionSchema` and their containers), because those are versioned JSONB authored by the AI pipeline and a malformed payload must fail as a friendly "this activity is unavailable" rather than a crash mid-lesson; and **anything used for a gate decision**. Expose a `parseWith` helper so a caller opts in:
   `apiFetch<LessonDetailResponse>("/api/content/lessons/x", { parseWith: LessonDetailSchema })`.
7. **Network state UI.** `components/NetworkStates.tsx` exporting `ColdStartNotice` (mascot + "waking up" copy) and `OfflineNotice`, both localised through `@kidlearn/i18n` namespaces, both usable inside either theme. Kid-surface copy stays 1–4 words with an icon (design.md §10); parent copy is a calm sentence.
8. **A hook, so screens are not full of `useEffect`.** `lib/use-api.ts` exporting `useApi<T>(fetcher, deps)` returning `{ data, error, isLoading, isColdStart, refetch }`. Every list and detail screen from M09 onwards uses it, which is what keeps cold-start and offline handling consistent instead of per-screen.
9. **No secrets, no PII in logs.** `console` calls are stripped from this file entirely (`document/standards/general.md`); errors surface through `ApiResult`, not logs. A child's name must never reach a log line (NFR-SAFE-02).
10. **Tests** (`lib/api-client.test.ts`, `lib/use-api.test.tsx`) with `global.fetch` mocked: success unwrap; 4xx settles with the server's `code` and does not retry; 5xx retries twice then fails, firing `onColdStart` exactly once; connection failure retries; `204` returns `undefined`; malformed body yields `MALFORMED_RESPONSE`; the auth-header provider's headers are sent; a timeout produces `NETWORK_ERROR`; `parseWith` failure yields `MALFORMED_RESPONSE`; `useApi` exposes `isColdStart` and `refetch` re-runs.

## Technical Approach & Suggestions

```
apps/mobile/lib/api-client.ts         # apiFetch + types (port of apps/web/lib/api-client.ts)
apps/mobile/lib/api-client.test.ts
apps/mobile/lib/network.ts            # NetInfo wrapper: isOnline(), useIsOnline()
apps/mobile/lib/use-api.ts            # useApi<T>() — loading / error / cold-start / refetch
apps/mobile/lib/use-api.test.tsx
apps/mobile/components/NetworkStates.tsx
```

Start by copying `apps/web/lib/api-client.ts` verbatim, then make exactly these four changes — the diff being small is the point:

```ts
// 1. Base URL comes from Expo's env, not Next's.
import { API_BASE_URL } from "./env";
export function apiBaseUrl(): string {
  return API_BASE_URL;
}

// 2. The cookie is not ambient on native. A provider supplies it (M07 registers
//    better-auth's); until then this returns {} and everything still typechecks.
type AuthHeaderProvider = () => Promise<Record<string, string>>;
let authHeaderProvider: AuthHeaderProvider = async () => ({});
export function setAuthHeaderProvider(provider: AuthHeaderProvider): void {
  authHeaderProvider = provider;
}

// 3. Requests get an explicit deadline.
const DEFAULT_TIMEOUT_MS = 15_000;

// 4. Optional schema parsing at the content boundary.
export interface ApiFetchInit extends RequestInit {
  retries?: number;
  onColdStart?: () => void;
  timeoutMs?: number;
  parseWith?: { safeParse: (value: unknown) => { success: boolean } };
}
```

The request itself, with the two additions folded in:

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  response = await fetch(url, {
    ...requestInit,
    signal: controller.signal,
    headers: buildHeaders(requestInit, await authHeaderProvider()),
  });
} catch {
  // AbortError and a dead socket are both "no answer" — retryable either way.
  return {
    kind: "retryable",
    failure: {
      code: "NETWORK_ERROR",
      message: (await isOnline())
        ? `Could not reach ${url}.`
        : "This device is offline.",
    },
  };
} finally {
  clearTimeout(timer);
}
```

`useApi` keeps the cold-start signal where the UI can see it:

```ts
export function useApi<T>(fetcher: (init: ApiFetchInit) => Promise<ApiResult<T>>, deps: unknown[]) {
  const [state, setState] = useState<{
    data?: T; error?: ApiFailure; isLoading: boolean; isColdStart: boolean;
  }>({ isLoading: true, isColdStart: false });

  const run = useCallback(async () => {
    setState({ isLoading: true, isColdStart: false });
    const result = await fetcher({ onColdStart: () => setState((s) => ({ ...s, isColdStart: true })) });
    setState(result.ok
      ? { data: result.data, isLoading: false, isColdStart: false }
      : { error: result.error, isLoading: false, isColdStart: false });
  }, deps);

  useEffect(() => { void run(); }, [run]);
  return { ...state, refetch: run };
}
```

Test the retry timing with Jest's fake timers rather than real 1.5s/4s waits, or the suite becomes slow enough that people stop running it.

## Step-by-Step Plan

1. Read `apps/web/lib/api-client.ts` end to end. Copy it into `apps/mobile/lib/api-client.ts` and get `pnpm --filter mobile typecheck` green with no behaviour changes. (~25 min)
2. Write the failing tests for the ported behaviour (success, 4xx no-retry, 5xx retry + single `onColdStart`, `204`, malformed body) and make them pass. (~40 min)
3. Add `setAuthHeaderProvider` and the header merge; test that provided headers are sent and that the default provider changes nothing. (~20 min)
4. Add the abort-controller timeout; test that a never-resolving fetch produces `NETWORK_ERROR` under fake timers. (~20 min)
5. Add `lib/network.ts` (NetInfo) and make the offline message branch; test both messages. (~25 min)
6. Add `parseWith` and test that a payload failing `ActivityDefinitionSchema` yields `MALFORMED_RESPONSE` rather than resolving. (~25 min)
7. Write `lib/use-api.ts` + its test (loading → data, `isColdStart` propagation, `refetch`). (~30 min)
8. Build `components/NetworkStates.tsx` with localised copy in both namespaces; render both states on the placeholder screen with the server stopped, and on a device with wifi off. (~30 min)
9. Device check against the real server: start `pnpm --filter server dev`, point `EXPO_PUBLIC_API_URL` at the LAN IP, and confirm `GET /health` succeeds from the phone. Then stop the server mid-request and confirm the cold-start notice appears. (~20 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `apiFetch` returns the same `ApiResult` shape and the same `ApiFailure` codes as `apps/web/lib/api-client.ts` for equivalent inputs — including `NETWORK_ERROR` and `MALFORMED_RESPONSE` as client-only codes.
- [ ] 5xx and connection failures retry with `[1500, 4000]` backoff and fire `onColdStart` exactly once; 4xx never retries.
- [ ] A `204` response yields `{ ok: true, data: undefined }`; a non-envelope body yields `MALFORMED_RESPONSE`.
- [ ] A request that never answers aborts at the timeout and surfaces `NETWORK_ERROR` — no screen can hang indefinitely.
- [ ] With wifi off, the failure message identifies the device as offline; with wifi on and the server down, it identifies the server as unreachable, and `OfflineNotice` / `ColdStartNotice` render accordingly in both languages.
- [ ] `setAuthHeaderProvider` is the only mechanism by which auth headers reach a request — no screen sets a cookie or token header itself.
- [ ] `parseWith` rejects a malformed activity payload with `MALFORMED_RESPONSE`.
- [ ] `GET /health` succeeds from a **physical device** against the dev server over the LAN.
- [ ] No `console.*` call remains in `lib/api-client.ts`, and no log line anywhere contains a child's name.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Attaching the actual session cookie — M07 registers the provider this file defines.
- Per-resource API modules (`children-api`, `content-api`, …). Each arrives with the screen that needs it, mirroring how `apps/web/lib/*-api.ts` grew.
- Request caching, deduplication or a data-fetching library (React Query / SWR). `useApi` plus the server's own caching is enough at MVP; adding a cache layer before there is a measured problem buys complexity, not speed.
- Offline queueing of writes. Out of scope for the whole project per `document/mobile-app-plan.md` §3.2.
- Crash/error reporting — M29.
