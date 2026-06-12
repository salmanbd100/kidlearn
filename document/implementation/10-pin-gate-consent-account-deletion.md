# 10 — PIN Gate, Consent & Account Deletion

> **Estimated effort:** 3–4 hours
> **Depends on:** 09
> **Requirement IDs:** FR-AUTH-03, FR-AUTH-04, FR-AUTH-05, NFR-SAFE-03, NFR-SAFE-05, NFR-SAFE-06
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Add the three safety pillars on top of Google auth: a 4-digit parental PIN gating every parent-dashboard/settings route (FR-AUTH-04) via a short-lived `pinVerifiedUntil` session grant, an explicit COPPA consent record that must exist before any child profile can be created (FR-AUTH-03, NFR-SAFE-03), and full account deletion with a confirmation-token flow that cascades through every child's data (FR-AUTH-05, NFR-SAFE-05..06). The PIN is an app-level check layered on the existing session — not a second auth system.

## Context & Current State

File 09 is done: better-auth Google sign-in works, cookie sessions exist with an `activeChildProfileId` additional field, `requireParent` attaches `req.parent` (Prisma `Parent` row) and `req.session`, and `GET /api/auth/me` reports `hasPin` and `consentGivenAt`. The `Parent` model (file 03) already has `pinHash String?` plus the canonical consent fields `consentGivenAt DateTime?` and `consentVersion String?` — use these exact names (do not introduce a `consentAt` alias). Child-profile routes don't exist yet (file 11) — but this file ships the consent guard they will mount.

## Detailed Requirements

1. **PIN set (FR-AUTH-04):** `POST /api/parent/pin` with body `{ pin: "0000"–"9999" }` (Zod: `z.string().regex(/^\d{4}$/)`). Hash with **argon2id** (`argon2` package — preferred over bcrypt for new code) into `Parent.pinHash`. Setting a PIN when one exists requires the current PIN: body `{ pin, currentPin }`; wrong `currentPin` → 403 `FORBIDDEN`. Raw PINs are never logged or returned.
2. **PIN verify (FR-AUTH-04):** `POST /api/parent/pin/verify` with `{ pin }`. On success, write a **session flag** `pinVerifiedUntil` = now + 15 minutes (better-auth session `additionalFields`, same mechanism as `activeChildProfileId` — decision: session flag, not a separate signed cookie, so there is exactly one session source of truth and logout kills the grant automatically). On failure → 403 with code `PIN_INVALID`. Apply a small brute-force guard: after 5 consecutive failures store a lockout until +60s (`pinFailedCount`, `pinLockedUntil` on Parent) → 429 `PIN_LOCKED`.
3. **`requirePinVerified` middleware:** runs after `requireParent`; 403 `PIN_REQUIRED` if `Parent.pinHash` is null (client should route to PIN setup); 403 `PIN_VERIFICATION_REQUIRED` if `pinVerifiedUntil` is absent or in the past. Mounted on a `/api/parent/*` router that all later parent-dashboard/settings routes (28–30) attach to. Student-portal routes never use it (FR-AUTH-06: profile switching stays PIN-free).
4. **Consent capture (FR-AUTH-03, NFR-SAFE-03):** `POST /api/parent/consent` with `{ accepted: z.literal(true), version: z.string() }` recording `consentGivenAt = now()` and `consentVersion` on Parent. The current consent text version is a server constant `CONSENT_VERSION = "2026-06-v1"` in `lib/consent.ts`; posting a stale version → 409 `CONFLICT` with message "consent version outdated". Export a guard `requireConsent` that returns 403 `CONSENT_REQUIRED` when `consentGivenAt` is null — file 11 mounts it on `POST /api/children`. Consent is idempotent (re-posting updates version/timestamp).
5. **Account deletion (FR-AUTH-05, NFR-SAFE-05):** two-step confirmation flow:
   - `POST /api/parent/account/delete-request` (behind `requirePinVerified`) → generates a random 32-byte token, stores `deleteToken` + `deleteTokenExpiresAt` (now + 15 min) on Parent, returns `{ data: { confirmationToken } }` (MVP returns it directly; an email step can replace this later without API change).
   - `DELETE /api/parent/account` with `{ confirmationToken }` → verifies token + expiry, then in **one transaction** deletes: all `ChildProfile`s and their cascading data (LessonProgress, QuizResponse, RewardLedger, ChildCharacter, Streak, ScreenTimeSetting, SessionEvent, WeeklyReport), the Parent row, and the better-auth `User`/`Session`/`Account` rows. Prefer `onDelete: Cascade` in the Prisma schema (verify files 03/06 set it; add a migration here if not) so the transaction is `deleteMany(children) → delete(parent) → delete(user)`. Returns 204-style `{ data: { deleted: true } }` and the session is gone (cookie invalid).
6. **Audit notes (NFR-SAFE-06):** write `document/implementation/notes/compliance-consent-deletion.md` (short, ~30 lines) recording: what the consent record stores (who/when/version), that deletion is synchronous and complete (no soft-delete of child PII), what is intentionally retained (nothing personal; anonymous aggregate counters allowed), and the GDPR right-to-erasure / COPPA verifiable-consent mapping.
7. **Gate-bypass tests:** parent-area route without PIN verify → 403; expired `pinVerifiedUntil` → 403; PIN verify then access → 200; deletion without token / with expired token → 403; deletion actually removes child rows; consent guard blocks then unblocks.

## Technical Approach & Suggestions

Files (under `/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/lib/pin.ts                      # hashPin / verifyPin (argon2)
src/lib/consent.ts                  # CONSENT_VERSION constant
src/middleware/require-pin-verified.ts
src/middleware/require-consent.ts
src/routes/parent.ts                # /api/parent: pin, pin/verify, consent, account deletion
src/services/account-deletion.ts    # transaction logic, unit-testable
src/routes/parent.test.ts
src/middleware/require-pin-verified.test.ts
```

New deps: `argon2`. Migration in `packages/db` adds to Parent: `pinFailedCount Int @default(0)`, `pinLockedUntil DateTime?`, `deleteToken String?`, `deleteTokenExpiresAt DateTime?` — `pnpm --filter @kidlearn/db prisma migrate dev --name parent_pin_consent_deletion`. (The consent columns `consentGivenAt`/`consentVersion` already exist from file 03 — do not re-add them.) Also add session additional field `pinVerifiedUntil: { type: "date", required: false }` in `lib/auth.ts`.

`src/lib/pin.ts`:

```ts
import argon2 from "argon2";

export const hashPin = (pin: string) => argon2.hash(pin, { type: argon2.argon2id });
export const verifyPin = (hash: string, pin: string) => argon2.verify(hash, pin);
```

`src/middleware/require-pin-verified.ts`:

```ts
import { ApiError } from "../lib/errors";

export function requirePinVerified(req: Request, _res: Response, next: NextFunction) {
  if (!req.parent?.pinHash) {
    return next(new ApiError(403, "FORBIDDEN", "PIN setup required", { reason: "PIN_REQUIRED" }));
  }
  const until = req.session?.pinVerifiedUntil;
  if (!until || new Date(until).getTime() < Date.now()) {
    return next(new ApiError(403, "FORBIDDEN", "PIN verification required", { reason: "PIN_VERIFICATION_REQUIRED" }));
  }
  next();
}
```

(If distinct top-level codes are preferred over `details.reason`, extend `ErrorCode` in `lib/errors.ts` with `"PIN_REQUIRED" | "PIN_VERIFICATION_REQUIRED" | "CONSENT_REQUIRED" | "PIN_LOCKED"` — do that; it keeps clients switch-friendly. Update file 08's type, it was designed to be extended.)

PIN verify route core:

```ts
router.post("/pin/verify", requireParent, validate({ body: z.object({ pin: z.string().regex(/^\d{4}$/) }) }),
  async (req, res, next) => {
    const parent = req.parent!;
    if (parent.pinLockedUntil && parent.pinLockedUntil > new Date())
      return next(new ApiError(429, "PIN_LOCKED", "Too many attempts, try again soon"));
    if (!parent.pinHash) return next(new ApiError(403, "PIN_REQUIRED", "No PIN set"));
    if (!(await verifyPin(parent.pinHash, req.body.pin))) {
      const failed = parent.pinFailedCount + 1;
      await prisma.parent.update({ where: { id: parent.id }, data: {
        pinFailedCount: failed,
        pinLockedUntil: failed >= 5 ? new Date(Date.now() + 60_000) : null,
      }});
      return next(new ApiError(403, "PIN_INVALID" as ErrorCode, "Incorrect PIN"));
    }
    await prisma.parent.update({ where: { id: parent.id }, data: { pinFailedCount: 0, pinLockedUntil: null } });
    const pinVerifiedUntil = new Date(Date.now() + 15 * 60_000);
    await auth.api.updateSession?.({ /* set pinVerifiedUntil via better-auth session update */ })
      ?? await prisma.session.update({ where: { id: req.session!.id }, data: { pinVerifiedUntil } });
    res.json({ data: { pinVerifiedUntil } });
  });
```

(Check better-auth's current API for updating session additional fields; if no public helper exists, updating the Prisma `Session` row directly is acceptable — note it in a comment. Verify field write-through with `auth.api.getSession` in a test.)

`src/services/account-deletion.ts`:

```ts
export async function deleteParentAccount(parentId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.childProfile.deleteMany({ where: { parentId } }); // cascades child data via onDelete: Cascade
    await tx.parent.delete({ where: { id: parentId } });
    await tx.user.delete({ where: { id: userId } });           // cascades Session/Account
  });
}
```

Confirmation token: `crypto.randomBytes(32).toString("hex")`; compare with `crypto.timingSafeEqual` on buffers.

Router mounting in `app.ts`: `app.use("/api/parent", requireParent, parentRouter)` with `requirePinVerified` applied per-route (pin set/verify and consent must NOT require prior PIN verification — chicken-and-egg; deletion request DOES).

## Step-by-Step Plan

1. Migration: add PIN-lockout, delete-token (and consent fields if missing) to Parent; add `pinVerifiedUntil` session additional field in `lib/auth.ts`; regenerate Prisma client. (~20 min)
2. TDD `lib/pin.ts` (hash/verify round-trip, wrong PIN false) and extend `ErrorCode` with the four new codes. (~15 min)
3. Failing tests then implement `POST /api/parent/pin` (set, change-with-currentPin, wrong currentPin 403). (~25 min)
4. Failing tests then implement `POST /api/parent/pin/verify` incl. lockout after 5 failures (429) and session-flag write; assert the flag is visible via a follow-up `getSession`. (~30 min)
5. TDD `requirePinVerified` with a scratch route: no PIN set → `PIN_REQUIRED`; not verified → `PIN_VERIFICATION_REQUIRED`; verified → 200; expired (mock `Date.now` or set a past value) → 403. (~25 min)
6. TDD consent: `POST /api/parent/consent` records timestamp+version; stale version → 409; `requireConsent` guard blocks (`CONSENT_REQUIRED`) and passes after consent. (~25 min)
7. TDD deletion: delete-request issues token (and is itself PIN-gated); `DELETE /api/parent/account` with bad/expired token → 403; happy path removes Parent + ChildProfiles + better-auth User in one transaction (assert rows gone; verify cascade config, add `onDelete: Cascade` migration if missing). (~35 min)
8. Write `notes/compliance-consent-deletion.md`; run `pnpm lint && pnpm typecheck && pnpm --filter server test`; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes including every gate-bypass case: missing PIN setup, unverified session, expired grant, wrong PIN, locked-out PIN, missing consent, bad deletion token.
- [ ] A PIN-gated scratch route returns 403 before `POST /api/parent/pin/verify` and 200 within 15 minutes after; after expiry it returns 403 again.
- [ ] 5 wrong PIN attempts → 429 `PIN_LOCKED`; correct PIN after lockout window resets the counter.
- [ ] `POST /api/children` (simulated guard test) is blocked with `CONSENT_REQUIRED` until `POST /api/parent/consent` succeeds — FR-AUTH-03 enforced server-side.
- [ ] Full deletion test: after `DELETE /api/parent/account`, `parent`, `childProfile`, and better-auth `user`/`session` rows for that account are all absent; the old session cookie gets 401 on `/api/auth/me`.
- [ ] Raw PIN values never appear in logs or response bodies; `pinHash` never serialized.
- [ ] `document/implementation/notes/compliance-consent-deletion.md` exists covering consent record contents, deletion completeness, and COPPA/GDPR mapping.
- [ ] `pnpm lint` and `pnpm typecheck` pass; new migration(s) committed.

## Out of Scope

- Child profile CRUD itself and mounting `requireConsent` on the real `POST /api/children` (file 11).
- Frontend PIN pad, consent checkbox UI, deletion confirmation screens (file 14).
- Screen-time settings routes that will sit behind `requirePinVerified` (file 28); dashboard routes (29–30).
- GDPR data **export** endpoint (post-MVP; noted in the compliance doc), email-based deletion confirmation.
