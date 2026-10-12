# M14 — Audio Layer & Narration

> **Estimated effort:** 3–4 hours
> **Depends on:** M13
> **Requirement IDs:** FR-LSN-02, FR-I18N-05, NFR-A11Y-04, NFR-PERF-02
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Give the app a voice. One audio layer owning three jobs: **narration** (the localised voice-over that lets a pre-reader use the app without reading), **UI sounds** (tap, page turn), and **feedback sounds** (correct, try again). Built on `expo-audio`, with a mute control, sensible interruption behaviour when a video or another app's audio starts, and a screen-narration hook every screen from M10 onwards can adopt.

## Context & Current State

- design.md §10 is unambiguous: kid copy is 1–4 words and **always pairs with a voice-over and an icon**. Narration is not an enhancement here — it is how a 3-year-old is expected to operate the product.
- FR-I18N-05: audio is per-language, in two shapes:
  - **Payload-embedded** `LocalizedAudioSchema` (`packages/types/src/primitives.ts`) = `{ en: AudioAssetRef, bn: AudioAssetRef }` — both locales required, each `{ kind: "audio", url, alt? }`. Used by activity `instructionAudio`, quiz `promptAudio` and quiz option `audio`.
  - **Server-resolved strings** — `LessonDetail.introAudioUrl`, story `pages[].narrationUrl`, `moralAudioUrl`, `titleAudioUrl`: the server has already picked the child's locale and fallen back to English (flagged in `LessonAssetFallbacksSchema` for the lesson). The client plays them as given.
  `NarrationTimingsSchema` / `NarrationSpanSchema` carry the story reader's word-level sync (M23).
- Web precedent: `apps/web/shared/components/AudioProvider.tsx` is the single owner (`play(url, { interrupt, onFinished })` resolving `"ended" | "unplayed"`, `stop`, `muted`, persisted in `localStorage` under `kidlearn_audio_muted`) — deliberately **single-voice**, so a feedback clip interrupts narration. `apps/web/shared/hooks/use-screen-narration.ts` plays `/audio/ui/{key}.{locale}.mp3` once per screen (keys `selectProfile`, `home`, `world`, `stories`), and `apps/web/shared/components/kid/feedback-audio.ts` picks one of three cheers / per-locale retries at random. The browser needs a user gesture before audio; native does not, which simplifies the native version.
- `apps/web/public/audio/feedback/` (`cheer-{1,2,3}`, `coin-1`, `unlock-1`, and per-locale `celebration`, `oops`, `locked`, `streak`, `retry-{1,2,3}`) and `audio/ui/` (`{selectProfile,home,world}.{en,bn}.mp3`) are **all one-second-of-silence placeholders** awaiting the voice pipeline (web file 36 — see each folder's README); `stories.{en,bn}.mp3` does not exist yet although the web hook requests it. Mobile bundles the same files and swaps them in when real clips land — short sounds must **not** be streamed from Cloudinary on every tap.
- Narration for lesson and story content comes from the content payload (Cloudinary URLs). UI and feedback sounds ship **in the app bundle** so they are instant and work offline.
- `expo-av` is deprecated; `expo-audio` is the current API. Do not start on `expo-av`.
- M03 gives the active locale; M13 gives the step shell whose steps will request narration.
- NFR-PERF-02 cares about media weight; bundled sounds must stay small (a few tens of KB each), and narration is streamed, not preloaded wholesale.

## Detailed Requirements

1. **`lib/audio.ts` — one owner.** Exports `playNarration(source)`, `stopNarration()`, `playSfx(name)`, `setMuted(muted)`, `isMuted()`. No component creates its own player. This matters on native: two `expo-audio` players fighting over the same output produce overlapping voices, and a child cannot tell which one to follow.
2. **Two players, deliberately.** One long-form player for narration (interruptible, one at a time — a new narration stops the previous), and one short-sound player pool for SFX (overlap is fine and desirable: a tap sound must not cut off "well done"). Keep the split inside `lib/audio.ts`. This diverges from web's single-voice `AudioProvider` on purpose — native players are cheap and overlap is no longer a browser autoplay risk; note it in a comment. `playNarration` resolves `"ended" | "unplayed"` like web's `play`, because the story reader (M23) only auto-turns a page after a clip was actually heard.
3. **Bundled SFX.** `assets/audio/ui/*` and `assets/audio/feedback/*`, ported from `apps/web/public/audio/` (transcode the `.mp3` files only if size or latency demands it), addressed by a typed name derived from the web filenames (feedback: `cheer` (random of three), `coin`, `unlock`, plus the per-locale `celebration`, `oops`, `locked`, `streak`, `retry` (random of three); there is no web `tap` or `pageTurn` asset, so add those as new files if wanted), preloaded once at app start. Add the missing `stories` UI prompt as a silent placeholder so the library screen does not request a file that is not there. A typo in a sound name must be a type error, not silence.
4. **Localised narration resolution.** `lib/narration.ts` exporting `resolveNarration(audio: LocalizedAudio | undefined, locale: Locale): string | undefined` for the payload-embedded shape — `audio[locale].url`, falling back to `audio.en.url`, and `undefined` when neither exists (the schema requires both; the guard is for a lenient read of an older payload). Server-resolved URLs (`introAudioUrl`, `narrationUrl`) are already resolved and only need the `null` check. A missing narration degrades to "no voice-over", never to a crash.
5. **`useScreenNarration(key | source)`** — plays a screen's narration once when it mounts and the screen is focused, stops on blur or unmount. Uses `useFocusEffect` from expo-router, because a screen pushed on top must silence the one beneath it. Respects mute. Never replays on re-render — the web hook's semantics, ported.
6. **Mute control.** Persisted in AsyncStorage (a preference, not a secret) under `kidlearn.muted`, exposed through a small provider so both the student surface's mute button and the parent settings screen read the same value. Muting silences narration and SFX but must **not** mute lesson video (that has its own control) — a parent muting the room's noise is different from turning off a video.
7. **Interruption and focus.** Configure the audio session so: narration ducks or pauses when a video step plays (M15 owns the video, this file owns yielding); the app respects the device silent switch for SFX but **not** for narration explicitly triggered by a tap (a muted phone is common, and a silent app is unusable for a pre-reader — so honour the app's own mute, and document the choice); and audio stops when the app backgrounds (`AppState`), because a phone in a pocket must not keep talking.
8. **Step narration in the player.** Each step plays its own narration through this module, as on web (`IntroStep` plays `introAudioUrl`, `ActivityEngine` the `instructionAudio`, `QuizEngine` each `promptAudio`); `StepShell` (M13) stays a frame. The player's only audio duty is to `stopNarration()` when it unmounts, so leaving mid-sentence does not keep talking over the world screen (web's `LessonPlayer` does the same).
9. **Replay affordance.** Every narrated kid screen gets a speaker button (≥64px, thumb zone) that replays the current narration. A child who missed it must not have to leave and re-enter the screen.
10. **No autoplay of anything loud on first launch.** The very first narration plays after the child's first tap (the profile picker's tile), not on app open — a phone that starts talking on the home screen while a parent is in a meeting is a one-star review.
11. **Tests** (`lib/audio.test.ts`, `lib/narration.test.ts`, `lib/use-screen-narration.test.tsx`) with `expo-audio` mocked: a new narration stops the previous one; SFX overlap narration; mute silences both and persists; `resolveNarration` returns the locale URL, falls back to `en`, and returns `undefined` when absent; `useScreenNarration` plays once on focus, not on re-render, and stops on blur; backgrounding stops narration.

## Technical Approach & Suggestions

```
apps/mobile/lib/audio.ts                       # the single audio owner
apps/mobile/lib/audio.test.ts
apps/mobile/lib/narration.ts                   # locale resolution
apps/mobile/lib/narration.test.ts
apps/mobile/lib/use-screen-narration.ts
apps/mobile/lib/use-screen-narration.test.tsx
apps/mobile/lib/mute.tsx                       # provider + persisted preference
apps/mobile/components/student/SpeakerButton.tsx
apps/mobile/assets/audio/ui/*                  # ported from apps/web/public/audio/ui
apps/mobile/assets/audio/feedback/*            # ported from apps/web/public/audio/feedback
```

Locale resolution, defensive because content is authored by a pipeline:

```ts
// apps/mobile/lib/narration.ts
import type { Locale, LocalizedAudio } from "@kidlearn/types";

/**
 * English is the fallback, as it is server-side for intro and story narration;
 * a missing clip in both degrades to silence, because the icon and the demo
 * still carry the meaning.
 */
export function resolveNarration(audio: LocalizedAudio | undefined, locale: Locale): string | undefined {
  return audio?.[locale]?.url ?? audio?.en?.url;
}
```

The single-owner shape, with the two-player split visible:

```ts
// apps/mobile/lib/audio.ts
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

const SFX = {
  cheer: [
    require("../assets/audio/feedback/cheer-1.mp3"),
    require("../assets/audio/feedback/cheer-2.mp3"),
    require("../assets/audio/feedback/cheer-3.mp3"),
  ],
  coin: [require("../assets/audio/feedback/coin-1.mp3")],
  unlock: [require("../assets/audio/feedback/unlock-1.mp3")],
} as const;   // per-locale clips (retry, oops, streak, …) keyed by locale alongside

export type SfxName = keyof typeof SFX;

// One narration voice at a time: two overlapping voices are unusable for a
// pre-reader, who cannot choose which to follow.
let narrationPlayer: ReturnType<typeof createAudioPlayer> | undefined;

export async function playNarration(uri: string): Promise<void> {
  if (muted) return;
  narrationPlayer?.remove();
  narrationPlayer = createAudioPlayer({ uri });
  narrationPlayer.play();
}

export function playSfx(name: SfxName): void {
  if (muted) return;
  // Short sounds may overlap narration on purpose — a tap must not cut off praise.
  const variants = SFX[name];
  const player = createAudioPlayer(variants[Math.floor(Math.random() * variants.length)]);
  player.play();
}
```

Stop on background, in one place rather than per screen:

```ts
AppState.addEventListener("change", (next) => {
  if (next !== "active") void stopNarration();
});
```

The focus-aware hook — the detail that stops a pushed screen and the screen beneath it talking over each other:

```ts
export function useScreenNarration(source: string | undefined) {
  useFocusEffect(
    useCallback(() => {
      if (source) void playNarration(source);
      return () => void stopNarration();
    }, [source]),
  );
}
```

Convert the web's audio assets rather than re-sourcing them: they are already tuned and the two clients must sound identical. Check the format `expo-audio` handles best on both platforms (m4a/AAC is the safe pick) and keep each file under ~50KB.

## Step-by-Step Plan

1. Install `expo-audio`; port the UI and feedback sounds from `apps/web/public/audio/` into `assets/audio/`, converting format if needed and checking file sizes. (~30 min)
2. Write `lib/narration.ts` + tests (exact locale, `en` fallback, absent). (~20 min)
3. Write the failing `lib/audio.ts` tests (single narration, overlapping SFX, mute, background stop), then implement the module with the two-player split. (~50 min)
4. Build `lib/mute.tsx` (provider + AsyncStorage persistence) and wire the mute control into the student surface and parent settings. (~25 min)
5. Write `useScreenNarration` + its test (plays once on focus, silent on re-render, stops on blur). (~30 min)
6. Build `SpeakerButton` (≥64px, thumb zone) and add it to the profile picker and home screen; wire their narration keys from M10/M11. (~30 min)
7. Add the player's stop-on-unmount (M13) and confirm leaving mid-narration silences it. (~15 min)
8. Configure the audio session: ducking, silent-switch policy (document the choice in a comment), and background stop. Verify on a **physical device** with the ringer off and with another app playing music. (~35 min)
9. Device pass: no autoplay on launch; narration stops when a screen is pushed; mute persists across restart; SFX are instant with no perceptible delay on a low-end Android. (~25 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `lib/audio.ts` is the only module that creates an audio player; no component instantiates one.
- [ ] Starting a new narration stops the previous one; SFX may overlap narration.
- [ ] UI and feedback sounds are bundled, play with no perceptible delay on a low-end Android device, and work with the network off.
- [ ] Payload narration resolves to the active locale, falls back to English, and degrades to silence when neither exists — never to a crash; server-resolved URLs are played as given.
- [ ] Mute silences narration and SFX, persists across app restarts, and is reachable from both the student surface and parent settings.
- [ ] Audio stops when the app is backgrounded, and yields appropriately when a video plays or another app takes the session.
- [ ] Nothing plays automatically on app launch; the first sound follows the child's first tap.
- [ ] Every narrated kid screen has a ≥64px replay speaker button in the thumb zone.
- [ ] The silent-switch policy is implemented and its rationale documented in a comment.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Word-level narration highlighting for the story reader — M23 (it consumes `NarrationTimingsSchema`; this file only plays the audio).
- Lesson video playback and its own audio track — M15.
- Text-to-speech generation. Narration is pre-generated content (the web-only AI pipeline, `apps/server/src/modules/admin/ai/google-tts.ts`); the client only plays URLs.
- Downloading narration for offline use — out of scope for the plan (§3.2).
- Background audio playback. A learning app that keeps talking with the screen off is a support ticket, not a feature.
