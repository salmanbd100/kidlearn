# M08 — Consent & Account Deletion

> **Estimated effort:** 2–3 hours
> **Depends on:** M07
> **Requirement IDs:** FR-AUTH-03, FR-AUTH-05, NFR-SAFE-03, NFR-SAFE-05, NFR-SAFE-06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Open the parent area properly: record COPPA consent, route a signed-in parent to the right onboarding step, and give the parent an in-app account-deletion path — which both app stores require, not just the spec. The onboarding order is fixed by the server's own guards: consent → (M09) first child profile. The parent area is reached from the signed-in session alone; there is no second gate.

## Context & Current State

The server side is complete (`apps/server/src/modules/parent/parent.routes.ts`, documented at `/docs` under **Parent Account**). Every route sits behind `requireParent` only:

- `GET /api/auth/me` — `{ parent, activeChildProfileId }`. `parent.consentGivenAt` is `null` until consent is recorded; there is no separate gate-status endpoint.
- `POST /api/parent/consent` — body `{ accepted: true, version }` (`accepted` is the literal `true`; `false` is rejected, not stored). Returns `{ consentGivenAt, consentVersion }`. Send `CONSENT_VERSION` from `@kidlearn/types` (currently `2026-06-v1`), never a literal. Re-posting the current version is idempotent (it refreshes the timestamp). A stale version answers `409 CONFLICT` with `error.details.currentVersion` — the re-consent mechanism when the policy text changes.
- `POST /api/parent/account/delete-request` — returns `{ confirmationToken, expiresAt }` (64 hex characters, single-use, 15 minutes). The token is returned in the response at MVP; email confirmation later changes only this operation.
- `DELETE /api/parent/account` — body `{ confirmationToken }`. Irreversible, synchronous erasure of the parent and every child profile. An invalid, used or expired token answers `403 FORBIDDEN`. Afterwards the caller's cookie resolves to nothing.
- `requireConsent` (`apps/server/src/shared/middleware/require-consent.ts`) guards `POST /api/children`; a parent whose consent version is older than the current one is refused with `403 CONSENT_REQUIRED`. A client-side check is a UX convenience over that decision, never a substitute.
- Web mirrors the flow: `apps/web/app/(parent)/parent/onboarding/consent/ConsentScreen.tsx`, `apps/web/features/parent/parent-api.ts` (`submitConsent`) and the pure redirect resolver `apps/web/features/parent/parent-redirect.ts` (`resolveParentRedirect`, which takes `{ parent, childCount }` and the current path). **Web has no account-deletion UI** — the endpoints exist, so this is the first client to build one.
- M05 shipped `Sheet`. M07 shipped `useAuth()` and the authenticated `apiFetch`.

## Detailed Requirements

1. **`lib/parent-api.ts`** — typed wrappers for the three endpoints above, returning `ApiResult<T>` with types from `packages/types/src/api/parent.ts` (`ConsentRecordResponse`, `DeletionRequestResponse`, `DeletedResponse`) and `auth.ts`. No response shape redeclared locally.
2. **Consent screen** (`app/(parent)/onboarding/consent.tsx`) — the COPPA text (localised, both languages, from the `parent` namespace), an explicit affirmative action (a button labelled with what it means, not "OK"), and a link to the privacy policy opened in a browser sheet. On success call `useAuth().refresh()` so `parent.consentGivenAt` updates, then route on. On `409` re-present the text for `details.currentVersion` rather than failing silently.
3. **Onboarding routing.** `lib/parent-redirect.ts` is a port of `apps/web/features/parent/parent-redirect.ts`, with its tests: signed out → login; no consent → consent screen; consent and zero children → first-child screen (M09); fully onboarded → the parent area. One pure function, exactly one source of truth; mobile route names replace web paths. Route guards in `app/(parent)/_layout.tsx` use it; the login and onboarding screens are the pre-onboarding exceptions, expressed with route segments, not a string check on the pathname.
4. **Account deletion** (`app/(parent)/settings/delete-account.tsx`) — two explicit steps mirroring the server: a `Sheet` explaining exactly what is destroyed (the account, every child profile, all progress; irreversible) requiring the parent to type the confirmation word from the localised copy, then `POST /api/parent/account/delete-request`, then `DELETE /api/parent/account` with the returned token, then sign out locally, clear SecureStore (M07's `signOut` ordering applies), and land on the login screen. An expired or rejected token (`403`) returns the parent to step one with a clear message — never a silent retry.
5. **Settings screen** (`app/(parent)/settings/index.tsx`) — the permanent home for the M03 language toggle, sign-out, and the deletion entry point. Store review asks where account deletion lives; it must be reachable in two taps from the parent area.
6. **Public deletion URL.** Both stores require a web URL for account deletion as well as the in-app path. Web has none today; record that as an open requirement in `document/project-requirement-details.md` before M30 needs it (the Play Data Safety form asks for it).
7. **Error mapping.** Codes map to copy in one module, in the style of `apps/web/features/parent/parent-errors.ts` (`CONSENT_REQUIRED`, `CONFLICT`, `FORBIDDEN` on deletion, `NETWORK_ERROR`, generic) — never `error.message`.
8. **Tests** (`lib/parent-redirect.test.ts`, `app/(parent)/onboarding/consent.test.tsx`, `app/(parent)/settings/delete-account.test.tsx`): the redirect function returns the right destination for each state; consent posts `{ accepted: true, version: CONSENT_VERSION }` and refreshes the session; a `409` re-presents the current version; deletion runs both steps in order, clears storage and signs out; a `403` on the second step returns to step one.

## Technical Approach & Suggestions

```
apps/mobile/lib/parent-api.ts
apps/mobile/lib/parent-redirect.ts           # pure: { parent, childCount }, route -> destination
apps/mobile/lib/parent-redirect.test.ts
apps/mobile/app/(parent)/_layout.tsx         # redirect guard around everything except login/onboarding
apps/mobile/app/(parent)/onboarding/consent.tsx
apps/mobile/app/(parent)/settings/index.tsx
apps/mobile/app/(parent)/settings/delete-account.tsx
```

For the deletion confirmation, take the required word from the localised copy rather than hardcoding "DELETE" — a Bengali-speaking parent should not have to type an English word. Put the expected string in the same translation file as the warning text, and compare after trimming.

`useAuth().parent` (M07) already carries `consentGivenAt`; the guard needs no extra request. Re-read the session on foreground (`AppState` `active`) so a consent-version bump made while the app was backgrounded is picked up.

## Step-by-Step Plan

1. Write `lib/parent-api.ts`; confirm each call against the dev server with a temporary button. (~20 min)
2. Port `parent-redirect.ts` and its tests. (~25 min)
3. Build the consent screen with localised COPPA copy in both languages and the privacy-policy link; verify `POST /api/parent/consent` records `CONSENT_VERSION`. (~30 min)
4. Wire the redirect guard into `app/(parent)/_layout.tsx` with the pre-onboarding exceptions. (~20 min)
5. Build the settings screen (language toggle, sign out, delete account). (~20 min)
6. Build the two-step deletion flow; test it against the dev server with a throwaway parent account and confirm the child profiles are gone and the session no longer authenticates. (~35 min)
7. Device pass: TalkBack announces the consent action and the deletion warning. (~15 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A brand-new parent is routed consent → (M09) first child → parent area, and a fully onboarded parent cannot land on an onboarding screen.
- [ ] Consent is recorded with `CONSENT_VERSION` from `@kidlearn/types`, the COPPA copy renders in EN and BN, and a `409` re-presents the current version.
- [ ] Account deletion is reachable in two taps from the parent area, requires typing the localised confirmation word, completes both server steps, clears SecureStore, and leaves the session unable to authenticate.
- [ ] A rejected or expired deletion token returns the parent to step one with a clear message.
- [ ] `lib/parent-redirect.ts` agrees with `apps/web/features/parent/parent-redirect.ts` for the same inputs.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Child profile creation — M09, even though it is the next onboarding step.
- Email confirmation of deletion. The server returns the token in the response at MVP; the client contract is already correct.
- Any second authentication step in front of the parent area. The signed-in session is the only gate; Apple's Kids Category adult-verification item belongs to M30.
- The privacy policy document itself — M30 (it must exist at a public URL before submission).
