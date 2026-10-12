# M11 — Student Home & Streak

> **Estimated effort:** 3–4 hours
> **Depends on:** M10
> **Requirement IDs:** FR-WORLD-01, FR-WORLD-02, FR-WORLD-03, FR-GAM-06 (display), NFR-A11Y-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the child's home screen: a full-bleed, world-themed launchpad with large illustrated waypoints in the thumb zone, the child's stars/coins and current streak on display, and a route into each learning world. No nav bar, no text a pre-reader must read to get anywhere.

## Context & Current State

- `GET /api/content/worlds` (behind `requireParent` + `requireActiveChild`) returns `{ worlds: WorldSummaryResponse[] }` (`WorldListResponseSchema`): `id`, `slug`, `name`, `palette` (a flat `Record<string, string>` of token → CSS colour) and `mascot` (`{ id, url, kind } | null`). `name` is **already localised** by the server to the active child's `preferredLanguage`; there is no cover image, ordering field or grade/lock flag on a world ("Worlds carry no grade tagging of their own" — `content.service.ts`). Worlds are **data** — the web app's `apps/web/features/content/worlds.ts` deliberately reads the accent from `palette` rather than keying a `jungle | ocean | space` map, precisely so adding a world is a database row and not a code change. Mobile must keep that property.
- `GET /api/me/rewards/summary` (`requireParent → requireActiveChild`, not consent-gated) returns `RewardSummaryResponse` — a flat `{ stars, coins, badgeCount, currentStreak }` (`RewardSummarySchema` in `packages/types/src/api/rewards.ts`, served from `apps/server/src/modules/me/me.routes.ts`; there is no separate rewards router). This is the display source for FR-GAM-06; the client computes nothing. Web calls it `getRewardsSummary` in `apps/web/shared/api/progress-api.ts`, and a failed summary read leaves the counters hidden rather than failing the screen. The richer `CompletionStreakSchema` (`{ current, milestone: 3 | 7 | null }`) arrives on lesson/story completion responses — that is M21.
- List endpoints are never screen-time gated: `enforceScreenTime` (`apps/server/src/modules/screen-time/enforce-screen-time.middleware.ts`) is mounted on content-detail reads only (`GET /api/content/lessons/:id`, `GET /api/content/stories/:id`). On web, `HomeScreen` reads `GET /api/screen-time/status` through `useScreenTimeGate` and swaps itself for `ScreenTimeLock` when blocked, and `guardStart` re-checks before each start. On mobile that read and the lock arrive in M25; until then the home screen renders normally for a locked-out child and the refusal surfaces as a 423 at content start (M04's `onScreenTimeLocked`).
- M10 gives `useActiveChild()` and the `StudentGuard`, so this screen only mounts with a real active `child`, and the `ParentCorner` (an anonymous lock here). M05 gives `Screen`, `IconTile`, `Spinner`, `EmptyState`, `KidRetry`. M04 gives `useApi`, `ColdStartNotice`, `OfflineNotice`.
- design.md §6: mobile-first, full-bleed and immersive, waypoints in the thumb zone (lower/centre) rather than top corners, both orientations supported — stack in portrait, side-by-side in landscape — `min-h-dvh` equivalent via safe areas, no horizontal scroll except intentional carousels.
- design.md §7 and §10: ≥64px targets, ≥20px text, meaning never carried by colour alone, kid copy 1–4 words paired with an icon.
- `apps/web/app/(student)/home/HomeScreen.tsx`, `apps/web/features/content/WorldCard.tsx`, `apps/web/features/student/RewardStrip.tsx` and `apps/web/features/stories/StoryTimeCard.tsx` are the web counterparts; read them for the data flow and the world-card composition before writing the native version.

## Detailed Requirements

1. **`lib/content-api.ts`** — start the module that M12, M13, M22 all extend: `listWorlds()`, plus `getRewardSummary()` (`GET /api/me/rewards/summary`) in `lib/rewards-api.ts`. Types from `packages/types` (`WorldSummaryResponse`, `RewardSummaryResponse`); both responses are enveloped (`{ data: { worlds } }`, `{ data: { stars, coins, badgeCount, currentStreak } }`).
2. **Home screen** (`app/(student)/home.tsx`) — one `useApi` call per resource (worlds, reward summary), rendered as: a greeting band with the child's avatar and first name plus the streak and star/coin counters; a set of world waypoints filling the lower two-thirds; and the small top-corner parent door — M10's `ParentCorner` in its anonymous-lock form (the named chip is the picker only; `user-journey-manual.md §4.2`). No PIN behind it.
3. **World theming from data — split, then lift (D6).** `apps/web/features/content/worlds.ts` returns a `CSSProperties`, so it cannot be shared as is. Split it: a pure `worldGradientColours(palette): [string, string] | undefined` in `packages/types/src/domain/` (no React, no CSS), which web's `worldGradientStyle` wraps into its `linear-gradient` and mobile's `lib/world-theme.ts` feeds to `expo-linear-gradient`. Rules, unchanged from web: read `palette.primary` and `palette.secondary` defensively (a world saved with only `primary` must still render; an unusable palette falls back to the theme's own card surface, never a broken gradient). Gradients need `expo-linear-gradient`; an unusable palette renders the card surface, never a guessed colour.
4. **Waypoint tiles.** Each world is a large tile (≥120px, image-led, name at ≥20px) with its world colour and the `mascot` image via `expo-image` (no mascot → colour and name only). All published worlds are enterable; the API has no locked state, so none is invented. Name sits on its own plate, as on web — palette is content data and cannot be trusted to contrast with text over it. Tapping a world routes to `/(student)/world/[worldId]` (M12).
5. **Layout in both orientations.** Portrait: a two-column grid of waypoints, greeting band above. Landscape: greeting band left, waypoints right in a horizontal row. Implement with `useWindowDimensions()` and a single `isLandscape` branch in the screen, not per-component media queries.
6. **Streak display (FR-GAM-06).** Current streak as a number plus an icon plus a localised label — three encodings, so it reads for a pre-reader and for a screen reader. Zero streak is a warm invitation ("Start today!"), never a scolding or an empty space. All values come from `RewardSummaryResponse`; nothing is derived on the client.
7. **Loading, cold start, offline, empty.** Loading is a kid-friendly skeleton or mascot, not a spinner alone. Cold start uses M04's `ColdStartNotice`. Offline uses `OfflineNotice`. No worlds published yet → a warm `EmptyState` (a fresh database has none until an admin publishes content).
8. **Switch learner.** A small affordance returning to `/(student)/select-profile`, sized ≥64px and placed away from the primary waypoints so it is not tapped by accident mid-play.
9. **Narration keys.** The greeting and each waypoint label get translation keys ready for M14's voice-over. No audio calls in this file.
10. **Preload the next screen's data politely.** Prefetch world mascot images with `expo-image`'s prefetch on mount; do **not** prefetch lesson content (it is gated and may 423).
11. **Tests** (`app/(student)/home.test.tsx`, `lib/world-theme.test.ts`): the screen renders one waypoint per world with a ≥64px target; a world with an empty palette renders the fallback surface rather than a broken gradient; the streak renders number + icon + label and shows the zero-state invitation at 0; a failed worlds call renders `KidRetry` and retries on tap; the cold-start notice appears when `useApi` reports it.

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

The lifted palette reader — web's rules, returning colours rather than a CSS string. Note web treats any string `secondary` (even empty) as usable; keep that behaviour in the lift or change it in both apps with a test, not silently in one:

```ts
// packages/types/src/domain/world-palette.ts
import type { WorldSummaryResponse } from "../api/content.js";

/**
 * `palette` is free-form JSONB, so both keys are read defensively: a world saved
 * with only `primary` still renders, and an unusable palette returns undefined so
 * the caller keeps the theme's own card surface instead of a broken gradient.
 */
export function worldGradientColours(
  palette: WorldSummaryResponse["palette"],
): [string, string] | undefined {
  const from = palette.primary;
  if (typeof from !== "string" || from.length === 0) return undefined;
  const to = typeof palette.secondary === "string" ? palette.secondary : from;
  return [from, to];
}
```

The waypoint — the name on its own plate, the mascot as the image:

```tsx
export function WorldWaypoint({ world, onPress }: WorldWaypointProps) {
  const gradient = worldGradientColours(world.palette);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("student:home.open", { name: world.name })}
      onPress={onPress}
      style={{ minHeight: 132, minWidth: 132 }}
      className="overflow-hidden rounded-3xl"
    >
      {gradient ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : (
        <View className="absolute inset-0 bg-card" />
      )}
      {world.mascot ? <Image source={world.mascot.url} style={{ flex: 1 }} contentFit="contain" transition={200} /> : null}
      <View className="self-center rounded-full bg-card px-5 py-2">
        <Text variant="heading">{world.name}</Text>
      </View>
    </Pressable>
  );
}
```

World, topic and lesson names arrive already localised, so this screen does not need it — but `localizedLabel` wraps `pickLocale` from `@kidlearn/types` (the fallback the API and `apps/web/features/children/localized-label.ts` already share: English when Bangla is missing *or blank*) in `apps/mobile/lib/localized-label.ts`, shipped here for the content payloads that do carry locale maps (quiz prompts, activity text). Do not write the fallback again: it was written twice once and the two disagreed about blank strings.

Orientation, handled once in the screen:

```tsx
const { width, height } = useWindowDimensions();
const isLandscape = width > height;
// portrait: <ScrollView> greeting + 2-col grid
// landscape: <View className="flex-row"> greeting | horizontal waypoint row
```

Keep the greeting band's data (`avatar`, `firstName`) from `useActiveChild()` and the counters from the reward summary — do not read stars from `ChildProfileSchema.stats`, which is the parent-facing snapshot; the student surface's authority is `GET /api/me/rewards/summary`.

## Step-by-Step Plan

1. Write `lib/localized-label.ts` (wrapping `pickLocale`, as the web helper does). Lift `worldGradientColours` into `packages/types` with its test (full palette, primary-only, empty, non-string), re-point web's `worldGradientStyle` at it, and add `lib/world-theme.ts`. (~35 min)
2. Write `lib/content-api.ts` (`listWorlds`) and `lib/rewards-api.ts` (`getRewardSummary`); check both against the dev server with a seeded child. (~25 min)
3. Build `CounterPill` and `StreakBadge` (number + icon + label, zero-state invitation) with a test for the zero case. (~30 min)
4. Build `WorldWaypoint`; test target size and the empty-palette fallback. (~30 min)
5. Build the home screen in portrait: greeting band, counters, waypoint grid, loading / cold-start / offline / empty states. (~40 min)
6. Add the landscape branch and check both orientations on a real phone and a tablet. (~25 min)
7. Add the switch-learner and anonymous parent-lock affordances with correct sizing and placement. (~15 min)
8. Add mascot-image prefetch on mount. (~10 min)
9. Device pass: TalkBack reads the greeting, counters, streak and every waypoint; no text below 20px; no target below 64px. (~25 min)
10. `pnpm lint && pnpm build && pnpm typecheck && pnpm test`; open the PR and confirm `gates` with `gh pr checks`; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The home screen renders one waypoint per published world, themed from `palette` data through the shared `worldGradientColours` — adding a world in the database requires no mobile code change, and web and mobile read a palette identically.
- [ ] A world with a missing or malformed `palette` renders the theme's card surface, never a broken or invisible tile.
- [ ] Stars, coins and streak come from `GET /api/me/rewards/summary`; nothing is computed on the client, and a zero streak reads as an invitation.
- [ ] Portrait and landscape both work on a phone and a tablet, with no horizontal scroll except a deliberate waypoint carousel.
- [ ] Waypoints sit in the lower two-thirds of the screen; the parent lock is the only top-corner control.
- [ ] All kid text is ≥20px and every target ≥64px, verified on a 360px-wide device.
- [ ] Cold-start, offline, error-retry and no-content states all render kid-appropriately in EN and BN.
- [ ] TalkBack announces the greeting, both counters, the streak and every waypoint.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and `gates` is green.

## Out of Scope

- The world detail and lesson list — M12.
- Voice-over narration — M14 (keys are in place).
- Screen-time lockout UI and the `GET /api/screen-time/status` read — M25 (web's `useScreenTimeGate` + `ScreenTimeLock` are the reference).
- Badges and character collections — M21.
- Story library entry point — M22 adds it to this screen once it exists.
- Animated world art or parallax. M21 owns delight; a home screen that animates on every visit gets tiresome and costs frame budget on low-end Android.
