# M13 — Lesson Player Shell & Step Engine

> **Estimated effort:** 3–4 hours
> **Depends on:** M12
> **Requirement IDs:** FR-LSN-01..07
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the container every lesson runs inside: the five-step flow (`intro → video → activity → quiz → reward`) as a state machine driven by `packages/types`' own step order, resume from where the child left off, a step report to the server after each step, a progress indicator a pre-reader can read, and — the native-only part — an exit guard so the Android back button and the iOS edge swipe cannot silently drop a child out mid-quiz.

## Context & Current State

- `packages/types/src/progress.ts` owns the flow and says so explicitly: "`LESSON_STEPS` is ordered, and the order **is** the contract: the player walks it forwards and never skips, `resumeTarget` reads a successor from it, and the server's monotonic guard compares indices in it." The array is `["intro", "video", "activity", "quiz", "reward"]`, with `nextLessonStep(step)` and a resume helper already exported. **Do not hardcode the step list or the order anywhere in `apps/mobile`.**
- **Two event surfaces, and they are not interchangeable** — the web app's `use-heartbeat.ts` spells the distinction out:
  - `POST /api/progress/events` (`SessionEventReportSchema`, types `LESSON_SESSION_EVENT_TYPES` = `["lesson_start", "step_complete", "lesson_complete"]`) carries a lesson's `step` **and** the locale-`fallback` flag — "`true` when the step the child just finished played an English asset because their locale had none". This is the lesson player's own event stream, and it is what this file posts.
  - `POST /api/events/activity` (`ACTIVITY_EVENT_TYPES`, which also includes `story_start`/`story_complete`) records discrete milestones that feed learning time. M24 owns that call; do not send step events there — it has no `step` field.
  Both are ungated by design, so time keeps recording while a child finishes.
- Server endpoints, all behind `requireParent` + `requireActiveChild`:
  - `GET /api/progress/lessons/:id` → `LessonProgressResponse` (the last completed step, score, completion).
  - `POST /api/progress/lessons/:id/step` → body per `LessonStepReportSchema`; **never screen-time gated**, because "a lesson already under way must always be finishable (FR-TIME-03), and a child cut off between the quiz and the reward screen loses the work they just did".
  - `POST /api/progress/lessons/:id/complete` → `LessonCompletionResponse` (rewards, new badges, streak).
  - `GET /api/content/lessons/:id` → `LessonDetailResponse`, screen-time gated — already called by M12, which hands the payload over.
- The server holds a **monotonic guard**: reporting an earlier step than the one already recorded cannot move progress backwards. The client therefore does not need to protect the server, but it must not assume its own optimistic state is authoritative — re-read progress on resume.
- M12 gives `lib/lesson-cache.ts` (the one-entry handoff) and the 423/404 branching before the player ever mounts.
- M05 gives `Sheet` (for the exit confirm) and `Screen`. M04 gives `useApi`. M11 gives `localizedLabel`.
- `apps/web/components/lesson/` is the reference implementation: `steps/` holds `IntroStep`, `VideoStep`, `ActivityStep`, `QuizStep`, `RewardStep` and `lesson-step-props.ts` — a shared prop contract. Mirror that contract so a step component is swappable.
- design.md §6/§7: full-bleed, no nav chrome, ≥64px targets, ≥20px text, both orientations.

## Detailed Requirements

1. **`lib/lesson-machine.ts`** — a pure reducer over `LESSON_STEPS`: state `{ step, completedSteps, status }`, actions `start(progress)`, `completeStep(step)`, `finish()`. It imports the step order and `nextLessonStep` from `packages/types` and contains **no** step names of its own. Pure and synchronous, so it is fully unit-testable without a renderer.
2. **Step prop contract.** `components/lesson/lesson-step-props.ts` mirroring the web app's: every step receives `{ lesson, step, onComplete(payload?), onExit }` and returns UI only. A step never navigates, never posts, and never knows what comes after it — that is the shell's job. This is what makes M15–M21 independent of each other.
3. **Player screen** (`app/(student)/lesson/[id].tsx`) — mounts, takes the handed-over detail from `lib/lesson-cache.ts` (falling back to `getLesson(id)` if the app was cold-started into this route via a deep link), reads `GET /api/progress/lessons/:id`, computes the resume target with the `packages/types` helper, and renders the step for that target inside a `<StepShell>`.
4. **Resume (FR-LSN-07).** The opening step is derived from the server's last-completed step, never from local storage. A child who closed the app during the quiz reopens on the quiz. If progress says the lesson is already complete, open on `reward` in a "you already did this — play again?" form rather than re-awarding (the server will not double-award; the UI must not imply it will).
5. **Step reporting.** On each `onComplete`, `POST /api/progress/lessons/:id/step` fires and the machine advances **optimistically** — a slow network must not stall a 4-year-old between steps. A failed report is retried once in the background; if it still fails, the step still advances locally and the next successful report (or the completion call) reconciles, because the server's guard is monotonic and the authority. Never block the UI on the report, and never show the child a network error mid-lesson.
6. **Session events.** `lesson_start` on mount, `step_complete` per step, `lesson_complete` at the end, posted to `POST /api/progress/events` with the step and — where a step played an English asset because the child's locale had none — the locale-fallback flag (`LessonAssetFallbacks`, FR-I18N-01; only the step knows which asset it actually used, which is why the client reports it). Fire-and-forget with **no retries**: by the time a retry landed the child would be elsewhere, and a duplicate would put a second milestone in the log for one crossing.
7. **Completion.** After the quiz step, `POST /api/progress/lessons/:id/complete` runs **before** the reward step renders, because its response *is* the reward step's data (stars, coins, new badges, streak — `LessonCompletionResponse`). The reward step is therefore the only step that waits on a request; cover the wait with a celebratory loading state, not a spinner.
8. **Exit guard — the native-only requirement.** Android hardware back and iOS edge-swipe both attempt to leave the route. Intercept both:
   - On `intro`, exiting is free (nothing has happened yet).
   - On any later step, show a `Sheet` in the *kid* register: two big buttons, an icon each, ≤4 words ("Keep playing" / "Stop"). Confirming exits to the world screen; the child's progress is already recorded server-side, so nothing is lost.
   - Use `usePreventRemove` (or `beforeRemove` on the navigation event) so the guard covers gestures, not just the hardware button — a back-swipe that bypasses a `BackHandler` listener is the classic bug here.
9. **Progress indicator.** Five dots or fruit (the web app uses a fruit motif — check `apps/web/components/quiz/ProgressFruit.tsx` and stay consistent), showing completed / current / upcoming with shape as well as colour, ≥44px each, placed out of the primary interaction area.
10. **Step placeholders.** `StepPlaceholder` renders for steps whose real component lands in a later file (`video` → M15, `activity` → M16, `quiz` → M19, `reward` → M21), showing the step name and a "continue" button so the whole flow is walkable end to end **from this file onwards**. This is what lets M14–M21 be built and tested independently without a broken app in between.
11. **Tests** (`lib/lesson-machine.test.ts`, `app/(student)/lesson/[id].test.tsx`): the reducer advances through `LESSON_STEPS` in order and refuses to skip; the resume target for each possible last-completed step matches the `packages/types` helper; a completed lesson opens on `reward` in replay mode; each `onComplete` posts a step report and advances even when the report fails; the completion call fires exactly once, before the reward step renders; exiting on `intro` leaves immediately while exiting on `quiz` shows the confirm sheet; confirming exits and cancelling stays.

## Technical Approach & Suggestions

```
apps/mobile/lib/lesson-machine.ts                  # pure reducer over LESSON_STEPS
apps/mobile/lib/lesson-machine.test.ts
apps/mobile/lib/progress-api.ts                    # getLessonProgress / reportStep / completeLesson / reportSessionEvent
apps/mobile/app/(student)/lesson/[id].tsx
apps/mobile/app/(student)/lesson/[id].test.tsx
apps/mobile/components/lesson/StepShell.tsx        # full-bleed frame + progress indicator + exit control
apps/mobile/components/lesson/lesson-step-props.ts
apps/mobile/components/lesson/StepPlaceholder.tsx
apps/mobile/components/lesson/ExitConfirmSheet.tsx
apps/mobile/components/lesson/ProgressDots.tsx
```

The reducer takes its vocabulary entirely from the shared package:

```ts
import { LESSON_STEPS, type LessonStep, nextLessonStep } from "@kidlearn/types";

export type LessonMachineState = {
  step: LessonStep;
  completed: LessonStep[];
  status: "playing" | "completing" | "finished";
};

export function lessonMachine(state: LessonMachineState, action: LessonAction): LessonMachineState {
  switch (action.type) {
    case "completeStep": {
      // The order in LESSON_STEPS is the contract — never a local list.
      const next = nextLessonStep(action.step);
      const completed = state.completed.includes(action.step) ? state.completed : [...state.completed, action.step];
      if (next === null) return { ...state, completed, status: "finished" };
      // The reward step needs the completion response, so pause before it.
      if (next === "reward") return { step: next, completed, status: "completing" };
      return { step: next, completed, status: "playing" };
    }
    // …start, finish
  }
}
```

The exit guard must cover gestures as well as the hardware button:

```tsx
import { usePreventRemove } from "@react-navigation/native";

const isMidLesson = state.step !== LESSON_STEPS[0];
usePreventRemove(isMidLesson && !exitConfirmed, () => setShowExitSheet(true));
```

`BackHandler` alone catches Android's button but not iOS's edge swipe or the router's own `back()`. Using the navigation-level guard is what makes all three paths land on the same sheet.

Optimistic advance with background reconciliation:

```ts
const handleStepComplete = useCallback((step: LessonStep, payload?: unknown) => {
  dispatch({ type: "completeStep", step });          // advance now — a child does not wait
  void reportStep(lessonId, { step, payload }).then((result) => {
    if (!result.ok) void reportStep(lessonId, { step, payload });  // one quiet retry
  });
  void reportSessionEvent({ type: "step_complete", lessonId });
}, [lessonId]);
```

Do not add a third retry or a queue. The server's monotonic guard means the *next* successful write carries the truth, and a queue of stale reports would report a child's timeline out of order — the same reasoning the web app's heartbeat uses for having no retries at all.

Keep `StepShell` responsible for the frame (safe area, world-coloured background, progress dots, exit control) and nothing else, so each step component owns its whole canvas.

## Step-by-Step Plan

1. Write `lib/lesson-machine.ts` tests first — order, no skipping, resume target for all five last-completed values, the pause before `reward` — then implement the reducer. (~45 min)
2. Write `lib/progress-api.ts` (four calls) and smoke-test each against the dev server with a seeded lesson. (~25 min)
3. Build `StepShell` + `ProgressDots` (shape and colour, ≥44px, out of the interaction zone). (~30 min)
4. Build `lesson-step-props.ts` and `StepPlaceholder`; wire the player screen to render the placeholder for every step so the flow is walkable end to end. (~30 min)
5. Add resume: read progress on mount, derive the target with the shared helper, and handle the already-complete replay case. Test it. (~30 min)
6. Add step reporting (optimistic advance, one quiet retry) and session events; test that the UI advances even when the report fails. (~30 min)
7. Add the completion call before the reward step, with its celebratory waiting state; test it fires once. (~25 min)
8. Add the exit guard with `usePreventRemove` + `ExitConfirmSheet`; verify on a **physical Android device** (hardware back) and an iOS device or simulator (edge swipe) that both land on the sheet, and that exiting on `intro` is free. (~35 min)
9. Device pass: walk the whole placeholder flow, kill the app mid-flow, reopen and confirm resume. (~20 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The step order comes from `LESSON_STEPS` in `packages/types`; no step name or ordering is hardcoded in `apps/mobile`.
- [ ] A child who closes the app mid-lesson reopens on the step the **server** says is next — verified on a device by force-stopping the app during the activity step.
- [ ] Each completed step posts to `POST /api/progress/lessons/:id/step` and the UI advances immediately, even if the report fails; no network error is ever shown to the child mid-lesson.
- [ ] `POST /api/progress/lessons/:id/complete` fires exactly once per lesson run, before the reward step renders, and its response is what the reward step consumes.
- [ ] `lesson_start`, `step_complete` and `lesson_complete` are posted to `POST /api/progress/events` fire-and-forget with no retries, carrying the step and the locale-fallback flag.
- [ ] Android hardware back **and** iOS edge swipe both hit the exit confirm sheet mid-lesson; exiting from `intro` is immediate.
- [ ] The exit sheet is kid-register: two large buttons, an icon each, ≤4 words, ≥64px.
- [ ] A lesson already completed opens in replay mode without implying a second reward.
- [ ] The progress indicator distinguishes states by shape as well as colour and sits outside the primary interaction area.
- [ ] The whole five-step flow is walkable with placeholders, in both orientations, on a physical device.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Any real step content: intro/video — M15, activity — M16–M18, quiz — M19–M20, reward — M21. Placeholders here are deliberate scaffolding.
- Audio and narration — M14.
- Learning-time heartbeats — M24 (this file posts *session events*, which are a different thing: discrete markers, not a presence ping).
- The screen-time lock — M12 already branches on 423 before the player mounts; M25 makes it pretty.
- Any local persistence of progress. The server is the authority; a local copy would be a second source of truth and the first thing to drift.
