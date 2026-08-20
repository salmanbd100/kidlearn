# M23 — Story Reader

> **Estimated effort:** 3–4 hours
> **Depends on:** M21, M22
> **Requirement IDs:** FR-STORY-02, FR-STORY-03, FR-STORY-06, FR-STORY-07
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the narrated story reader: full-bleed illustrated pages, a page-turn gesture, narration that plays per page with word-level highlighting where the content provides timings, and a completion that awards through the server and celebrates with M21's components.

## Context & Current State

- `GET /api/content/stories/:id` returns `StoryDetailResponse`: the story plus `StoryPageSchema[]` — per page, the illustration, the localised text, and the localised narration. `NarrationTimingsSchema` / `NarrationSpanSchema` carry the per-span timings that make word highlighting possible; they are **optional content**, so the reader must work perfectly without them and better with them.
- `POST /api/progress/stories/:id/complete` returns `StoryCompletionResponse` — the reward for finishing (FR-STORY-07). Like the lesson's completion, it is the **server** that grants; the reader animates what it is told, reusing M21's reward components.
- The detail call is screen-time gated, and M22 already made it before navigating — the reader receives the payload through `lib/story-cache.ts`, with a fallback fetch for a cold-start deep link (which may then legitimately 423, so handle it).
- `apps/web/components/student/story-reader/` is the reference implementation — read it for the narration/highlight coordination and the page model before writing the native version.
- M14 owns audio: one narration at a time, `stopNarration()`, mute, background stop. The reader must not create its own player.
- M21 gives `StarBurst`, `CoinCountUp`, `BadgeReveal`, `StreakCelebration` and `rewardSequence` — a story completion is a smaller version of the same celebration.
- design.md §6: both orientations; a story page is a natural landscape layout on a tablet and a portrait one on a phone. §7: ≥64px controls, ≥20px text. §10: kid copy 1–4 words.

## Detailed Requirements

1. **Reader screen** (`app/(student)/stories/[id].tsx`) — takes the payload from `takeStory(id)`, falling back to `getStory(id)` for a cold-start deep link (handling `423` by showing the lock and leaving). Renders one page at a time, full-bleed, with the world's accent as the surround.
2. **Page model.** `lib/story-reader.ts` — a pure reducer over `{ index, pages, status }` with `next()`, `previous()` and `atEnd`. Page changes are the only navigation; there is no chapter list.
3. **Page turn: gesture and buttons.** A horizontal swipe turns the page (`react-native-gesture-handler` pan with a velocity threshold), and **large visible next/back buttons** are always present — a 3-year-old should not have to discover a gesture, and a swipe alone would also fight a screen reader. Both paths call the same reducer. The page-turn sound comes from M14's bundled SFX.
4. **Narration per page (FR-STORY-03).** On each page change, narration for the active locale plays automatically (respecting mute) via M14. A ≥64px speaker replays it. Turning the page mid-sentence stops the previous narration — M14's single-narration rule handles it, but call `stopNarration()` explicitly rather than relying on ordering.
5. **Word highlighting where timings exist (FR-STORY-02).** When a page carries `NarrationTimings`, highlight the current span as the audio plays: split the page text into spans, track playback position, and mark the active one with a background and a slightly heavier weight (two encodings, not colour alone). Without timings, the text renders plainly and nothing is lost. **Do not fake timings** by dividing duration by word count — a highlight that drifts out of sync is worse than none.
6. **Progressive image loading.** Prefetch the next two pages' illustrations while the current page is displayed; show the page's own illustration with a `transition` rather than a pop. A page must never display an empty frame.
7. **Completion (FR-STORY-06, FR-STORY-07).** At the last page, a large "Finish" control calls `POST /api/progress/stories/:id/complete`, then plays the M21 celebration built from the response, then returns to the library with the story now marked read. A failed completion call retries once, then still celebrates with a provisional framing and returns — the server reconciles, and a child does not lose a story's ending to a dropped request.
8. **Exit guard, lighter than the lesson's.** Leaving mid-story loses nothing (there is no partial reward), so the back gesture exits directly — but the story-reading time already recorded stays recorded. No confirmation sheet: it would be friction with no purpose. (This is a deliberate difference from M13's lesson exit guard; note it in a comment so it does not read as an oversight.)
9. **Learning time.** The reader is a **learning surface**, so M24's heartbeat mounts here as well as in the lesson player — the web app's `use-heartbeat` docstring is explicit that it belongs on "the lesson player and the story reader" and nowhere else. This file leaves the hook call site ready; M24 supplies the hook.
10. **Both orientations.** Portrait: illustration on top, text below. Landscape/tablet: illustration and text side by side. One `isLandscape` branch in the screen, as in M11.
11. **Tests** (`lib/story-reader.test.ts`, `app/(student)/stories/[id].test.tsx`, `components/student/story-reader/NarratedText.test.tsx`): the reducer advances and clamps at both ends; swipe and buttons both turn the page; narration plays once per page and stops on turn; highlighting follows a fake playback clock when timings exist and renders plain text when they do not; the next pages' images prefetch; the last page's finish calls complete once and then celebrates; a failed completion still celebrates provisionally and returns; a cold-start `423` shows the lock and does not render pages.

## Technical Approach & Suggestions

```
apps/mobile/app/(student)/stories/[id].tsx
apps/mobile/app/(student)/stories/[id].test.tsx
apps/mobile/lib/story-reader.ts                                  # pure page reducer
apps/mobile/lib/story-reader.test.ts
apps/mobile/lib/story-api.ts                                     # completeStory(id)
apps/mobile/components/student/story-reader/StoryPage.tsx
apps/mobile/components/student/story-reader/NarratedText.tsx      # spans + highlight
apps/mobile/components/student/story-reader/NarratedText.test.tsx
apps/mobile/components/student/story-reader/PageControls.tsx
```

Highlighting, driven by real playback position and honest about missing data:

```tsx
export function NarratedText({ text, timings, positionMs }: NarratedTextProps) {
  // No timings is a normal content state, not a degraded one. Never synthesise
  // spans from duration ÷ word count: a drifting highlight teaches the wrong
  // word.
  if (!timings) return <Text variant="body">{text}</Text>;

  const activeIndex = timings.spans.findIndex(
    (s) => positionMs >= s.startMs && positionMs < s.endMs,
  );

  return (
    <Text variant="body">
      {timings.spans.map((span, i) => (
        <Text
          key={`${span.startMs}-${i}`}
          className={i === activeIndex ? "bg-accent/40 font-bold" : undefined}
        >
          {span.text}
        </Text>
      ))}
    </Text>
  );
}
```

Get `positionMs` from the audio player's status rather than a `setInterval` guess, and throttle updates to a few per second — a 60Hz state update per frame for a highlight will cost more than it gains:

```ts
const [positionMs, setPositionMs] = useState(0);
useEffect(() => {
  const id = setInterval(() => setPositionMs(getNarrationPositionMs()), 120);
  return () => clearInterval(id);
}, [pageIndex]);
```

The page turn, with both paths through one reducer:

```tsx
const swipe = Gesture.Pan().onEnd((e) => {
  "worklet";
  if (e.velocityX < -400 || e.translationX < -80) runOnJS(goNext)();
  else if (e.velocityX > 400 || e.translationX > 80) runOnJS(goPrevious)();
});
```

Prefetch a short window ahead — two pages is enough to hide latency without downloading a whole book:

```ts
useEffect(() => {
  const upcoming = pages.slice(index + 1, index + 3).map((p) => p.imageUrl);
  void Image.prefetch(upcoming);
}, [index, pages]);
```

Reuse M21's components directly for the completion celebration rather than writing a story-specific one — the child should recognise the reward language from lessons.

## Step-by-Step Plan

1. Write `lib/story-reader.ts` + tests (advance, clamp, `atEnd`). (~25 min)
2. Build `StoryPage` (illustration + text, portrait and landscape layouts) and confirm a seeded story renders full-bleed on device. (~35 min)
3. Build `PageControls` (≥64px next/back, page indicator by shape) and wire the swipe gesture to the same reducer. (~30 min)
4. Wire per-page narration through M14 with an explicit stop on turn, plus the replay speaker; test play-once-per-page. (~30 min)
5. Build `NarratedText` with span highlighting and the no-timings path; test both against a fake clock. (~40 min)
6. Add image prefetch for the next two pages and the `transition` on the current illustration. (~20 min)
7. Add `lib/story-api.ts` and the finish flow: complete → M21 celebration → back to the library. Test the success and the failed-then-provisional paths. (~40 min)
8. Handle the cold-start deep link: fallback fetch, including the `423` branch. Test it. (~20 min)
9. Device pass on a **physical phone and a tablet**: swipe and buttons, mute on and off, both languages (check Bengali line wrapping with highlighting), both orientations, TalkBack reading the page text and controls. (~35 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A story reads end to end on a physical device with both swipe and button navigation working through the same reducer.
- [ ] Narration plays once per page, stops on a page turn, respects mute, and is replayable from a ≥64px speaker.
- [ ] Word highlighting follows real playback position where `NarrationTimings` exist, and pages without timings render plain text with no synthesised timing.
- [ ] The highlight is encoded by background **and** weight, not colour alone.
- [ ] The next two pages' illustrations are prefetched; no page shows an empty frame.
- [ ] Finishing calls `POST /api/progress/stories/:id/complete` once, celebrates with M21's components from the response, and returns to the library with the story marked read.
- [ ] A failed completion retries once, then celebrates provisionally and still returns — no child loses the ending to a dropped request.
- [ ] Exiting mid-story leaves immediately with no confirmation, and the difference from the lesson player's guard is documented in a comment.
- [ ] A cold-start deep link into a locked story shows the screen-time lock and renders no pages.
- [ ] Portrait and landscape layouts both work on a phone and a tablet; all text ≥20px, all controls ≥64px.
- [ ] TalkBack reads the page text and announces both navigation controls.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The heartbeat hook itself — M24 (this file provides the mount point).
- The full screen-time lock screen — M25.
- Generating narration or timings — the AI pipeline (web file 36).
- Per-page resume ("continue where you left off"). Not a requirement, and a story is short enough that restarting is not a cost.
- Read-aloud recording, karaoke mode, or reading-speed controls. Not in the spec.
- Offline story caching — out of scope for the plan (§3.2).
