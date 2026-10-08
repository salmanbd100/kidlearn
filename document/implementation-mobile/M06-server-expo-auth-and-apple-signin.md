# M06 — Server: Expo Auth Support & Sign in with Apple

> **Estimated effort:** 3–4 hours
> **Depends on:** M04
> **Requirement IDs:** FR-AUTH-02, FR-AUTH-06, FR-AUTH-07, App Store Review Guideline 4.8, NFR-SAFE-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Make `apps/server` able to authenticate a native client without forking the session model or weakening
anything the web relies on: register better-auth's `expo` plugin, trust the `kidlearn://` scheme, and add
Sign in with Apple — which App Store Review Guideline 4.8 makes mandatory because Google is otherwise the only
parent sign-in. This is the **only** file in the mobile plan that changes `apps/server`.

What this file deliberately does **not** do: add a `?client=` parameter or a callback whitelist to
`GET /api/auth/google`, enable account linking, or touch admin sign-in. The reasons are below.

## Context & Current State

- `apps/server/src/config/auth.ts` is the single better-auth instance (`better-auth` `^1.7.7`). Today:
  `prismaAdapter`, `baseURL: env.BETTER_AUTH_URL`, `trustedOrigins: [env.WEB_ORIGIN]`, `socialProviders: { google }`,
  **no `plugins` array**, and `emailAndPassword: { enabled: true, disableSignUp: true }` with a 12-character minimum —
  the admin CMS credential surface only.
  - Parent sessions: 30 days, sliding (`updateAge` one day). **Admin sessions** are capped at 12 hours from creation
    by `databaseHooks.session.create/update` (`ADMIN_SESSION_MAX_AGE_MS`), applied to users with a `credential` account.
  - `account.accountLinking.enabled: false` — **deliberately**, so a Google sign-in on the seeded admin's address cannot
    inherit the admin user (commit `f8a8bdf`). This file keeps it off.
  - `session.additionalFields.activeChildProfileId` is `input: false`; only `POST /api/children/:id/activate` writes it.
  - `advanced.defaultCookieAttributes`: `httpOnly`, `sameSite: "lax"`, `secure` in production.
- `apps/server/src/modules/auth/auth.routes.ts` mounts before `express.json()` and before better-auth's wildcard
  handler (order is load-bearing). Its `GET /api/auth/google` is a **web convenience** — a GET wrapper so the
  homepage sign-in dialog can be a plain anchor — and hardcodes `callbackURL: WEB_ORIGIN + PARENT_POST_LOGIN_PATH`.
  `GET /api/auth/me` (`requireParent`) returns `{ parent, activeChildProfileId }` (`AuthMeResponseSchema`,
  `packages/types/src/api/auth.ts`) and lazily provisions the `Parent` row.
- `requireParent` (`apps/server/src/modules/parent/require-parent.middleware.ts`) calls `findOrCreateParentForUser`
  (`parent.service.ts`), which — only when no `Parent` row exists yet — refuses an admin user (`403` "Admin accounts
  cannot access the parent dashboard") and any user without a `google` account (`403` "This account did not sign in with
  Google…"). **Adding Apple makes the Google-only check wrong** — it must accept a `google` or `apple` account.
- `apps/server/src/shared/middleware/security.ts` — `rejectCrossOriginWrites([WEB_ORIGIN, BETTER_AUTH_URL])` exempts
  `/api/auth/*` (better-auth's own `trustedOrigins` check governs it) and passes requests with **no** `Origin`, which is
  what React Native's `fetch` sends. CORS allows exactly `WEB_ORIGIN`; native requests are not browser CORS requests,
  so it needs no change — do not widen it.
- **How native sign-in actually works** (better-auth Expo integration): the app's `expoClient` calls
  `POST /api/auth/sign-in/social` directly with a relative `callbackURL` (e.g. `/parent`), which the client turns into
  `kidlearn://parent`. The server `expo()` plugin (1) copies the `expo-origin` header into `origin` so the scheme passes
  `trustedOrigins`, (2) injects the session cookie into the custom-scheme redirect after `/callback/*`, and
  (3) adds `GET /api/auth/expo-authorization-proxy`. In `NODE_ENV=development` it also trusts `exp://` automatically.
  So the native client never uses the GET wrapper, and the server never has to choose a callback per client.
- `apps/server/src/openapi/paths/auth.ts` registers the auth surface; `src/openapi/coverage.test.ts` fails on any
  unregistered route walked from the live routers (`standards/backend.md §7`).
- **Why Apple sign-in is in scope:** guideline 4.8 requires an Apple option wherever a third-party login is the only one.
  KidLearn is a consumer app, so no exemption applies; finding this at review costs a full submission cycle.

## Detailed Requirements

1. **Expo plugin.** `config/auth.ts` gains `plugins: [expo()]` from `@better-auth/expo`, and `trustedOrigins`
   becomes `[env.WEB_ORIGIN, env.MOBILE_APP_SCHEME]`. `MOBILE_APP_SCHEME` lives in `config/env.ts` with the default
   `kidlearn://`, so a rename is one edit and the value appears in the env matrix.
2. **The web wrapper is untouched.** `GET /api/auth/google` keeps its hardcoded web callback and reads no query
   parameters. A regression test asserts that a caller-supplied `callbackURL` or `client` query parameter is ignored —
   the wrapper must never become an open redirect for a freshly minted session.
3. **Apple provider.** `socialProviders.apple` with `clientId` (the Services ID), `clientSecret` (the generated JWT)
   and `appBundleIdentifier` (`net.kidlearn.app`) so iOS native `idToken` sign-in verifies. The Apple values are
   optional in development and required in production — the provider is registered only when they are present, and
   the server refuses to boot in production without them. No web Apple button is added in this file.
4. **Account linking stays off.** Write the consequence in a comment in `config/auth.ts` next to the existing linking
   comment: a parent who signed in with Google and later chooses Apple with the **same** email is refused with
   better-auth's `account_not_linked` error (M07 turns it into "use the provider you signed up with"); an Apple
   "Hide My Email" relay address is a different email and yields a separate parent. Guarded linking is an open question
   in `mobile-app-plan.md` §17, not this file.
5. **`findOrCreateParentForUser` recognises Apple.** The provisioning check accepts a user with a `google` **or** `apple` account and
   still refuses an admin user. Tests: an Apple-only user is provisioned as a `Parent`; an admin user is still refused
   with the same 403; a `credential`-only user is refused.
6. **Admin stays web-only.** Nothing here makes password sign-in reachable from the app: the native client never calls
   `/api/auth/sign-in/email`, and no mobile-specific admin route exists. The 12-hour admin cap and session revocation on
   rotation are untouched.
7. **Cookies, consent and active child unchanged.** `httpOnly`/`sameSite: "lax"`/`secure` stay pinned; `requireConsent`,
   `requireActiveChild`, `loadOwnedChild` and `activeChildProfileId`'s `input: false` are untouched. Sign-out
   (`POST /api/auth/sign-out`) still revokes the session row, which ends the active child (FR-AUTH-07).
8. **OpenAPI in the same change.** Register `GET /api/auth/expo-authorization-proxy` and `/api/auth/callback/apple` in
   `src/openapi/paths/auth.ts`, and document `apple` as an accepted `provider` on `/api/auth/sign-in/social`.
   `pnpm --filter server test` must pass, including `coverage.test.ts` and `document.test.ts`.
9. **Tests** (`auth.routes.test.ts`, `require-parent.middleware.test.ts`, and a config assertion):
   - `GET /api/auth/google` still redirects with the web callback; `?callbackURL=https://evil.example` and
     `?client=mobile` are ignored (asserted on the outgoing callback).
   - `trustedOrigins` contains `WEB_ORIGIN` and `MOBILE_APP_SCHEME` and nothing else in production.
   - `account.accountLinking.enabled` is `false` (a regression guard on the admin-inheritance fix).
   - The provisioning cases in requirement 5 (`parent.service` / `require-parent.middleware.test.ts`).
   - A Supertest request with **no** `Origin` header to a state-changing parent route (e.g. `POST /api/children/:id/activate`)
     is not refused by `rejectCrossOriginWrites` — the guarantee every native write depends on.
10. **Provider setup, documented.** Add to `document/deployment-walkthrough.md` (the provider-console checklist used by
    web file 38 · provisioning): the Google OAuth client needs **no** new redirect URI for mobile (the callback still lands
    on `https://api.kidlearn.net/api/auth/callback/google`); Apple needs a Services ID, a signing key, the return URL
    `https://api.kidlearn.net/api/auth/callback/apple`, domain verification and the bundle ID `net.kidlearn.app`; and the
    new SSM parameters `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` for both environments.
    Note that Apple's client secret JWT expires (at most six months) — add its rotation to `document/runbook.md`.

## Technical Approach & Suggestions

**Files:**

```
apps/server/src/config/auth.ts                               # + expo() plugin, apple provider, trustedOrigins, linking comment
apps/server/src/config/env.ts                                # + MOBILE_APP_SCHEME, APPLE_* (production-required)
apps/server/src/modules/parent/parent.service.ts             # google OR apple account counts as a parent
apps/server/src/modules/auth/auth.routes.test.ts             # wrapper-ignores-query regression
apps/server/src/openapi/paths/auth.ts                        # expo-authorization-proxy, callback/apple, provider enum
document/deployment-walkthrough.md, document/runbook.md      # provider checklist, Apple secret rotation
```

```ts
// apps/server/src/config/auth.ts (shape only — keep the existing options)
import { expo } from "@better-auth/expo";

const apple =
  env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET && env.APPLE_APP_BUNDLE_IDENTIFIER
    ? {
        clientId: env.APPLE_CLIENT_ID,
        clientSecret: env.APPLE_CLIENT_SECRET,
        appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
      }
    : undefined;

export const auth = betterAuth({
  // …unchanged…
  plugins: [expo()],
  trustedOrigins: [env.WEB_ORIGIN, env.MOBILE_APP_SCHEME],
  socialProviders: {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    // App Store Review Guideline 4.8: Google is otherwise the only parent sign-in.
    ...(apple && { apple }),
  },
  account: {
    // Off so a social sign-in on the admin's address cannot inherit the admin user. With Apple added,
    // the same email arriving through a second provider is refused (account_not_linked), and a
    // Hide-My-Email relay address becomes a separate parent.
    accountLinking: { enabled: false },
  },
});
```

`env.ts`: the Apple trio is optional in the base schema; the existing production `superRefine` (the one that refuses
localhost origins) gains a check that names any missing Apple variable, so production fails at boot rather than at
the first Apple sign-in.

`authRouter` is mounted before `express.json()` and nothing here reads a body, so mount order does not change. The
plugin's routes live inside better-auth's wildcard handler, after `authRouter`.

## Step-by-Step Plan

1. Install `@better-auth/expo` in `apps/server` at the version matching `better-auth`; add `MOBILE_APP_SCHEME` and
   the Apple trio to `config/env.ts`, plus `.env.example`. (~25 min)
2. Failing tests first: wrapper ignores `callbackURL`/`client`, `trustedOrigins` contents, linking off, the no-`Origin`
   write, and the three provisioning cases. (~40 min)
3. Add `plugins: [expo()]` and the scheme; run the full server suite to prove the plugin changes no existing response. (~20 min)
4. Add the Apple provider and the provisioning change; green the tests. (~35 min)
5. Register the new paths in `src/openapi/paths/auth.ts`; run `pnpm --filter server test` until `coverage.test.ts` and
   `document.test.ts` pass. (~30 min)
6. Manual check against the dev server: sign in on the web homepage dialog end to end (unchanged), then
   `curl -i -X POST http://localhost:4000/api/auth/sign-in/social -H 'content-type: application/json' -H 'expo-origin: kidlearn://' -d '{"provider":"google","callbackURL":"/parent"}'`
   and confirm a Google authorisation URL comes back rather than an untrusted-origin error. (~15 min)
7. Provider checklist and the Apple secret rotation note in the deployment docs. (~15 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter server test`; open the PR; `gates` green (`gh pr checks`); update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The web sign-in flow is unchanged end to end, verified in a browser, not only in tests.
- [ ] `GET /api/auth/google` ignores every query parameter — asserted in a test.
- [ ] `POST /api/auth/sign-in/social` accepts `expo-origin: kidlearn://` and rejects an unlisted scheme.
- [ ] `trustedOrigins` is exactly `WEB_ORIGIN` + `MOBILE_APP_SCHEME` in production; CORS still allows one browser origin.
- [ ] `accountLinking.enabled` is `false`, with the Apple consequence written beside it.
- [ ] `findOrCreateParentForUser` provisions an Apple-only user as a parent and still refuses an admin user.
- [ ] A state-changing parent request with no `Origin` header passes `rejectCrossOriginWrites`.
- [ ] Session cookie attributes, the admin 12-hour cap and `activeChildProfileId`'s `input: false` are unchanged.
- [ ] Every new route is in the OpenAPI document; `pnpm --filter server test` passes.
- [ ] The server boots in development without Apple credentials and refuses to boot in production without them.
- [ ] `pnpm lint` and `pnpm typecheck` pass, and `gates` is green on the PR.

## Out of Scope

- Any mobile code — M07 consumes this.
- A web "Sign in with Apple" button. Guideline 4.8 is about the iOS app; adding it to web is a separate product decision.
- Account linking across providers — open question (§17 of the plan), because it reopens the admin-inheritance hole.
- Apple credential *creation* — needs the paid Apple account; done during web 38 · provisioning / M31.
- Widening CORS, a bearer/JWT session, or any mobile-only API surface. There is one API and one session model.
