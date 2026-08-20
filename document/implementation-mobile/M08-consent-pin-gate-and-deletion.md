# M08 — Consent, PIN Gate & Account Deletion

> **Estimated effort:** 3–4 hours
> **Depends on:** M07
> **Requirement IDs:** FR-AUTH-03, FR-AUTH-04, FR-AUTH-05, NFR-SAFE-03, NFR-SAFE-05, NFR-SAFE-06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Open the parent area properly: record COPPA consent, set and verify the 4-digit parental PIN against the server's 15-minute session grant, wrap every parent route in a gate a pre-reader cannot pass, and give the parent an in-app account-deletion path — which both app stores require, not just the spec. The onboarding order is fixed by the server's own guards: consent → PIN → (M09) first child profile.

## Context & Current State

The server side is already complete (`apps/server/src/routes/parent.ts`), and its guard placement dictates this file's flow:

- `GET /api/parent/gate-status` — **not** PIN-gated, by design: "a gate cannot be asked whether it is shut from the far side of itself". Costs no query, answers while the database is asleep. Returns `GateStatus` (`packages/types` → `GateStatusSchema`): whether consent exists, whether a PIN exists, and whether the current session holds a live grant.
- `POST /api/parent/consent` — body `{ version }`, **not** PIN-gated (consent is normally a new parent's first act). Returns `{ consentGivenAt, consentVersion }`. `CONSENT_VERSION` is exported by `packages/types` — send that constant, never a literal.
- `POST /api/parent/pin` — body `{ pin, currentPin? }`, **not** PIN-gated (a parent with no PIN could never get through the gate to create one). Returns `{ hasPin: true, pinVerifiedUntil }` — it *opens a grant*, so onboarding can walk straight on to the gated first-profile form without a second prompt.
- `POST /api/parent/pin/verify` — body `{ pin }`. Returns `{ pinVerifiedUntil }`.
- `POST /api/parent/account/delete-request` — `requirePinVerified`. Returns `{ confirmationToken, expiresAt }` (15 minutes).
- `DELETE /api/parent/account` — body `{ confirmationToken }`. Irreversible, synchronous erasure of the parent and every child profile. Guarded by the token rather than the PIN, because the token was itself issued behind the gate. Afterwards the caller's cookie resolves to nothing.
- The grant lives on the **session** (`pinVerifiedUntil`, `input: false`), so it survives an app restart and is revoked by signing out. The client must never keep its own countdown as the source of truth.
- `requireConsent` and `requirePinVerified` are the middleware enforcing all of the above; a client-side gate is a UX convenience over a server decision, never a substitute.
- M05 shipped `PinKeypad` (masked display, own digits, no OS keyboard, no biometrics) and `Sheet`. M07 shipped `useAuth()` and the authenticated `apiFetch`.
- `apps/web/app/(parent)` is the flow to mirror: `login → onboarding/consent → onboarding/pin → onboarding/child`, with `PinGate` wrapping the gated area. Read `apps/web/lib/parent-errors.ts` for the existing code→message mapping and reuse its vocabulary.

## Detailed Requirements

1. **`lib/parent-api.ts`** — typed wrappers for the six endpoints above, returning `ApiResult<T>` with types from `packages/types` (`GateStatusResponse`, `PinGrantResponse`, `PinStatusResponse`, `ConsentRecordResponse`, `DeletionRequestResponse`, `DeletedResponse`). No response shape redeclared locally.
2. **`lib/gate.tsx`** — `GateProvider` + `useGate()` exposing `{ status, hasConsent, hasPin, grantedUntil, refresh, verify(pin), setPin(pin, currentPin?) }`. It calls `GET /api/parent/gate-status` on mount and after every mutation. `grantedUntil` is stored as returned by the server; the client may *display* remaining time but must re-check with the server, never assume.
3. **Consent screen** (`app/(parent)/onboarding/consent.tsx`) — the COPPA text (localised, both languages, from the `parent` namespace), an explicit affirmative action (a button labelled with what it means, not "OK"), and a link to the privacy policy opened in a browser sheet. On success, route to the PIN screen. Consent is recorded with `CONSENT_VERSION` from `packages/types`.
4. **PIN setup screen** (`app/(parent)/onboarding/pin.tsx`) — enter 4 digits, then confirm them. Mismatch is an inline error with both fields cleared, not a silent reset. On success, the returned grant is live, so route straight into the parent area without a second PIN prompt (this is why the endpoint returns a grant — do not add a redundant verify call).
5. **`components/parent/PinGate.tsx`** — wraps the gated parent area. If a live grant exists, render children. Otherwise render the keypad with calm copy ("Grown-ups only — enter your PIN"), and on success re-render the children. Failed attempts show the server's mapped error; after 5 consecutive failures the gate adds a 30-second cool-down **in the UI only** (the server is the real authority; this exists so a child cannot brute-force by hammering).
6. **Gate placement.** `app/(parent)/_layout.tsx` renders `PinGate` around the whole group **except** `login` and the two onboarding screens — those are pre-gate by definition. Implement the exception with route segments, not a string check on the pathname.
7. **Re-check on foreground.** When the app returns to the foreground, `PinGate` re-reads `gate-status` before rendering gated content. A phone left on a table for an hour must not still be inside the parent area because the JS timer was frozen while backgrounded. (This is the same class of bug as M25's screen-time re-check, and the two must behave consistently.)
8. **Onboarding routing.** A signed-in parent's landing route derives from `gate-status`: no consent → consent screen; consent but no PIN → PIN setup; both → the parent area (which, with no children yet, sends them to M09's "add your first child"). Put this decision in one function so it is testable and there is exactly one source of truth.
9. **Account deletion** (`app/(parent)/settings/delete-account.tsx`) — behind the gate. Two explicit steps mirroring the server: a `Sheet` explaining exactly what is destroyed (the account, every child profile, all progress; irreversible) requiring the parent to type the word from the localised copy, then `POST /api/parent/account/delete-request`, then `DELETE /api/parent/account` with the returned token, then sign out locally, clear SecureStore, and land on the login screen. Handle an expired token by returning to step one with a clear message — never by retrying silently.
10. **Settings screen** (`app/(parent)/settings/index.tsx`) — the permanent home for the M03 language toggle, a "change PIN" entry (reusing the PIN setup screen with `currentPin`), sign-out, and the deletion entry point. Store review asks where account deletion lives; it needs to be reachable in two taps from the parent area.
11. **No PIN anywhere but in flight.** The PIN is never written to SecureStore, AsyncStorage, a log, or component state that outlives the screen. No "remember my PIN". The masked display holds it only until submit.
12. **Tests** (`lib/gate.test.tsx`, `components/parent/PinGate.test.tsx`, `app/(parent)/onboarding/pin.test.tsx`): a live grant renders children; no grant renders the keypad; a correct PIN transitions to children; a wrong PIN shows the mapped error and does not transition; 5 failures start the cool-down and the keypad stops submitting; foregrounding re-reads `gate-status` and re-locks when the grant has expired; PIN setup rejects a mismatched confirmation; the onboarding router returns the right destination for each of the three gate states.

## Technical Approach & Suggestions

```
apps/mobile/lib/parent-api.ts
apps/mobile/lib/gate.tsx
apps/mobile/lib/gate.test.tsx
apps/mobile/lib/onboarding-route.ts          # pure: gate status -> destination
apps/mobile/lib/onboarding-route.test.ts
apps/mobile/components/parent/PinGate.tsx
apps/mobile/components/parent/PinGate.test.tsx
apps/mobile/app/(parent)/_layout.tsx         # PinGate around the gated segments
apps/mobile/app/(parent)/onboarding/consent.tsx
apps/mobile/app/(parent)/onboarding/pin.tsx
apps/mobile/app/(parent)/settings/index.tsx
apps/mobile/app/(parent)/settings/delete-account.tsx
```

Keep the routing decision pure so it can be tested without a renderer:

```ts
// apps/mobile/lib/onboarding-route.ts
import type { GateStatusResponse } from "@kidlearn/types";

export type OnboardingDestination =
  | "/(parent)/onboarding/consent"
  | "/(parent)/onboarding/pin"
  | "/(parent)";

export function nextOnboardingRoute(gate: GateStatusResponse): OnboardingDestination {
  if (!gate.hasConsent) return "/(parent)/onboarding/consent";
  if (!gate.hasPin) return "/(parent)/onboarding/pin";
  return "/(parent)";
}
```

The gate itself — note that the grant's validity is re-read from the server rather than computed from a stored timestamp:

```tsx
export function PinGate({ children }: { children: ReactNode }) {
  const { status, grantedUntil, refresh, verify } = useGate();

  // A backgrounded app's timers are frozen; the grant may have expired while the
  // phone sat on a table. Re-ask the server, do not trust the last answer.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  if (status === "loading") return <Spinner />;
  if (grantedUntil && new Date(grantedUntil) > new Date()) return <>{children}</>;
  return <PinPrompt onSubmit={verify} />;
}
```

For the deletion confirmation, take the required word from the localised copy rather than hardcoding "DELETE" — a Bengali-speaking parent should not have to type an English word. Put the expected string in the same translation file as the warning text, and compare after trimming.

Map error codes to copy in one module, mirroring `apps/web/lib/parent-errors.ts`: `PIN_REQUIRED`, `PIN_VERIFICATION_REQUIRED`, `CONSENT_REQUIRED`, `INVALID_PIN` and the deletion token's expiry each have a distinct screen or message. Read that file first and match its mapping so the two clients cannot drift.

## Step-by-Step Plan

1. Write `lib/parent-api.ts` against the six endpoints with `packages/types` types; confirm each returns real data from the dev server using the placeholder screen or a temporary button. (~30 min)
2. Write `lib/onboarding-route.ts` + tests (three gate states). (~15 min)
3. Write the failing `GateProvider` tests, then implement `lib/gate.tsx`. (~35 min)
4. Build the consent screen with localised COPPA copy in both languages and the privacy-policy link; verify `POST /api/parent/consent` records `CONSENT_VERSION`. (~30 min)
5. Build the PIN setup screen on M05's `PinKeypad` (enter + confirm, mismatch handling) and confirm the returned grant lets you into the gated area with no second prompt. (~35 min)
6. Build `PinGate` with the failing tests first (grant renders children, wrong PIN, 5-failure cool-down, foreground re-check), then wire it into `app/(parent)/_layout.tsx` with the pre-gate route exceptions. (~40 min)
7. Build the settings screen (language toggle, change PIN, sign out, delete account). (~25 min)
8. Build the two-step deletion flow; test it against the dev server with a throwaway parent account and confirm the child profiles are gone and the session no longer authenticates. (~35 min)
9. Device pass: on a real phone, confirm the gate re-locks after the grant expires while backgrounded, and that TalkBack announces the keypad digits and the gate's purpose. (~25 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A brand-new parent is routed consent → PIN → parent area, with the PIN screen's returned grant carrying them in without a second prompt.
- [ ] `GET /api/parent/gate-status` is the only source of truth for whether the gate is open; no client-side countdown grants access.
- [ ] Backgrounding the app for longer than the grant and returning re-locks the parent area — verified on a physical device, not only in a test.
- [ ] A wrong PIN shows a localised message mapped from the server's error **code**; five consecutive failures trigger the UI cool-down.
- [ ] The gate cannot be passed by a pre-reader: digits must be read and typed on the app's own keypad, with no OS keyboard, no autofill and no biometric path (design.md §7).
- [ ] Consent is recorded with `CONSENT_VERSION` from `packages/types`, and the COPPA copy renders in EN and BN.
- [ ] Account deletion is reachable in two taps from the parent area, requires typing the localised confirmation word, completes both server steps, clears SecureStore, and leaves the session unable to authenticate.
- [ ] An expired deletion token returns the parent to step one with a clear message.
- [ ] The PIN never appears in storage, logs or persisted state.
- [ ] Error-code→copy mapping matches `apps/web/lib/parent-errors.ts`.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Child profile creation — M09, even though it is the next onboarding step. The gate is what this file delivers.
- Email confirmation of deletion. The server returns the token in the response at MVP and its comment says only that handler changes later; the client contract is already correct.
- PIN recovery / "forgot PIN". Not in the spec, and a recovery path is a gate bypass unless designed carefully. Raise it as a spec question rather than inventing one here.
- Rate limiting the verify endpoint server-side. The UI cool-down is a child-deterrent; real rate limiting is a server concern and would need a spec entry.
- The privacy policy document itself — M30 (it must exist at a public URL before submission).
