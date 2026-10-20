# M21 — Rewards, Badges, Characters & Celebration

> **Estimated effort:** 3–4 hours
> **Depends on:** M15, M20
> **Requirement IDs:** FR-LSN-05, FR-GAM-01, FR-GAM-02, FR-GAM-04, FR-GAM-05, FR-GAM-06, FR-GAM-07, FR-GAM-08
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Pay the child. The reward step — stars bursting, coins counting up, a badge revealing itself, a character unlocking, a streak celebrating — calls the completion endpoint and renders everything from the **server's** response, plus the collection screens where a child can revisit what they have earned. This is the last step of the lesson flow and the file that makes the loop feel worth repeating.

## Context & Current State

- Rewards are **entirely server-computed** (`apps/server/src/modules/rewards/reward.service.ts`, no router of its own). `POST /api/progress/lessons/:id/complete` returns `LessonCompletionResponse` (`packages/types/src/api/rewards.ts`): `{ starsEarned, coinsEarned, newBadges: NewBadge[], newCharacters: NewCharacter[], streak: { current, milestone: 3 | 7 | null }, totals: { stars, coins } }`. A badge is `{ id, slug, name, iconUrl | null }`, a character `{ id, slug, name, imageUrl | null }` — **there is no badge description field**, and `name` is a plain string from the row, not locale-resolved. `starsEarned` is what *this call* wrote: `0` on a replay, and badges/characters are empty on a replay; the day's activity coins may still appear. `POST /api/progress/stories/:id/complete` returns the same unlock fields (`newBadges`, `newCharacters`, `streak`, `totals`) plus `alreadyCompleted` and `granted: { stars, coins } | null`, so M23 renders from the same components. The client animates what it is given and grants nothing itself.
- **Completion needs evidence and settled writes.** The server refuses with `409 LESSON_NOT_PLAYED` unless this run reached `activity` (and is not an already-paid run), and it derives the quiz star and per-answer coins from **stored** quiz responses. So the reward step awaits `pendingWrites.settled()` (M13's chain: every step report and M20's quiz submission) before calling. The endpoint is idempotent server-side (grants are guarded by the ledger's unique index), so `isIdempotent: true` lets M04's transport retry a dropped connection; there is no manual retry.
- `packages/types/src/api/rewards.ts` provides `RewardTotalsSchema`, `RewardSummarySchema` (`{ stars, coins, badgeCount, currentStreak }`), `NewBadgeSchema`, `NewCharacterSchema`, `StreakMilestoneSchema`, `STREAK_MILESTONE_DAYS` (`[3, 7]`), `CompletionStreakSchema`, `LessonCompletionSchema` and `StoryCompletionSchema`; `api/children.ts` provides `AvatarCharacterSchema` and `CharacterUnlockSchema`.
- Read endpoints (`requireParent` + `requireActiveChild`, under `/api/me`): `GET /api/me/rewards/summary` (already used by M11's home) and `GET /api/me/characters` → `{ characters: [{ id, slug, name, imageUrl, isDefault, isUnlocked }] }`, **every published character** flagged per child, alphabetical — enough to draw locked ones as silhouettes. (`GET /api/characters` is only the starter-avatar list for profile creation, not the catalogue.) **No endpoint lists a child's earned badges or the badge catalogue**, and `apps/web` has no collection screens; only `badgeCount` is available outside a completion response.
- Web reference: `apps/web/features/lesson/steps/RewardStep.tsx` composes `apps/web/features/rewards/StarBurst.tsx` (`STAR_STAGGER_MS = 400`), `CoinCountUp.tsx` (`from`/`to`, ease-out, `COIN_COUNT_DURATION_MS = 1200`; the step counts `0 → coinsEarned`), `StreakCelebration.tsx`, and `apps/web/shared/components/kid/BadgeReveal.tsx` (one component, `kind: "badge" | "character"`); `apps/web/shared/lib/unlock-names.ts` joins several names through i18n. The sequence is **timer-driven**, phases `stars → coins → badges → characters → streak → mascot`, skipping phases with nothing in them; holds are `starsEarned × STAR_STAGGER_MS + 600`, `1200`, `2200` per unlock phase and `2000` for the streak; the mascot phase is terminal and the child taps "done". One clip per phase, never per item: a random cheer, `coin-1` (only when coins > 0), `unlock-1`, `streak-{locale}`, `celebration-{locale}`. A failed completion is logged and the celebration runs with no numbers. Match these beats — a reward that lands differently on the two clients feels like two products.
- `apps/web` uses `canvas-confetti`; mobile has no canvas. Use Reanimated for the burst and `lottie-react-native` for badge and character reveals if a Lottie asset exists, otherwise a Reanimated composition. Do not add both libraries if one suffices — check the bundle cost.
- M13 hands the step `pendingWrites` and does not report `reward` itself. M14 gives the feedback clips. M05 gives `useReducedMotion`.
- design.md §5.2: animate `transform` and `opacity` only; respect reduced motion. §7: ≥64px targets. §10: kid copy 1–4 words with an icon and a voice-over.
- NFR-PERF: a low-end Android phone is the target. A celebration that drops frames reads as a broken app at exactly the moment the child is supposed to feel good.

## Detailed Requirements

1. **Reward step** (`components/lesson/steps/RewardStep.tsx`) — replaces M13's placeholder. On mount: `await pendingWrites.settled()`, then `completeLesson(lesson.id)`, showing a celebratory loading state (sparkles, not a spinner) meanwhile. Then render web's **sequence**, not a pile: stars → coins → badges (if any) → characters (if any) → streak (if a milestone) → mascot with one big "Done". Each beat is skippable by a tap, and the whole sequence is skippable to the button — a child who has seen it forty times should not be held hostage by it.
2. **Everything from the response.** Star count, coin delta, new badges, unlocked characters and the streak milestone all come from `LessonCompletionResponse`. No client-side arithmetic, no "if score > 80 then 3 stars" rule in the app. If the response carries no badge, no badge appears. On any failure (including `409 LESSON_NOT_PLAYED`), log it and run the celebration with no numbers — never grant locally and never retry by hand.
3. **Star burst** (`components/rewards/StarBurst.tsx`) — `starsEarned` stars, staggered `STAR_STAGGER_MS`, with a spring. Reanimated on `transform`/`opacity`; under reduced motion the stars simply appear in place.
4. **Coin count-up** (`components/rewards/CoinCountUp.tsx`) — `from`/`to` with web's ease-out over `COIN_COUNT_DURATION_MS`; the reward step counts `0 → coinsEarned`. Under reduced motion it shows the final number immediately.
5. **Badge and character reveal** (`components/rewards/BadgeReveal.tsx`, `kind: "badge" | "character"`, as web) — the `iconUrl` / `imageUrl` (`expo-image`, prefetched while the completion request is in flight; a `null` URL gets a generic glyph), its `name` (a plain string; several names joined through i18n like `unlock-names.ts`), with a scale-and-shine entrance. For a character, a hint that it can now be the child's avatar (FR-GAM-05). Reduced motion: a static presentation.
6. **Streak celebration** (`components/rewards/StreakCelebration.tsx`) — only when `streak.milestone` is set (`STREAK_MILESTONE_DAYS`). Shows the day count as a number **and** a shape (a chain of markers), with warm copy and the `streak` clip. A non-milestone day shows nothing extra (FR-GAM-06) — otherwise every day is a party and none of them mean anything.
7. **Collection screens.**
   - `app/(student)/collection/badges.tsx` — **blocked on a server read endpoint that does not exist** (see Context). Until one is added, show only `badgeCount` from the reward summary; do not invent a client-side catalogue. If an endpoint is added, earned badges are bright and unearned are silhouettes with names hidden but their count visible ("3 more to find!").
   - `app/(student)/collection/characters.tsx` — from `GET /api/me/characters`: unlocked characters bright and selectable as the child's avatar, locked ones as silhouettes that play the `locked` clip (an invitation, never a refusal — as web's `AvatarPicker`). Selecting calls `PATCH /api/children/:id` with `{ avatarCharacterId }` (M09); the server answers `400 VALIDATION_FAILED` (`field: "avatarCharacterId"`) for a character that is neither a default nor unlocked for this child, so surface that as a gentle retry rather than silence.
   - Both reachable from the home screen (M11) with ≥64px entries. These are mobile additions; web has none.
8. **Reduced motion is a first-class path, not a fallback.** Every celebration has a designed static form. Test with the OS setting on: the child must still learn what they earned.
9. **Performance budget.** The whole sequence must hold 60fps (or the device's refresh rate) on a low-end Android device. Animate `transform`/`opacity` only, cap simultaneous animated nodes, and prefetch every image before its beat. If a Lottie asset costs more than ~150KB, question it.
10. **Replays need no special mode.** A finished lesson replays from `intro` (M13), so a replay reaches this step like any run and calls completion once it has been played through again. The server answers with `starsEarned: 0` and no unlocks (perhaps the day's coins); the sequence shows only what was granted, so nothing implies a new award. Do not read old progress to fake a past celebration.
11. **Tests** (`RewardStep.test.tsx`, plus one per reward component): completion is called once and only after `pendingWrites.settled()` resolves; the sequence renders only the phases the response contains, in web's order; no badge in the response renders no badge; a failed or `409` completion celebrates without numbers and is not retried; a tap skips the current beat and a second tap reaches the button; reduced motion renders every beat statically with the same information; the streak celebration appears only on a milestone; a replay response (`starsEarned: 0`, empty unlocks) renders no star burst or unlock beats; the collection screens show earned and locked states correctly.

## Technical Approach & Suggestions

```
apps/mobile/components/lesson/steps/RewardStep.tsx
apps/mobile/components/lesson/steps/RewardStep.test.tsx
apps/mobile/components/rewards/StarBurst.tsx
apps/mobile/components/rewards/CoinCountUp.tsx
apps/mobile/components/rewards/CoinCountUp.test.tsx
apps/mobile/components/rewards/BadgeReveal.tsx            # badge | character, as web
apps/mobile/components/rewards/StreakCelebration.tsx
apps/mobile/lib/reward-sequence.ts                  # pure: response -> ordered phases with holds
apps/mobile/lib/reward-sequence.test.ts
apps/mobile/lib/characters-api.ts                   # GET /api/me/characters
apps/mobile/app/(student)/collection/badges.tsx
apps/mobile/app/(student)/collection/characters.tsx
```

Derive the sequence purely, mirroring web's `buildSchedule`, so the step component is a player and the logic is testable:

```ts
// apps/mobile/lib/reward-sequence.ts
import type { LessonCompletionResponse } from "@kidlearn/types";

const PHASES = ["stars", "coins", "badges", "characters", "streak", "mascot"] as const;
export type RewardPhase = (typeof PHASES)[number];

/** Only what the server granted, in web's order; `rewards` is undefined when completion failed. */
export function rewardSequence(rewards: LessonCompletionResponse | undefined) {
  const stars = rewards?.starsEarned ?? 0;
  return PHASES.filter((phase) => {
    if (phase === "badges") return (rewards?.newBadges.length ?? 0) > 0;
    if (phase === "characters") return (rewards?.newCharacters.length ?? 0) > 0;
    if (phase === "streak") return rewards?.streak.milestone != null;
    return true;
  }).map((phase) => ({
    phase,
    holdMs:
      phase === "stars" ? stars * STAR_STAGGER_MS + STAR_PHASE_TAIL_MS
      : phase === "coins" ? COIN_COUNT_DURATION_MS
      : phase === "streak" ? STREAK_PHASE_MS
      : UNLOCK_PHASE_MS,       // the mascot phase is terminal; its hold is unused
  }));
}
```

The completion call, as web's `RewardStep` makes it:

```ts
useEffect(() => {
  let isCurrent = true;
  void pendingWrites.settled()
    .then(() => completeLesson(lesson.id))          // isIdempotent: true
    .then((result) => {
      if (!isCurrent) return;
      if (!result.ok) console.warn(`completion not recorded: ${result.error.code}`);
      setRewards(result.ok ? result.data : undefined);
      setPhase("stars");
    });
  return () => { isCurrent = false; };
}, [lesson.id, pendingWrites]);
```

The star burst, cheap on low-end Android — one shared value per star, transform + opacity only:

```tsx
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
<Pressable onPress={advancePhase} accessibilityLabel={t("lesson:skipCelebration")} style={StyleSheet.absoluteFill}>
  {renderPhase(schedule[index])}
</Pressable>
```

Under reduced motion, render the *whole* sequence at once as a summary card (stars, coins, badge, character, streak) with a single "Done" — one screen, all the information, no motion.

## Step-by-Step Plan

1. Read `LessonCompletionSchema`, `NewBadgeSchema`, `NewCharacterSchema`, `StreakMilestoneSchema`, web's `RewardStep.tsx`, the three `features/rewards/` components and `shared/components/kid/BadgeReveal.tsx`; note the phase holds and clips. (~25 min)
2. Write `lib/reward-sequence.ts` + tests (only granted phases, web's order, failed completion, replay response). (~30 min)
3. Build `CoinCountUp` (ported easing, reduced-motion branch) with its test. (~25 min)
4. Build `StarBurst` with transform/opacity-only animation. (~30 min)
5. Build `BadgeReveal` (both kinds) with prefetched art and the null-URL glyph. (~30 min)
6. Build `StreakCelebration`, milestone-only, with number + shape encoding. (~25 min)
7. Build `RewardStep`: settled-then-complete, the loading state, the phase player, tap-to-skip, the reduced-motion summary card, the final "Done" that calls `onComplete()`. Test each branch. (~45 min)
8. Build `lib/characters-api.ts` and the two collection screens (earned/locked states, home-screen entries); confirm the avatar-change rejection path before wiring that button. (~40 min)
9. Device pass: complete a real lesson on a **low-end Android phone**, watch for dropped frames, then replay it, then repeat with reduced motion on and with TalkBack on. (~30 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] Completion is called once per run, only after `pendingWrites` has settled; the app computes no stars, coins, badges, characters or streaks.
- [ ] The sequence contains only the phases the server actually granted, in web's order, ending on the mascot with one large "Done".
- [ ] Any beat can be tapped through, and the whole sequence can be skipped to the button.
- [ ] A failed or `409` completion celebrates without numbers, is logged, and is not retried by hand.
- [ ] Reduced motion renders a single static summary carrying the same information — nothing is lost, only the movement.
- [ ] The streak celebration appears only on a `STREAK_MILESTONE_DAYS` milestone.
- [ ] Badge and character art is prefetched before its beat; no reveal waits on the network.
- [ ] The full celebration holds the device's refresh rate on a **low-end Android phone**, animating `transform`/`opacity` only.
- [ ] A replayed lesson shows only what the replay's completion granted, with no "new" framing.
- [ ] The character collection shows unlocked and locked characters; the badge screen shows the count (full gallery only once a server endpoint exists).
- [ ] Selecting an unlocked character updates the child's avatar via `PATCH /api/children/:id`, and a rejected selection is shown gently, never silently.
- [ ] TalkBack announces what was earned in every beat.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Awarding logic of any kind. Server-side and shipped (`apps/server/src/modules/rewards/`).
- The story-completion reward — M23 reuses these components for its own celebration.
- A shop or coin spending. Coins are a score at MVP; a store is a product decision with store-review consequences (in-app purchase rules).
- Leaderboards or comparison between children. Explicitly against the product's tone and a privacy risk for children.
- Push notifications for streak reminders — out of scope for the plan (§3.2).
