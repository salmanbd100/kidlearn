# M07 — Mobile Auth Client & Session

> **Estimated effort:** 3–4 hours
> **Depends on:** M06
> **Requirement IDs:** FR-AUTH-02, FR-AUTH-06, NFR-SAFE-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Sign a parent in on a real phone and keep them signed in: the better-auth Expo client with the session cookie in the device keychain, Google and Apple buttons that open a system browser and deep-link back into `kidlearn://`, an `AuthProvider` that resolves the session behind the splash screen before any screen renders, sign-out that actually clears SecureStore, and the cookie wired into `apiFetch` through the provider hook M04 defined. After this file, `GET /api/auth/me` succeeds from the device.

## Context & Current State

- M06 shipped the server half: `expo()` plugin, `kidlearn://` in `trustedOrigins`, `GET /api/auth/google?client=mobile` and `GET /api/auth/apple?client=mobile` producing whitelisted `kidlearn://parent` callbacks, and the Apple provider.
- M04 shipped `apiFetch` with `setAuthHeaderProvider(fn)` — the single seam through which auth reaches every request. No screen sets headers itself.
- `GET /api/auth/me` (`apps/server/src/routes/auth.ts`) returns `{ parent, activeChildProfileId }` behind `requireParent`, and is also what lazily provisions the `Parent` row on a brand-new parent's first request. It is therefore the correct call to make immediately after sign-in — not an optimisation to skip.
- `packages/types` provides `AuthMeResponseSchema` / `AuthMeSchema` and `ParentSummarySchema`. Use them; do not describe the response again in `apps/mobile`.
- `apps/web/lib/active-child.tsx` is the web precedent for a session-shaped provider: statuses `"loading" | "ready" | "signedOut" | "error"`. Reuse that vocabulary so the two clients read the same way.
- **The native difference that trips people up:** `credentials: "include"` is a no-op in React Native. There is no cookie jar. The Expo plugin stores the cookie in SecureStore and returns it from `authClient.getCookie()`, which is **async** in current better-auth versions — any helper reading it must be `async`.
- SecureStore is backed by the iOS keychain and Android keystore. The session goes there; ordinary preferences (locale, mute) stay in AsyncStorage (M03).

## Detailed Requirements

1. **Auth client.** `lib/auth-client.ts` creating the better-auth client with `expoClient({ scheme: "kidlearn", storagePrefix: "kidlearn", storage: SecureStore })` and `baseURL: API_BASE_URL`. Exported as a module singleton — one client per app, as on the server.
2. **Register the header provider once.** At module load (imported from `app/_layout.tsx`), call `setAuthHeaderProvider(async () => { const cookie = await authClient.getCookie(); return cookie ? { Cookie: cookie } : {}; })`. This is the whole reason M04 has that seam: after this line, every existing and future `apiFetch` call is authenticated with no per-call code.
3. **Sign-in flows.** `signInWithGoogle()` and `signInWithApple()` in `lib/auth-client.ts`, each calling `authClient.signIn.social({ provider, callbackURL: "kidlearn://parent" })`. The plugin opens the system browser (`expo-web-browser`) and completes on the deep link. Both return a discriminated result so the screen can show a real error rather than a silent failure.
4. **Apple's native path.** On iOS, use `expo-apple-authentication`'s native sheet where available rather than a browser round-trip — it is what Apple expects and it reviews better. Fall back to the browser flow on Android (Apple sign-in on Android is a web flow by definition). Keep the branch inside `signInWithApple()` so screens do not know about it.
5. **`AuthProvider`.** `lib/auth.tsx` exporting `AuthProvider` and `useAuth(): { status, parent, activeChildProfileId, refresh, signOut }` with `status: "loading" | "signedOut" | "ready" | "error"`. On mount it calls `GET /api/auth/me` through `apiFetch` (parsed with `AuthMeSchema`) and derives the status from the result: `ok` → `ready`; a `401`/`UNAUTHENTICATED` → `signedOut`; anything else → `error` with the failure retained so the screen can offer a retry.
6. **Splash gate.** `app/_layout.tsx` holds `expo-splash-screen` until fonts (M02), i18n (M03) **and** the first session resolution have all settled. No screen may render while `status === "loading"` — a flash of the sign-in screen for an already-signed-in parent is the exact bug this prevents.
7. **Routing by status.** `app/index.tsx` becomes the router's decision point: `signedOut` → redirect to `/(parent)/login`; `ready` → redirect to `/(student)/select-profile` when a child profile exists, else `/(parent)` (onboarding continues in M08/M09); `error` → a retry screen using M04's `ColdStartNotice`, because the most likely cause is the free tier waking up.
8. **Login screen.** `app/(parent)/login.tsx`: parent theme, calm copy, the two provider buttons (each ≥44px, with the provider's required branding and wording), a localised explanation that this is the grown-ups' area, and an error region that maps `ApiFailure.code` to a message — never `error.message`, which is a developer hint.
9. **Sign-out.** `signOut()` calls `authClient.signOut()` **and** clears the SecureStore entries the plugin wrote, then resets the provider to `signedOut` and navigates to the login screen. A sign-out that leaves a stale cookie behind is a security bug, not a cosmetic one.
10. **Deep-link handling.** `app.config.ts` already declares the scheme (M01). Verify the OAuth return actually re-enters the app on both platforms, including the cold-start case: the app killed, sign-in completed in the browser, and the deep link launching the app fresh. That path is a separate code path from the warm one and is where these flows usually break.
11. **No PII in logs, no token anywhere but SecureStore.** No `console.*` in these files. Never write the cookie, the parent's email or a child's name to AsyncStorage or a log line (NFR-SAFE-02).
12. **Tests** (`lib/auth.test.tsx`): with `apiFetch` mocked, `AuthProvider` resolves `ready` and exposes the parsed parent; a `401` yields `signedOut`; a `500` yields `error` and `refresh()` re-runs; `signOut()` clears storage (assert the SecureStore mock was called) and transitions to `signedOut`; the header provider returns a `Cookie` header when a cookie exists and `{}` when it does not.

## Technical Approach & Suggestions

```
apps/mobile/lib/auth-client.ts        # better-auth client, signInWithGoogle/Apple, signOut, header provider
apps/mobile/lib/auth.tsx              # AuthProvider + useAuth
apps/mobile/lib/auth.test.tsx
apps/mobile/app/_layout.tsx           # + AuthProvider, splash gate
apps/mobile/app/index.tsx             # status-based redirect
apps/mobile/app/(parent)/login.tsx
apps/mobile/app/(parent)/_layout.tsx  # parent theme (from M02) + Stack
```

```ts
// apps/mobile/lib/auth-client.ts
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { setAuthHeaderProvider } from "./api-client";
import { API_BASE_URL } from "./env";

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  plugins: [
    expoClient({ scheme: "kidlearn", storagePrefix: "kidlearn", storage: SecureStore }),
  ],
});

/**
 * The single place auth meets the API client. `credentials: "include"` does
 * nothing on native — without this, every request is anonymous.
 * `getCookie()` is async in current better-auth; awaiting it is not optional.
 */
setAuthHeaderProvider(async () => {
  const cookie = await authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
});

const POST_LOGIN_URL = "kidlearn://parent";

export async function signInWithGoogle() {
  return authClient.signIn.social({ provider: "google", callbackURL: POST_LOGIN_URL });
}
```

The Apple branch, kept behind the same function signature:

```ts
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

export async function signInWithApple() {
  if (Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync())) {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    // better-auth verifies the identity token against APPLE_APP_BUNDLE_IDENTIFIER (M06).
    return authClient.signIn.social({ provider: "apple", idToken: { token: credential.identityToken ?? "" } });
  }
  return authClient.signIn.social({ provider: "apple", callbackURL: POST_LOGIN_URL });
}
```

`AuthProvider` — status vocabulary lifted from `apps/web/lib/active-child.tsx`:

```tsx
export type AuthStatus = "loading" | "signedOut" | "ready" | "error";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: AuthStatus; parent?: ParentSummaryResponse; activeChildProfileId?: string | null; error?: ApiFailure }>({ status: "loading" });

  const refresh = useCallback(async () => {
    const result = await apiFetch<AuthMe>("/api/auth/me", { parseWith: AuthMeSchema });
    if (result.ok) {
      setState({ status: "ready", parent: result.data.parent, activeChildProfileId: result.data.activeChildProfileId });
      return;
    }
    // 401 is not an error state — it is the app's normal starting point.
    setState(result.error.status === 401
      ? { status: "signedOut" }
      : { status: "error", error: result.error });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // …signOut, memoised value, provider
}
```

Deep links are much easier to debug from the command line than through a full OAuth round-trip:

```bash
# Android
adb shell am start -W -a android.intent.action.VIEW -d "kidlearn://parent" net.kidlearn.app
# iOS simulator
xcrun simctl openurl booted "kidlearn://parent"
```

Test the cold-start deep link explicitly: force-stop the app, then run the command above. A warm-only implementation looks perfect right up until a real parent's browser takes long enough for iOS to reclaim the app.

## Step-by-Step Plan

1. Install `better-auth`, `@better-auth/expo`, `expo-secure-store`, `expo-web-browser`, `expo-linking`, `expo-apple-authentication`; add the Apple config plugin to `app.config.ts` (`usesAppleSignIn: true`). Rebuild the development client — new native modules require a new build, not just a bundler restart. (~30 min)
2. Write `lib/auth-client.ts` with the client, `setAuthHeaderProvider` registration and `signInWithGoogle`. (~25 min)
3. Write the failing `AuthProvider` tests (ready / signedOut / error / refresh / signOut clears storage / header provider), then implement `lib/auth.tsx`. (~45 min)
4. Wire `AuthProvider` into `app/_layout.tsx` inside the existing provider order, and extend the splash gate to include session resolution. (~20 min)
5. Build `app/(parent)/_layout.tsx` (parent theme + Stack) and `app/(parent)/login.tsx` with the Google button and localised copy. (~30 min)
6. End-to-end on a **physical Android device** against the dev server: tap Google, complete in the browser, land back in the app, and confirm `GET /api/auth/me` returns the parent. Then force-stop the app and repeat to prove the cold-start deep link. (~35 min)
7. Add `signInWithApple` with the iOS native branch and the Apple button; verify on an iOS simulator or device if the Apple account is available, otherwise leave the button behind a `Platform.OS === "ios"` check and note that M31 verifies it for real. (~30 min)
8. Implement `signOut` (server call + SecureStore clear + navigation) and confirm on device that a subsequent `/api/auth/me` returns 401. (~20 min)
9. Add the status-based redirect in `app/index.tsx`, including the `error` retry using `ColdStartNotice`. (~20 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A parent signs in with Google on a **physical device** and `GET /api/auth/me` returns their parent record; the session survives an app restart without re-authenticating.
- [ ] The OAuth deep link re-enters the app in both the warm case and the **cold-start** case (app force-stopped before completing sign-in).
- [ ] Every `apiFetch` call is authenticated purely because `setAuthHeaderProvider` is registered — no screen or API module sets a cookie or token header.
- [ ] `authClient.getCookie()` is awaited everywhere it is read; no synchronous cookie access remains.
- [ ] Sign-out clears SecureStore, and the next `/api/auth/me` returns 401.
- [ ] The splash screen is held until fonts, i18n and session all resolve — an already-signed-in parent never sees the login screen flash.
- [ ] The login screen shows a localised, code-mapped error for a failed sign-in and never renders `error.message`.
- [ ] `packages/types` schemas type and parse the `/api/auth/me` response; no response shape is redeclared in `apps/mobile`.
- [ ] No cookie, email or child name is written to AsyncStorage or any log line.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Consent, PIN setup and the PIN gate — M08. This file gets a parent authenticated; it does not open the parent area.
- Child profiles and the profile picker — M09/M10.
- Apple credential creation in the developer portal — M30/M31 (needs the paid account). The code path exists and is exercised as far as the credentials allow.
- Session refresh UI or a "you were signed out" toast. better-auth's 30-day sliding session with a one-day `updateAge` makes this a non-event at MVP.
- Biometric unlock. Deliberately excluded: the PIN gate must be hard for a child, and a child's face or finger unlocks a phone (design.md §7).
