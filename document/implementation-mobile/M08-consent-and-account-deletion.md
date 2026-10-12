# M08 — Consent & Account Deletion

> **Estimated effort:** 2–3 hours
> **Depends on:** M07
> **Requirement IDs:** FR-AUTH-03, FR-AUTH-05, NFR-SAFE-03, NFR-SAFE-05, NFR-SAFE-06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Open the parent area properly: record COPPA consent, route a signed-in parent to the right onboarding step, and give the parent an in-app account-deletion path — which both app stores require, not just the spec. The onboarding order is fixed by the server's own guards: consent → (M09) first child profile. The parent area is reached from the signed-in session alone; there is no second gate.

## Context & Current State

The server side is complete (`apps/server/src/modules/parent/parent.routes.ts`, documented at `/docs` under **Parent Account**). Every route sits behind `requireParent` only:

- `GET /api/auth/me` — `{ parent, activeChildProfileId }`. **Route on `parent.hasCurrentConsent`**, not on `consentGivenAt`: a parent who consented to an older version has a timestamp but no current consent (`hasCurrentConsent()` in `packages/types/src/api/parent.ts`). There is no separate gate-status endpoint.
- `POST /api/parent/consent` — body `{ accepted: true, version }` (`accepted` is the literal `true`; `false` is rejected, not stored). Returns `{ consentGivenAt, consentVersion }`. Send `CONSENT_VERSION` from `@kidlearn/types` (currently `2026-06-v1`), never a literal. Re-posting the current version is idempotent (it refreshes the timestamp). A stale version answers `409 CONFLICT` with `error.details.currentVersion`.
- **The native release trap.** `CONSENT_VERSION` and the consent text are bundled into the app. When the server's version moves on, an installed binary can only ever send the old one and gets `409` — it cannot record consent until it is updated. Both live in JS, so an EAS Update carries a new version without a store review; the runbook order is **publish the OTA, then deploy the server bump** (M32). A binary that still sees `409` shows an "update the app" screen. It must **never** re-post `details.currentVersion`: that records consent to text the parent never saw.
- `POST /api/parent/account/delete-request` — returns `{ confirmationToken, expiresAt }` (64 hex characters, single-use, 15 minutes). The token is returned in the response at MVP; email confirmation later changes only this operation.
- `DELETE /api/parent/account` — body `{ confirmationToken }`. Irreversible, synchronous erasure of the parent and every child profile. An invalid, used or expired token answers `403 FORBIDDEN`. Afterwards the caller's cookie resolves to nothing.
- `requireConsent` (`apps/server/src/shared/middleware/require-consent.ts`) guards `POST /api/children`, **every `/api/progress/*` route and every `/api/events/*` route, heartbeat included**; a parent without current consent is refused with `403 CONSENT_REQUIRED`. Content reads, `/api/me` and `/api/screen-time` are not gated. So a version bump reaches a child mid-lesson as a `403` on the next step report — M04's `onConsentRequired` listener and M07's `refresh()` turn that into a reroute to the consent screen (the web does the same in `active-child.tsx`). A client-side check is a UX convenience over the server's decision, never a substitute.
- Web mirrors the flow: `apps/web/app/(parent)/parent/onboarding/consent/ConsentScreen.tsx`, `apps/web/features/parent/parent-api.ts` (`submitConsent`) `apps/web/features/parent/parent-errors.ts`, and the pure redirect resolver `apps/web/features/parent/parent-redirect.ts` (`resolveParentRedirect` plus the `PARENT_ROUTES` table: signed out → login, `!hasCurrentConsent` → consent, no children → first child, onboarded on an onboarding path → dashboard). **Web has no account-deletion UI** — the endpoints exist, so this is the first client to build one.
- M05 shipped `Sheet`. M07 shipped `useAuth()` and the authenticated `apiFetch`.

## Detailed Requirements

1. **`lib/parent-api.ts`** — typed wrappers for the three endpoints above, returning `ApiResult<T>` with types from `packages/types/src/api/parent.ts` (`ConsentRecordResponse`, `DeletionRequestResponse`, `DeletedResponse`) and `auth.ts`. No response shape redeclared locally.
2. **Consent screen** (`app/(parent)/onboarding/consent.tsx`) — the COPPA text (localised, both languages, from the `parent` namespace), an explicit affirmative action (a button labelled with what it means, not "OK"), and the privacy policy rendered **in-app** (localised, from the same namespace) — not a browser sheet. The parent area has no PIN, so any external link here would need Apple's Kids Category parental gate (`mobile-app-plan.md` §12.2). On success call `useAuth().refresh()` so `parent.hasCurrentConsent` updates, then route on. On `409` show the "update the app" screen (Context, *native release trap*) — never re-post `details.currentVersion`.
3. **Onboarding routing — lift, don't port.** Move `resolveParentRedirect` and its tests out of `apps/web/features/parent/parent-redirect.ts` into a shared package (`packages/types/src/domain/` is the natural home: it is pure and has no React), taking the route table as an argument so web passes `PARENT_ROUTES` and mobile passes its expo-router paths. `apps/web` imports it back in the same change and its tests stay green. Rules: signed out → login; `!hasCurrentConsent` → consent; current consent and zero children → first-child screen (M09); fully onboarded on an onboarding route → the parent area. One function, one source of truth. Route guards in `app/(parent)/_layout.tsx` use it; the login and onboarding screens are the pre-onboarding exceptions, expressed with route segments, not a string check on the pathname.
4. **Account deletion** (`app/(parent)/settings/delete-account.tsx`) — two explicit steps mirroring the server: a `Sheet` explaining exactly what is destroyed (the account, every child profile, all progress; irreversible) requiring the parent to type the confirmation word from the localised copy, then `POST /api/parent/account/delete-request`, then `DELETE /api/parent/account` with the returned token, then sign out locally, clear SecureStore (M07's `signOut` ordering applies), and land on the login screen. An expired or rejected token (`403`) returns the parent to step one with a clear message — never a silent retry.
5. **Settings screen** (`app/(parent)/settings/index.tsx`) — reached from the account menu M26 builds (the web `ParentTopBar` avatar menu's counterpart); the permanent home for the M03 language toggle, sign-out (M07, FR-AUTH-07), and the deletion entry point. Store review asks where account deletion lives; it must be reachable in two taps from the parent area.
6. **Public deletion URL.** Both stores require a web URL for account deletion as well as the in-app path. Web has neither a deletion screen nor a public page today — the public `(site)` route group (`/`, `/guide/*`) is the natural host for an explainer page that tells a parent how to delete from the app or by signing in on the web. Record it as a requirement in `document/project-requirement-details.md` (FR-AUTH-05 / §5.15) so it is a web file before M30 needs the URL for the Play Data Safety form.
7. **Error mapping.** Codes map to copy in one module, in the style of `apps/web/features/parent/parent-errors.ts` (`CONSENT_REQUIRED`, `CONFLICT`, `FORBIDDEN` on deletion, `NETWORK_ERROR`, generic) — never `error.message`.
8. **Tests** (the lifted resolver's tests in its package, `app/(parent)/onboarding/consent.test.tsx`, `app/(parent)/settings/delete-account.test.tsx`): the resolver returns the right destination for each state, for both route tables; a parent with `consentGivenAt` set but `hasCurrentConsent: false` goes to consent; consent posts `{ accepted: true, version: CONSENT_VERSION }` and refreshes the session; a `409` shows the update screen and makes no second POST; deletion runs both steps in order, clears storage and signs out; a `403` on the second step returns to step one.

## Technical Approach & Suggestions

```
apps/mobile/lib/parent-api.ts
packages/types/src/domain/parent-redirect.ts # lifted from apps/web, route table as an argument (+ its test)
apps/mobile/lib/parent-routes.ts             # mobile's route table for the resolver
apps/mobile/app/(parent)/_layout.tsx         # redirect guard around everything except login/onboarding
apps/mobile/app/(parent)/onboarding/consent.tsx
apps/mobile/app/(parent)/settings/index.tsx
apps/mobile/app/(parent)/settings/delete-account.tsx
```

For the deletion confirmation, take the required word from the localised copy rather than hardcoding "DELETE" — a Bengali-speaking parent should not have to type an English word. Put the expected string in the same translation file as the warning text, and compare after trimming.

`useAuth().parent` (M07) already carries `hasCurrentConsent`; the guard needs no extra request. Re-read the session on foreground (`AppState` `active`) so a consent-version bump made while the app was backgrounded is picked up before the child's next write hits `403 CONSENT_REQUIRED`.

## Step-by-Step Plan

1. Write `lib/parent-api.ts`; confirm each call against the dev server with a temporary button. (~20 min)
2. Lift `parent-redirect.ts` and its tests into the shared package, re-point `apps/web` at it, and run `pnpm --filter web test`. (~30 min)
3. Build the consent screen with localised COPPA copy and the in-app privacy policy in both languages; verify `POST /api/parent/consent` records `CONSENT_VERSION`. (~30 min)
4. Wire the redirect guard into `app/(parent)/_layout.tsx` with the pre-onboarding exceptions. (~20 min)
5. Build the settings screen (language toggle, sign out, delete account). (~20 min)
6. Build the two-step deletion flow; test it against the dev server with a throwaway parent account and confirm the child profiles are gone and the session no longer authenticates. (~35 min)
7. Device pass: TalkBack announces the consent action and the deletion warning. (~15 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A brand-new parent is routed consent → (M09) first child → parent area, and a fully onboarded parent cannot land on an onboarding screen.
- [ ] Consent is recorded with `CONSENT_VERSION` from `@kidlearn/types`, the COPPA copy renders in EN and BN, and a `409` shows the update screen without re-posting another version.
- [ ] A `403 CONSENT_REQUIRED` from any progress or event write reroutes to the consent screen.
- [ ] Account deletion is reachable in two taps from the parent area, requires typing the localised confirmation word, completes both server steps, clears SecureStore, and leaves the session unable to authenticate.
- [ ] A rejected or expired deletion token returns the parent to step one with a clear message.
- [ ] Web and mobile route through the same lifted `resolveParentRedirect`; the web suite still passes.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and `gates` is green on the PR.

## Out of Scope

- Child profile creation — M09, even though it is the next onboarding step.
- Email confirmation of deletion. The server returns the token in the response at MVP; the client contract is already correct.
- Any second authentication step in front of the parent area. The signed-in session is the only gate; Apple's Kids Category adult-verification item belongs to M30.
- Writing the privacy policy itself — M30. It must also exist at a public URL for the store listings; the in-app copy and the public page say the same thing.
