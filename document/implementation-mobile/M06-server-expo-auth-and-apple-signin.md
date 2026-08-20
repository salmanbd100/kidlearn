# M06 — Server: Expo Auth Support & Sign in with Apple

> **Estimated effort:** 3–4 hours
> **Depends on:** M04
> **Requirement IDs:** FR-AUTH-02, FR-AUTH-06, App Store Review Guideline 4.8, NFR-SAFE-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Make `apps/server` able to authenticate a native client without forking the session model: register better-auth's `expo` plugin, trust the `kidlearn://` scheme, replace the hardcoded web callback in `GET /api/auth/google` with a **server-side whitelist** of per-client destinations, and add Sign in with Apple — which App Store Review Guideline 4.8 makes mandatory, not optional, because Google is currently the only sign-in method. This is the **only** file in the mobile plan that changes `apps/server`.

## Context & Current State

- `apps/server/src/lib/auth.ts` is the single better-auth instance. Today: `prismaAdapter`, `baseURL: env.BETTER_AUTH_URL`, `trustedOrigins: [env.WEB_ORIGIN]`, `emailAndPassword: { enabled: false }`, `socialProviders: { google }`, a 30-day session with `updateAge` of one day, and two `additionalFields` on the session — `activeChildProfileId` and `pinVerifiedUntil`, both `input: false` so only our own validated routes can write them.
- `advanced.defaultCookieAttributes` pins `httpOnly`, `sameSite: "lax"`, `secure` in production.
- `apps/server/src/routes/auth.ts` mounts before `express.json()` and before better-auth's wildcard handler (order is load-bearing and documented in that file). It owns two routes:
  - `GET /api/auth/google` — a GET wrapper over better-auth's POST-only `signInSocial`, existing so the web sign-in button can be a plain anchor. It **hardcodes** `callbackURL: ${env.WEB_ORIGIN}${env.PARENT_POST_LOGIN_PATH}` and forwards better-auth's OAuth `state` cookie before redirecting.
  - `GET /api/auth/me` — `requireParent`, returns `{ parent, activeChildProfileId }`. Also the endpoint that lazily provisions the `Parent` row on a new parent's first request.
- `apps/server/src/app.ts` allows exactly one CORS origin with credentials (`env.WEB_ORIGIN`). Native requests carry no browser `Origin`, so CORS needs no change — do not widen it.
- `document/database-design.md` §5: better-auth owns `User`/`Session`/`Account`/`Verification`; kidlearn owns `Parent` (linked by `Parent.userId → User.id`), provisioned lazily by `requireParent`.
- `apps/server/src/openapi/paths/auth.ts` registers `/api/auth/google`, `/api/auth/me`, `/api/auth/callback/google`, `/api/auth/sign-in/social`, `/api/auth/get-session` and `/api/auth/sign-out`. `src/openapi/coverage.test.ts` walks the live routers and fails if a route is unregistered — so any route added here must be registered in the same change (`standards/backend.md §7`).
- **Why Apple sign-in is in scope:** guideline 4.8 requires Sign in with Apple wherever a third-party or social login is the only option. KidLearn is a consumer app with no education/enterprise account system, so no exemption applies. Discovering this at review costs a full submission cycle.

## Detailed Requirements

1. **Expo plugin.** `apps/server/src/lib/auth.ts` adds `plugins: [expo()]` from `@better-auth/expo`, and `trustedOrigins` becomes `[env.WEB_ORIGIN, MOBILE_SCHEME]` where `MOBILE_SCHEME` is `"kidlearn://"`. Keep the scheme in `lib/env.ts` as `MOBILE_APP_SCHEME` with a default, so a rename is one edit and the value is visible in the env matrix.
2. **Whitelisted post-login destinations.** `GET /api/auth/google` accepts an optional `client` query parameter validated by a Zod enum (`"web" | "mobile"`, default `"web"`). The route maps it to a callback URL from a server-side record — never from the request:
   - `web` → `${env.WEB_ORIGIN}${env.PARENT_POST_LOGIN_PATH}` (unchanged behaviour)
   - `mobile` → `${env.MOBILE_APP_SCHEME}${env.MOBILE_POST_LOGIN_PATH}` (e.g. `kidlearn://parent`)
   An unknown `client` value is a `400 VALIDATION_ERROR`, not a fallback. **Never accept a raw `callbackURL` from a client** — that is an open redirect, and on an OAuth callback it is a session-handoff vulnerability.
3. **Apple provider.** `socialProviders.apple` configured with `clientId` (the Services ID), `clientSecret` (the generated JWT) and `appBundleIdentifier` for native verification, all from new required-in-production env vars. A matching `GET /api/auth/apple` wrapper mirrors the Google one, including forwarding better-auth's `state` cookie headers before the redirect.
4. **Identity linking decision, written down.** When the same person signs in with Google on web and Apple on mobile, they must land on **one** `Parent`. Enable better-auth's account linking for trusted providers so a verified-email match links the new `Account` to the existing `User`. Apple's private-relay addresses are a distinct verified email and will **not** match — so document the outcome plainly in a comment in `lib/auth.ts`: a parent who chooses "Hide My Email" gets a separate account, and the recovery path is signing in with the original provider. Do not attempt name-based matching.
5. **Env additions.** `lib/env.ts` gains `MOBILE_APP_SCHEME` (default `kidlearn://`), `MOBILE_POST_LOGIN_PATH` (default `parent`), `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER`. Follow the existing pattern: Zod-parsed, the server refuses to boot on an incomplete configuration, and the Apple vars are required only when `NODE_ENV === "production"` so local development is not blocked on Apple credentials.
6. **Cookie attributes stay as they are.** The Expo plugin handles the native cookie exchange; `httpOnly`/`sameSite: "lax"`/`secure` remain pinned for the browser. Do not loosen anything for mobile's benefit.
7. **PIN, consent and active-child semantics unchanged.** `requireParent`, `requireConsent`, `requirePinVerified`, `requireActiveChild` and `loadOwnedChild` are untouched. The mobile client is a new front door to the same house.
8. **OpenAPI in the same change.** Register `GET /api/auth/apple` and the `client` parameter on `GET /api/auth/google` in `src/openapi/paths/auth.ts`, plus `/api/auth/callback/apple`. `pnpm --filter server test` must pass, which includes `coverage.test.ts`.
9. **Tests** (`src/routes/auth.test.ts`, extending the existing file):
   - `GET /api/auth/google` with no `client` redirects to Google with the **web** callback (regression guard on existing behaviour).
   - `GET /api/auth/google?client=mobile` produces the `kidlearn://` callback.
   - `GET /api/auth/google?client=evil` → 400 with `VALIDATION_ERROR`.
   - A request supplying its own `callbackURL` query parameter has it **ignored** (assert the outgoing callback is still the whitelisted one).
   - `GET /api/auth/apple` forwards the `state` cookie and redirects (mock `auth.api.signInSocial` as the Google test does).
   - `trustedOrigins` contains the mobile scheme (a direct assertion on the config, cheap and it catches a rename).
10. **Provider setup, documented.** A short note in the file's own commit message or in `document/implementation/notes/` recording: the Google OAuth console needs no new redirect URI for mobile (the callback still lands on the server origin, then redirects to the scheme), and Apple needs a Services ID, a private key, a domain association and the bundle ID `net.kidlearn.app`. Whoever runs the deployment (web file 38) needs both lists.

## Technical Approach & Suggestions

**Files:**

```
apps/server/src/lib/auth.ts                # + expo() plugin, apple provider, trustedOrigins, linking comment
apps/server/src/lib/env.ts                 # + MOBILE_APP_SCHEME, MOBILE_POST_LOGIN_PATH, APPLE_*
apps/server/src/routes/auth.ts             # client whitelist + /apple wrapper
apps/server/src/routes/auth.test.ts        # the six cases above
apps/server/src/openapi/paths/auth.ts      # /api/auth/apple, /api/auth/callback/apple, client param
```

The whitelist — the security-relevant part of this file, kept in one place:

```ts
// apps/server/src/routes/auth.ts
const SignInClientSchema = z.enum(["web", "mobile"]).default("web");

/**
 * Post-login destinations are chosen here, never supplied by the caller. A
 * client-supplied `callbackURL` on an OAuth start is an open redirect, and the
 * thing being redirected is a freshly minted session.
 */
function callbackFor(client: "web" | "mobile"): string {
  return client === "mobile"
    ? `${env.MOBILE_APP_SCHEME}${env.MOBILE_POST_LOGIN_PATH}`
    : `${env.WEB_ORIGIN}${env.PARENT_POST_LOGIN_PATH}`;
}

function socialStart(provider: "google" | "apple") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SignInClientSchema.safeParse(req.query.client ?? undefined);
      if (!parsed.success) return next(badRequest(parsed.error));

      const { headers, response } = await auth.api.signInSocial({
        body: { provider, callbackURL: callbackFor(parsed.data) },
        returnHeaders: true,
      });

      // better-auth sets an OAuth `state` cookie here and verifies it on the
      // callback; dropping it fails every sign-in on the state check.
      for (const cookie of headers.getSetCookie()) res.append("set-cookie", cookie);

      if (!response?.url) throw new Error(`better-auth returned no ${provider} authorization URL`);
      res.redirect(302, response.url);
    } catch (error) {
      next(error);
    }
  };
}

authRouter.get("/google", socialStart("google"));
authRouter.get("/apple", socialStart("apple"));
```

Reuse the existing `badRequest`/error helpers from `src/lib/errors.ts` rather than hand-rolling a 400 body — the envelope and the `VALIDATION_ERROR` code are already defined there.

**auth.ts additions:**

```ts
import { expo } from "@better-auth/expo";

export const auth = betterAuth({
  // …unchanged config…
  plugins: [expo()],
  trustedOrigins: [env.WEB_ORIGIN, env.MOBILE_APP_SCHEME],
  socialProviders: {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    // Required by App Store Review Guideline 4.8: Google is otherwise the only
    // sign-in method, and no 4.8 exemption applies to a consumer app.
    apple: {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Verified-email match only. A parent using Apple's private relay gets a
      // separate Parent row — their recovery path is the original provider.
      trustedProviders: ["google", "apple"],
    },
  },
});
```

Note the interaction with `apps/server/src/app.ts`: `authRouter` is mounted **before** `express.json()`, and neither new route reads a body, so nothing about the middleware order changes. Keep it that way — moving `authRouter` after the JSON parser breaks better-auth's raw-stream handler.

## Step-by-Step Plan

1. Install `@better-auth/expo` in `apps/server`; add the five env vars to `lib/env.ts` with the production-only conditions and update `apps/server/env.example` if one exists. (~25 min)
2. Write the failing tests first: default-web callback, `client=mobile`, `client=evil` → 400, ignored caller-supplied `callbackURL`, and the `trustedOrigins` assertion. (~40 min)
3. Refactor `GET /api/auth/google` into the shared `socialStart` factory with `callbackFor`; make the tests green with no change to existing web behaviour. (~30 min)
4. Add `plugins: [expo()]` and the mobile scheme to `trustedOrigins`; run the full server suite to confirm the plugin has not altered any existing response. (~20 min)
5. Add the Apple provider, the `GET /api/auth/apple` route and its test; add the account-linking block with the private-relay comment. (~35 min)
6. Register `/api/auth/apple`, `/api/auth/callback/apple` and the `client` parameter in `src/openapi/paths/auth.ts`; run `pnpm --filter server test` until `coverage.test.ts` passes. (~30 min)
7. Manual check with the dev server running: `curl -i "http://localhost:4000/api/auth/google?client=mobile"` and confirm the `Location` header's `redirect_uri`/state round-trip, and that the eventual callback target is the `kidlearn://` URL. (~15 min)
8. Write the provider-setup note (Google console: nothing new; Apple: Services ID, key, bundle ID) into `document/implementation/notes/`. (~15 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter server test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `GET /api/auth/google` with no query parameter behaves exactly as before — the web sign-in flow is unchanged end to end (verified in the browser, not only in tests).
- [ ] `GET /api/auth/google?client=mobile` and `GET /api/auth/apple?client=mobile` produce the `kidlearn://` callback; `client=evil` returns 400 `VALIDATION_ERROR`.
- [ ] A caller-supplied `callbackURL` query parameter is ignored — asserted in a test.
- [ ] `trustedOrigins` includes both `WEB_ORIGIN` and `MOBILE_APP_SCHEME`; CORS still allows exactly one browser origin.
- [ ] Session cookie attributes (`httpOnly`, `sameSite: "lax"`, `secure` in production) are unchanged.
- [ ] `pinVerifiedUntil` and `activeChildProfileId` remain `input: false` and writable only by their own routes.
- [ ] Account linking is enabled for verified-email matches, and the private-relay consequence is documented in a comment in `lib/auth.ts`.
- [ ] Every new route is registered in `src/openapi/paths/auth.ts`; `pnpm --filter server test` passes including `coverage.test.ts`.
- [ ] The server still refuses to boot on incomplete configuration, and Apple vars are required only in production.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.

## Out of Scope

- Any mobile-side code — M07 consumes what this file exposes.
- Email/password sign-in for parents. Disabled forever on this provider list (spec §4.2); file 31's admin surface is separate.
- Apple credential *creation* (Services ID, key, domain association). That needs the paid Apple account and belongs to M30/M31; this file only reads the values from env, and local development works without them.
- Widening CORS or adding a mobile-specific API surface. There is one API.
- Migrating the session model to JWTs. The cookie session is the source of truth for the PIN grant and the active child; a parallel token system would create a second one.
