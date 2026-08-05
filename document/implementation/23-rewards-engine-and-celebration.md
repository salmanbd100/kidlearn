# 23 — Rewards Engine & Celebration Screen

> **Estimated effort:** 3–4 hours
> **Depends on:** 06, 16, 22
> **Requirement IDs:** FR-LSN-05, FR-GAM-01, FR-GAM-02, FR-GAM-07, FR-GAM-08
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Make rewards real and server-authoritative: a rewards service in `apps/server` that, on lesson completion, computes the grants — stars for completing the lesson and its quiz (FR-GAM-01), coins for correct quiz answers and the first activity of the day (FR-GAM-02) — and writes them as traceable, timestamped `RewardLedger` rows (FR-GAM-07) with a hard idempotency guard so replaying a lesson never double-grants. A new `POST /api/progress/lessons/:id/complete` endpoint returns `{starsEarned, coinsEarned, newBadges: [], totals}`, and that response drives the real `RewardStep`: star burst, coin count-up, mascot celebration with cheerful audio, and a big "Done!" back to home (FR-LSN-05). Rewards are earned only — there is no purchase path anywhere (FR-GAM-08).

## Context & Current State

File 06 delivered `RewardLedger` (append-only: `childId`, `rewardType` enum `star|coin|badge`, `amount`, `sourceType`, `sourceId?`, `badgeId?`, `createdAt`) — but **no uniqueness guard yet**; this file adds it. File 16 delivered the lesson player: `RewardStep` is still the placeholder (`components/lesson/steps/reward-step.tsx`), the `finished` state currently posts `reportStep({ step: "reward", completed: true })`, and `apps/server/src/routes/progress.ts` is mounted at `/api/progress` behind the active-child middleware. File 22 delivered the quiz score: `LessonProgress.score` is written and `QuizResponse` rows (with `attempts`) exist per question, so the rewards service can derive "correct answers" server-side instead of trusting the client. File 08's patterns apply: `services/` for business logic, `{ data }` envelope, `ApiError`. `canvas-confetti` and the cheer audio pools exist from file 18. File 15's student home shows reward totals from a placeholder — this file gives it the real `GET /api/me/rewards/summary`.

## Detailed Requirements

1. **Grant rules (FR-GAM-01..02), fixed constants in one place** (`REWARD_RULES` in the service, with a comment that tuning is data-driven post-MVP):
   - `lesson_completion` → **2 stars**, `sourceId = lessonId`.
   - `quiz_completion` → **1 star**, `sourceId = lessonId` (granted when the lesson's quiz has responses).
   - `quiz_correct_answers` → **2 coins per correct answer**, `sourceId = lessonId`, `amount = 2 × correctCount`. `correctCount` is computed **server-side**: the number of the quiz's questions whose *latest* `QuizResponse` for this child has `isCorrect: true` (replay-stable, never trusts the client).
   - `daily_activity` → **5 coins** for the first qualifying activity of the local day, `sourceId = <yyyy-MM-dd>` in `APP_TIMEZONE` — the unique guard makes "once per day" structural.
2. **FR-GAM-07 — traceable ledger:** every grant is a `RewardLedger` row with `sourceType` + `sourceId` + `createdAt`; balances remain `SUM(amount)` aggregates (file 06 rule). Recent-activity and weekly reports (29–30) read these rows as-is.
3. **Idempotency (binding):** add `@@unique([childId, rewardType, sourceType, sourceId])` to `RewardLedger` (additive migration; Postgres treats NULL `sourceId` as distinct, so server logic **always** sets `sourceId`). Grants insert with `createMany({ skipDuplicates: true })`. Completing the same lesson twice grants nothing the second time and the endpoint reports `starsEarned: 0, coinsEarned: 0` with unchanged totals.
4. **Completion endpoint:** `POST /api/progress/lessons/:id/complete` (active-child scoped; 404 if the lesson isn't visible to the child) marks `LessonProgress` complete (`currentStep: "reward"`, `completedAt` set only if currently null — replays keep the original date), runs the rewards service in one transaction, and responds `{ data: { starsEarned, coinsEarned, newBadges: [], totals: { stars, coins } } }`. `newBadges` is the fixed-shape empty array file 24 fills. This call **replaces** the file-16 client call `reportStep({ step: "reward", completed: true })`.
5. **Summary endpoint:** `GET /api/me/rewards/summary` (active-child scoped) returns `{ data: { stars, coins, badgeCount } }` from ledger aggregates; the student home (file 15) switches its totals display to this.
6. **FR-LSN-05 — RewardStep celebration:** on mount it calls the complete endpoint (sparkle loading state meanwhile); the response drives the UI: animated star burst (one big star pops per star earned, confetti), coin count-up animating `0 → coinsEarned` with coin-clink ticks, mascot celebration animation + cheerful audio, then updated totals shown small at the bottom. A huge "Done!" button (≥ 96px tall) fires `onComplete` → the file-16 `finished` flow returns home. If the request fails or returns zeros (replay), still celebrate warmly — the child never sees an error or an empty screen.
7. **FR-GAM-08 — no purchase path, by construction:** the only code paths that insert `RewardLedger` rows live in `apps/server/src/services/rewards.ts`; no endpoint accepts client-supplied amounts or reward types. State this in a comment atop the service and assert it in review.
8. **Pure grant computation:** `computeLessonGrants(input)` is a pure function (no I/O) returning `GrantSpec[]`; all rule logic and amounts are unit-tested without a database.
9. **Tests:** unit tests for `computeLessonGrants`; Supertest for the endpoint including the double-completion idempotency case and child scoping; RTL test that the celebration renders stars/coins from a mocked completion response.

## Technical Approach & Suggestions

Files to create:

```
apps/server/src/services/rewards.ts            # REWARD_RULES, computeLessonGrants (pure), grantLessonCompletion (Prisma)
apps/server/src/services/rewards.test.ts       # pure-function suite (no DB)
apps/server/src/routes/me.ts                   # GET /api/me/rewards/summary
apps/web/components/rewards/StarBurst.tsx
apps/web/components/rewards/CoinCountUp.tsx
apps/web/components/rewards/CoinCountUp.test.tsx
apps/web/components/lesson/steps/reward-step.test.tsx
```

Files to modify:

```
apps/server/src/routes/progress.ts             # + POST /api/progress/lessons/:id/complete
apps/server/src/routes/progress.test.ts        # + completion + idempotency specs
apps/server/src/lib/env.ts                     # + APP_TIMEZONE (default "Asia/Dhaka") if absent; update .env.example
packages/db/prisma/schema.prisma               # RewardLedger @@unique guard (migration: reward_ledger_unique_grant)
apps/web/components/lesson/steps/reward-step.tsx   # placeholder → real celebration
apps/web/lib/progress-api.ts                   # + completeLesson(), getRewardsSummary(); remove the reward reportStep call
apps/web/components/lesson/lesson-player.tsx   # finished effect calls completeLesson via RewardStep instead of reportStep
```

Service contracts (binding — file 24 extends these):

```ts
// apps/server/src/services/rewards.ts
// FR-GAM-08: this module is the ONLY writer of RewardLedger rows. No route may
// accept client-supplied amounts/types. Rewards are earned, never purchased.

export const REWARD_RULES = {
  lessonCompletionStars: 2,
  quizCompletionStars: 1,
  coinsPerCorrectAnswer: 2,
  firstActivityOfDayCoins: 5,
} as const;

export interface GrantSpec {
  rewardType: "star" | "coin";
  amount: number;
  sourceType: "lesson_completion" | "quiz_completion" | "quiz_correct_answers" | "daily_activity";
  sourceId: string; // always set — the unique guard depends on it
}

export interface GrantInput {
  lessonId: string;
  quizAttempted: boolean;   // the lesson's quiz has >= 1 response row for this child
  correctCount: number;     // latest-response-per-question isCorrect count (server-derived)
  firstActivityOfDay: boolean;
  localDate: string;        // "2026-06-12" in APP_TIMEZONE
}

export function computeLessonGrants(input: GrantInput): GrantSpec[];

export interface CompletionRewards {
  starsEarned: number;      // sum of star rows actually inserted (0 on replay)
  coinsEarned: number;
  totals: { stars: number; coins: number };
}
export async function grantLessonCompletion(childId: string, lessonId: string): Promise<CompletionRewards>;
```

`grantLessonCompletion` flow (single `prisma.$transaction`): derive `correctCount` (group latest `QuizResponse` per question of the lesson's quiz), check `firstActivityOfDay` by probing for an existing `daily_activity` row with `sourceId = localDate` (the unique guard backstops the race), build specs via `computeLessonGrants`, insert with `createMany({ skipDuplicates: true })`, then compute *earned* amounts from what was actually inserted (compare ledger state before/after or use the `createMany` count split by query — simplest: query for the exact `(sourceType, sourceId)` rows created in this transaction window) and `totals` via `groupBy(rewardType, _sum.amount)`. Local date helper: `formatInTimeZone(new Date(), env.APP_TIMEZONE, "yyyy-MM-dd")` from `date-fns-tz` (same package/env var file 27 uses — keep names identical).

Endpoint contract:

```
POST /api/progress/lessons/:id/complete
200: { data: { starsEarned: number, coinsEarned: number, newBadges: [], totals: { stars: number, coins: number } } }
401: no active child   404: lesson not visible to child

GET /api/me/rewards/summary
200: { data: { stars: number, coins: number, badgeCount: number } }
```

`RewardStep` sketch (props stay `{ lesson, onComplete }` per file 16):

```tsx
const [rewards, setRewards] = useState<CompletionResponse | null>(null);
useEffect(() => {
  completeLesson(lesson.id)
    .then(setRewards)
    .catch(() => setRewards({ starsEarned: 0, coinsEarned: 0, newBadges: [], totals: null })); // celebrate anyway
}, [lesson.id]);
// phase 1: stars pop one-by-one (400ms stagger) + confetti via canvas-confetti
// phase 2: <CoinCountUp from={0} to={rewards.coinsEarned} durationMs={1200} /> with tick sfx
// phase 3: mascot bounce loop + /audio/feedback/celebration-{locale}.mp3
// always-on: <BigButton onClick={onComplete}>Done!</BigButton>
```

`CoinCountUp` uses `requestAnimationFrame` with an ease-out curve; respect `prefers-reduced-motion` (jump straight to the final number, per NFR-A11Y-05) — test with fake timers/mocked rAF.

## Step-by-Step Plan

1. Write failing unit tests for `computeLessonGrants`: lesson-only (2 stars), with quiz attempted (+1 star), 3 correct answers → 6 coins, first-of-day adds the 5-coin spec with `sourceId = localDate`, zero correct → no coin spec, repeat-day → no daily spec. (~25 min)
2. Implement `computeLessonGrants` + `REWARD_RULES` → green; add `APP_TIMEZONE` to `lib/env.ts` + `.env.example` and the local-date helper. (~20 min)
3. Add the `@@unique([childId, rewardType, sourceType, sourceId])` migration to `RewardLedger`; verify `migration.sql` creates the composite unique index. (~15 min)
4. Write failing Supertest specs for `POST /api/progress/lessons/:id/complete`: 401 / 404 guards; happy path inserts the expected ledger rows with timestamps and returns earned + totals; **calling it twice returns `starsEarned: 0, coinsEarned: 0` with identical totals and no new rows**; `completedAt` is set once and not overwritten. (~30 min)
5. Implement `grantLessonCompletion` (transaction, latest-response correctCount, skipDuplicates) and the route handler → green. (~35 min)
6. Implement `GET /api/me/rewards/summary` (ledger `groupBy`) + Supertest (aggregates match inserted rows; 401 without active child); point the student home totals at it. (~20 min)
7. Build `StarBurst`, `CoinCountUp` (+ reduced-motion test), and the real `RewardStep`; RTL test: mocked `completeLesson` resolving `{starsEarned: 3, coinsEarned: 11, ...}` renders 3 stars and counts to 11, Done fires `onComplete`; a rejected promise still renders the celebration + Done. (~35 min)
8. Swap the file-16 `reportStep(reward, completed)` call for the complete endpoint; manual run: finish a seeded lesson, watch the celebration, replay it and confirm zero new grants in the DB; `pnpm lint && pnpm typecheck && pnpm --filter web test && pnpm --filter server test`; update tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: `computeLessonGrants` suite, completion endpoint specs, double-completion grants nothing new, summary aggregates.
- [ ] `pnpm --filter web test` passes: `reward-step` celebration from mocked response, `CoinCountUp` (including reduced-motion), failure path still celebrates.
- [ ] Completing a seeded lesson inserts ledger rows: 2-star `lesson_completion`, 1-star `quiz_completion`, `2 × correctCount`-coin `quiz_correct_answers`, and (first time today) 5-coin `daily_activity` — each with `sourceType`, `sourceId`, `createdAt` (FR-GAM-01..02, FR-GAM-07).
- [ ] `migration.sql` contains the unique index on `(childId, rewardType, sourceType, sourceId)`; completing the same lesson twice leaves the ledger row count unchanged.
- [ ] `GET /api/me/rewards/summary` totals equal `SUM(amount)` per type; the student home displays them.
- [ ] The celebration shows star burst, coin count-up, mascot animation + audio, and a ≥ 96px "Done!" returning home; a failed request never shows an error to the child (FR-LSN-05).
- [ ] No route anywhere accepts client-supplied reward amounts or types; ledger writes exist only in `services/rewards.ts` (FR-GAM-08) — verify with `grep -r "rewardLedger.create" apps/server/src` showing only the service.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- Badge rule evaluation, character unlocks, and streak updates — file 24 (it plugs into this completion flow and fills `newBadges`).
- Story completion rewards (file 26 reuses the service with a `story_completion` source).
- Recent-activity and weekly-report reads of the ledger (29–30); admin badge management (33).
- Per-child timezone (post-MVP; `APP_TIMEZONE` env is the MVP decision, shared with file 27).
