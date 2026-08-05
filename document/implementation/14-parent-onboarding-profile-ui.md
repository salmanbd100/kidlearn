# 14 — Parent Onboarding & Profile Management UI

> **Estimated effort:** 3–4 hours
> **Depends on:** 10, 11, 13
> **Requirement IDs:** FR-AUTH-02, FR-AUTH-03, FR-AUTH-04, FR-PROF-01, FR-PROF-02, FR-PROF-05, FR-PROF-06
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the entire parent-facing onboarding and profile-management UI in the `(parent)` route group: Google-only login, the mandatory first-run flow (COPPA consent → 4-digit PIN setup → first child profile), the child-profile list with create/edit/delete (max 5), and the PIN re-entry modal that gates every entry into `/parent/*` from a student surface. After this file a parent can go from a fresh browser to a fully provisioned account with children ready for the student portal (file 15).

## Context & Current State

- File 13 is done: `(parent)` layout with `data-theme="parent"`, i18next EN/BN, `apiFetch`, `useAudio`, kid primitives.
- File 10 (server) is done: `POST /api/parent/consent`, `POST /api/parent/pin` (set), `POST /api/parent/pin/verify` (grants a 15-minute parent-gate window on the session), `GET /api/parent/gate-status`, account deletion endpoint.
- File 11 (server) is done: `/api/children` CRUD — `GET` (list), `POST` (create, rejects >5 with `code: "CHILD_LIMIT_REACHED"`), `PATCH /api/children/:id`, `DELETE /api/children/:id`; all owner-scoped; Zod-validated bodies with schemas exported from `packages/types` (`childProfileCreateSchema`, `childProfileUpdateSchema`).
- better-auth Google sign-in (file 09): the client starts OAuth by navigating to `${API_URL}/api/auth/sign-in/social?provider=google`; the session cookie is set for the API origin; `GET /api/auth/session`-equivalent (`/api/me`) returns `{ parent, hasConsent, hasPin }`.
- Parent surfaces use the parent theme: Inter UI font, 44px targets, `text-sm` allowed (design.md).

## Detailed Requirements

1. **`/parent/login`** (FR-AUTH-02): a single "Continue with Google" button — no email/password fields anywhere. Already-authenticated visitors are redirected forward.
2. **First-run gating** (FR-AUTH-03): after login, if `hasConsent === false` the parent is forced through `/parent/onboarding/consent` — a plain-language COPPA summary with an **explicit unchecked checkbox**; submit calls `POST /api/parent/consent` and is disabled until checked. No child profile UI is reachable before consent.
3. **PIN setup** (FR-AUTH-04): `/parent/onboarding/pin` — choose a 4-digit PIN on a **big numpad** (parent-sized 44px+ keys, masked dots), enter it twice; mismatch clears and shows a calm inline error. Calls `POST /api/parent/pin`.
4. **First child profile** (FR-PROF-01/02): onboarding ends at the profile form; creating the first child completes onboarding and lands on `/parent/children`.
5. **Child profile form** (FR-PROF-02): fields — first name (1–30 chars), age (3–6 stepper), grade (`nursery` | `kg1` segmented control; KG-2 omitted at MVP per §10), language (`en` | `bn`), avatar (grid of selectable character thumbnails from a static MVP list). Client validation mirrors `childProfileCreateSchema` exactly — same limits, same messages keyed through i18next.
6. **Profile list** (FR-PROF-05/06): `/parent/children` lists profiles as cards (avatar, name, grade, language) with Edit and Delete. Delete requires **typing the child's name** into a confirmation dialog before the button enables (design.md: nothing destructive one tap away). Edit reuses the same form pre-filled, submitting `PATCH`.
7. **Max-5 handling** (FR-PROF-01): when 5 profiles exist, hide the "Add child" button and show a friendly note ("You've reached the maximum of 5 children"); also surface the server's `CHILD_LIMIT_REACHED` error as the same message if a race slips through.
8. **PIN gate modal** (FR-AUTH-04): a reusable `PinGate` that wraps `(parent)` pages — on mount checks `GET /api/parent/gate-status`; if no active grant, renders a blocking modal with the numpad; `POST /api/parent/pin/verify` success (15-min grant, server-side per file 10) unlocks. Wrong PIN shows attempts-remaining message from the server. `/parent/login` and onboarding-before-PIN are exempt.
9. **Tests**: component tests for the PIN pad (entry, masking, confirm-mismatch, verify success/failure) and the profile form (validation parity, submit payload shape).

## Technical Approach & Suggestions

**Files to create/modify:**

```
apps/web/app/(parent)/
├── layout.tsx                         # extend: session fetch + <OnboardingRedirect> + <PinGate> wrapper
├── parent/login/page.tsx
├── parent/onboarding/consent/page.tsx
├── parent/onboarding/pin/page.tsx
├── parent/onboarding/child/page.tsx   # first-child form (reuses ChildProfileForm)
└── parent/children/
    ├── page.tsx                       # list + add
    ├── new/page.tsx
    └── [id]/edit/page.tsx
apps/web/components/parent/
├── pin-pad.tsx                        # presentational numpad + dots
├── pin-setup.tsx                      # twice-entry state machine around PinPad
├── pin-gate.tsx                       # blocking verify modal + gate-status check
├── child-profile-form.tsx
├── avatar-picker.tsx
└── delete-child-dialog.tsx
apps/web/lib/
├── use-session.ts                     # useSession(): { parent, hasConsent, hasPin } via apiFetch("/api/me")
└── children-api.ts                    # listChildren / createChild / updateChild / deleteChild (typed via packages/types)
apps/web/locales/{en,bn}/parent.json   # new namespace
```

**Key contracts:**

```ts
// pin-pad.tsx — pure & testable
export function PinPad(props: {
  value: string;                  // "" .. "1234"
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: string | null;
}): JSX.Element;                  // digits 0-9 + backspace; auto-stops at 4

// pin-setup.tsx internal state machine
type PinSetupState =
  | { phase: "enter"; first: string }
  | { phase: "confirm"; first: string; second: string }
  | { phase: "mismatch" }         // shows error, returns to "enter" on next keypress
  | { phase: "submitting" };

// child-profile-form.tsx
export function ChildProfileForm(props: {
  initial?: ChildProfileUpdate;   // from packages/types
  onSubmit: (values: ChildProfileCreate) => Promise<ApiResult<ChildProfile>>;
  submitLabel: string;
}): JSX.Element;
```

**Validation:** import the Zod schemas directly from `packages/types` and run `schema.safeParse` on change/submit — do not duplicate rules. Use plain `useState` + Zod (no react-hook-form dependency needed at this scale); map Zod issue paths to field errors with i18next keys (`parent.form.errors.nameRequired`, etc.).

**Avatars (MVP static list):** `apps/web/lib/avatars.ts` exporting `[{ id: "lion", src: "/avatars/lion.webp", alt key }, ...]` (6–8 entries, files in `public/avatars/`). The form stores the avatar `id` string — matching what file 11's schema expects.

**Login flow:** the Google button is a plain anchor to `${NEXT_PUBLIC_API_URL}/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(origin + "/parent/children")}` — better-auth handles the round trip; no client SDK needed. `(parent)/layout.tsx` is a client boundary that calls `useSession()` and: unauthenticated → `/parent/login`; `!hasConsent` → consent; `!hasPin` → pin setup; otherwise renders children inside `PinGate`.

**PinGate behavior:** check gate-status once per mount; while locked render `<Dialog open modal>` (shadcn primitive from `packages/ui`) containing `PinPad`; on 4th digit auto-submit verify; on success store nothing client-side (the grant is the server session, per file 10) and unmount the modal. Re-checking on route change within `/parent/*` is unnecessary — after 15 min the server returns **403 `PIN_VERIFICATION_REQUIRED`** on the PIN-gated calls, which `apiFetch` consumers surface by re-showing the gate (export a `useParentGate()` context with `relock()`). (This spec originally said `401 GATE_EXPIRED`; file 10 shipped neither that status nor that code. Corrected in file 12a against the implemented API — `403 PIN_REQUIRED` is the distinct "no PIN set at all" case and belongs in setup, not the gate.)

**API contracts (file 12a):** import response types and the `ErrorCode` union from `@kidlearn/types` (`packages/types/src/api/`) — never redeclare a response shape in `apps/web`. Branch on `error.code`, never on `error.message`, which is a developer hint and may be reworded; behind a `403` the code is what distinguishes `CONSENT_REQUIRED`, `PIN_REQUIRED` and `PIN_VERIFICATION_REQUIRED`, which are three different screens. Run the server and browse `/docs` for the live contract.

## Step-by-Step Plan

1. Add `parent.json` locale namespaces (EN + BN) for every string in this file; create `use-session.ts` and `children-api.ts` with typed wrappers. (~25 min)
2. Write failing RTL tests for `PinPad`: digit taps build value, masked dots count, backspace, disabled state. Implement `PinPad`. (~30 min)
3. Write failing tests for `PinSetup`: confirm-mismatch resets with error, matching pair calls `POST /api/parent/pin` (mock apiFetch). Implement it. (~25 min)
4. Build `/parent/login` page + `(parent)/layout.tsx` session/onboarding redirect logic (test redirect decisions as a pure function `resolveParentRedirect(session, pathname)`). (~25 min)
5. Build consent page: checkbox-gated submit, posts consent, advances to PIN setup. (~15 min)
6. Write failing tests for `ChildProfileForm`: empty-name error, age bounds, submit payload matches `childProfileCreateSchema.parse` output, avatar selection required. Implement form + `AvatarPicker`. (~40 min)
7. Build `/parent/children` list page with `new`/`[id]/edit` routes; implement `DeleteChildDialog` (typed-name confirmation) and max-5 hide+note logic. (~30 min)
8. Implement `PinGate` + `useParentGate()`; test: locked renders modal, correct PIN unlocks, wrong PIN shows server message. (~25 min)
9. Manual pass at 360px: full journey login → consent → PIN → first child → list → edit → delete; verify Bangla toggle on every screen. (~15 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter web test`; update tracker. (~10 min)

## Acceptance Criteria

- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] `pnpm --filter web test` passes including new suites: `pin-pad`, `pin-setup`, `pin-gate`, `child-profile-form`, `resolveParentRedirect`
- [ ] Fresh-browser manual flow (server from files 09–11 running): Google login → consent (cannot proceed unchecked) → PIN twice (mismatch handled) → first child created → `/parent/children` shows it
- [ ] With 5 children, the Add button is hidden and the friendly note appears (FR-PROF-01)
- [ ] Deleting a child requires typing the exact name; profile disappears from the list (FR-PROF-06)
- [ ] Re-opening `/parent/children` after the 15-min grant expires shows the PIN modal; correct PIN unlocks without losing the page (FR-AUTH-04)
- [ ] No email/password UI exists anywhere (FR-AUTH-02); all strings render in both EN and BN
- [ ] All interactive parent controls ≥44×44px; numpad keys comfortably larger

## Out of Scope

- Student-side profile *selection* and activation (file 15)
- Account deletion UI (server exists from file 10; the settings screen that exposes it ships with the parent dashboard, file 29)
- Screen-time settings per child (file 28); progress/report views (files 29–30)
- Writing the child's language preference from the student surface (file 15)
- Avatar *unlocking* mechanics — the picker shows only default starter avatars; character unlocks are file 24
