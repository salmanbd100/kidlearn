# 24 — Badges, Character Unlocks & Streaks

> **Estimated effort:** 3–4 hours
> **Depends on:** 23
> **Requirement IDs:** FR-GAM-04, FR-GAM-05, FR-GAM-06
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Finish the gamification layer with the three data-driven unlock systems that run after every completion event: a **badge rule engine** that interprets `Badge.ruleType` + `rule` JSONB rows and grants milestone badges through the reward ledger (FR-GAM-04), **character unlocks** evaluated from `Character.unlockRule` criteria so new avatar characters appear progressively in the avatar picker (FR-GAM-05), and **server-side learning streaks** — current and longest consecutive days with at least one qualifying activity, updated once per local day, with 3- and 7-day milestones flagged for special celebration (FR-GAM-06). All three plug into file 23's completion flow and surface in its response: `newBadges` gets filled, plus `newCharacters` and `streak` are added.

## Context & Current State

File 23 is done: `grantLessonCompletion` runs in a transaction inside `POST /api/progress/lessons/:id/complete`, the `RewardLedger` unique guard `(childId, rewardType, sourceType, sourceId)` exists, `APP_TIMEZONE` is in env (default `"Asia/Dhaka"`, `date-fns-tz` installed), and the `RewardStep` celebration renders from the completion response (with `newBadges: []` reserved). From file 06: `Badge` rows carry `ruleType String` + `rule Json` + `status`, `Character` rows carry `unlockRule Json` + `isDefault`, `ChildCharacter` is unique per `(childId, characterId)`, `Streak` is one row per child (`current`, `longest`, `lastActivityDate @db.Date`), and the seed already created the six FR-GAM-04 badges and the default character `leo-the-lion`. The avatar picker exists from file 14 (profile management) and file 15 shows the current streak on the student home from a placeholder value. `QuizResponse`, `LessonProgress`, and `RewardLedger` provide everything the evaluators count.

## Detailed Requirements

1. **Badge rule engine (FR-GAM-04) — badges are data, not code.** Implement one evaluator per `ruleType`, dispatched from a registry; unknown `ruleType` logs a warning and evaluates false (a bad admin row must never break completions). MVP rule types (binding shapes):
   - `lessons_completed_in_topic` — `{ topicSlug: string, count: number | "all" }`: child's distinct completed lessons (`LessonProgress.completedAt != null`) in that topic reaches `count` (`"all"` = every published lesson in the topic).
   - `stories_completed` — `{ count: number }`: distinct completed stories counted from `story_completion` ledger rows (file 26 creates them; evaluates 0 until then).
   - `streak_days` — `{ days: number }`: `Streak.current >= days` (evaluated **after** the streak update in the same flow).
   - `quiz_correct_in_topic` — `{ topicSlug: string, count: number }`: distinct questions in that topic whose latest `QuizResponse` is correct ("20 animals identified" honestly measured).
2. **Six MVP badges as seed data** (update `packages/db/prisma/seed.ts` to these exact payloads, all `status: "published"`): `alphabet-hero` → `lessons_completed_in_topic {topicSlug:"alphabet", count:"all"}`; `math-champion` → `lessons_completed_in_topic {topicSlug:"numbers", count:"all"}`; `reading-star` → `stories_completed {count:10}`; `animal-expert` → `quiz_correct_in_topic {topicSlug:"animals", count:20}`; `streak-starter` → `streak_days {days:3}`; `week-warrior` → `streak_days {days:7}`.
3. **Badge granting:** after each completion event, evaluate every **published, not-yet-earned** badge (earned = a ledger row with `rewardType: "badge"` and that `badgeId`); grant via `RewardLedger` rows (`rewardType: "badge"`, `amount: 1`, `sourceType: "badge_unlock"`, `sourceId: badge.slug`, `badgeId`) — the file-23 unique guard makes grants idempotent. Newly granted badges return as `newBadges: [{ id, slug, name, iconUrl }]` in the completion response, and the celebration shows a badge reveal card per badge.
4. **Character unlocks (FR-GAM-05):** `Character.unlockRule` criteria evaluated against ledger totals — MVP shapes `{ stars: number }`, `{ coins: number }`, or `{ badges: number }` (any combination; all present keys must be met). On unlock, create a `ChildCharacter` row (`skipDuplicates` on the unique pair). Newly unlocked characters return as `newCharacters: [{ id, slug, name, imageUrl }]`. Seed three unlockable characters (e.g. `mia-the-monkey {stars: 10}`, `ollie-the-octopus {coins: 50}`, `zara-the-zebra {badges: 2}`).
5. **Avatar picker shows progression:** `GET /api/me/characters` returns all published characters with `unlocked: boolean` (default character always unlocked); the picker (file 14/15 UI) renders locked ones as a friendly silhouette with a small lock — tapping one plays a gentle "keep learning to unlock!" audio, never an error. Selecting an unlocked one updates `ChildProfile.avatarCharacterId` (existing profile-update route).
6. **Streaks (FR-GAM-06), server-side only:** `updateStreakForActivity(childId, now)` computes "today" in `env.APP_TIMEZONE` (single app timezone at MVP, consistent with file 27) and compares to `Streak.lastActivityDate`: same day → no change (`isNewDay: false`); yesterday → `current + 1`; anything else (or null) → `current = 1`; `longest = max(longest, current)`; upsert the row. It returns `{ current, longest, isNewDay, milestone: 3 | 7 | null }` — `milestone` is set only when `current` **reaches** 3 or 7 on this update (not on later days).
7. **Completion response extended (additively, file-23 shape preserved):** `{ data: { starsEarned, coinsEarned, newBadges, newCharacters, streak: { current, milestone }, totals } }`. The `RewardStep` celebration adds: badge reveal cards, character unlock reveal, and — when `milestone` is non-null — a special streak celebration animation (flame/fireworks + dedicated audio). The student home reads the real `current` streak (replace the file-15 placeholder via the existing summary/profile fetch).
8. **Ordering inside the completion transaction (binding):** stars/coins grants (23) → streak update → badge evaluation (so `streak_days` sees the new value) → character evaluation (so `{ badges: n }` sees new badges). All in the same `$transaction` as file 23.
9. **Tests:** unit tests for every rule-type evaluator (met / not met / `"all"` / unknown type), character criteria, and streak day-boundary cases (same-day repeat, consecutive day, broken streak, longest preserved, milestone exactly at 3 and 7 only); Supertest extension: completing a lesson that crosses a 3-day streak returns `streak-starter` in `newBadges` and `milestone: 3`, and re-completing grants nothing new.

## Technical Approach & Suggestions

Files to create:

```
apps/server/src/services/streaks.ts            # updateStreakForActivity (date math pure-extracted)
apps/server/src/services/streaks.test.ts
apps/server/src/services/badge-rules.ts        # rule evaluators + registry (pure: take counts, return boolean)
apps/server/src/services/badge-rules.test.ts
apps/server/src/services/achievements.ts       # evaluateBadges / evaluateCharacters (Prisma queries + grants)
apps/server/src/routes/me-characters.test.ts   # or extend routes/me tests
apps/web/components/rewards/BadgeReveal.tsx
apps/web/components/rewards/StreakCelebration.tsx
```

Files to modify:

```
apps/server/src/services/rewards.ts            # completion flow calls streaks → badges → characters; extended response
apps/server/src/routes/me.ts                   # + GET /api/me/characters
packages/db/prisma/seed.ts                     # final badge rule payloads + 3 unlockable characters
apps/web/components/lesson/steps/reward-step.tsx   # badge/character/streak celebration phases
apps/web/components/profile/avatar-picker.tsx  # locked silhouettes + unlock state (file 14 component)
apps/web/lib/progress-api.ts                   # CompletionResponse type extended; getMyCharacters()
```

Streak math (pure core, binding semantics — keep it I/O-free for tests):

```ts
// apps/server/src/services/streaks.ts
export interface StreakUpdate { current: number; longest: number; isNewDay: boolean; milestone: 3 | 7 | null }

export function computeStreakUpdate(
  prev: { current: number; longest: number; lastActivityDate: string | null }, // "yyyy-MM-dd" local
  today: string,     // formatInTimeZone(now, env.APP_TIMEZONE, "yyyy-MM-dd")
  yesterday: string,
): StreakUpdate {
  if (prev.lastActivityDate === today)
    return { current: prev.current, longest: prev.longest, isNewDay: false, milestone: null };
  const current = prev.lastActivityDate === yesterday ? prev.current + 1 : 1;
  const longest = Math.max(prev.longest, current);
  const milestone = current === 3 ? 3 : current === 7 ? 7 : null;
  return { current, longest, isNewDay: true, milestone };
}
```

`updateStreakForActivity` wraps it: read the `Streak` row (treat `lastActivityDate` via `formatInTimeZone`), upsert with the computed values + `lastActivityDate: today`.

Badge rule registry (pure evaluators take pre-fetched facts, so they unit-test without Prisma):

```ts
// badge-rules.ts
export interface BadgeFacts {
  completedLessonIdsByTopic: (topicSlug: string) => { completed: number; totalPublished: number };
  storiesCompleted: number;
  streakCurrent: number;
  correctQuestionsInTopic: (topicSlug: string) => number;
}
type Evaluator = (rule: unknown, facts: BadgeFacts) => boolean;
export const BADGE_RULE_EVALUATORS: Record<string, Evaluator> = {
  lessons_completed_in_topic: (rule, f) => { /* zod-parse rule; count === "all" ? completed >= totalPublished : completed >= count */ },
  stories_completed: (rule, f) => { /* f.storiesCompleted >= rule.count */ },
  streak_days: (rule, f) => { /* f.streakCurrent >= rule.days */ },
  quiz_correct_in_topic: (rule, f) => { /* f.correctQuestionsInTopic(rule.topicSlug) >= rule.count */ },
};
export function evaluateBadgeRule(ruleType: string, rule: unknown, facts: BadgeFacts): boolean {
  const ev = BADGE_RULE_EVALUATORS[ruleType];
  if (!ev) { console.warn(`unknown badge ruleType: ${ruleType}`); return false; }
  return ev(rule, facts); // zod-parse inside each evaluator; malformed rule → warn + false
}
```

`achievements.ts`: `evaluateBadges(tx, childId, facts)` loads published badges minus earned (`rewardLedger.findMany({ where: { childId, rewardType: "badge" }, select: { badgeId } })`), filters with `evaluateBadgeRule`, inserts ledger rows via `createMany({ skipDuplicates: true })`, returns the newly granted badges with `iconUrl` resolved from `iconAsset`. `evaluateCharacters(tx, childId, totals)` mirrors it against `ChildCharacter` (criteria check: `Object.entries(rule).every(([k, v]) => totals[k] >= v)` after zod-parsing `{ stars?, coins?, badges? }`, rejecting empty objects).

Endpoint addition:

```
GET /api/me/characters
200: { data: { characters: [{ id, slug, name, imageUrl, isDefault, unlocked: boolean }] } }
```

`RewardStep` celebration order (each phase skipped when empty): stars → coins (file 23) → `BadgeReveal` per new badge (card flips in, badge name spoken) → character reveal → `StreakCelebration` when `milestone` is non-null (full-screen flame/fireworks ~2s + `/audio/feedback/streak-{locale}.mp3`) → Done. Respect `prefers-reduced-motion` throughout (static reveals, no flame loop).

Supertest streak fixture tip: seed `Streak` rows directly with `lastActivityDate` = yesterday (computed in `APP_TIMEZONE`) to simulate "completing on day 3" without time travel; for the broken-streak case seed a 3-day-old date.

## Step-by-Step Plan

1. Write failing tests for `computeStreakUpdate`: first-ever activity → 1/new-day, same-day repeat → unchanged/no milestone, yesterday → +1, 2→3 sets `milestone: 3`, 6→7 sets `milestone: 7`, 4th consecutive day → `milestone: null`, gap resets to 1 with `longest` preserved. Implement → green. (~30 min)
2. Implement `updateStreakForActivity` (Prisma upsert around the pure core) and wire it into the file-23 completion transaction; extend the route response with `streak`. (~20 min)
3. Write failing tests for each badge evaluator: met / unmet, `count: "all"` against `totalPublished`, malformed rule → false + warn, unknown `ruleType` → false + warn. Implement `badge-rules.ts` → green. (~30 min)
4. Implement `achievements.ts` fact-loading queries + `evaluateBadges` granting through the ledger; update `seed.ts` with the six final badge payloads; Supertest: a child seeded with a 2-day streak completing a lesson gets `streak-starter` in `newBadges`; completing again returns `newBadges: []` and no duplicate row. (~35 min)
5. Write failing tests for character criteria (single key, multi key, empty rule rejected, already-unlocked skipped); implement `evaluateCharacters` + seed the three unlockable characters; wire into the transaction (after badges) and add `newCharacters` to the response. (~25 min)
6. Add `GET /api/me/characters` + Supertest (default unlocked, earned unlocks flagged, drafts hidden); update the avatar picker: locked silhouettes + lock icon + "keep learning" audio, unlocked selectable. (~25 min)
7. Build `BadgeReveal` + `StreakCelebration` and extend `reward-step.tsx`; RTL test: a mocked response with one badge, one character, and `milestone: 3` renders all three phases then Done; empty arrays skip phases. Point the student-home streak display at the real `current`. (~30 min)
8. Manual run: complete lessons across three seeded streak days, watch badge + streak celebrations, check the picker; `pnpm lint && pnpm typecheck && pnpm --filter web test && pnpm --filter server test`; update tracker. (~15 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: full `computeStreakUpdate` boundary suite, every badge rule type, character criteria, and the Supertest streak-badge integration (grant once, never twice).
- [ ] `pnpm --filter web test` passes: extended reward-step phases, avatar picker locked/unlocked states.
- [ ] All six FR-GAM-04 badges exist as published seed rows with the exact `ruleType`/`rule` payloads above; granting one creates a `badge` ledger row with `sourceType: "badge_unlock"`, `sourceId: <slug>`, `badgeId` set.
- [ ] Completing a lesson on the third consecutive local day returns `streak: { current: 3, milestone: 3 }` and `streak-starter` in `newBadges`; the same-day second completion returns `milestone: null` and no new grants (FR-GAM-04, FR-GAM-06).
- [ ] A same-day repeat never changes `current`; a gap resets `current` to 1 while `longest` is preserved (verify `Streak` row in DB).
- [ ] Reaching a character's criteria creates exactly one `ChildCharacter` row; the character appears unlocked in `GET /api/me/characters` and is selectable in the avatar picker, while locked characters show silhouettes and are not selectable (FR-GAM-05).
- [ ] A badge row with an unknown `ruleType` or malformed `rule` logs a warning and the completion still succeeds (no 500).
- [ ] The student home shows the real current streak; the milestone celebration animation plays only on milestone completions (FR-GAM-06).
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- Story completion events feeding `stories_completed` / streaks — file 26 (it calls the same completion-reward service; the evaluator is ready).
- Admin badge/character management UI and icon uploads — file 33 (rules are already data-driven for it).
- Learning-time heartbeats and screen-time enforcement — files 27–28 (streak "qualifying activity" at MVP = lesson/story completion, not raw heartbeats).
- Per-parent timezone for streak day boundaries (post-MVP; `APP_TIMEZONE` env is the MVP decision, shared with files 23 and 27).
- Recent-activity and weekly-report surfacing of badges (29–30).
