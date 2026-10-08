# M04 — API Client & Network States

> **Estimated effort:** 3–4 hours
> **Depends on:** M01
> **Requirement IDs:** spec §7.3, NFR-PERF-04, NFR-SAFE-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build `apps/mobile`'s single door to `apps/server`: a typed `apiFetch` that unwraps the `{ data } | { error }` envelope into a discriminated `ApiResult`, retries a cold or flaky backend with backoff and signals it to the UI, distinguishes "no internet" from "server waking up", raises the session-wide outcomes (401, 403 `CONSENT_REQUIRED`, other 403s, 423, 429) to one listener each instead of leaving every screen to rediscover them, and types every response from `@kidlearn/types` rather than a hand-written interface. This is the file every later screen depends on, so it ships with tests and a real device check against a running server — not a mock.

## Context & Current State

- `apps/web/shared/api/api-client.ts` is the reference implementation and should be read in full before starting. Its shape is deliberate and is being reproduced, not redesigned:
  - `ApiResult<T>` = `{ ok: true; data: T } | { ok: false; error: ApiFailure }`.
  - `ApiFailure` = `{ code: ApiErrorCode; message: string; status?: number; details?: unknown }`.
  - `CLIENT_ERROR_CODES = ["NETWORK_ERROR", "MALFORMED_RESPONSE"]`, kept disjoint from the server's `ErrorCode` so "the API said no" is never confused with "the API did not answer".
  - `RETRY_BACKOFF_MS = [1500, 4000]`, two retries by default; **5xx and connection failures retry, every 4xx settles immediately** — 401, 403, 409, 423 and 429 included (a 4xx is a decision, not a hiccup; a 429 retried in a loop only extends the ban). Only `GET`/`HEAD`/`PUT`/`DELETE` retry; a `POST` — even on a connection failure or 5xx — settles unless the caller passes `isIdempotent: true`. `POST /api/children` creates a row; `POST /api/progress/lessons/:id/step` is an upsert and opts in.
  - A per-attempt timeout (`DEFAULT_TIMEOUT_MS = 20_000`, `timeoutMs` per call) on its own `AbortController`, with the caller's `signal` forwarded onto it.
  - `204` short-circuits to `{ ok: true, data: undefined }` — there is no envelope to unwrap.
  - `onColdStart` fires once, before the first retry, so the UI can show the "mascot waking up" state (NFR-PERF-04).
  - Two module-level listener sets: `onUnauthorized` (any `401`) and `onConsentRequired` (`403 CONSENT_REQUIRED` — the consent version moved under a live session). Each returns its unsubscribe.
  - A non-envelope error body (proxy or CDN page) falls back to a code from the status (`400/401/403/404/409`, else `INTERNAL`).
- Every server route answers that envelope (`apps/server/src/shared/errors/errors.ts`). The envelope's own schemas are `ok(schema)` and `ErrorEnvelopeSchema` in `packages/types/src/api/envelope.ts` — `{ error: { code, message, details? } }`, with `details` deliberately `unknown` (a client must not depend on it except where a contract below names its shape). Response shapes live in `packages/types/src/api/` and are asserted in the route tests with `assertContract`. The mobile client therefore does not need runtime validation of every field — but see requirement 6 for where it does.
- Error codes are the contract, messages are developer hints. `ERROR_CODES` in `packages/types/src/api/errors.ts` is the vocabulary: `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`, `CONSENT_REQUIRED`, `TIME_LIMIT_REACHED` (423), `OUTSIDE_WINDOW` (423) and `RATE_LIMITED` (429). Branch on the code, never the message.
- The outcomes every screen can hit, and what they carry:
  - `401 UNAUTHORIZED` — no or expired session.
  - `403 CONSENT_REQUIRED` — `requireConsent` guards `POST /api/children`, all of `/api/progress/*` and all of `/api/events/*` (heartbeat included). Content reads, `/api/me/*` and `/api/screen-time/*` are not consent-gated.
  - `403 FORBIDDEN` with three causes that share one code: **no active child** ("No active child profile", `requireActiveChild` — also when the active profile was deleted or belongs to another parent); **an admin account** on `GET /api/auth/me` ("Admin accounts cannot access the parent dashboard", `apps/server/src/modules/parent/parent.service.ts`); and a cross-origin write (below). The code cannot tell them apart and the message must not be branched on, so the client re-reads `GET /api/auth/me` and lets the session state decide (requirement 2).
  - `423 TIME_LIMIT_REACHED | OUTSIDE_WINDOW` — `details: { minutesToday, dailyLimitMinutes, windowStart, windowEnd }` (`screen-time.service.ts`), on `GET /api/content/lessons/:id`, `GET /api/content/stories/:id`, the first progress write that opens a lesson, `story_start`, and story completion > 30 min after its start.
  - `429 RATE_LIMITED` — the per-IP flood guard (300/min on `/api/*`, no `details`, a `RateLimit` header) and the per-child limits (30 client events/min across `/api/progress/events` + `/api/events/activity`; 30 quiz responses/min).
- **`rejectCrossOriginWrites`** (`apps/server/src/shared/middleware/security.ts`, mounted app-wide before the routers) refuses a `POST`/`PUT`/`PATCH`/`DELETE` whose `Origin` header is present and is neither `WEB_ORIGIN` nor `BETTER_AUTH_URL`; it passes when `Origin` is **absent**, the method is safe, or the path is under `/api/auth/`. React Native's `fetch` sends no `Origin`, so native writes should pass — but that is an assumption about two HTTP stacks (OkHttp, `NSURLSession`), so this file proves it on a physical device. A setup that does send one (Expo web, a WebView, a header the M07 provider adds) gets `403 FORBIDDEN "Cross-origin request refused"` on every write.
- **The one real difference from web:** `credentials: "include"` does nothing on React Native. The session cookie lives in SecureStore and is attached by the better-auth Expo client (M07). This file is written so that M07 can inject that behaviour without any screen changing.
- `lib/env.ts` (M01) exports `API_BASE_URL`.

## Detailed Requirements

1. **`lib/api-client.ts`** exporting `apiFetch<T>(path, init?)`, `ApiResult`, `ApiFailure`, `ApiErrorCode`, `CLIENT_ERROR_CODES`, `RETRY_BACKOFF_MS`, `DEFAULT_TIMEOUT_MS` and `apiBaseUrl()`. Names match the web app's deliberately: a developer moving between the two clients should not have to relearn the vocabulary.
2. **Behavioural parity with web, plus the global outcomes.** Same envelope unwrapping, same retry policy (5xx and connection errors retry for idempotent requests only; every 4xx settles, 429 included — never a retry loop), same `204` handling, same `onColdStart` semantics, same "never branch on `error.message`" rule stated in the file header. One listener set per session-wide outcome, each returning its unsubscribe, each firing once per settled response:
   - `onUnauthorized` — any `401`. M07's `AuthProvider` flips to `signedOut` and routes to the login screen.
   - `onConsentRequired` — `403 CONSENT_REQUIRED`. M07/M08 mark the session "needs consent" (`hasCurrentConsent: false`) and route to the consent screen; the failed write is not replayed.
   - `onForbidden` — any other `403 FORBIDDEN`. M07 re-reads `GET /api/auth/me`: a `403` there is an admin (or otherwise non-parent) account → localised "this app is for parents" copy and sign-out; `activeChildProfileId: null` → the guard sends the student surface to the profile picker (M10). Nothing branches on the message.
   - `onScreenTimeLocked(details)` — `423`, with the typed `details`. M25 shows the lock screen.
   - `onRateLimited` — `429`. A calm toast; the request is not retried, and nothing re-sends automatically.
3. **Pluggable auth header.** A module-level `setAuthHeaderProvider(fn: () => Promise<Record<string, string>>)` that `apiFetch` awaits on every request and merges into headers. M07 registers the better-auth cookie provider here. Default is a provider returning `{}` so this file is testable and usable before auth exists.
4. **Timeouts.** Ported from web as-is (`DEFAULT_TIMEOUT_MS`, per-call `timeoutMs`, per attempt). Use `AbortController` + `setTimeout`, not `AbortSignal.timeout`/`any` (web's file explains the gap; Hermes has the same one). A phone on a bad network must never hang a screen indefinitely.
5. **Offline detection.** `lib/network.ts` wrapping `@react-native-community/netinfo` and exporting `useIsOnline()` plus `isOnline()`. `apiFetch` does **not** refuse to send when offline (the check can be stale, and a queued request may still succeed) — but it maps a connection failure while `isOnline()` is false to a `NETWORK_ERROR` whose message the UI shows as "no internet" rather than "server waking up".
6. **Response parsing where it earns its keep.** Do not Zod-parse every response — the contract is already tested server-side. Parse with `@kidlearn/types` schemas at exactly two boundaries: **content payloads** (`ActivityDefinitionSchema`, `QuizQuestionSchema` and their containers), because those are versioned JSONB authored by the AI pipeline and a malformed payload must fail as a friendly "this activity is unavailable" rather than a crash mid-lesson; and **anything used for a gate decision**. Expose a `parseWith` helper so a caller opts in:
   `apiFetch<{ lesson: LessonDetailResponse }>("/api/content/lessons/x", { parseWith: z.object({ lesson: LessonDetailSchema }) })` — `parseWith` checks `data`, not the envelope. `LessonDetailSchema` already nests `ActivityDefinitionSchema` and `QuizQuestionSchema`.
7. **Network state UI.** `components/NetworkStates.tsx` exporting `ColdStartNotice` (mascot + "waking up" copy) and `OfflineNotice`, both localised through `@kidlearn/i18n` namespaces, both usable inside either theme. Kid-surface copy stays 1–4 words with an icon (design.md §10); parent copy is a calm sentence.
8. **No `/api/admin/*` path, ever.** The client has no admin helpers; M01's import-boundaries test fails on the string.
9. **A hook, so screens are not full of `useEffect`.** `lib/use-api.ts` exporting `useApi<T>(fetcher, deps)` returning `{ data, error, isLoading, isColdStart, refetch }`. Every list and detail screen from M09 onwards uses it, which is what keeps cold-start and offline handling consistent instead of per-screen.
10. **No secrets, no PII in logs.** `console` calls are stripped from this file entirely (`document/standards/general.md`); errors surface through `ApiResult`, not logs. A child's name must never reach a log line (NFR-SAFE-02).
11. **Tests** (`lib/api-client.test.ts`, `lib/use-api.test.tsx`) with `global.fetch` mocked: success unwrap; 4xx settles with the server's `code` and does not retry; 429 settles with no retry and fires `onRateLimited` once; 5xx on a `GET` retries twice then fails, firing `onColdStart` exactly once; 5xx and connection failure on a `POST` settle without retry unless `isIdempotent`; `204` returns `undefined`; malformed body yields `MALFORMED_RESPONSE`; each of 401, 403 `CONSENT_REQUIRED`, 403 `FORBIDDEN` and 423 fires exactly its own listener (and 423 passes `details`); the auth-header provider's headers are sent and no `Origin` header is; a timeout produces `NETWORK_ERROR`; `parseWith` failure yields `MALFORMED_RESPONSE`; `useApi` exposes `isColdStart` and `refetch` re-runs.

## Technical Approach & Suggestions

```
apps/mobile/lib/api-client.ts         # apiFetch + types (port of apps/web/shared/api/api-client.ts)
apps/mobile/lib/api-client.test.ts
apps/mobile/lib/network.ts            # NetInfo wrapper: isOnline(), useIsOnline()
apps/mobile/lib/use-api.ts            # useApi<T>() — loading / error / cold-start / refetch
apps/mobile/lib/use-api.test.tsx
apps/mobile/components/NetworkStates.tsx
```

Start by copying `apps/web/shared/api/api-client.ts` verbatim (minus `credentials: "include"` and its `signOut`, which M07 replaces), then make exactly these changes — the diff being small is the point:

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

// 3. Optional schema parsing at the content boundary.
export interface ApiFetchInit extends RequestInit {
  retries?: number;
  onColdStart?: () => void;
  timeoutMs?: number;
  isIdempotent?: boolean;
  parseWith?: { safeParse: (value: unknown) => { success: boolean } };
}

// 4. Three more listener sets beside web's onUnauthorized / onConsentRequired,
//    dispatched from the same place once a response settles.
export function onForbidden(listener: () => void): () => void { /* … */ }
export function onScreenTimeLocked(listener: (details: ScreenTimeLockDetails) => void): () => void { /* … */ }
export function onRateLimited(listener: () => void): () => void { /* … */ }
```

`ScreenTimeLockDetails` is `{ minutesToday, dailyLimitMinutes, windowStart, windowEnd }`. `details` is `unknown` on the wire, so parse it with a small Zod schema (add it to `packages/types/src/api/screen-time.ts` if no exported schema covers it yet) — a 423 decides what the child sees, which makes it a gate decision under requirement 6.

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
  const failure: ApiFailure = {
    code: "NETWORK_ERROR",
    message: hasTimedOut()
      ? `Timed out waiting for ${url}.`
      : (await isOnline())
        ? `Could not reach ${url}.`
        : "This device is offline.",
  };
  // A dropped response looks like a dropped request: only idempotent calls retry.
  return canRetry
    ? { kind: "retryable", failure }
    : { kind: "settled", result: { ok: false, error: failure } };
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

1. Read `apps/web/shared/api/api-client.ts` end to end. Copy it into `apps/mobile/lib/api-client.ts` and get `pnpm --filter mobile typecheck` green with no behaviour changes. (~25 min)
2. Write the failing tests for the ported behaviour (success, 4xx/429 no-retry, 5xx retry + single `onColdStart`, `POST` no-retry, `204`, malformed body, `onUnauthorized`/`onConsentRequired`) and make them pass. (~40 min)
2a. Add `onForbidden`, `onScreenTimeLocked` (with the `details` schema) and `onRateLimited`; test each fires alone. (~30 min)
3. Add `setAuthHeaderProvider` and the header merge; test that provided headers are sent and that the default provider changes nothing. (~20 min)
4. Confirm the ported timeout works on Hermes (no `AbortSignal.timeout`/`any`); test that a never-resolving fetch produces `NETWORK_ERROR` under fake timers. (~15 min)
5. Add `lib/network.ts` (NetInfo) and make the offline message branch; test both messages. (~25 min)
6. Add `parseWith` and test that a payload failing `ActivityDefinitionSchema` yields `MALFORMED_RESPONSE` rather than resolving. (~25 min)
7. Write `lib/use-api.ts` + its test (loading → data, `isColdStart` propagation, `refetch`). (~30 min)
8. Build `components/NetworkStates.tsx` with localised copy in both namespaces; render both states on the placeholder screen with the server stopped, and on a device with wifi off. (~30 min)
9. Device check against the real server: start `pnpm --filter server dev`, point `EXPO_PUBLIC_API_URL` at the LAN IP (preview builds also point at a LAN server until 38 · provisioning delivers `api.dev.kidlearn.net`), and confirm `GET /health` (root-mounted, not under `/api`) succeeds from the phone. Then send an unauthenticated `POST /api/children` from the device on **both** Android and iOS (simulator is not enough for this one): the answer must be `401 UNAUTHORIZED`, not `403 "Cross-origin request refused"` — that is the proof that no `Origin` header leaves the device. Record the result in the file header comment. Finally stop the server mid-request and confirm the cold-start notice appears. (~30 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; open the PR and confirm `gates` with `gh pr checks`; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `apiFetch` returns the same `ApiResult` shape and the same `ApiFailure` codes as `apps/web/shared/api/api-client.ts` for equivalent inputs — including `NETWORK_ERROR` and `MALFORMED_RESPONSE` as client-only codes.
- [ ] 5xx and connection failures on idempotent requests retry with `[1500, 4000]` backoff and fire `onColdStart` exactly once; a `POST` never retries without `isIdempotent`; no 4xx retries, 429 included.
- [ ] 401, 403 `CONSENT_REQUIRED`, other 403s, 423 (with typed `details`) and 429 each reach exactly one global listener; no screen handles them itself.
- [ ] On a physical Android **and** iOS device, an unauthenticated write returns `401`, not the cross-origin `403` — native requests carry no `Origin`.
- [ ] A `204` response yields `{ ok: true, data: undefined }`; a non-envelope body yields `MALFORMED_RESPONSE`.
- [ ] A request that never answers aborts at the timeout and surfaces `NETWORK_ERROR` — no screen can hang indefinitely.
- [ ] With wifi off, the failure message identifies the device as offline; with wifi on and the server down, it identifies the server as unreachable, and `OfflineNotice` / `ColdStartNotice` render accordingly in both languages.
- [ ] `setAuthHeaderProvider` is the only mechanism by which auth headers reach a request — no screen sets a cookie or token header itself.
- [ ] `parseWith` rejects a malformed activity payload with `MALFORMED_RESPONSE`.
- [ ] `GET /health` succeeds from a **physical device** against the dev server over the LAN.
- [ ] No `console.*` call remains in `lib/api-client.ts`, and no log line anywhere contains a child's name.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass, and `gates` is green.

## Out of Scope

- Attaching the actual session cookie — M07 registers the provider this file defines. Wiring the listeners to navigation — M07 (401, 403s), M08 (consent), M25 (423).
- Per-resource API modules (`children-api`, `content-api`, …). Each arrives with the screen that needs it, mirroring how the per-feature `*-api.ts` files under `apps/web/features/` grew.
- Request caching, deduplication or a data-fetching library (React Query / SWR). `useApi` plus the server's own caching is enough at MVP; adding a cache layer before there is a measured problem buys complexity, not speed.
- Offline queueing of writes. Out of scope for the whole project per `document/mobile-app-plan.md` §3.2.
- Crash/error reporting — M29.
