# M21 — Rewards, Badges, Characters & Celebration

> **Estimated effort:** 3–4 hours
> **Depends on:** M15, M20
> **Requirement IDs:** FR-LSN-05, FR-GAM-01, FR-GAM-02, FR-GAM-04, FR-GAM-05, FR-GAM-06, FR-GAM-07, FR-GAM-08
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Pay the child. The reward step — stars bursting, coins counting up, a badge revealing itself, a character unlocking, a streak celebrating — all rendered from the **server's** completion response, plus the collection screens where a child can revisit what they have earned. This is the last step of the lesson flow and the file that makes the loop feel worth repeating.

## Context & Current State

- Rewards are **entirely server-computed** (spec §7.3). `POST /api/progress/lessons/:id/complete` (called by M13's shell *before* the reward step renders) returns `LessonCompletionResponse`, which carries the reward totals, any `NewBadgeSchema` entries, any `NewCharacterSchema` unlocks, and the `StreakMilestoneSchema` when one was hit. The client animates what it is given and grants nothing itself.
- `packages/types` provides `RewardTotalsSchema`, `RewardSummarySchema` / `RewardSummaryResponse`, `NewBadgeSchema`, `NewCharacterSchema`, `StreakMilestoneSchema`, `STREAK_MILESTONE_DAYS`, `CompletionStreakSchema`, `AvatarCharacterSchema` and `CharacterUnlockSchema`.
- Read endpoints for the collection screens: `GET /api/me/rewards/summary` (totals + streak — already used by M11's home), `GET /api/me/characters` (this child's unlocked characters), `GET /api/characters` (the full catalogue, so locked ones can be shown as silhouettes).
- `apps/web/components/rewards/` is the reference: `StarBurst.tsx`, `CoinCountUp.tsx`, `BadgeReveal.tsx`, `StreakCelebration.tsx`. Match their sequence and their beats — a reward that lands differently on the two clients feels like two products.
- `apps/web` uses `canvas-confetti`; mobile has no canvas. Use Reanimated for the burst and `lottie-react-native` for badge and character reveals if a Lottie asset exists, otherwise a Reanimated composition. Do not add both libraries if one suffices — check the bundle cost.
- M13's machine pauses in `status: "completing"` before the reward step so the completion response is in hand when this step mounts. M14 gives the `celebrate` sound. M05 gives `useReducedMotion`.
- design.md §5.2: animate `transform` and `opacity` only; respect reduced motion. §7: ≥64px targets. §10: kid copy 1–4 words with an icon and a voice-over.
- NFR-PERF: a low-end Android phone is the target. A celebration that drops frames reads as a broken app at exactly the moment the child is supposed to feel good.

## Detailed Requirements

1. **Reward step** (`components/lesson/steps/RewardStep.tsx`) — replaces M13's placeholder. Renders a **sequence**, not a pile: stars burst in → coins count up → badge reveals (if any) → character unlocks (if any) → streak celebration (if a milestone) → one big "Done" button. Each beat is skippable by a tap, and the whole sequence is skippable to the button — a child who has seen it forty times should not be held hostage by it.
2. **Everything from the response.** The star count, coin delta, new badges, unlocked characters and streak milestone all come from `LessonCompletionResponse`. No client-side arithmetic, no "if score > 80 then 3 stars" rule in the app. If the response carries no badge, no badge appears.
3. **Star burst** (`components/rewards/StarBurst.tsx`) — n stars (from the response) flying from the centre with a spring, settling into the counter. Reanimated on `transform`/`opacity`; under reduced motion the stars simply appear in place with the count.
4. **Coin count-up** (`components/rewards/CoinCountUp.tsx`) — animates from the previous total to the new one over a short duration with the coin sound; under reduced motion it shows the final number immediately. Port the web component's easing and duration.
5. **Badge reveal** (`components/rewards/BadgeReveal.tsx`) — the badge image (Cloudinary, `expo-image`, prefetched during the completion request), its localised name and a one-line localised description, with a scale-and-shine entrance. Reduced motion: a static presentation.
6. **Character unlock** (`components/rewards/CharacterUnlock.tsx`) — a new character joining the collection: silhouette → colour, name, and a hint that it can be used as an avatar (FR-GAM-05). Tapping through goes to the collection screen rather than dead-ending.
7. **Streak celebration** (`components/rewards/StreakCelebration.tsx`) — only when the response reports a milestone from `STREAK_MILESTONE_DAYS`. Shows the day count as a number **and** a shape (a chain of markers), with warm copy. A non-milestone day shows the streak quietly in the totals rather than celebrating (FR-GAM-06) — otherwise every day is a party and none of them mean anything.
8. **Collection screens.**
   - `app/(student)/collection/badges.tsx` — earned badges bright, unearned as silhouettes with their names hidden but their count visible ("3 more to find!"), so the collection motivates without spoiling.
   - `app/(student)/collection/characters.tsx` — unlocked characters selectable as the child's avatar (which calls M09's child-update endpoint — the parent-facing `PATCH` is PIN-gated, so **check whether a child may change their own avatar**: if the endpoint requires the PIN, the collection screen shows the character and its unlocked state but routes avatar changes to the parent area rather than failing silently. Confirm the guard before building the button.)
   - Both reachable from the home screen (M11) with ≥64px entries.
9. **Reduced motion is a first-class path, not a fallback.** Every celebration has a designed static form. Test with the OS setting on: the child must still learn what they earned.
10. **Performance budget.** The whole sequence must hold 60fps (or the device's refresh rate) on a low-end Android device. Animate `transform`/`opacity` only, cap simultaneous animated nodes (a dozen stars, not eighty), and prefetch every image before the step renders. If a Lottie asset costs more than ~150KB, question it.
11. **Replay mode.** M13 opens a completed lesson on `reward` in replay form. In that mode the sequence shows what was earned **previously** without implying a new award — no coin count-up from an old total, no "new badge" framing. Take the data from `GET /api/progress/lessons/:id` and the reward summary, not from a completion call that must not be repeated.
12. **Tests** (`RewardStep.test.tsx`, plus one per reward component): the sequence renders only the beats the response contains; no badge in the response renders no badge; a tap skips the current beat and a second tap reaches the button; reduced motion renders every beat statically with the same information; the streak celebration appears only on a milestone; replay mode shows no "new" framing and fires no completion call; the collection screens show earned and locked states correctly.

## Technical Approach & Suggestions

```
apps/mobile/components/lesson/steps/RewardStep.tsx
apps/mobile/components/lesson/steps/RewardStep.test.tsx
apps/mobile/components/rewards/StarBurst.tsx
apps/mobile/components/rewards/CoinCountUp.tsx
apps/mobile/components/rewards/CoinCountUp.test.tsx
apps/mobile/components/rewards/BadgeReveal.tsx
apps/mobile/components/rewards/CharacterUnlock.tsx
apps/mobile/components/rewards/StreakCelebration.tsx
apps/mobile/lib/reward-sequence.ts                  # pure: response -> ordered beats
apps/mobile/lib/reward-sequence.test.ts
apps/mobile/lib/characters-api.ts                   # GET /api/me/characters, GET /api/characters
apps/mobile/app/(student)/collection/badges.tsx
apps/mobile/app/(student)/collection/characters.tsx
```

Derive the sequence purely, so the step component is a player and the logic is testable:

```ts
// apps/mobile/lib/reward-sequence.ts
import type { LessonCompletionResponse } from "@kidlearn/types";

export type RewardBeat =
  | { kind: "stars"; count: number }
  | { kind: "coins"; from: number; to: number }
  | { kind: "badge"; badgeId: string }
  | { kind: "character"; characterId: string }
  | { kind: "streak"; days: number };

/** Only what the server actually granted, in a fixed order. */
export function rewardSequence(completion: LessonCompletionResponse): RewardBeat[] {
  const beats: RewardBeat[] = [];
  if (completion.stars > 0) beats.push({ kind: "stars", count: completion.stars });
  if (completion.coinsAwarded > 0) {
    beats.push({ kind: "coins", from: completion.totals.coins - completion.coinsAwarded, to: completion.totals.coins });
  }
  for (const badge of completion.newBadges) beats.push({ kind: "badge", badgeId: badge.id });
  for (const character of completion.newCharacters) beats.push({ kind: "character", characterId: character.id });
  if (completion.streakMilestone) beats.push({ kind: "streak", days: completion.streakMilestone.days });
  return beats;
}
```

(Field names above follow `LessonCompletionSchema` — read it and match it exactly rather than trusting this sketch.)

The star burst, bounded and cheap:

```tsx
const STAR_CAP = 12;   // more than this is invisible and costs frames on low-end Android
const stars = Array.from({ length: Math.min(count, STAR_CAP) });

// Each star: one shared value, transform + opacity only.
const style = useAnimatedStyle(() => ({
  opacity: progress.value,
  transform: [
    { translateX: interpolate(progress.value, [0, 1], [0, dx]) },
    { translateY: interpolate(progress.value, [0, 1], [0, dy]) },
    { scale: interpolate(progress.value, [0, 0.6, 1], [0.2, 1.15, 1]) },
  ],
}));
```

Skippable beats, so a fortieth playthrough is not a hostage situation:

```tsx
<Pressable onPress={advanceBeat} accessibilityLabel={t("lesson:skipCelebration")} style={StyleSheet.absoluteFill}>
  {renderBeat(beats[index])}
</Pressable>
```

Under reduced motion, render the *whole* sequence at once as a summary card (stars, coins, badge, character, streak) with a single "Done" — one screen, all the information, no motion. That is a better accommodation than five static screens in a row.

Prefetch badge and character art during the completion request (M13 is already awaiting it), so the reveal never waits on a network round-trip.

## Step-by-Step Plan

1. Read `LessonCompletionSchema`, `NewBadgeSchema`, `NewCharacterSchema` and `StreakMilestoneSchema`, and the four web reward components; note the exact field names and animation timings. (~25 min)
2. Write `lib/reward-sequence.ts` + tests (only granted beats, correct order, empty response). (~30 min)
3. Build `CoinCountUp` (ported easing, reduced-motion branch) with its test. (~25 min)
4. Build `StarBurst` with the cap and transform/opacity-only animation. (~30 min)
5. Build `BadgeReveal` and `CharacterUnlock` with prefetched art and localised copy. (~35 min)
6. Build `StreakCelebration`, milestone-only, with number + shape encoding. (~25 min)
7. Build `RewardStep`: the beat player, tap-to-skip, the reduced-motion summary card, the final "Done" that calls `onComplete("reward")`. Test each branch. (~45 min)
8. Add replay mode (no completion call, no "new" framing) and its test. (~25 min)
9. Build `lib/characters-api.ts` and the two collection screens (earned/locked states, home-screen entries); confirm the avatar-change guard before wiring that button. (~40 min)
10. Device pass: complete a real lesson on a **low-end Android phone**, watch for dropped frames, then repeat with reduced motion on and with TalkBack on. (~30 min)
11. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] Every reward shown comes from `LessonCompletionResponse`; the app computes no stars, coins, badges, characters or streaks.
- [ ] The sequence contains only the beats the server actually granted, in a fixed order, ending in one large "Done".
- [ ] Any beat can be tapped through, and the whole sequence can be skipped to the button.
- [ ] Reduced motion renders a single static summary carrying the same information — nothing is lost, only the movement.
- [ ] The streak celebration appears only on a `STREAK_MILESTONE_DAYS` milestone; other days show the streak quietly.
- [ ] Badge and character art is prefetched before the step renders; no reveal waits on the network.
- [ ] The full celebration holds the device's refresh rate on a **low-end Android phone**, animating `transform`/`opacity` only, with the star count capped.
- [ ] Replaying a completed lesson shows past rewards without "new" framing and triggers no completion call.
- [ ] The badge collection shows earned badges and silhouetted unearned ones with a count, and the character collection shows unlocked characters.
- [ ] Avatar changes from the character collection either work or route to the parent area — never fail silently against a PIN-gated endpoint.
- [ ] TalkBack announces what was earned in every beat.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Awarding logic of any kind. Server-side, already built (web files 23–24).
- The story-completion reward — M23 reuses these components for its own celebration.
- A shop or coin spending. Coins are a score at MVP; a store is a product decision with store-review consequences (in-app purchase rules).
- Leaderboards or comparison between children. Explicitly against the product's tone and a privacy risk for children.
- Push notifications for streak reminders — out of scope for the plan (§3.2).
