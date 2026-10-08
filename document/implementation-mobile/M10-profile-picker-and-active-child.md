# M10 — Profile Picker & Active Child

> **Estimated effort:** 3–4 hours
> **Depends on:** M09
> **Requirement IDs:** FR-AUTH-06, FR-PROF-03, FR-PROF-04, FR-I18N-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Cross from the parent side into the child side: a big, wordless-enough profile picker a 3-year-old can use, an `ActiveChildProvider` and a `StudentGuard` that every student screen sits behind, activation through the server so the session — not the client — decides who is learning, the child's own `preferredLanguage` applied to the UI on activation, and the `ParentCorner` door back to the parent area. This is the first kid-theme screen in the app.

## Context & Current State

- `POST /api/children/:id/activate` sets `activeChildProfileId` on the session. It is the **only** writer of that field (`input: false` in `apps/server/src/config/auth.ts`), and `requireActiveChild` gates every student-facing route (`/api/content/*`, `/api/progress/*`, `/api/events/*`, `/api/me/*`, `/api/screen-time/*`; mounted in `apps/server/src/modules/index.ts`). Without one they answer `403 FORBIDDEN` "No active child profile" — also when the active profile was deleted or belongs to another parent. The guard exists to make that unreachable; M04's `onForbidden` is the backstop (re-read `/api/auth/me`, and the guard routes to the picker).
- Activation itself is not consent-gated, but `/api/progress/*` and `/api/events/*` are, so a child playing without current consent fails on the first write. That is why the guard checks consent **before** the picker.
- `GET /api/children` returns the list, so the picker works on the signed-in session alone. Switching children is a child-initiated action; nothing sits in front of profile selection.
- `apps/web/features/children/active-child.tsx` and `apps/web/app/(student)/select-profile/SelectProfileScreen.tsx` are the references: statuses `"loading" | "ready" | "signedOut" | "error"`, provider + `useActiveChild()` exposing `{ status, parent, profiles, avatars, child, isWakingUp, activate, refresh }`. `status: "ready"` means *loaded*, not *has a child* — `child` is `undefined` until one is picked. The web provider subscribes to `onUnauthorized` and `onConsentRequired` (the latter flips `parent.hasCurrentConsent` to `false`). Reuse the vocabulary; M07's `AuthProvider` already does.
- **`apps/web/app/(student)/StudentGuard.tsx`** decides, in this order: `status === "signedOut"` → `PARENT_ROUTES.signInPage` (`/parent/login` — the bare sign-in, never the homepage, NFR-SAFE-07); `ready` and `parent.hasCurrentConsent === false` → consent; `ready` and no `child` → `/select-profile`. `error` shows a retry; `loading` shows a status line ("waking up" once retried). Mobile has no homepage, so "sign-in page" is simply the app's login screen (M07).
- **`apps/web/features/student/ParentCorner.tsx`** is the only door from the kid side to the parent side. There is **no PIN** (FR-AUTH-04 was retired on 2026-09-09) and no second gate. It is a 44px top-right control: a **named chip** on `/select-profile` — `ParentAvatar` (the parent's `avatarUrl`, else initials from `name`, else the email's first letter) plus `parent.name ?? t("parentCorner.chipFallback")` ("Grown-ups"), truncated to one row — and an **anonymous lock icon** everywhere else. It is **hidden on the lesson player and story reader**, whose own exit X owns that corner. It routes to `/parent/children`. Label `t("parentCorner.label")`. There is no student-side sign-out. `document/user-journey-manual.md` §4.2 explains why the two appearances differ.
- `AuthProvider` (M07) already knows `parent` (`ParentSummary` = `{ id, email, name | null, avatarUrl | null, consentGivenAt | null, hasCurrentConsent }`) and `activeChildProfileId` from `GET /api/auth/me`, so on a warm start the app knows who was learning **before** any child list is fetched. Use it — do not make the picker the only path in.
- `packages/types` gives `ChildProfileSchema` (avatar, first name, `preferredLanguage`, `gradeLevel`, `ChildStatsSchema` counters), `ActiveChildSchema` / `ActiveChildResponseSchema` and `ParentSummarySchema`.
- M03's `setLocale()` changes the app language and persists it. FR-I18N-03: once a child profile is active, that child's `preferredLanguage` column wins over the device default.
- M05 gives `IconTile` (≥96px), `Screen`, `Spinner`, `EmptyState`. M02 gives the kid theme at the `(student)` group boundary.
- design.md §6: kid screens are full-bleed and immersive — no nav chrome, waypoints in the thumb zone (lower/centre), not top corners. §7: ≥64px targets, text ≥20px. §10: kid copy is 1–4 words and always pairs with an icon and a voice-over.

## Detailed Requirements

1. **`lib/active-child.tsx`** — `ActiveChildProvider` + `useActiveChild(): { status, parent, profiles, avatars, child, isWakingUp, activate(id), refresh }`, names and statuses matching the web app's. On mount: read the child list, and cross-reference `useAuth().activeChildProfileId` to resolve `child` without a round-trip. `status: "ready"` means loaded; `child` set means there is a real active child present in the list.
1a. **`StudentGuard`** (`app/(student)/_layout.tsx`) — the web guard's order exactly: signed out → the login screen (M07; there is no homepage to fall back to); `!parent.hasCurrentConsent` → the consent screen (M08); no `child` → the picker. Use `hasCurrentConsent`, never `consentGivenAt !== null`. `error` → `KidRetry`; `loading` → a status line that says "waking up" once `isWakingUp`. The picker route itself is exempt from the third rule.
2. **Profile picker** (`app/(student)/select-profile.tsx`) — a grid of large avatar tiles (avatar image, first name, star count from `ChildStatsSchema`), full-bleed kid background, no back chrome to the parent area other than the `ParentCorner` in its named form. Top corner is out of the thumb zone on purpose.
2a. **`components/student/ParentCorner.tsx`** — mounted once in the `(student)` layout. Named chip on the picker: a native `ParentAvatar` (`parent.avatarUrl` via `expo-image`, else initials — port `parentInitials` from `apps/web/shared/components/ParentAvatar.tsx`, it is pure) and `parent.name ?? t("student:parentCorner.chipFallback")`, one line, truncated. Anonymous lock icon on every other student screen. **Hidden on the lesson player and story reader routes.** 44×44 minimum (a parent control, design.md §7), `accessibilityLabel={t("student:parentCorner.label")}`. No PIN, no hold-to-open, no second gate.
3. **Activation flow.** Tapping a tile: optimistic visual selection → `POST /api/children/:id/activate` → on success set the active child, apply the child's language, navigate to `/(student)/home`; on failure, revert the selection and show a kid-friendly retry (icon + 2 words) rather than an error string. A 401 sends the parent to login; a 404 refreshes the list (the profile was deleted on another device).
4. **Language on activation (FR-I18N-03).** After a successful activation, call `setLocale(child.preferredLanguage)`. Leaving the parent area must **not** revert it — the device language follows whoever is using the device, and the parent's own preference is restored when they sign the child out of the session (requirement 6).
5. **Switching children.** A "switch learner" affordance reachable from the student home (M11) returns here. Re-activating is the same call — never mutate the active child locally.
6. **Leaving the kid side.** `ParentCorner` routes to the parent children list (web: `/parent/children`), inside the signed-in parent area behind M08's redirect guard; there is no second gate, so the lock's dullness on every other student screen is what discourages a child's tap. Restore the parent's stored locale on entering the parent group so a Bengali child's session does not leave an English-speaking parent's dashboard in Bengali (read the persisted preference from M03, do not guess — web does the same with its locale cookie). There is no student-side sign-out; signing out lives in the parent area (M07/M08).
7. **One child shortcut.** If the parent has exactly one child, the app still shows the picker on first run (a child must learn where their face is), but on subsequent launches with a live `activeChildProfileId` it goes straight to the home screen. No child should have to pick themselves twice a day.
8. **Empty state.** No children (a parent who deleted them all) → a warm kid-safe message and a route into the parent area.
9. **Narration hook-in point.** The picker's copy ("Who's learning today?") is the first string that will get a voice-over in M14. Wire the key now through the `student` namespace and leave the audio call for M14 rather than hardcoding text.
10. **Tests** (`lib/active-child.test.tsx`, `app/(student)/_layout.test.tsx`, `app/(student)/select-profile.test.tsx`, `components/student/ParentCorner.test.tsx`): the guard sends signed-out → login, `hasCurrentConsent: false` → consent (even with an active child, and even when `consentGivenAt` is set), no child → picker, in that order; `ParentCorner` is named on the picker with `parent.name`, falls back to "Grown-ups" and initials, is a lock elsewhere, and is absent on the player routes; the provider resolves the active child from `useAuth()` plus the list without an extra call; `activate` posts and then exposes the new child; a failed activation reverts and does not navigate; a 404 triggers a list refresh; activation calls `setLocale` with the child's `preferredLanguage`; the picker renders one tile per child with a ≥96px target and the child's star count; the empty state renders with no children.

## Technical Approach & Suggestions

```
apps/mobile/lib/active-child.tsx
apps/mobile/lib/active-child.test.tsx
apps/mobile/app/(student)/_layout.tsx          # kid theme + StudentGuard + ParentCorner + Stack (headerShown: false)
apps/mobile/app/(student)/_layout.test.tsx
apps/mobile/components/student/ParentCorner.tsx
apps/mobile/components/student/ParentAvatar.tsx
apps/mobile/app/(student)/select-profile.tsx
apps/mobile/app/(student)/select-profile.test.tsx
apps/mobile/components/student/ProfileTile.tsx
apps/mobile/components/student/KidRetry.tsx    # icon + 1–4 words + tap-to-retry
```

The provider avoids a redundant fetch by combining what M07 already knows with the list:

```tsx
export function ActiveChildProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, activeChildProfileId } = useAuth();
  const [list, setList] = useState<ChildProfileResponse[] | undefined>();
  const [activeId, setActiveId] = useState<string | null>(activeChildProfileId ?? null);

  const refresh = useCallback(async () => {
    const result = await listChildren();
    if (result.ok) setList(result.data);
    return result;
  }, []);

  useEffect(() => {
    if (authStatus === "ready") void refresh();
  }, [authStatus, refresh]);

  const activate = useCallback(async (id: string) => {
    const result = await activateChild(id);
    if (!result.ok) return result;
    setActiveId(id);
    const child = list?.find((c) => c.id === id);
    // FR-I18N-03: the child's own language wins once they are learning.
    if (child) await setLocale(child.preferredLanguage);
    return result;
  }, [list]);

  // status: "loading" until the list lands, then "ready"; `child` is the list entry
  // matching activeId, or undefined. "signedOut" when auth says so; "error" otherwise.
}
```

Deriving `child` from *both* pieces is what makes student screens safe: never render a content screen on `activeId` alone, because a deleted child leaves a stale id on the session and every content call would 403.

The tile — big, image-led, and legible to a pre-reader:

```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel={t("student:pickLearner", { name: child.firstName })}
  onPress={() => onSelect(child.id)}
  className="items-center gap-3 rounded-3xl bg-card p-4"
  style={{ minWidth: 132, minHeight: 160 }}
>
  <Avatar characterId={child.avatarCharacterId} size={96} />
  <Text variant="heading">{child.firstName}</Text>
  <StarCount value={child.stats.stars} />
</Pressable>
```

Place the grid in the lower two-thirds of the screen (design.md §6, thumb zone) and let it scroll horizontally at five children on a small phone rather than shrinking tiles below the target size. Put `ParentCorner` top-right, small — findable by an adult.

## Step-by-Step Plan

1. Build `app/(student)/_layout.tsx` with the kid `ThemeProvider`, `StudentGuard` and a headerless `Stack`; write the guard-order tests first. (~35 min)
2. Write the failing `ActiveChildProvider` tests (resolve from auth + list, activate, failure revert, 404 refresh, `setLocale` called), then implement `lib/active-child.tsx`. (~50 min)
3. Build `ProfileTile` and `Avatar` (character id → image from the M09 character list), checking the target size on a 360px-wide device. (~30 min)
4. Build `ParentCorner` + `ParentAvatar` and their tests, then the picker screen with the grid and the empty state. (~50 min)
5. Wire `app/index.tsx`'s routing through the guard: signed out → login; no current consent → consent; signed in + active child → home; no active child → picker; no children → parent area (M08's resolver sends them to the first-child screen). (~20 min)
6. Add `KidRetry` and use it for a failed activation; confirm the copy is 1–4 words with an icon in both languages. (~20 min)
7. Add locale restoration when entering the `(parent)` group, and confirm on device: activate a Bengali child, go to the parent area, and see the parent's language. (~25 min)
8. Device pass: a real phone in portrait and landscape, five children, TalkBack labels, and the "second launch goes straight to home" behaviour. (~30 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; open the PR and confirm `gates` with `gh pr checks`; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A child can select their profile on a physical device with tiles ≥96px, and lands on the student home.
- [ ] Activation always goes through `POST /api/children/:id/activate`; no code path sets the active child locally without the server confirming.
- [ ] A student screen renders only with a `child` present in the list — a stale session id never lets a content screen render.
- [ ] The student guard routes signed out → login, `hasCurrentConsent === false` → consent, no active child → picker, in that order.
- [ ] A failed activation reverts the visual selection and shows a kid-appropriate retry (icon + ≤4 words), never a raw error message.
- [ ] Activating a child whose `preferredLanguage` is `bn` switches the app to Bengali; entering the parent area restores the parent's own language.
- [ ] On a second launch with a live active child, the app opens the home screen without asking the child to pick again.
- [ ] The only route from the kid side to the parent side is `ParentCorner`: the named chip (parent's `name` and `avatarUrl` from `/api/auth/me`) on the picker, the anonymous lock elsewhere, hidden on the lesson player and story reader; it lands in the signed-in parent area with no PIN.
- [ ] No parent-surface chrome, text below 20px, or touch target under 64px appears on the picker.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The home screen itself — M11.
- Voice-over narration of the picker's copy — M14 (the translation keys are in place for it).
- Screen-time gating of the picker. The gate belongs on *starting content* (`enforceScreenTime` is mounted on the lesson and story detail reads only — `GET /api/content/lessons/:id`, `GET /api/content/stories/:id`). M25 adds the friendly lock screen where it belongs.
- Child-switching restrictions. Not in the spec.
- A PIN or any adult gate on `ParentCorner` — FR-AUTH-04 is retired. The Apple Kids Category parental gate is M30's single adult-verification item, needed only once an external link or purchase ships.
- Avatar animation. M21 owns kid delight; the picker stays calm and fast.
