# Remove the parental PIN gate

**Date:** 2026-09-09
**Status:** approved, not yet implemented

## Goal

Remove the parental PIN in full — endpoints, middleware, database columns, UI
and documented requirement — so that the parent area is reached by Google
sign-in alone. The motive is simplicity: the PIN is the single most
cross-cutting feature in the codebase relative to what it delivers, spanning
five columns, three endpoints, eight middleware mounts, a React context with a
grant-expiry timer, and a functional requirement mirrored across four documents
and the mobile plan.

## Accepted trade-off

FR-AUTH-04 exists because the Google session persists on a shared family
tablet. Once the gate is gone, the lock icon in the Student Portal is a one-tap
door into a dashboard that can edit and delete child profiles and request
account deletion. This is a deliberate, recorded decision, not an oversight.

Two things soften it and both are retained:

- The `ParentCorner` exit keeps its deliberate dullness — an anonymous lock on
  every screen a child is using, named only on `/select-profile`, which is the
  hand-off screen where no child is playing yet.
- Account deletion keeps its two-step confirmation-token flow. Step one issues a
  64-hex token with a 15-minute expiry; step two requires it back. A stray
  single tap cannot erase an account.

Account deletion gains no replacement guard. Adding a typed confirmation or a
Google re-authentication was considered and rejected: both reintroduce the
concept this change removes.

## Non-goals

- COPPA consent (FR-AUTH-03) is untouched. `Parent.consentGivenAt`,
  `consentVersion`, `POST /api/parent/consent` and the `CONSENT_REQUIRED` gate
  on `POST /api/children` all stay exactly as they are.
- Active-child scoping (FR-AUTH-06's session mechanism) is untouched. Only that
  requirement's PIN clause is edited.
- `Parent.deleteToken` and `deleteTokenExpiresAt` stay.
- No new guard replaces the PIN anywhere.

## Sequencing

One branch, one PR. The layers are too interlocked to stage: removing `hasPin`
from `ParentSummarySchema` breaks `assertContract` in server and web tests in
the same commit, and the alternative — landing a deliberately-defanged security
middleware on `main` as an intermediate step — is harder to review than
deleting it outright.

## 1. Database

One forward migration. The 22 existing migrations are committed and must not be
edited.

`packages/db/prisma/migrations/20260909000000_remove_parent_pin/migration.sql`:

```sql
ALTER TABLE "Parent" DROP COLUMN "pinHash",
  DROP COLUMN "pinFailedCount",
  DROP COLUMN "pinLockoutStrikes",
  DROP COLUMN "pinLockedUntil";

ALTER TABLE "session" DROP COLUMN "pinVerifiedUntil";
```

`packages/db/prisma/schema.prisma`: drop those four fields from `Parent` and
`pinVerifiedUntil` from `Session`, together with the two explanatory comment
blocks that justify the lockout counters and the grant.

`packages/db/src/schema.test.ts`: the three assertions covering
`pinFailedCount`, `pinLockoutStrikes`, `pinLockedUntil` and
`Session.pinVerifiedUntil` are replaced by one asserting all five columns are
absent from the schema.

The migration cannot be run from the implementing session: `prisma migrate dev`
needs `DIRECT_URL` and a live Supabase connection. The SQL is hand-written and
`pnpm db:migrate` is the engineer's step. Everything downstream of it must be
reported as unverified until it has run.

## 2. Server

Deleted outright:

- `apps/server/src/lib/pin.ts` and `pin.test.ts`
- `apps/server/src/middleware/require-pin-verified.ts` and its test
- `argon2` from `apps/server/package.json` — `lib/pin.ts` is its only consumer;
  admin email/password auth hashes through better-auth's own scrypt

`apps/server/src/services/parentSecurityService.ts` reduces to consent alone and
is renamed `parentConsentService.ts`, because "security" stops describing it.
Removed from it: `PIN_GRANT_MS`, `MAX_PIN_ATTEMPTS`, `PIN_LOCKOUT_BASE_MS`,
`PIN_LOCKOUT_MAX_MS`, `lockoutMsFor`, `isRecordNotFound`, `PinGrant`,
`GateStatus`, `readGateStatus`, `setParentPin`, `verifyParentPinForSession`,
`grantPinToSession`, `PIN_LOCKED`, `consumePinAttempt`, `restoreOneAttempt`,
`claimAttemptSlot`, `armLockout`. Retained: `ConsentRecord`,
`recordParentConsent`.

`apps/server/src/routes/parent.ts`: delete the `GET /gate-status`,
`POST /pin` and `POST /pin/verify` handlers with their response types
(`PinSetResponse`, `PinVerifyResponse`, `GateStatusResponse`). Remove
`requirePinVerified` from `POST /account/delete-request` and rewrite the comment
above it: the token flow, not the gate, is what now stands between a session and
an erased account.

`apps/server/src/routes/children.ts`: remove all seven `requirePinVerified`
mounts and the import.

`apps/server/src/schemas/parent.ts`: delete `PinSchema`, `SetPinSchema`,
`VerifyPinSchema`. Keep `ConsentSchema`, `DeleteAccountSchema`.

`apps/server/src/lib/auth.ts`: remove `pinVerifiedUntil` from the session
`additionalFields` and the comment explaining why it was `input: false`.

`apps/server/src/lib/errors.ts`: edit the comment listing the three
destinations behind a shared 403 — only `CONSENT_REQUIRED` remains.

`apps/server/src/services/parentService.ts`: remove `hasPin` from
`ParentSummary` and from the object `findOrCreateParentForUser` returns, plus
the comment about choosing between "set a PIN" and "enter your PIN". Keep the
doc comment's point that fields on `Parent` stay invisible to HTTP until added
deliberately — it is still true and still load-bearing.

## 3. Shared types

`packages/types/src/api/parent.ts`: delete `PinStatusSchema`,
`GateStatusSchema`, `GateStatusResponse`, `PinGrantSchema` and the
`PinStatusResponseSchema` / `PinGrantResponseSchema` / `GateStatusResponseSchema`
wrappers. Update the file's leading comment — the router is now consent and
deletion.

`packages/types/src/api/auth.ts`: remove `hasPin` from `ParentSummarySchema`.

`packages/types/src/api/errors.ts`: remove `PIN_REQUIRED`,
`PIN_VERIFICATION_REQUIRED`, `PIN_INVALID` and `PIN_LOCKED` from `ERROR_CODES`.
Doing this early in the implementation is deliberate: narrowing the union turns
every surviving reference anywhere in the monorepo into a type error, which is
the mechanism that stops a stale branch surviving the change.

## 4. OpenAPI

`apps/server/src/openapi/paths/parent.ts`: delete the `getParentGateStatus`,
`setParentPin` and `verifyParentPin` `RouteDoc`s and the `PIN_LOCKED_RESPONSE`
constant. Rewrite the `requestAccountDeletion` description — it is no longer
PIN-gated, and its `403` no longer carries the two PIN codes. Rewrite the
`deleteParentAccount` description's claim that the token "was itself issued from
behind the gate".

`apps/server/src/openapi/paths/children.ts`: delete `PIN_GATE_RESPONSE` and its
eight `"403"` usages. `POST /api/children` keeps a `403` for
`CONSENT_REQUIRED` alone. Rewrite the descriptions on `/{id}/dashboard`,
`/{id}/reports/latest`, `/{id}/screen-time` (both verbs), `PATCH /{id}`,
`DELETE /{id}`, `/{id}/learning-time` and `/{id}/activate` — each currently
explains itself in terms of being gated or deliberately not gated.

`apps/server/src/openapi/examples.ts`: delete `GATE_STATUS_EXAMPLE` and remove
`hasPin` from the two auth examples.

`apps/server/src/openapi/components.ts`: remove the `SetPinSchema` /
`VerifyPinSchema` imports and their `SetPinBody` / `VerifyPinBody`
registrations; remove the `PinStatusResponseSchema` / `PinGrantResponseSchema` /
`GateStatusSchema` / `GateStatusResponseSchema` imports and their four
registrations. Edit the `Parent Account` tag description, and the
`Screen Time`, `Dashboard` and `Admin` tag descriptions, each of which explains
itself partly in terms of the PIN gate.

`apps/server/src/openapi/document.ts`: edit the `error.code` paragraph — five
codes behind a 403 becomes two; the onboarding sequence, which currently runs
`consent → pin → children`; the mobile-credential note's claim that both gates
stay server-side; and the "Parental PIN" bullet in the gates list, which is
deleted.

`coverage.test.ts` and `document.test.ts` are the backstop: the first walks the
live Express routers and fails if a path is documented or undocumented in
error, the second asserts unique `operationId`s and that every tag belongs to an
`x-tagGroups` group.

## 5. Web

The largest simplification. `apps/web/app/(parent)/context/parent-session.tsx`
loses `ParentGateContext` whole: `ParentGateValue`, `useParentGate`,
`isLocked`, `grantExpiresAt`, `unlock`, `relock`, `guard`, `MAX_TIMEOUT_MS`, the
grant-expiry `useEffect` with its chunked-sleep workaround, and the fail-closed
branches in `load` that set `isLocked` from `gate.ok`. `fetchGateStatus` drops
out of the `Promise.all`, leaving `fetchAuthMe` and `listChildren`.

Deleted files:

- `apps/web/components/parent/PinGate.tsx` + test
- `apps/web/components/parent/PinPad.tsx` + test
- `apps/web/components/parent/PinSetup.tsx` + test
- `apps/web/app/(parent)/parent/onboarding/pin/` (`page.tsx`,
  `PinSetupScreen.tsx`)

`apps/web/app/(parent)/ParentGuard.tsx`: keep the redirect gate, delete the
`isGated` computation, the `PinGate` render and the `useParentGate` import.
Update the doc comment — there is one gate now, not two.

`apps/web/lib/parent-api.ts`: delete `fetchGateStatus`, `setPin`, `verifyPin`
and the `GateStatusResponse` import.

`apps/web/lib/parent-errors.ts`: delete `pinErrorKey`.

`apps/web/lib/parent-redirect.ts`: delete the `!parent.hasPin` branch,
`PARENT_ROUTES.pinSetup`, `GATE_EXEMPT_PATHS`, `isGateExemptPath`, and
`pinSetup` from `ONBOARDING_PATHS`. Onboarding becomes consent then first child.

`apps/web/components/parent/OnboardingStep.tsx`: `ONBOARDING_STEP_COUNT` 3 → 2,
`STEP_NUMBERS` `[1, 2, 3]` → `[1, 2]`, and the comment naming three first-run
steps. `FirstChildScreen` becomes `step={2}`.

The eight `guard(...)` call sites become plain calls, dropping the
`useParentGate` import from each: `DashboardScreen`, `ChildrenScreen`,
`ReportsScreen`, `NewChildScreen`, `EditChildScreen`, `FirstChildScreen`,
`ScreenTimeScreen` (two calls).

`apps/web/components/student/ParentCorner.tsx` keeps its exact appearance —
the `cva` variants, the anonymous lock, the named chip on `/select-profile`, the
44px target — and becomes a navigation button. `handleOpen` collapses to
`router.push(PARENT_DESTINATION)`, taking with it the `Dialog`, `PinPad`,
`isPromptOpen`, `pin`, `error`, `isBusy`, `handleChange`, and the
`fetchGateStatus` / `verifyPin` / `pinErrorKey` / `PARENT_NAMESPACE` imports.
The comment explaining why this dialog is dismissable while `PinGate` is not
goes with it.

`apps/web/app/(parent)/layout.tsx`: the doc comment calls the shell
"PIN-gated".

`apps/web/lib/screen-time-api.ts`: two comments instruct the caller to wrap in
`useParentGate().guard`. `apps/web/lib/active-child.tsx`: one comment notes
activation needs no PIN — now unremarkable.

## 6. i18n

`apps/web/locales/{en,bn}/parent.json`: delete the whole `pin` object (15 keys
each) and `onboarding.pin`.

`apps/web/locales/{en,bn}/student.json`: delete `parentCorner.title` and
`parentCorner.intro`. `label` and `chipFallback` are still rendered and stay.

## 7. Documentation

FR-AUTH-04 is **retired**, not reworded. In
`document/project-requirement-details.md`: remove its table row (line 133), edit
FR-AUTH-06 (line 135) to drop the "but entering parent areas does (PIN)"
clause, and replace the §504 decision note — which currently records adopting
the gate as a hard requirement — with one recording that it was dropped on
2026-09-09 for simplicity, that Google sign-in is now the only barrier to the
parent area, and that account deletion is guarded by its confirmation token.

Also edited, because each describes current behaviour that stops being true:

- `document/user-journey-manual.md:170` — the parent chip is the same door, no
  longer a PIN-gated one
- `document/database-design.md:191` — `pinVerifiedUntil` drops out of the
  session-additional-fields note; `activeChildProfileId` remains
- `document/mobile-app-plan.md:284` — the PIN-grant paragraph
- `document/design.md:262` — the design rule requiring the parental gate to be
  "genuinely hard for a pre-reader"; the rule goes with the gate
- `document/standards/frontend.md:117` — the `(parent)/` directory-tree comment
  reading "PIN-gated"
- `document/improvement-plan.md:461` — the file 41 plan item scoping rate
  limiting to "auth and PIN routes"; the PIN routes will not exist

**Left alone deliberately** — these are historical records, not descriptions of
current behaviour, and editing them would falsify the record:

- `document/standards/general.md:222` — the lost-update defect on the PIN
  counter that shipped through the testing exception in files 10–12. It
  happened; it is why rules 1, 3 and 4 exist.
- `document/improvement-plan.md:125, 143, 153, 202, 218` — the same defect, the
  transaction-isolation examples, and the assessment of what abuse controls the
  codebase had at the time of writing.

The rule for the whole documentation pass: edit a statement about how the system
works now; never edit a statement about what once happened.

`document/key-description.md` is named in the root `CLAUDE.md` but does not
exist in the tree — nothing to edit there.

`document/implementation/10-pin-gate-consent-account-deletion.md` and
`document/implementation-mobile/M08-consent-pin-gate-and-deletion.md` get
superseded-notes at the top rather than rewrites, matching how commit `d486f14`
handled the Swagger passages. `document/implementation/00-progress-tracker.md`
gets an entry. `document/implementation/**` is otherwise not edited.

## 8. Tests

Deleted: `apps/server/src/lib/pin.test.ts`,
`apps/server/src/middleware/require-pin-verified.test.ts`,
`apps/web/components/parent/{PinGate,PinPad,PinSetup}.test.tsx`.

Roughly thirty further test files touch the PIN, in three distinct ways that
need different handling:

**Mechanical fixture removal** — the file's only PIN reference is a
`pinHash: null` (or `pinHash: "$argon2id$fixture"`) field in a parent-row
fixture. Delete the line; nothing else in the file is about the PIN.
`me.test.ts`, `stories.test.ts`, `events.test.ts`, `progress.test.ts`,
`characters.test.ts`.

**Gate assertions to delete** — suites that exist to prove the gate works:
the PIN suites in `parent.test.ts`, the 403-gate cases in `content.test.ts`,
`dashboard.test.ts`, `reports.test.ts`, `screen-time.test.ts`,
`children.test.ts` (where `fixture.parent.pinHash` is assigned to *pass* the
gate, so the assignments and the cases needing them go together), and the
`isLocked` / `unlock` / `relock` / `guard` branches in
`parent-session.test.tsx`, `layout.test.tsx`, `parent-redirect.test.ts`,
`ParentCorner.test.tsx`.

**Re-point, do not delete** — `api-client.test.ts:77-87` uses
`PIN_VERIFICATION_REQUIRED` merely as a sample error code while testing envelope
parsing. The test is about the client, not the PIN: swap the code for a
surviving one such as `CONSENT_REQUIRED` and keep the assertions.

Two tests must be **kept and re-pointed**, not deleted, because they assert
properties this change is supposed to preserve:

- `auth.test.ts:160-169` sets `pinHash` on the fixture *specifically* so it can
  assert the response body never contains `argon2id`. Deleting the fixture field
  would quietly destroy the test's premise while leaving it green. Re-point it:
  assert the parent summary leaks no credential-shaped field, using a surviving
  column, so the leak check outlives the PIN.
- `accountDeletionService.test.ts`'s token expiry and single-use cases — now the
  entire guard on deletion, so they matter more than before

New coverage: `POST /api/parent/account/delete-request` succeeds with only
`requireParent` satisfied, and the seven previously-gated `children` routes
answer normally for a signed-in parent with no further ceremony.

## 9. Verification

Run from the repo root, in order:

```
pnpm lint
pnpm build
pnpm typecheck
pnpm test
```

`pnpm db:migrate` is the engineer's step — it needs `DIRECT_URL` and a live
database. Until it has run, the migration and anything depending on the dropped
columns is unverified, and must be reported that way rather than as passing.

`apps/server`'s Supertest suites fail intermittently under load for reasons
unrelated to the code under test (see **Open follow-up fixes** in
`document/implementation/00-progress-tracker.md`); a red run is worth repeating
once before treating it as a finding.
