# M11 — Student Home & Streak

> **Estimated effort:** 3–4 hours
> **Depends on:** M10
> **Requirement IDs:** FR-WORLD-01, FR-WORLD-02, FR-WORLD-03, FR-GAM-06 (display), NFR-A11Y-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the child's home screen: a full-bleed, world-themed launchpad with large illustrated waypoints in the thumb zone, the child's stars/coins and current streak on display, and a route into each learning world. No nav bar, no text a pre-reader must read to get anywhere.

## Context & Current State

- `GET /api/content/worlds` (behind `requireParent` + `requireActiveChild`) returns `WorldSummaryResponse[]`: id, slug, localised `name`, `palette` (free-form JSONB, `{ primary, secondary, bg }` in the seed), cover media and ordering. Worlds are **data** — the web app's `apps/web/lib/worlds.ts` deliberately reads the accent from `palette` rather than keying a `jungle | ocean | space` map, precisely so adding a world is a database row and not a code change. Mobile must keep that property.
- `GET /api/me/rewards/summary` returns `RewardSummaryResponse` — `RewardTotalsSchema` (stars, coins) plus `CompletionStreakSchema` (current streak, longest, last-active date). This is the display source for FR-GAM-06; the client computes nothing.
- List endpoints are never screen-time gated (see the comment in `apps/server/src/middleware/enforce-screen-time.ts`): "a blocked child browsing worlds sees a friendly screen from the status read, not a wall of errors — and the tile they tap is where the refusal belongs". So the home screen renders normally even for a locked-out child; M25 adds the friendly lock at the point of starting content.
- M10 gives `useActiveChild()` with `status === "ready"` guaranteeing a real active child. M05 gives `Screen`, `IconTile`, `Spinner`, `EmptyState`, `KidRetry`. M04 gives `useApi`, `ColdStartNotice`, `OfflineNotice`.
- design.md §6: mobile-first, full-bleed and immersive, waypoints in the thumb zone (lower/centre) rather than top corners, both orientations supported — stack in portrait, side-by-side in landscape — `min-h-dvh` equivalent via safe areas, no horizontal scroll except intentional carousels.
- design.md §7 and §10: ≥64px targets, ≥20px text, meaning never carried by colour alone, kid copy 1–4 words paired with an icon.
- `apps/web/app/(student)/home` is the web counterpart; read it for the data flow and the world-card composition before writing the native version.

## Detailed Requirements

1. **`lib/content-api.ts`** — start the module that M12, M13, M22 all extend: `listWorlds()`, plus `getRewardSummary()` in `lib/rewards-api.ts`. Types from `packages/types` (`WorldSummaryResponse`, `RewardSummaryResponse`).
2. **Home screen** (`app/(student)/home.tsx`) — one `useApi` call per resource (worlds, reward summary), rendered as: a greeting band with the child's avatar and first name plus the streak and star/coin counters; a set of world waypoints filling the lower two-thirds; and the small top-corner grown-ups affordance from M10.
3. **World theming from data.** `lib/world-theme.ts` — the native counterpart of `apps/web/lib/worlds.ts`: read `palette.primary` and `palette.secondary` defensively (a world saved with only `primary` must still render; an unusable palette falls back to the theme's own card surface, never a broken gradient). Gradients need `expo-linear-gradient`; a solid `primary` fill is an acceptable fallback and must be what renders when the palette is unusable.
4. **Waypoint tiles.** Each world is a large tile (≥120px, image-led, localised name at ≥20px) with its world colour, a cover image via `expo-image`, and a locked state for worlds the child's grade cannot enter — locked shown with a **lock icon and reduced saturation**, not colour alone. Tapping a world routes to `/(student)/world/[worldId]` (M12).
5. **Layout in both orientations.** Portrait: a two-column grid of waypoints, greeting band above. Landscape: greeting band left, waypoints right in a horizontal row. Implement with `useWindowDimensions()` and a single `isLandscape` branch in the screen, not per-component media queries.
6. **Streak display (FR-GAM-06).** Current streak as a number plus an icon plus a localised label — three encodings, so it reads for a pre-reader and for a screen reader. Zero streak is a warm invitation ("Start today!"), never a scolding or an empty space. All values come from `CompletionStreakSchema`; nothing is derived on the client.
7. **Loading, cold start, offline, empty.** Loading is a kid-friendly skeleton or mascot, not a spinner alone. Cold start uses M04's `ColdStartNotice`. Offline uses `OfflineNotice`. No worlds published yet → a warm `EmptyState` — realistic at MVP, since the content pipeline (web files 34–37) is not built.
8. **Switch learner.** A small affordance returning to `/(student)/select-profile`, sized ≥64px and placed away from the primary waypoints so it is not tapped by accident mid-play.
9. **Narration keys.** The greeting and each waypoint label get translation keys ready for M14's voice-over. No audio calls in this file.
10. **Preload the next screen's data politely.** Prefetch world cover images with `expo-image`'s prefetch on mount so the world screen is instant; do **not** prefetch lesson content (it is gated and may 423).
11. **Tests** (`app/(student)/home.test.tsx`, `lib/world-theme.test.ts`): the screen renders one waypoint per world with a ≥64px target; a world with an empty palette renders the fallback surface rather than a broken gradient; a locked world renders a lock icon and is not pressable; the streak renders number + icon + label and shows the zero-state invitation at 0; a failed worlds call renders `KidRetry` and retries on tap; the cold-start notice appears when `useApi` reports it.

## Technical Approach & Suggestions

```
apps/mobile/lib/content-api.ts                 # listWorlds() (extended by M12/M13/M22)
apps/mobile/lib/rewards-api.ts                 # getRewardSummary()
apps/mobile/lib/world-theme.ts                 # palette -> gradient colours or undefined
apps/mobile/lib/world-theme.test.ts
apps/mobile/app/(student)/home.tsx
apps/mobile/app/(student)/home.test.tsx
apps/mobile/components/student/WorldWaypoint.tsx
apps/mobile/components/student/StreakBadge.tsx
apps/mobile/components/student/CounterPill.tsx  # stars / coins
apps/mobile/components/student/GreetingBand.tsx
```

The palette reader — same defensive shape as the web helper, returning colours rather than a CSS string:

```ts
// apps/mobile/lib/world-theme.ts
import type { WorldSummaryResponse } from "@kidlearn/types";

/**
 * `palette` is free-form JSONB, so both keys are read defensively: a world saved
 * with only `primary` still renders, and an unusable palette returns undefined so
 * the caller keeps the theme's own card surface instead of a broken gradient.
 */
export function worldGradient(
  palette: WorldSummaryResponse["palette"],
): [string, string] | undefined {
  const from = palette.primary;
  if (typeof from !== "string" || from.length === 0) return undefined;
  const to = typeof palette.secondary === "string" && palette.secondary.length > 0
    ? palette.secondary
    : from;
  return [from, to];
}
```

The waypoint, with the locked state carrying two non-colour signals:

```tsx
export function WorldWaypoint({ world, locked, onPress }: WorldWaypointProps) {
  const gradient = worldGradient(world.palette);
  const label = localizedLabel(world.name, i18n.language);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={locked ? t("student:worldLocked", { name: label }) : label}
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={{ minHeight: 132, minWidth: 132 }}
      className="overflow-hidden rounded-3xl"
    >
      {gradient ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : (
        <View className="absolute inset-0 bg-card" />
      )}
      <Image source={world.coverUrl} style={{ flex: 1 }} contentFit="contain" transition={200} />
      <View className="flex-row items-center gap-2 p-3">
        {locked ? <LockIcon /> : null}
        <Text variant="heading">{label}</Text>
      </View>
      {locked ? <View className="absolute inset-0 bg-background/40" /> : null}
    </Pressable>
  );
}
```

`localizedLabel` should mirror `apps/web/lib/localized-label.ts` (`label[locale] ?? label.en`) — add it to `apps/mobile/lib/localized-label.ts` here, since every content screen from now on needs it. One line of logic, but three files would otherwise each grow their own fallback.

Orientation, handled once in the screen:

```tsx
const { width, height } = useWindowDimensions();
const isLandscape = width > height;
// portrait: <ScrollView> greeting + 2-col grid
// landscape: <View className="flex-row"> greeting | horizontal waypoint row
```

Keep the greeting band's data (`avatar`, `firstName`) from `useActiveChild()` and the counters from the reward summary — do not read stars from `ChildProfileSchema.stats`, which is the parent-facing snapshot; the student surface's authority is `GET /api/me/rewards/summary`.

## Step-by-Step Plan

1. Write `lib/localized-label.ts` (mirroring the web helper) and `lib/world-theme.ts` with its test (full palette, primary-only, empty, non-string). (~25 min)
2. Write `lib/content-api.ts` (`listWorlds`) and `lib/rewards-api.ts` (`getRewardSummary`); check both against the dev server with a seeded child. (~25 min)
3. Build `CounterPill` and `StreakBadge` (number + icon + label, zero-state invitation) with a test for the zero case. (~30 min)
4. Build `WorldWaypoint` including the locked state; test target size, lock signalling and disabled press. (~35 min)
5. Build the home screen in portrait: greeting band, counters, waypoint grid, loading / cold-start / offline / empty states. (~40 min)
6. Add the landscape branch and check both orientations on a real phone and a tablet. (~25 min)
7. Add the switch-learner and grown-ups affordances with correct sizing and placement. (~15 min)
8. Add cover-image prefetch on mount; confirm the world screen (stub route for now) appears without a visible image pop. (~15 min)
9. Device pass: TalkBack reads the greeting, counters, streak and every waypoint including the locked one; no text below 20px; no target below 64px. (~25 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The home screen renders one waypoint per published world, themed from `palette` data — adding a world in the database requires no mobile code change.
- [ ] A world with a missing or malformed `palette` renders the theme's card surface, never a broken or invisible tile.
- [ ] Locked worlds are marked by a lock icon **and** reduced saturation, and cannot be pressed.
- [ ] Stars, coins and streak come from `GET /api/me/rewards/summary`; nothing is computed on the client, and a zero streak reads as an invitation.
- [ ] Portrait and landscape both work on a phone and a tablet, with no horizontal scroll except a deliberate waypoint carousel.
- [ ] Waypoints sit in the lower two-thirds of the screen; the grown-ups affordance is the only top-corner control.
- [ ] All kid text is ≥20px and every target ≥64px, verified on a 360px-wide device.
- [ ] Cold-start, offline, error-retry and no-content states all render kid-appropriately in EN and BN.
- [ ] TalkBack announces the greeting, both counters, the streak and every waypoint including locked ones.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The world detail and lesson list — M12.
- Voice-over narration — M14 (keys are in place).
- Screen-time lockout UI — M25. The home screen deliberately renders for a blocked child; the refusal belongs at content start.
- Badges and character collections — M21.
- Story library entry point — M22 adds it to this screen once it exists.
- Animated world art or parallax. M21 owns delight; a home screen that animates on every visit gets tiresome and costs frame budget on low-end Android.
