# M09 — Child Profile Management

> **Estimated effort:** 3–4 hours
> **Depends on:** M08
> **Requirement IDs:** FR-PROF-01..07, NFR-SAFE-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Give the parent the screens to manage learners: list their children, add one (up to five), edit name / age / grade / preferred language / avatar, delete one behind an explicit confirmation, and activate a profile for the session. This is also the last onboarding step — a parent with consent but no children lands here, and cannot reach the student portal until one exists.

## Context & Current State

The API is complete (`apps/server/src/modules/children/children.routes.ts`; browse `/docs` under **Children**), and its guard layout is the contract this file works to:

- The router is mounted with `requireParent`; **there is no parent-id parameter anywhere on it**. Ownership comes from the session, and `loadOwnedChild` answers **404** (not 403) for another parent's child — the client must therefore treat 404 on a child route as "not yours or not there" and never distinguish the two.
- `POST /api/children` — the only consent-gated route on the router (`requireParent → requireConsent`): a parent without **current** consent gets `403 CONSENT_REQUIRED`, which M04's global `onConsentRequired` turns into a reroute to the consent screen. Body validated by `ChildProfileCreateSchema` (`firstName` trimmed 1..`MAX_CHILD_FIRST_NAME_LENGTH`, `age` `MIN_CHILD_AGE`..`MAX_CHILD_AGE`, `gradeLevel`, `preferredLanguage`, `avatarCharacterId` — all required, `.strict()`). An avatar that is not a selectable starter is `400 VALIDATION_FAILED` ("Unknown avatar character"). The limit is `MAX_CHILDREN_PER_PARENT = 5` (`packages/types/src/domain/children.ts`), enforced in a serialisable transaction as `409 CONFLICT` ("Profile limit reached (5)"). The client both disables "Add" at the limit (web: `ChildrenScreen.tsx`, `items.length >= MAX_CHILDREN_PER_PARENT`) and handles the 409 for a stale list.
- No `GET`/`PATCH`/`DELETE` here is consent-gated; nor is `/:id/activate`.
- `GET /api/children` — the list. Returns `ChildProfileListResponseSchema`.
- `GET /api/children/:id` — `loadOwnedChild`. (The router also carries `/:id/learning-time`, `/:id/dashboard`, `/:id/reports` and `/:id/screen-time` — M25–M27.)
- `PATCH /api/children/:id` — body `ChildProfileUpdateSchema` (the create schema made partial, at least one field).
- `DELETE /api/children/:id` — returns `{ deleted: true }`.
- `POST /api/children/:id/activate` — sets `activeChildProfileId` on the **session**. It is the only writer of that field (`input: false` in `apps/server/src/config/auth.ts`); it returns `{ activeChildProfileId }`, so a client cannot fake an active child.
- `packages/types` provides `ChildProfileSchema`, `ChildProfileCreateSchema`, `ChildProfileUpdateSchema`, `ChildProfileListResponseSchema`, `ChildStatsSchema`, `ActiveChildSchema`, `GRADE_LEVELS` / `GradeLevelSchema`, `MIN_CHILD_AGE`, `MAX_CHILD_AGE`, `MAX_CHILD_FIRST_NAME_LENGTH`, `MAX_CHILDREN_PER_PARENT`, `AvatarCharacterSchema`, `CharacterUnlockSchema` and `LocaleSchema`. Every bound and every enum used by this screen already exists — do not retype them.
- `ChildProfileSchema` deliberately omits `parentId` (NFR-SAFE-02). `ChildStatsSchema` (`stars`, `coins`, `badges`, `currentStreak`) is summed from the reward ledger, the same rules as `GET /api/me/rewards/summary`.
- Avatar sources, both `requireParent`: `GET /api/characters` (the starter avatars, `AvatarCharacterSchema[]` = `{ id, slug, name, imageUrl | null }` — use on **create**) and `GET /api/children/:id/characters` (`{ characters: CharacterUnlockSchema[] }`, adding `isDefault` / `isUnlocked`, FR-GAM-05 — use on **edit** so locked ones render as locked and cannot be chosen). The list is content, not a hardcoded asset list.
- `imageUrl` is nullable and the seeded starters have none, so web draws placeholder art from `apps/web/features/children/avatars.ts`: a slug → `{ glyph, tileClassName }` table with a fallback. The glyph is data; `tileClassName` is Tailwind and web-only (D6).
- M08 lifted `resolveParentRedirect` into `packages/types/src/domain/parent-redirect.ts` (route table as an argument; mobile's is `lib/parent-routes.ts`) and shipped the parent route guard. M05 shipped `Card`, `EmptyState`, `BigButton`, `Spinner`, `Sheet`.
- `apps/web/app/(parent)/parent/children/` (list, `new`, `[id]/edit`, `[id]/screen-time`), `apps/web/app/(parent)/parent/onboarding/child`, and `apps/web/features/children/` (`ChildProfileForm`, `ChildCard`, `AvatarPicker`, `DeleteChildDialog`, `ChildSwitcher`) are the flow and components to mirror. `features/parent/parent-errors.ts` has `childWriteErrorKey` (`CONFLICT` → `errors.childLimit`, `CONSENT_REQUIRED` → `errors.consentRequired`, `NOT_FOUND` → `errors.notFound`) and `toFieldErrors` (Zod issue → `form.errors.*` key); both are pure and their keys already exist in the shared `parent` namespace.

## Detailed Requirements

1. **`lib/children-api.ts`** — typed wrappers for the six endpoints with `packages/types` types, plus `listAvatars()` (`GET /api/characters`) and `listChildCharacters(id)` (`GET /api/children/:id/characters`). Returns `ApiResult<T>`; no locally declared response shapes. `createChild` is a `POST` and never retries (M04).
2. **Children list** (`app/(parent)/children/index.tsx`) — one `Card` per child showing avatar, first name, age, grade and the four `ChildStatsSchema` counters, with edit / screen-time / delete actions and a prominent "Add a child" button that is **disabled with an explanatory caption once `MAX_CHILDREN_PER_PARENT` exist** (FR-PROF-01) — the constant, never a literal `5`. A parent with no children sees an `EmptyState` whose action is "Add your first child", because that is also the last onboarding step.
3. **Add / edit form** (`app/(parent)/children/new.tsx`, `app/(parent)/children/[id]/edit.tsx`) — one shared form component, differing only in initial values and which endpoint it submits to. Fields:
   - **First name** — `TextInput`, `maxLength` from `MAX_CHILD_FIRST_NAME_LENGTH`, trimmed before submit, required.
   - **Age** — a stepper or segmented control bounded by `MIN_CHILD_AGE`/`MAX_CHILD_AGE`. Not a free text field: a native numeric keyboard invites nonsense and the range is tiny.
   - **Grade** — segmented control over `GRADE_LEVELS` with localised labels (never the raw enum on screen).
   - **Preferred language** (`preferredLanguage`) — segmented control over `LOCALES`.
   - **Avatar** — a grid of characters (`GET /api/characters` on create, `GET /api/children/:id/characters` on edit, locked ones shown locked), minimum 64px targets, current selection marked by **shape and a check icon, not colour alone**. `imageUrl` when present; otherwise the placeholder glyph (requirement 4a).
4. **Client-side validation mirrors the schema, it does not invent rules.** Validate with `ChildProfileCreateSchema` / `ChildProfileUpdateSchema` via `safeParse` and map issues to the same `form.errors.*` keys web's `toFieldErrors` uses. Any rule not in the schema is not a rule.
4a. **Avatar placeholder art — split, then lift (D6).** Move the slug → glyph table (and the fallback glyph) from `apps/web/features/children/avatars.ts` into `packages/types/src/domain/avatars.ts`, with a brand-hue key (`keyof typeof brand` as a string union, no tokens import) in place of `tileClassName`. Web derives its class from the hue; mobile derives a background from `@kidlearn/tokens`' `brand`. Web's `AvatarPicker` tests stay green.
5. **Delete** — a `Sheet` naming the child and stating that their progress is deleted with them, requiring a deliberate confirm. On success, remove from the list optimistically only after the server confirms; a failed delete must not leave a card missing.
6. **Activate** — `POST /api/children/:id/activate` before entering the student portal. Called from M10's picker, but the wrapper and its test live here so the endpoint is covered by the file that owns the resource.
7. **Onboarding continuation.** `lib/parent-redirect.ts` (M08, a port of web's `resolveParentRedirect`) already routes a consented parent with `childCount === 0` to the first-child screen; this file supplies `childCount` from `GET /api/children` and the first-child route. Keep the decision in that one pure function.
8. **Language side-effect.** Editing a child's `preferredLanguage` changes what that child's session will render (FR-I18N-03). The parent surface itself stays in the parent's chosen language — do not call `setLocale()` from this screen. M10 applies the child's language when a profile is activated.
9. **Limit and consent error handling.** When the server rejects a sixth child (`409 CONFLICT`), show `errors.childLimit` next to the disabled button rather than a generic failure — the client's own disabled state should normally prevent reaching this, and hitting it means the list was stale, so refresh it. A `403 CONSENT_REQUIRED` on create is handled globally (M04 → consent screen); the form keeps its values so the parent can resubmit after consenting.
10. **No PII beyond what the screen needs.** A child's first name is personal data (it drives the Play Data Safety declaration in M30). Never log it, never write it to AsyncStorage, never include it in an error report (M29 must scrub it too).
11. **Tests** (`components/parent/ChildForm.test.tsx`, `lib/children-api.test.ts`, `app/(parent)/children/index.test.tsx`): the form rejects an empty name, an out-of-range age and an unlisted grade before submitting; a successful create calls the endpoint with the trimmed, schema-valid body; the list disables "Add" at five children; the delete sheet requires confirmation and only removes on success; a 409 shows the limit message and refetches the list; a 404 from an edit route renders "not found" rather than a crash; `activate` posts to the right path and returns `activeChildProfileId`.

## Technical Approach & Suggestions

```
apps/mobile/lib/children-api.ts
apps/mobile/lib/children-api.test.ts
apps/mobile/components/parent/ChildForm.tsx          # shared by new + edit
apps/mobile/components/parent/ChildForm.test.tsx
apps/mobile/components/parent/ChildCard.tsx
apps/mobile/components/parent/AvatarPicker.tsx
apps/mobile/app/(parent)/children/index.tsx
apps/mobile/app/(parent)/children/new.tsx
apps/mobile/app/(parent)/children/[id]/edit.tsx
```

Validate with the shared schema rather than a parallel rule set — this is the whole reason `packages/types` is a dependency:

```ts
import { ChildProfileCreateSchema } from "@kidlearn/types";

const parsed = ChildProfileCreateSchema.safeParse({
  firstName: firstName.trim(),
  age,
  gradeLevel,
  preferredLanguage,
  avatarCharacterId,
});

if (!parsed.success) {
  // field -> message, so each input can show its own error
  setFieldErrors(
    Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0]]),
    ),
  );
  return;
}

const result = await createChild(parsed.data);
```

Bounds come from the package, so a spec change to the age range does not need a hunt through screens:

```tsx
import { MAX_CHILD_AGE, MAX_CHILD_FIRST_NAME_LENGTH, MIN_CHILD_AGE } from "@kidlearn/types";

<AgeStepper min={MIN_CHILD_AGE} max={MAX_CHILD_AGE} value={age} onChange={setAge} />
<TextInput maxLength={MAX_CHILD_FIRST_NAME_LENGTH} … />
```

Grade labels are localised, never the enum:

```tsx
// The keys already exist in the shared `parent` namespace: form.gradeNursery / form.gradeKg1 / form.gradeKg2
// (web: GRADE_LABEL_KEYS in features/children/ChildCard.tsx). A Record keyed by the enum makes a new grade a type error.
const GRADE_LABEL_KEYS: Record<GradeLevelValue, string> = {
  NURSERY: "form.gradeNursery",
  KG1: "form.gradeKg1",
  KG2: "form.gradeKg2",
};

{GRADE_LEVELS.map((grade) => (
  <SegmentOption key={grade} label={t(GRADE_LABEL_KEYS[grade])} selected={grade === gradeLevel} onPress={() => setGradeLevel(grade)} />
))}
```

For the avatar grid, cache the character list for the session (it changes rarely) but do not hardcode it — `GET /api/characters` is the source, and content grows it.

Keep `ChildForm` presentational: it takes `initialValues`, `onSubmit(values)` and `submitLabel`, and owns no fetching. That is what lets one test cover both the create and edit paths without a router.

## Step-by-Step Plan

1. Write `lib/children-api.ts` (six endpoints + characters) with types from `packages/types`; smoke-test each against the dev server. Lift the avatar glyph table (4a) and re-point web. (~45 min)
2. Write the failing `ChildForm` tests (empty name, age bounds, grade enum, trimmed submit), then build `ChildForm` with the schema-driven validation. (~45 min)
3. Build `AvatarPicker` from `GET /api/characters` with ≥64px targets and a non-colour selected indicator. (~25 min)
4. Build `ChildCard` and the children list screen, including the five-child disabled state and the empty state. Test both. (~35 min)
5. Wire `new.tsx` and `[id]/edit.tsx` to the shared form; handle the 404 case on edit. (~25 min)
6. Add the delete `Sheet` with its confirmation and only-on-success removal; test it. (~25 min)
7. Add `activateChild` to the API module with its test, and feed `childCount` into `lib/parent-redirect.ts` (plus its test for the empty-list case). (~20 min)
8. Device pass on a real phone: create a child end to end, edit it, delete it, and confirm the max-five rule by creating five. Check the form with TalkBack and with the keyboard open on a small screen. (~35 min)
9. `pnpm lint && pnpm build && pnpm typecheck && pnpm test`; open the PR and confirm `gates` with `gh pr checks`; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A parent can create, edit and delete a child profile on a physical device.
- [ ] "Add a child" is disabled with an explanation at `MAX_CHILDREN_PER_PARENT` children, and a server-side rejection of a sixth is shown as a mapped message with the list refreshed.
- [ ] Validation comes from `ChildProfileCreateSchema` / `ChildProfileUpdateSchema` — no parallel rules, no locally declared bounds, no retyped grade enum.
- [ ] Grades, languages and ages render as localised labels in EN and BN; the raw enum never appears on screen.
- [ ] Deleting requires an explicit confirmation naming the child, and the card disappears only after the server confirms.
- [ ] A 404 on an edit route renders a "not found" state; the client never distinguishes "not yours" from "does not exist".
- [ ] Avatar options come from `GET /api/characters` (create) and `GET /api/children/:id/characters` (edit, locked ones unselectable), are ≥64px, and the selected one is marked by shape plus icon, not colour alone. The placeholder glyph table lives in `packages/types`, used by both apps.
- [ ] A create refused with `403 CONSENT_REQUIRED` lands on the consent screen without losing the form.
- [ ] A parent with consent and no children is routed here, and cannot enter the student portal until one exists.
- [ ] No child's first name appears in any log, storage entry or error payload.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and `gates` is green.

## Out of Scope

- The profile picker and active-child context — M10 (this file only ships the `activate` wrapper).
- Screen-time settings per child — M25, though the card links there.
- The dashboard — M26.
- Avatar image upload. Avatars are content characters (`GET /api/characters`), and letting a parent upload a photo of a child would change the privacy declarations in M30 substantially.
- Parent profile editing (their own name/email). Owned by better-auth's `User`; not in the spec's parent surface at MVP.
