# M10 — Profile Picker & Active Child

> **Estimated effort:** 3–4 hours
> **Depends on:** M09
> **Requirement IDs:** FR-AUTH-06, FR-PROF-03, FR-PROF-04, FR-I18N-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Cross from the parent side into the child side: a big, wordless-enough profile picker a 3-year-old can use, an `ActiveChildProvider` that every student screen reads, activation through the server so the session — not the client — decides who is learning, and the child's own `language` applied to the UI on activation. This is the first kid-theme screen in the app.

## Context & Current State

- `POST /api/children/:id/activate` sets `activeChildProfileId` on the session. It is the **only** writer of that field (`input: false` in `apps/server/src/lib/auth.ts`), and `requireActiveChild` gates every student-facing route (`/api/content/*`, `/api/progress/*`, `/api/events/*`, `/api/me/*`). A student screen without an active child gets a 403 — the provider exists to make that unreachable.
- `GET /api/children` returns the list, not PIN-gated, so the picker works without the parent re-entering their PIN. That is deliberate: switching children is a child-initiated action, and design.md's gate rule applies to the *parent area*, not to profile selection.
- `apps/web/lib/active-child.tsx` is the reference: statuses `"loading" | "ready" | "signedOut" | "error"`, provider + `useActiveChild()`. Reuse the vocabulary; M07's `AuthProvider` already does.
- `AuthProvider` (M07) already knows `activeChildProfileId` from `GET /api/auth/me`, so on a warm start the app knows who was learning **before** any child list is fetched. Use it — do not make the picker the only path in.
- `packages/types` gives `ChildProfileSchema` (avatar, first name, `language`, `gradeLevel`, `ChildStatsSchema` counters) and `ActiveChildSchema` / `ActiveChildResponseSchema`.
- M03's `setLocale()` changes the app language and persists it. FR-I18N-03: once a child profile is active, that child's `language` column wins over the device default.
- M05 gives `IconTile` (≥96px), `Screen`, `Spinner`, `EmptyState`. M02 gives the kid theme at the `(student)` group boundary.
- design.md §6: kid screens are full-bleed and immersive — no nav chrome, waypoints in the thumb zone (lower/centre), not top corners. §7: ≥64px targets, text ≥20px. §10: kid copy is 1–4 words and always pairs with an icon and a voice-over.

## Detailed Requirements

1. **`lib/active-child.tsx`** — `ActiveChildProvider` + `useActiveChild(): { status, child, children, activate(id), refresh }`, statuses matching the web app's. On mount: read the child list, and cross-reference `useAuth().activeChildProfileId` to resolve the active child without a round-trip. `status: "ready"` means *there is an active child*, so a student screen can render unconditionally once it sees `ready`.
2. **Profile picker** (`app/(student)/select-profile.tsx`) — a grid of large avatar tiles (avatar image, first name, star count from `ChildStatsSchema`), full-bleed kid background, no back chrome to the parent area other than a single small, deliberate "grown-ups" affordance in a **top** corner (out of the thumb zone on purpose — the one place a child's thumb should not land).
3. **Activation flow.** Tapping a tile: optimistic visual selection → `POST /api/children/:id/activate` → on success set the active child, apply the child's language, navigate to `/(student)/home`; on failure, revert the selection and show a kid-friendly retry (icon + 2 words) rather than an error string. A 401 sends the parent to login; a 404 refreshes the list (the profile was deleted on another device).
4. **Language on activation (FR-I18N-03).** After a successful activation, call `setLocale(child.language)`. Leaving the parent area must **not** revert it — the device language follows whoever is using the device, and the parent's own preference is restored when they sign the child out of the session (requirement 6).
5. **Switching children.** A "switch learner" affordance reachable from the student home (M11) returns here. Re-activating is the same call — never mutate the active child locally.
6. **Leaving the kid side.** The "grown-ups" affordance routes to `/(parent)`, which is behind M08's `PinGate` — so a child tapping it meets the keypad, which is exactly the intended dead end. Restore the parent's stored locale on entering the parent group so a Bengali child's session does not leave an English-speaking parent's dashboard in Bengali (read the persisted preference from M03, do not guess).
7. **One child shortcut.** If the parent has exactly one child, the app still shows the picker on first run (a child must learn where their face is), but on subsequent launches with a live `activeChildProfileId` it goes straight to the home screen. No child should have to pick themselves twice a day.
8. **Empty state.** No children (a parent who deleted them all) → a warm kid-safe message and a route into the parent area, gated as usual.
9. **Narration hook-in point.** The picker's copy ("Who's learning today?") is the first string that will get a voice-over in M14. Wire the key now through the `student` namespace and leave the audio call for M14 rather than hardcoding text.
10. **Tests** (`lib/active-child.test.tsx`, `app/(student)/select-profile.test.tsx`): the provider resolves the active child from `useAuth()` plus the list without an extra call; `activate` posts and then exposes the new child; a failed activation reverts and does not navigate; a 404 triggers a list refresh; activation calls `setLocale` with the child's language; the picker renders one tile per child with a ≥96px target and the child's star count; the empty state renders with no children.

## Technical Approach & Suggestions

```
apps/mobile/lib/active-child.tsx
apps/mobile/lib/active-child.test.tsx
apps/mobile/app/(student)/_layout.tsx          # kid theme + Stack (headerShown: false)
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
    if (child) await setLocale(child.language);
    return result;
  }, [list]);

  // status: "loading" until the list lands; "ready" only when activeId resolves
  // to a child in the list; "signedOut" when auth says so; "error" otherwise.
}
```

Deriving `status` from *both* pieces is what makes student screens safe: never render a content screen on `activeId` alone, because a deleted child leaves a stale id on the session and every content call would 403.

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

Place the grid in the lower two-thirds of the screen (design.md §6, thumb zone) and let it scroll horizontally at five children on a small phone rather than shrinking tiles below the target size. Put the "grown-ups" affordance top-right, small, with a lock icon — findable by an adult, uninteresting to a child, and it lands on a keypad anyway.

## Step-by-Step Plan

1. Build `app/(student)/_layout.tsx` with the kid `ThemeProvider` and a headerless `Stack`. (~15 min)
2. Write the failing `ActiveChildProvider` tests (resolve from auth + list, activate, failure revert, 404 refresh, `setLocale` called), then implement `lib/active-child.tsx`. (~50 min)
3. Build `ProfileTile` and `Avatar` (character id → image from the M09 character list), checking the target size on a 360px-wide device. (~30 min)
4. Build the picker screen with the grid, the top-corner grown-ups affordance and the empty state; add its tests. (~40 min)
5. Wire the picker into `app/index.tsx`'s routing: signed in + active child → home; signed in + no active child → picker; no children → parent area. (~20 min)
6. Add `KidRetry` and use it for a failed activation; confirm the copy is 1–4 words with an icon in both languages. (~20 min)
7. Add locale restoration when entering the `(parent)` group, and confirm on device: activate a Bengali child, go to the parent area, and see the parent's language. (~25 min)
8. Device pass: a real phone in portrait and landscape, five children, TalkBack labels, and the "second launch goes straight to home" behaviour. (~30 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A child can select their profile on a physical device with tiles ≥96px, and lands on the student home.
- [ ] Activation always goes through `POST /api/children/:id/activate`; no code path sets the active child locally without the server confirming.
- [ ] `status === "ready"` implies there is a real active child present in the list — a stale session id never lets a content screen render.
- [ ] A failed activation reverts the visual selection and shows a kid-appropriate retry (icon + ≤4 words), never a raw error message.
- [ ] Activating a child whose `language` is `bn` switches the app to Bengali; entering the parent area restores the parent's own language.
- [ ] On a second launch with a live active child, the app opens the home screen without asking the child to pick again.
- [ ] The only route from the kid side to the parent side is the top-corner affordance, and it lands on the PIN keypad.
- [ ] No parent-surface chrome, text below 20px, or touch target under 64px appears on the picker.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The home screen itself — M11.
- Voice-over narration of the picker's copy — M14 (the translation keys are in place for it).
- Screen-time gating of the picker. The gate belongs on *starting content* (`enforceScreenTime` is mounted on lesson and story detail reads only, and its comment explains why list screens are never gated). M25 adds the friendly lock screen where it belongs.
- Per-child app-level PIN or child-switching restrictions. Not in the spec.
- Avatar animation. M21 owns kid delight; the picker stays calm and fast.
