# 16 — Lesson Player Shell & Step Engine

> **Estimated effort:** 3–4 hours
> **Depends on:** 12, 15
> **Requirement IDs:** FR-LSN-01..07 (shell), especially FR-LSN-06 (resume) and FR-LSN-07 (recording), Pillar B
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the lesson player shell at `/lesson/[id]`: a typed five-step state machine (intro → video → activity → quiz → reward) implemented as a plain `useReducer`, full-screen step container UI with progress dots, mascot, and a kid-friendly exit confirm, server-persisted per-step progress with resume-from-last-incomplete-step (FR-LSN-06), and the SessionEvent groundwork (`lesson_start` / `step_complete` / `lesson_complete`) for time tracking (FR-LSN-07, feeds file 27). The five step components ship as functional placeholders receiving `lesson` + `onComplete`; their real implementations land in files 17–23.

## Context & Current State

- File 15: student home routes to `/lesson/[id]` from lesson tiles; `ActiveChildProvider`, `useAudio`, `useScreenNarration`, kid primitives, `apiFetch` all exist.
- File 12: `GET /api/content/lessons/:id` returns the full published lesson for the active child's grade+locale: `{ id, title, worldId, mascotUrl, introScript, introAudioUrl, videoUrl, videoPosterUrl, activityId, quizId, … }` (per-locale fields already resolved server-side).
- The server has **no progress endpoints yet** — this file defines the contract and adds them in `apps/server` (LessonProgress model exists from file 06).
- Vitest is configured in both `apps/web` (RTL/jsdom) and `apps/server` (Supertest).

## Detailed Requirements

1. **Route** `/lesson/[id]` inside `(student)`: requires an active child (redirect to `/select-profile` otherwise); fetches lesson + progress in parallel, shows mascot skeleton meanwhile.
2. **Five-step machine** (FR-LSN-01..05, Pillar B): ordered steps `intro → video → activity → quiz → reward`, always the same, no skipping ahead. Modeled as a typed reducer — **no XState or other state-machine library**.
3. **Events**: `STEP_COMPLETE` (advance; from `reward` it transitions to `finished`), `RESUME` (initialize at a given step from server progress), `EXIT` (request exit → confirm dialog → leave or stay). Invalid events for a state are ignored (reducer returns state unchanged).
4. **Server persistence** (FR-LSN-06): after each `STEP_COMPLETE`, `POST /api/progress/lessons/:id/step` upserts `LessonProgress.currentStep` for the active child. Contract (binding for server + client):
   - Request: `{ step: "intro" | "video" | "activity" | "quiz" | "reward", completed: boolean }` — `completed: true` only with `step: "reward"` (sets `completedAt`).
   - Response: `{ ok: true, data: { lessonId, currentStep, completedAt } }`; 404 if lesson not visible to the child; 401 without an active child session.
   - Server validates with a Zod schema (`lessonStepReportSchema`) added to `packages/types`.
5. **Resume** (FR-LSN-06): `GET /api/progress/lessons/:id` returns `{ currentStep, completedAt } | null`. On open, a lesson with saved progress dispatches `RESUME` to the **first incomplete step** (`currentStep` stores the last *completed* step; resume target = its successor). A lesson with `completedAt` set restarts from `intro` (replay) without erasing the completion record.
6. **Recording groundwork** (FR-LSN-07, FR-TIME-06): the client POSTs `SessionEvent`s to `POST /api/progress/events` — `{ type: "lesson_start" | "step_complete" | "lesson_complete", lessonId, step?, clientTs }`. The server stamps its own time and stores rows (model from file 06). Time aggregation itself is file 27; here we only emit + store. Fire-and-forget (failures logged, never block the child).
7. **Step container UI** (Pillar A): full-bleed `min-h-dvh` screen; 5 progress dots at top (filled = done, pulsing = current); world mascot in a corner; an exit (X) button that opens a kid-friendly confirm ("Leave the lesson?" with big Stay / Leave buttons, spoken aloud); Leave navigates back to `/world/[worldId]`, progress already saved per step.
8. **Placeholder steps**: `IntroStep`, `VideoStep`, `ActivityStep`, `QuizStep`, `RewardStep`, each `({ lesson, onComplete }) => JSX` rendering the step name + a `BigButton` that calls `onComplete()`. Files 17–23 replace internals; the prop contract is fixed here.
9. **Tests**: reducer unit tests covering the full happy path, resume at every step, ignored invalid events, and exit-confirm flow; server Supertest specs for both progress endpoints.

## Technical Approach & Suggestions

**Files to create/modify:**

```
apps/web/app/(student)/lesson/[id]/page.tsx
apps/web/components/lesson/
├── lesson-player.tsx                # data fetch + reducer + step switch
├── step-container.tsx               # dots, mascot, exit button, full-bleed frame
├── exit-confirm.tsx
├── lesson-machine.ts                # types + reducer + selectors (pure, no React)
└── steps/
    ├── intro-step.tsx               # placeholder
    ├── video-step.tsx               # placeholder
    ├── activity-step.tsx            # placeholder
    ├── quiz-step.tsx                # placeholder
    └── reward-step.tsx              # placeholder
apps/web/lib/progress-api.ts         # getLessonProgress / reportStep / sendSessionEvent
apps/server/src/routes/progress.ts   # the two endpoints + events endpoint
apps/server/src/routes/progress.test.ts
packages/types/src/progress.ts       # LessonStep, lessonStepReportSchema, sessionEventSchema
apps/web/locales/{en,bn}/lesson.json
```

**The machine (binding contract):**

```ts
// components/lesson/lesson-machine.ts
export const LESSON_STEPS = ["intro", "video", "activity", "quiz", "reward"] as const;
export type LessonStep = (typeof LESSON_STEPS)[number];

export type LessonPlayerState =
  | { status: "playing"; step: LessonStep; confirmingExit: boolean }
  | { status: "finished" };

export type LessonPlayerEvent =
  | { type: "STEP_COMPLETE" }
  | { type: "RESUME"; step: LessonStep }
  | { type: "EXIT" }            // playing → confirmingExit: true
  | { type: "EXIT_CANCEL" }     // confirmingExit: false
  | { type: "EXIT_CONFIRM" };   // handled by caller (navigation); reducer no-op marker

export const initialLessonState: LessonPlayerState = {
  status: "playing", step: "intro", confirmingExit: false,
};
export function lessonReducer(s: LessonPlayerState, e: LessonPlayerEvent): LessonPlayerState;
export function nextStep(step: LessonStep): LessonStep | null;          // "reward" → null
export function resumeTarget(lastCompleted: LessonStep | null): LessonStep; // null → "intro"
```

`STEP_COMPLETE` on `reward` yields `{ status: "finished" }`. `RESUME` only applies while on `intro` with no progress made (i.e. as initialization). Any event not valid in the current state returns the state unchanged — assert this in tests rather than throwing (a child's mashed taps must never crash).

**Side effects live in `LessonPlayer`, not the reducer:** a `useEffect` on `state.step` transitions calls `reportStep` for the step just completed and `sendSessionEvent({ type: "step_complete", step })`; on mount after data load: `sendSessionEvent({ type: "lesson_start" })` and dispatch `RESUME` with `resumeTarget(progress?.currentStep ?? null)`; on `finished`: `reportStep({ step: "reward", completed: true })` + `lesson_complete` event, then render a "Back to world" `BigButton`.

**Server (`apps/server/src/routes/progress.ts`):** router mounted at `/api/progress`, behind the active-child session middleware from file 11. Upsert via Prisma `lessonProgress.upsert` on `(childId, lessonId)`; monotonic guard — never move `currentStep` backwards (replay POSTs of earlier steps are acknowledged but don't regress; index into `LESSON_STEPS` to compare). Events insert into `SessionEvent` with server `receivedAt`.

**Step switch:**

```tsx
const StepComponent = {
  intro: IntroStep, video: VideoStep, activity: ActivityStep,
  quiz: QuizStep, reward: RewardStep,
}[state.step];
<StepContainer step={state.step} mascotUrl={lesson.mascotUrl} onExit={() => dispatch({ type: "EXIT" })}>
  <StepComponent lesson={lesson} onComplete={() => dispatch({ type: "STEP_COMPLETE" })} />
</StepContainer>
```

## Step-by-Step Plan

1. Add `packages/types/src/progress.ts` (`LessonStep`, `lessonStepReportSchema`, `sessionEventSchema`) with schema unit tests (valid/invalid payloads). (~20 min)
2. Write failing reducer tests in `lesson-machine.test.ts`: full intro→finished walk, `nextStep`/`resumeTarget` tables, resume at each of the 5 steps, EXIT → confirm → cancel, invalid events ignored. (~30 min)
3. Implement `lesson-machine.ts` until green. (~20 min)
4. Server: write failing Supertest specs — step upsert creates then advances `currentStep`, no-regress on replay, `completed: true` sets `completedAt`, 401 without active child, 404 for unpublished lesson; events endpoint stores rows. (~30 min)
5. Implement `apps/server/src/routes/progress.ts` + mount; green. (~30 min)
6. Build `progress-api.ts` client wrappers and `StepContainer` (dots, mascot, exit button) + `ExitConfirm` with RTL tests (dots fill per step; exit opens confirm; Stay resumes). (~30 min)
7. Create the five placeholder step components (fixed prop contract `{ lesson, onComplete }`). (~15 min)
8. Assemble `LessonPlayer` + `/lesson/[id]/page.tsx`: parallel fetch, RESUME dispatch, effect-driven `reportStep`/events, finished screen. RTL test with mocked `apiFetch`: completing all five placeholders posts 5 step reports + start/complete events; reopening with mocked progress `{ currentStep: "video" }` renders ActivityStep first. (~40 min)
9. Manual run: walk a seeded lesson end-to-end on a 360px viewport, kill the tab mid-lesson, reopen, confirm resume; check both orientations. (~15 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter web test && pnpm --filter server test`; update tracker. (~10 min)

## Acceptance Criteria

- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] `pnpm --filter web test` passes: lesson-machine suite (happy path, resume×5, invalid-event immunity, exit confirm), step-container, lesson-player integration with mocked API
- [ ] `pnpm --filter server test` passes: step upsert/advance/no-regress/completedAt, auth + visibility guards, session events stored
- [ ] Manual: a lesson interrupted after the video step resumes at the activity step on reopen (FR-LSN-06)
- [ ] Completing a lesson sets `completedAt` and emits `lesson_start`, 5× `step_complete`, `lesson_complete` SessionEvents (verify rows in DB) (FR-LSN-07)
- [ ] Exit button always asks before leaving; Stay loses nothing; Leave returns to the world screen with progress retained
- [ ] Progress dots always show 5 steps with current-step indication; UI is full-bleed and works in portrait + landscape
- [ ] Replaying a completed lesson starts at intro without erasing `completedAt`

## Out of Scope

- Real step content: intro narration + video player (17), activity engine (18–20), quiz engine + scoring (21–22), reward computation + celebration (23)
- Quiz score recording (`QuizResponse`) — file 22; `LessonProgress.score` is written there
- Learning-time aggregation, heartbeats, and screen-time enforcement consuming these events (files 27–28)
- Asset preloading between steps (file 17, NFR-PERF-02)
- Streak/badge side effects of `lesson_complete` (files 23–24)
