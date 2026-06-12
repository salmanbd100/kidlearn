# 17 — Lesson Intro & Video Steps

> **Estimated effort:** 3–4 hours
> **Depends on:** 16
> **Requirement IDs:** FR-LSN-01, FR-LSN-02, NFR-PERF-02, NFR-A11Y-01
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Replace the first two placeholder steps from file 16 with real implementations. `IntroStep`: the world mascot greets the child, the localized intro script auto-plays as narration audio (text shown large as reinforcement, never the primary channel), with a replay button and a big "Let's go!" to advance (FR-LSN-01). `VideoStep`: a kid-safe player for the 1–3 minute lesson video with only big play/pause and replay controls — no seek bar, no volume UI, no escape into native browser chrome — poster + skeleton while loading, missing-locale fallback to English, and next-step asset preloading while the video plays (FR-LSN-02, NFR-PERF-02). Both steps fire `onComplete` into the step engine.

## Context & Current State

- File 16 is done: `/lesson/[id]` works end-to-end with placeholder steps; the prop contract is fixed — each step receives `{ lesson, onComplete }`; `StepContainer` provides dots/mascot/exit chrome; step completion persists server-side.
- Lesson payload (file 12) provides per-locale-resolved fields: `introScript` (string), `introAudioUrl`, `videoUrl`, `videoPosterUrl`, `mascotUrl`, plus `assetFallbacks: { introAudioUrl?: "en", videoUrl?: "en" }` flags when the server fell back to English because the child's locale asset is missing (if file 12 didn't ship this flag, add it there now — the server resolves locale, so fallback is server-side; the client only needs to know for analytics/QA, not behavior).
- `useAudio()` (file 13) is the single narration channel; `useScreenNarration` exists but **is not used inside lesson steps** — the intro script *is* the narration.
- No videos exist yet in seeded content beyond test fixtures; real media arrives via admin upload (33) / AI pipeline (36). Use a small public-domain mp4 in `public/dev/` for local dev seeding.

## Detailed Requirements

1. **IntroStep auto-narration** (FR-LSN-01, NFR-A11Y-01): on mount, play `lesson.introAudioUrl` via `useAudio` (interrupting anything else). The mascot image (`lesson.mascotUrl`) is the visual anchor, with a gentle idle bob (Motion, respecting reduced-motion → static).
2. **Script as reinforcement**: `lesson.introScript` renders below the mascot at `text-h3`+ (≥24px), display font on kid surface — but a pre-reader never needs it (Pillar A).
3. **Intro controls**: exactly two — a replay-audio button (speaker icon, ≥64px) that restarts the narration, and a `BigButton` "Let's go!" (localized) that calls `onComplete()`. The advance button is always enabled (never trap a child waiting for audio), but pulses gently after narration ends as the "what's next" cue.
4. **VideoStep player** (FR-LSN-02): plays `lesson.videoUrl` (1–3 min, per-locale already resolved). Custom controls only: one big center play/pause toggle (≥80px) and a replay button; `controls` attribute off, `playsInline` + `disablePictureInPicture` + `controlsList="nodownload nofullscreen noremoteplayback"` so the child cannot reach browser chrome (NFR-SAFE-07 spirit). No seek bar, no volume slider. A thin non-interactive progress bar at the bottom is allowed for "how much is left".
5. **Loading states** (NFR-PERF-02): render `videoPosterUrl` immediately with a skeleton shimmer + spinner until `canplay`; buffering mid-play shows a small mascot spinner overlay. Errors (network/decode) show a friendly retry button — never a raw error.
6. **Autoplay handling**: attempt `video.play()` on mount; if the promise rejects (autoplay policy — possible because narration audio already unlocked the gesture chain, but not guaranteed), fall back to showing the big play button on the poster. Never silent-fail.
7. **Completion**: the `ended` event reveals/enables a pulsing "Done — next!" `BigButton` that fires `onComplete()` (explicit tap, not auto-advance, so a distracted child isn't yanked forward); replay remains available before advancing (re-watching is fine, FR-STORY-06 spirit).
8. **Preload next step** (NFR-PERF-02): while the video plays, prefetch the activity step's assets: fire `GET /api/content/activities/:activityId` (file 12/18 endpoint) into a small in-memory cache and warm image assets via `new Image().src`. Expose as `usePreloadNextStep(lesson)` so files 18+ read the cache instead of refetching.
9. **Locale fallback** (FR-I18N-01): when `assetFallbacks` marks a field, behavior is unchanged (English asset plays); log a `console.warn` in dev and include the flag in the `step_complete` event payload (`{ fallback: true }`) for content-gap reporting.
10. **Tests**: component tests for intro (auto-play called, replay restarts, advance fires `onComplete`) and video (play/pause toggle, ended → done button → `onComplete`, error → retry, no native `controls` attribute).

## Technical Approach & Suggestions

**Files to create/modify:**

```
apps/web/components/lesson/steps/
├── intro-step.tsx                   # replace placeholder
├── intro-step.test.tsx
├── video-step.tsx                   # replace placeholder
├── video-step.test.tsx
└── video-controls.tsx               # play/pause/replay overlay (separately testable)
apps/web/lib/
├── use-preload-next-step.ts         # prefetch + module-level Map cache
└── use-preload-next-step.test.ts
apps/web/locales/{en,bn}/lesson.json # add: letsGo, replay, done, videoError, tryAgain
```

**IntroStep sketch:**

```tsx
export function IntroStep({ lesson, onComplete }: LessonStepProps) {
  const { play, isPlaying } = useAudio();
  const [narrationDone, setNarrationDone] = useState(false);
  useEffect(() => {
    play(lesson.introAudioUrl, { interrupt: true }).then(() => setNarrationDone(true));
  }, [lesson.introAudioUrl]);
  return (
    <div className="flex min-h-full flex-col items-center justify-between gap-6 p-6 text-center">
      <MascotBob src={lesson.mascotUrl} />                {/* Motion y-bob; static if reduced motion */}
      <p className="font-display text-h3 text-foreground">{lesson.introScript}</p>
      <div className="flex w-full items-center gap-4">
        <ReplayAudioButton onPress={() => play(lesson.introAudioUrl, { interrupt: true })} />
        <BigButton variant="primary" size="lg" pulse={narrationDone} onPress={onComplete}>
          {t("lesson.letsGo")}
        </BigButton>
      </div>
    </div>
  );
}
```

(If `useAudio().play` doesn't currently resolve on clip end, extend the file-13 provider with an `ended`-resolved promise — additive change, keep its existing tests green.)

**VideoStep state:** small discriminated union, not booleans:

```ts
type VideoState = "loading" | "ready" | "playing" | "paused" | "buffering" | "ended" | "error";
```

Drive it from media events (`canplay`→ready, `waiting`→buffering, `playing`, `pause`, `ended`, `error`). `VideoControls` receives `{ state, onPlayPause, onReplay }` and is tested in isolation. Pause lesson narration channel while video plays (`useAudio().stop()` on play) — one sound source at a time.

**jsdom note:** jsdom doesn't implement media playback. In tests, mock `HTMLMediaElement.prototype.play/pause` (`vi.spyOn`, play → resolved promise) and drive state by dispatching `canplay` / `ended` / `error` events on the element via `fireEvent`. This is the established pattern; don't pull in extra libraries.

**Preload cache:**

```ts
// lib/use-preload-next-step.ts
const cache = new Map<string, unknown>();
export function usePreloadNextStep(lesson: Lesson): void; // call in VideoStep on "playing"
export function getPreloaded<T>(key: string): T | undefined; // key: `activity:${id}` — consumed by file 18
```

## Step-by-Step Plan

1. Add the new locale keys (EN/BN) to `lesson.json`; verify `assetFallbacks` exists in the file-12 lesson payload, add it there if missing (server-side, small). (~20 min)
2. Write failing IntroStep tests: auto-plays `introAudioUrl` on mount via mocked `useAudio`, replay button replays, "Let's go!" calls `onComplete`, script text rendered. (~25 min)
3. Implement `IntroStep` + `MascotBob` (Motion `useReducedMotion` guard); extend AudioProvider with end-of-clip resolution if needed (keep file-13 tests green). (~30 min)
4. Write failing `VideoControls` tests: play/pause toggle per state, replay shown when ended, no element with native `controls`. Implement `VideoControls`. (~25 min)
5. Write failing `VideoStep` tests: poster+skeleton until `canplay`; `ended` reveals done button which fires `onComplete`; `error` shows retry which reloads `src`; autoplay rejection falls back to paused-with-big-play. (~30 min)
6. Implement `VideoStep` with the `VideoState` union and media-event wiring. (~35 min)
7. Implement `usePreloadNextStep` + `getPreloaded` with tests (fetch fired once on playing, cache hit returned); call it from `VideoStep`. (~25 min)
8. Wire `step_complete` fallback flag passthrough; manual run with a seeded lesson + dev mp4 at 360px portrait and tablet landscape: full intro→video flow, mid-video exit/resume from file 16 still works. (~20 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter web test`; update tracker. (~10 min)

## Acceptance Criteria

- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] `pnpm --filter web test` passes: intro-step, video-controls, video-step, use-preload-next-step suites; all file-13/16 suites still green
- [ ] Manual: opening a lesson speaks the intro automatically with no tap (NFR-A11Y-01 / FR-LSN-01); replay restarts it; "Let's go!" advances and the engine records the step
- [ ] Video plays with only big play/pause + replay; no native controls, no fullscreen/PiP path, no seek scrubbing (FR-LSN-02)
- [ ] Poster + skeleton visible before `canplay`; simulated network error shows the friendly retry, and retry recovers
- [ ] Video `ended` reveals the done button; tapping it advances to the activity step; the activity payload is already in the preload cache (inspect network: fetched during playback, not after advance) (NFR-PERF-02)
- [ ] With a `bn` child and a missing `bn` video, the English asset plays and the `step_complete` event carries `fallback: true`
- [ ] Both steps usable in portrait and landscape; all controls ≥64px; mascot bob disabled under reduced motion

## Out of Scope

- ActivityStep and the JSON-driven activity engine (file 18) — this file only warms its cache
- QuizStep (21–22) and RewardStep with real reward grants (23)
- Video transcoding/CDN setup and admin upload of real lesson videos (33, 38)
- Generated narration and per-locale video production (36)
- Captions/subtitles (post-MVP; not in master spec)
