# M13 — Lesson Player Shell & Step Engine

> **Estimated effort:** 3–4 hours
> **Depends on:** M12
> **Requirement IDs:** FR-LSN-01..07
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the container every lesson runs inside: the five-step flow (`intro → video → activity → quiz → reward`) as a state machine driven by `packages/types`' own step order, resume from where the child left off, serialised step reports the server's order check accepts, a progress indicator a pre-reader can read, and — the native-only part — an exit guard so the Android back button and the iOS edge swipe cannot silently drop a child out mid-quiz.

## Context & Current State

- `packages/types/src/domain/progress.ts` owns the flow: `LESSON_STEPS = ["intro", "video", "activity", "quiz", "reward"]`, with `nextLessonStep(step)` and `resumeLessonStep(lastCompleted)`. The server's order check compares indices in the same array. **Do not hardcode the step list or the order anywhere in `apps/mobile`.**
- **Two event surfaces, and they are not interchangeable:**
  - `POST /api/progress/events` (`SessionEventReportSchema`, types `LESSON_SESSION_EVENT_TYPES` = `["lesson_start", "step_complete", "lesson_complete"]`) carries a lesson's `step` **and** the locale-`fallback` flag — "`true` when the finished step played an English asset because the locale had none". This is the lesson player's own event stream, and it is what this file posts.
  - `POST /api/events/activity` (`ACTIVITY_EVENT_TYPES`, which also includes `story_start`/`story_complete`) records milestones by `refId`. The lesson player does not use it; the story reader does (M23). Do not send step events there — it has no `step` field.
  Neither is screen-time gated (except `story_start`), so recording continues while a child finishes. Both **are** consent-gated, and both count against `CLIENT_EVENTS_PER_MINUTE = 30` per child (heartbeats excluded) → `429 RATE_LIMITED`. A lesson run posts about seven events, so only a loop reaches the limit; never retry on 429.
- Server endpoints, all behind `requireParent → requireConsent → requireActiveChild` (`apps/server/src/modules/progress/`):
  - `GET /api/progress/lessons/:id` → `LessonProgressReadResponseSchema`: `{ progress: { lessonId, currentStep, completedAt } | null }`. `currentStep` is the furthest step reported **finished**; `null` means never opened. Feed it to `resumeLessonStep`.
  - `POST /api/progress/lessons/:id/step` → body `{ step, completed }` (`LessonStepReportSchema`; `completed: true` only with `step: "reward"`). **Order is enforced** (`assertReachable` in `lesson-progress.service.ts`): a report may be at most one step past the stored `currentStep`, otherwise `409 CONFLICT` with `details: { code: "STEP_OUT_OF_ORDER", currentStep }` (`currentStep` may be `null`). A re-post of a passed step is a no-op; `intro` on a finished run (`currentStep: "reward"` with `completedAt`) is a **replay start** and moves the row back to `intro`. Only the report that would *create* the row is screen-time gated (`423`, M25); continuing a lesson never is.
  - `POST /api/progress/lessons/:id/complete` → `LessonCompletionResponse`: `{ starsEarned, coinsEarned, newBadges[], newCharacters[], streak: { current, milestone }, totals }`. It performs the `reward` step report itself. **Completion requires evidence:** `409` with `details.code = "LESSON_NOT_PLAYED"` unless this run's row has reached `activity` and is not an already-paid finished run (so re-posting a completion does not pay twice; a replay counts once it has been played through again). It derives the quiz star and per-answer coins from quiz responses already stored, so that write must have landed first.
  - `GET /api/content/lessons/:id` → `LessonDetailResponse`, screen-time gated — already called by M12, which hands the payload over. A lesson **in progress** (row touched < 30 min ago, started < 3 h ago — `LESSON_RESUME_GRACE_MS` / `LESSON_RESUME_CEILING_MS`) is exempt, so a child can reopen what they were doing after the limit passes.
- A `403 CONSENT_REQUIRED` on any of these writes (a consent-version bump mid-session) is handled globally: M04's `onConsentRequired` listener and M07/M08 reroute to the consent screen. The player does not branch on it.
- M12 gives `lib/lesson-cache.ts` (the one-entry handoff) and the 423/404 branching before the player ever mounts.
- M05 gives `Sheet` (for the exit confirm) and `Screen`. M04 gives `apiFetch` (with the `isIdempotent` opt-in) and `useApi`. M11 gives `localizedLabel`.
- `apps/web/features/lesson/` is the reference: `LessonPlayer.tsx`, `lesson-machine.ts`, `step-reports.ts`, `pending-writes.ts`, `StepContainer.tsx`, `ExitConfirm.tsx`, and `steps/` (`IntroStep`, `VideoStep`, `ActivityStep`, `QuizStep`, `RewardStep`, `lesson-step-props.ts`). `lesson-machine.ts`, `step-reports.ts` and `pending-writes.ts` are pure and platform-free — **lift them, do not copy them** (D6).
- The web's `ParentCorner` lock is hidden on `/lesson/*` (`apps/web/features/student/ParentCorner.tsx`): the player's own exit control occupies that corner. Mobile does the same (D10).
- design.md §6/§7: full-bleed, no nav chrome, ≥64px targets, ≥20px text, both orientations.

## Detailed Requirements

1. **Lift the pure lesson logic (D6).** Move `lesson-machine.ts`, `step-reports.ts` and `pending-writes.ts` (with their tests) from `apps/web/features/lesson/` into `packages/types/src/domain/` (the home M08 uses for `parent-redirect.ts`), and re-point `apps/web` at them in the same change. `step-reports.ts` currently defaults `send` to web's `reportStep` and imports web's `ApiResult` — make `send` a required argument typed against a minimal `{ ok: true } | { ok: false; error: { code: string; details?: unknown } }` result so the module has no client dependency. `pnpm --filter web test` stays green.
2. **The machine is the web's.** `lessonReducer` over `{ status: "playing"; step; isConfirmingExit } | { status: "finished" }` with events `STEP_COMPLETE`, `RESUME`, `EXIT`, `EXIT_CANCEL`, `EXIT_CONFIRM`. It reads the order from `nextLessonStep` and contains no step names beyond the initial `intro`. `RESUME` only applies before the child has moved, so a progress read that lands late cannot yank them backwards.
3. **Step prop contract.** `components/lesson/lesson-step-props.ts` mirrors web's `LessonStepProps`: `{ lesson, onComplete(), locale, pendingWrites }` (web's `isPreview` is admin preview — dropped, D1). A step never navigates, never reports its own step, and never knows what comes after it. Exit lives on the shell, not the step. This is what makes M15–M21 independent of each other.
4. **Player screen** (`app/(student)/lesson/[id].tsx`) — takes the handed-over detail from `lib/lesson-cache.ts` (falling back to `getLesson(id)` for a cold-start deep link, which may legitimately `423`), reads `GET /api/progress/lessons/:id` in parallel, and dispatches `RESUME` with the target before the first step renders (batched with the ready state, so the intro never mounts and narrates for one frame).
5. **Resume (FR-LSN-07).** The opening step is `resumeLessonStep(progress?.currentStep ?? null)`, never local storage. A child who closed the app during the quiz reopens on the quiz. A **finished** lesson (`currentStep: "reward"`) resumes at `intro` and replays from the start (FR-LSN-06) — its first report is the server's replay start. A failed progress read starts at `intro` rather than refusing the lesson.
6. **Step reporting — serialised, optimistic.** On each step change the machine advances **immediately** (a slow network must not stall a 4-year-old), and the finished step's report is queued on the run's `PendingWrites` chain through the lifted `createStepReporter(lessonId, resumeAt, send)`:
   - writes run one at a time — a report must never overtake the one before it, or the server's order check refuses it;
   - the reporter re-sends any earlier step the server has not confirmed before the current one;
   - a `409 STEP_OUT_OF_ORDER` is a **resync, not an error**: restart from `details.currentStep` once and report forward from there;
   - `reportStep` passes `isIdempotent: true` (the upsert never moves backwards), so M04's transport retries cover 5xx and dropped connections. Add no retry loop of your own.
   Never block the UI on a report, and never show the child a network error mid-lesson.
7. **Session events.** `lesson_start` once when the lesson is ready, `step_complete` per finished step (with `fallback` from `stepAssetFallback` — `apps/web/features/lesson/asset-fallback.ts`, pure, lifted with the rest — where the step has locale-resolved media — FR-I18N-01), and `step_complete` for `reward` plus `lesson_complete` when the run finishes, all to `POST /api/progress/events`. Fire-and-forget with `retries: 0`: a late retry would put a second milestone in the log for one crossing. A `429` is logged and dropped.
8. **Completion.** The reward step (M21) owns the call: as it mounts it awaits `pendingWrites.settled()` (every step report and the quiz-responses write), then `POST /api/progress/lessons/:id/complete` (`isIdempotent: true`). The shell's part is to hand the step `pendingWrites` and not to report `reward` itself. On `409 LESSON_NOT_PLAYED` or any failure, the reward step celebrates without numbers and logs; never grant locally and never loop. Cover the wait with a celebratory loading state, not a spinner.
9. **Exit guard — the native-only requirement.** Android hardware back and iOS edge-swipe both attempt to leave the route. Intercept both:
   - On `intro`, exiting is free (nothing has happened yet). (Web confirms on every step; skipping it on `intro` is a deliberate native simplification.)
   - On any later step, dispatch `EXIT` and show a `Sheet` in the *kid* register: two big buttons, an icon each, ≤4 words ("Keep playing" / "Stop"). Confirming exits to the world screen; the finished steps were reported as they finished, so nothing is lost.
   - Use `usePreventRemove` (or `beforeRemove` on the navigation event) so the guard covers gestures, not just the hardware button — a back-swipe that bypasses a `BackHandler` listener is the classic bug here.
10. **No parent door on the player.** The student layout's `ParentCorner` counterpart is hidden on this route, as on web; the shell's exit control takes that corner.
11. **Progress indicator.** Five dots mirroring web's `StepContainer.tsx`: every dot ringed, completed / current / upcoming distinguished by shape and fill as well as colour, one accessible progress element (`accessibilityRole="progressbar"` with "step n of 5") rather than five announced dots, ≥44px each, out of the primary interaction area. (`ProgressFruit` is the *quiz's* indicator — M19.)
12. **Step placeholders.** `StepPlaceholder` renders for steps whose real component lands in a later file (`video` → M15, `activity` → M16, `quiz` → M19, `reward` → M21), showing the step name and a "continue" button so the whole flow is walkable end to end **from this file onwards**.
13. **Tests** (the lifted modules keep their web tests in `packages/types`; `app/(student)/lesson/[id].test.tsx`): the resume target for each possible `currentStep` matches `resumeLessonStep`, and a finished lesson opens on `intro`; each step change advances the UI even when its report fails; reports are sent strictly in order and never overlap; a `409 STEP_OUT_OF_ORDER` with `currentStep` resyncs once and continues; session events fire with `retries: 0`; the completion call waits for pending writes; exiting on `intro` leaves immediately while exiting on `quiz` shows the confirm sheet; confirming exits and cancelling stays; no parent-door control renders on the player.

## Technical Approach & Suggestions

```
packages/types/src/domain/lesson-machine.ts        # lifted from apps/web (+ test)
packages/types/src/domain/step-reports.ts          # lifted, `send` injected (+ test)
packages/types/src/domain/pending-writes.ts        # lifted (+ test)
packages/types/src/domain/asset-fallback.ts        # lifted stepAssetFallback — pure, same rule as the three above
apps/mobile/lib/progress-api.ts                    # getLessonProgress / reportStep / completeLesson / sendSessionEvent
apps/mobile/app/(student)/lesson/[id].tsx
apps/mobile/app/(student)/lesson/[id].test.tsx
apps/mobile/components/lesson/StepShell.tsx        # full-bleed frame + progress indicator + exit control
apps/mobile/components/lesson/lesson-step-props.ts
apps/mobile/components/lesson/StepPlaceholder.tsx
apps/mobile/components/lesson/ExitConfirmSheet.tsx
apps/mobile/components/lesson/ProgressDots.tsx
```

Recording, as web's `useLessonRecording` does it — the machine advances, an effect compares previous and next state and queues the finished step's report:

```ts
const [pendingWrites] = useState(createPendingWrites);
const reportFinished = useRef<ReturnType<typeof createStepReporter>>();

// Once, when the run is ready: the reporter's "confirmed" cursor starts one before resumeAt.
reportFinished.current ??= createStepReporter(lessonId, resumeAt, reportStep);

// On every playing → playing step change:
const finished = before.step;
pendingWrites.add(() => reportFinished.current!(finished));   // serialised, never parallel
sendSessionEvent({ type: "step_complete", lessonId, step: finished, ...fallbackFor(finished) });
```

Do not add a retry loop or a persistent queue. The reporter already re-sends what the server has not confirmed, the transport retries a dropped connection, and the server's order check would refuse a stale queue replayed out of order.

The exit guard must cover gestures as well as the hardware button:

```tsx
import { usePreventRemove } from "@react-navigation/native";

const isMidLesson = state.status === "playing" && state.step !== LESSON_STEPS[0];
usePreventRemove(isMidLesson && !exitConfirmed, () => dispatch({ type: "EXIT" }));
```

`BackHandler` alone catches Android's button but not iOS's edge swipe or the router's own `back()`. Using the navigation-level guard is what makes all three paths land on the same sheet.

Keep `StepShell` responsible for the frame (safe area, world-coloured background, progress dots, exit control) and nothing else, so each step component owns its whole canvas.

## Step-by-Step Plan

1. Lift `lesson-machine.ts`, `step-reports.ts`, `pending-writes.ts` and their tests into `packages/types/src/domain/`, inject `send`, re-point `apps/web`; run `pnpm --filter @kidlearn/types test` and `pnpm --filter web test`. (~40 min)
2. Write `lib/progress-api.ts` (four calls, `isIdempotent` on the step report and completion, `retries: 0` on events) and smoke-test each against the dev server with a seeded lesson, including a deliberate out-of-order report to see the `409` body. (~25 min)
3. Build `StepShell` + `ProgressDots` (ringed dots, one progress element, ≥44px, out of the interaction zone). (~30 min)
4. Build `lesson-step-props.ts` and `StepPlaceholder`; wire the player screen to render the placeholder for every step so the flow is walkable end to end. (~30 min)
5. Add resume: parallel progress read, `RESUME` batched with the ready state, finished → `intro`. Test it. (~25 min)
6. Add recording: the pending-writes chain, the step reporter, session events; test ordering, the failure path and the `STEP_OUT_OF_ORDER` resync. (~35 min)
7. Add the exit guard with `usePreventRemove` + `ExitConfirmSheet`, and hide the parent door on this route; verify on a **physical Android device** (hardware back) and an iOS device or simulator (edge swipe) that both land on the sheet, and that exiting on `intro` is free. (~35 min)
8. Device pass: walk the whole placeholder flow, kill the app mid-flow, reopen and confirm resume; replay a finished lesson from `intro`. (~20 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `lesson-machine.ts`, `step-reports.ts` and `pending-writes.ts` live in `packages/types` and both clients import them; no copy exists in `apps/mobile`, and the web suite passes.
- [ ] The step order comes from `LESSON_STEPS`; no step ordering is hardcoded in `apps/mobile`.
- [ ] A child who closes the app mid-lesson reopens on the step the **server** says is next — verified on a device by force-stopping the app during the activity step. A finished lesson replays from `intro`.
- [ ] Step reports are sent one at a time, in order, and the UI advances immediately even if a report fails; no network error is ever shown to the child mid-lesson.
- [ ] A `409 STEP_OUT_OF_ORDER` resyncs from `details.currentStep` once and does not surface as an error.
- [ ] `lesson_start`, `step_complete` and `lesson_complete` are posted to `POST /api/progress/events` fire-and-forget with no retries, carrying the step and the locale-fallback flag.
- [ ] The reward step receives `pendingWrites`, and completion fires only after it settles.
- [ ] A `403 CONSENT_REQUIRED` mid-lesson reroutes to consent through the global handler.
- [ ] Android hardware back **and** iOS edge swipe both hit the exit confirm sheet mid-lesson; exiting from `intro` is immediate.
- [ ] The exit sheet is kid-register: two large buttons, an icon each, ≤4 words, ≥64px.
- [ ] No parent-door control is shown on the player.
- [ ] The progress indicator distinguishes states by shape as well as colour and sits outside the primary interaction area.
- [ ] The whole five-step flow is walkable with placeholders, in both orientations, on a physical device.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and CI `gates` is green (D8).

## Out of Scope

- Any real step content: intro/video — M15, activity — M16–M18, quiz — M19–M20, reward and the completion call — M21. Placeholders here are deliberate scaffolding.
- Audio and narration — M14.
- Learning-time heartbeats — M24 (session events are discrete markers, not a presence ping; the server also records its own beat on each step write).
- The screen-time lock — M12 already branches on 423 before the player mounts; M25 makes it pretty.
- Any local persistence of progress. The server is the authority; a local copy would be a second source of truth and the first thing to drift.
