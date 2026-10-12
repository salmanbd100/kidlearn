# M15 — Intro & Video Steps

> **Estimated effort:** 3–4 hours
> **Depends on:** M14
> **Requirement IDs:** FR-LSN-01, FR-LSN-02, NFR-PERF-02, NFR-A11Y-04
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Replace the first two step placeholders with real content: the intro greeting (the world's mascot, the lesson's localised intro script, narration, one big "Let's go!") and the narrated video step on `expo-video` — with kid-proof controls, an orientation policy, and the next step's assets preloading while the video plays.

## Context & Current State

- M13 gives the shell: the lifted `lessonReducer`, the `{ lesson, onComplete(), locale, pendingWrites }` step prop contract, `StepShell` with the progress indicator and exit guard, and `StepPlaceholder` for the steps still to come. The shell reports the step; a step only calls `onComplete()`.
- M14 gives `playNarration` (resolving `"ended" | "unplayed"`), `stopNarration`, `playSfx`, `useScreenNarration`, mute, and the audio-session policy — including that this file's video is what narration must yield to.
- `LessonDetailResponse` (`packages/types/src/api/content.ts`) carries `title`, `world` (with a nullable `mascot`), `locale`, `introScript | null` (locale-resolved), `introAudioUrl | null`, `videoUrl | null`, `videoPosterUrl | null` (the still painted while the video loads), `assetFallbacks` (`{ introAudioUrl, videoUrl, videoPosterUrl }` booleans — `true` when the server served English because the child's locale had none), and nullable `activity` and `quiz`. The URLs are **already locale-resolved by the server**; the client plays them as given. They are Cloudinary-served (NFR-PERF-02); the client streams, it does not download.
- `apps/web/features/lesson/steps/IntroStep.tsx`, `VideoStep.tsx` and `VideoControls.tsx` are the reference. Web's intro shows the mascot, `introScript` and "Let's go!", which starts pulsing once the narration ends (immediately when there is none); the speaker appears only when `introAudioUrl` exists. Web's video autoplays (landing on the poster with play showing if refused), shows a non-interactive progress bar, reveals "done" on `ended`, offers retry on error, and renders a "done" nudge straight away when `videoUrl` is `null`. It has **no skip-after-threshold** — that is a native addition below. `apps/web/features/lesson/use-preload-next-step.ts` is the preload precedent: once, when the video starts playing, it warms up to **8 image URLs** from `activity.definition` at low priority and skips audio/video URLs.
- `expo-av` is deprecated; `expo-video` is the current player. It supports fullscreen, picture-in-picture (which must be **off** here), and its own controls.
- design.md §6: both orientations, with a friendly rotate prompt where a screen genuinely needs landscape — "never a dead end". §7: ≥64px targets, ≥20px text. §10: kid copy 1–4 words plus icon plus voice-over.
- Reduced motion (M05's `useReducedMotion`) applies to the intro's mascot animation, not to the video itself — a video is content, not decoration.

## Detailed Requirements

1. **Intro step** (`components/lesson/steps/IntroStep.tsx`) — full-bleed world-coloured background, the world's mascot (omitted when `world.mascot` is `null`), `introScript` at display size when present, and a single `BigButton` ("Let's go!") that pulses once the narration has ended. `introAudioUrl` plays on mount via `playNarration`; a ≥64px speaker replays it, and is absent when there is no recording. `onComplete()` fires on the button. When `assetFallbacks.introAudioUrl` is `true`, log a dev-only warning as web does — the shell already reports the fallback on `step_complete`.
2. **Mascot entrance.** A short Reanimated spring on `transform`/`opacity` only, skipped entirely under reduced motion (a static mascot, not a shortened animation). No animation longer than the design.md §5.1 duration tokens.
3. **Video step** (`components/lesson/steps/VideoStep.tsx`) — `expo-video` with:
   - **`contentFit="contain"`** on the world background, so a portrait phone shows the whole frame rather than cropping a teaching visual.
   - **Custom controls, not the native ones**: play/pause and replay only, each ≥64px, in the thumb zone. No seek bar (a 4-year-old dragging a scrubber is a lost lesson), no fullscreen button, no picture-in-picture, no playback-speed control, no share.
   - **A visible "next" affordance that appears when the video ends**, plus an always-available skip after a threshold (see requirement 5).
   - Poster (`videoPosterUrl`) while the stream buffers, never a black rectangle.
   - `videoUrl === null` (a content hole, not a broken screen): render the "done" nudge straight away, as web does.
4. **Orientation policy — decide and implement, do not leave to chance.** The lesson video plays in **both** orientations with the same layout (contained, centred). No forced rotation and no rotate-prompt dead end: a child holding the phone in portrait must be able to watch. If a specific video's aspect ratio makes portrait genuinely unusable, that is a content problem to fix in the CMS, not a client lock.
5. **Skip and completion.** `onComplete()` fires when the child taps "next" after the video ends. A skip control appears after a modest threshold (e.g. 5 seconds) so a stuck stream or a re-watch cannot trap a child in the step — a native addition (web has retry only); the step is still reported as finished, because FR-LSN-03's requirement is that the child moves through the flow, and the server only asks that steps arrive in order. Do not silently auto-advance on a buffering failure — show the skip.
6. **Buffering, error and offline.** A stalled stream shows a kid-appropriate waiting state (mascot, ≤4 words) and, after a few seconds, the skip. A hard playback error shows `KidRetry` with the skip alongside — a broken video must never end a lesson.
7. **Audio coordination.** Narration stops before playback starts (M14's single-narration rule handles it, but the step must call `stopNarration()` explicitly rather than relying on timing). App mute does **not** mute the video; the video has its own mute control if the design calls for one. Backgrounding pauses playback and resumes paused, never auto-resumes.
8. **Preload the next step (NFR-PERF-02).** Once, when the video first reports playing, prefetch the activity's images exactly as `apps/web/features/lesson/use-preload-next-step.ts` selects them: walk `activity.definition` for `https://` strings, drop audio/video URLs (same regex), cap at 8. Use `expo-image`'s `Image.prefetch`. Web does not warm audio; do not add it here — the instruction clip is short and M14 streams it.
9. **Analytics-free.** No third-party video analytics SDK. This is a Kids Category app (plan §12) and a tracking SDK on a child's screen is a rejection.
10. **Tests** (`IntroStep.test.tsx`, `VideoStep.test.tsx`): the intro renders `introScript` and calls `onComplete()` on the button; with no `introAudioUrl` there is no speaker and the button pulses at once; narration plays once on mount and not on re-render; the mascot animation is skipped under reduced motion; the video step renders custom controls and **no** seek bar; reaching the end reveals "next" and tapping it fires `onComplete()`; a `null` `videoUrl` renders the nudge; the skip appears after the threshold; a playback error renders retry plus skip; backgrounding pauses; the preload fires once when playback starts and takes at most 8 image URLs.

## Technical Approach & Suggestions

```
apps/mobile/components/lesson/steps/IntroStep.tsx
apps/mobile/components/lesson/steps/IntroStep.test.tsx
apps/mobile/components/lesson/steps/VideoStep.tsx
apps/mobile/components/lesson/steps/VideoStep.test.tsx
apps/mobile/components/lesson/KidVideoControls.tsx
apps/mobile/lib/use-preload-next-step.ts          # port of the web hook
apps/mobile/lib/use-preload-next-step.test.ts
apps/mobile/components/student/Mascot.tsx
```

The player, with everything a child should not reach turned off:

```tsx
import { useVideoPlayer, VideoView } from "expo-video";

const player = useVideoPlayer(videoUrl, (p) => {
  p.loop = false;
  p.timeUpdateEventInterval = 1;   // enough to drive the "ended" state
  p.muted = false;
});

<VideoView
  player={player}
  style={{ flex: 1 }}
  contentFit="contain"
  nativeControls={false}           // custom kid controls only
  allowsFullscreen={false}
  allowsPictureInPicture={false}
  accessibilityLabel={t("lesson:videoLabel", { title })}
/>
```

Watch for the end through the player's status rather than a timer, and reveal the skip on a timer that starts with playback:

```tsx
useEffect(() => {
  const sub = player.addListener("playToEnd", () => setEnded(true));
  return () => sub.remove();
}, [player]);

useEffect(() => {
  // A stalled stream must never trap a child in the step.
  const timer = setTimeout(() => setCanSkip(true), 5_000);
  return () => clearTimeout(timer);
}, []);
```

Pause on background rather than letting the OS decide:

```tsx
useEffect(() => {
  const sub = AppState.addEventListener("change", (next) => {
    if (next !== "active") player.pause();     // resume is the child's choice
  });
  return () => sub.remove();
}, [player]);
```

Preload, ported from the web hook's decision-making:

```ts
export function usePreloadNextStep(lesson: LessonDetailResponse, isActive: boolean) {
  const hasRun = useRef(false);
  useEffect(() => {
    if (!isActive || hasRun.current || lesson.activity === null) return;
    hasRun.current = true;
    // Same walk, regex and cap of 8 as the web hook.
    void Image.prefetch(collectImageUrls(lesson.activity.definition).slice(0, MAX_PRELOADED_IMAGES));
  }, [lesson, isActive]);
}
```

Keep `KidVideoControls` dumb: it takes `{ playing, ended, canSkip, onPlayPause, onReplay, onNext, onSkip }` and renders buttons. That is what makes the step's own tests able to drive every state without a real video.

## Step-by-Step Plan

1. Build `Mascot` and the intro step; wire narration through `playNarration` and the replay speaker; test the script, the no-audio branch, completion and the reduced-motion branch. (~40 min)
2. Install `expo-video`; render a seeded lesson's video on a **physical device** with `nativeControls={false}` and confirm it streams and contains correctly in both orientations. (~30 min)
3. Build `KidVideoControls` (play/pause, replay, next, skip — no seek bar) with ≥64px targets in the thumb zone. (~30 min)
4. Wire the video step: poster while buffering, end detection, next/skip behaviour, the `null`-video nudge, `onComplete()`. Test each state. (~40 min)
5. Add the buffering, error and offline states with the skip escape hatch; test the error path. (~25 min)
6. Add audio coordination: explicit `stopNarration()` before play, background pause, and a check that app mute does not mute the video. (~25 min)
7. Port `use-preload-next-step.ts` from the web app with its test, and confirm on device that the activity step's images appear without a pop. (~30 min)
8. Device pass: low-end Android, throttled network (stall the stream deliberately), portrait and landscape, reduced motion on, TalkBack on. (~30 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The intro step shows the mascot and the localised `introScript`, speaks `introAudioUrl` once on mount (when there is one), and advances on one large button.
- [ ] A lesson with no video shows the "done" nudge rather than an empty player.
- [ ] The mascot animation is skipped (not shortened) under reduced motion.
- [ ] The video plays on a **physical device** with custom controls only: no seek bar, no fullscreen, no picture-in-picture, no native control overlay.
- [ ] The video is watchable in portrait **and** landscape without a forced-rotation dead end.
- [ ] A stalled or failed stream never traps the child: a skip appears after the threshold and reports the step as complete.
- [ ] Backgrounding pauses playback and does not auto-resume.
- [ ] Narration is explicitly stopped before playback; app mute does not mute the video.
- [ ] Up to 8 activity-step images are prefetched once playback starts, and the activity step appears without a visible image pop.
- [ ] No third-party video analytics or tracking SDK is present.
- [ ] All controls are ≥64px in the thumb zone; all kid text ≥20px; TalkBack labels the video and every control.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The activity, quiz and reward steps — M16, M19, M21.
- Video download for offline viewing — out of scope for the plan (§3.2).
- Subtitles or captions. Not in the spec, and the audience cannot read; the narration and visuals carry the content. Raise it as a spec question if accessibility review asks for it.
- Video authoring or transcoding — Cloudinary and the admin CMS (`apps/web/features/admin/`) own that.
- Picture-in-picture and background playback: deliberately disabled for a children's app.
