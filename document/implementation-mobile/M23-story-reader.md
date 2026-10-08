# M23 — Story Reader

> **Estimated effort:** 3–4 hours
> **Depends on:** M21, M22
> **Requirement IDs:** FR-STORY-02, FR-STORY-03, FR-STORY-06, FR-STORY-07
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the narrated story reader: full-bleed illustrated pages, a page-turn gesture and buttons, narration per page that turns the page when it ends, word-level highlighting where the content provides timings, the `story_start` evidence the server pays against, and a completion that awards through the server and celebrates with M21's components.

## Context & Current State

- `GET /api/content/stories/:id` returns `{ story }` (`StoryDetailSchema`): the story plus `pages[]` — per page `{ pageNumber, illustrationUrl | null, text, narrationUrl | null, narrationTimings | null }`, plus `moral` / `moralAudioUrl` (FR-STORY-03) for the finish screen. `narrationTimings` is `{ unit: "word" | "sentence", spans: [{ start, end, tMs }] }` — **character offsets** into `text` and the millisecond the narration reaches each span (an empty `spans` is treated as `null`). Timings are **optional content**, so the reader must work perfectly without them and better with them.
- **`story_start` is the evidence a completion is paid against.** `POST /api/events/activity` `{ type: "story_start", refId: storyId }` records it; it is **screen-time gated** (`423` with the usual body when the limit or window is shut — recording one while the gate is shut would manufacture an exemption), consent-gated, and counts against `CLIENT_EVENTS_PER_MINUTE = 30` per child. `story_complete` is the matching milestone, posted the same way.
- `POST /api/progress/stories/:id/complete` returns `StoryCompletionResponse`: `{ alreadyCompleted, granted: { stars, coins } | null, newBadges, newCharacters, streak: { current, milestone }, totals }` (FR-STORY-07). `granted` is `{ stars: 1, coins: 5 }` on the first finish and `null` on every replay. It is refused with **`409` `details.code = "STORY_NOT_STARTED"`** unless this child has a `story_start` for this story in the last 3 hours (`LESSON_RESUME_CEILING_MS`), and when that start is **more than 30 minutes old** (`LESSON_RESUME_GRACE_MS`) the completion re-checks screen time and may answer `423` (`apps/server/src/modules/progress/story-progress.service.ts`). Story completion runs the same streak, badge and character tail as a lesson. It is the **server** that grants; the reader animates what it is told. Both writes are consent-gated (`403 CONSENT_REQUIRED` → M04's global handler).
- The detail call is screen-time gated, and M22 already made it before navigating — the reader receives the payload through `lib/story-cache.ts`, with a fallback fetch for a cold-start deep link (which may then legitimately `423` or `404`).
- `apps/web/features/stories/reader/` is the reference: `StoryReader.tsx`, `reader-machine.ts` (pure reducer), `NarratedText.tsx` (`activeSpanIndex`), `StoryPageView.tsx`, `FinishScreen.tsx`. Its behaviour:
  - `trackEvent("story_start", storyId)` once per mount (fire-and-forget, `retries: 0`); "Read again" is the same sitting and posts nothing new.
  - The reducer: `{ pageIndex, pageCount, autoAdvance (default on), phase: "reading" | "finished", completionRequested }`, events `NEXT` (on the last page, finishes), `BACK`, `NARRATION_ENDED` (turns the page only with auto-advance on, never past the last page), `TOGGLE_AUTO_ADVANCE`, `FINISH`, `READ_AGAIN`. Completion is requested once per mount.
  - A page's narration plays on arrival; only a clip that was actually heard (`"ended"`, not muted/blocked/failed) arms a `1500 ms` hold before `NARRATION_ENDED`. Any tap cancels a pending advance. Swipe threshold `50 px`.
  - The highlight clock is elapsed time since the clip started, sampled every `100 ms`, re-rendering only when the active span changes.
  - On finish it posts `story_complete` and the completion; a failure is logged and the finish screen shows no grant. The finish screen speaks `moralAudioUrl`, shows the moral, `granted` stars/coins and any badges/characters, and offers "Read again" and "More stories". A replay inside one mount shows no grant.
  - `useHeartbeat()` mounts on the reading surface only (not the loading or "put away" states).
  - No illustration prefetch.
- `apps/web/features/student/ParentCorner.tsx` is hidden on `/stories/[id]`: the reader's own controls occupy that corner. Mobile does the same (D10).
- M14 owns audio: one narration at a time, `"ended" | "unplayed"` outcomes, mute, background stop. The reader must not create its own player.
- M21 gives `StarBurst`, `CoinCountUp`, `BadgeReveal` and `StreakCelebration`.
- design.md §6: both orientations; a story page is a natural landscape layout on a tablet and a portrait one on a phone. §7: ≥64px controls, ≥20px text. §10: kid copy 1–4 words.

## Detailed Requirements

1. **Reader screen** (`app/(student)/stories/[id].tsx`) — takes the payload from `takeStory(id)`, falling back to `getStory(id)` for a cold-start deep link (`423` → the lock, `404` → a "put away" state, a story with no pages → a calm empty state). Renders one page at a time, full-bleed, with the world's accent as the surround.
2. **Page model — lifted, not copied (D6).** `reader-machine.ts` is pure: move it (with its test) to `packages/types/src/domain/story-reader.ts`, re-point web, and use the same reducer here.
3. **`story_start` on open.** `trackEvent("story_start", storyId)` once when the reading surface mounts — fire-and-forget, `retries: 0`, as web. The completion cannot succeed without it, so this file creates `lib/track-event.ts` exactly as M24 specifies it (M24 then reuses it and adds only the heartbeat). A lost or refused start (a `429`, or a `423` if the gate shut in the moments since the detail read) surfaces later as `409 STORY_NOT_STARTED` on completion, which the finish treats as non-fatal. Never retry it; never post it per page or per "Read again".
4. **Page turn: gesture and buttons.** A horizontal swipe turns the page (`react-native-gesture-handler` pan; web's 50px threshold, plus a velocity threshold), and **large visible next/back buttons** are always present — a 3-year-old should not have to discover a gesture, and a swipe alone would also fight a screen reader. Both dispatch to the same reducer and cancel any pending auto-advance. The page-turn sound, if added in M14, plays here.
5. **Narration per page (FR-STORY-03).** On each page change, `narrationUrl` plays via M14 (respecting mute); a ≥64px speaker replays it. Turning the page mid-sentence stops the previous narration — call `stopNarration()` explicitly. Only an `"ended"` outcome arms the 1500ms hold before `NARRATION_ENDED`; an `"unplayed"` clip never turns the page. An auto-advance toggle (default on) mirrors web's.
6. **Highlighting where timings exist (FR-STORY-02).** When a page carries non-empty `narrationTimings`, split `text` by the spans' `start`/`end` offsets and mark the active span (`activeSpanIndex`: the last span whose `tMs ≤ elapsed`) with a background **and** a heavier weight. Drive `elapsed` from the clip's start, sampled about every 100ms, and set state only when the active span changes. Without timings, render plain text. **Do not fake timings** by dividing duration by word count — a highlight that drifts is worse than none.
7. **Images.** Show the page's own illustration with a short `transition` rather than a pop; a `null` illustration gets a calm placeholder. As a native addition, prefetch the next two pages' `illustrationUrl`s while the current page is displayed.
8. **Completion (FR-STORY-06, FR-STORY-07).** Reaching the end (`NEXT` on the last page, or the finish control) posts `story_complete` and calls `POST /api/progress/stories/:id/complete` once per mount (`isIdempotent: true`; no manual retry). Then show the finish screen: the moral and its audio, M21's star/coin beats only when `granted` is non-null, badge/character reveals and the streak milestone from the response, "Read again" and "More stories". On any failure — `409 STORY_NOT_STARTED`, `423` (a start more than 30 minutes old with the gate now shut), network — log it and show the ending without a grant; the story stays unread until a later reading completes. A "Read again" within the same mount shows no grant and makes no second call.
9. **Exit, lighter than the lesson's.** Leaving mid-story loses nothing (there is no partial reward), so the back gesture exits directly. No confirmation sheet — note in a comment that the difference from M13's guard is deliberate. Narration stops on the way out.
10. **No parent door on the reader.** The `ParentCorner` counterpart is hidden on this route, as on web.
11. **Learning time.** The reader is a learning surface, so M24's heartbeat mounts on the reading surface (as web's `StoryReader` does), not on its loading or error states. This file leaves the call site ready; M24 supplies the hook.
12. **Both orientations.** Portrait: illustration on top, text below. Landscape/tablet: side by side. One `isLandscape` branch, as in M11.
13. **Tests** (the lifted reducer keeps web's tests; `app/(student)/stories/[id].test.tsx`, `components/student/story-reader/NarratedText.test.tsx`): `story_start` is posted once per mount with `retries: 0`, and not again on "Read again"; swipe and buttons both turn the page and cancel a pending advance; narration plays once per page and stops on turn; an `"ended"` clip auto-advances after the hold and an `"unplayed"` one does not; highlighting follows a fake clock when timings exist and renders plain text when they do not; reaching the end posts `story_complete` and calls complete once; a replay response (`granted: null`) shows no star or coin beat; a `409 STORY_NOT_STARTED` or `423` on completion shows the plain ending; "Read again" makes no second call; a cold-start `423` on the detail shows the lock and renders no pages; no parent-door control renders.

## Technical Approach & Suggestions

```
packages/types/src/domain/story-reader.ts                        # lifted reader-machine.ts (+ test)
apps/mobile/app/(student)/stories/[id].tsx
apps/mobile/app/(student)/stories/[id].test.tsx
apps/mobile/lib/progress-api.ts                                  # + completeStory(id)
apps/mobile/lib/track-event.ts                                   # trackEvent(type, refId), as M24 specifies it (+ test)
apps/mobile/components/student/story-reader/StoryPage.tsx
apps/mobile/components/student/story-reader/NarratedText.tsx      # spans + highlight
apps/mobile/components/student/story-reader/NarratedText.test.tsx
apps/mobile/components/student/story-reader/PageControls.tsx
apps/mobile/components/student/story-reader/FinishScreen.tsx
```

(M24 owns `/api/events/heartbeat` and the heartbeat hook; `track-event.ts` lands here first because completion depends on `story_start`.)

Highlighting, driven by the schema's offsets and honest about missing data:

```tsx
export function NarratedText({ text, timings, elapsedMs }: NarratedTextProps) {
  // No timings is a normal content state. Never synthesise spans from
  // duration ÷ word count: a drifting highlight teaches the wrong word.
  if (timings === null || timings.spans.length === 0) return <Text variant="body">{text}</Text>;

  const active = activeSpanIndex(timings, elapsedMs);   // last span with tMs <= elapsed
  return (
    <Text variant="body">
      {segments(text, timings.spans, active).map((segment) => (
        <Text key={segment.start} className={segment.isActive ? "bg-accent/40 font-bold" : undefined}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}
```

The clock, re-rendering only when the word changes:

```ts
useEffect(() => {
  if (timings === null) return;
  let lastActive = Number.NaN;
  const tick = setInterval(() => {
    const elapsed = Date.now() - narrationStartedAt;
    const active = activeSpanIndex(timings, elapsed);
    if (active === lastActive) return;
    lastActive = active;
    setElapsedMs(elapsed);
  }, 100);
  return () => clearInterval(tick);
}, [timings, narrationStartedAt]);
```

The page turn, with both paths through one reducer:

```tsx
const swipe = Gesture.Pan().onEnd((e) => {
  "worklet";
  if (e.velocityX < -400 || e.translationX < -50) runOnJS(act)({ type: "NEXT" });
  else if (e.velocityX > 400 || e.translationX > 50) runOnJS(act)({ type: "BACK" });
});
```

Prefetch a short window ahead — two pages hide latency without downloading a whole book:

```ts
useEffect(() => {
  const upcoming = pages.slice(index + 1, index + 3)
    .map((p) => p.illustrationUrl)
    .filter((url): url is string => url !== null);
  void Image.prefetch(upcoming);
}, [index, pages]);
```

Reuse M21's components for the finish celebration rather than writing a story-specific one — the child should recognise the reward language from lessons.

## Step-by-Step Plan

1. Lift `reader-machine.ts` and its test to `packages/types/src/domain/story-reader.ts`, re-point web, run both suites. (~25 min)
2. Build `StoryPage` (illustration + text, portrait and landscape layouts, `null` illustration) and confirm a seeded story renders full-bleed on device. (~35 min)
3. Add `lib/track-event.ts` and the `story_start` post on mount. Test it. (~20 min)
4. Build `PageControls` (≥64px next/back, auto-advance toggle, page indicator by shape) and wire the swipe to the same reducer. (~30 min)
5. Wire per-page narration through M14 with an explicit stop on turn, the `"ended"`-only auto-advance hold and the replay speaker. (~30 min)
6. Build `NarratedText` with offset-based spans and the no-timings path; test both against a fake clock. (~40 min)
7. Add the next-two-pages prefetch and the illustration `transition`. (~15 min)
8. Add `completeStory` and the finish flow: `story_complete` + complete → `FinishScreen` with M21's beats → back to the library. Test success, replay (`granted: null`), `409 STORY_NOT_STARTED` and `423`. (~40 min)
9. Handle the cold-start deep link: fallback fetch, including `423` and `404`. Test it. (~15 min)
10. Device pass on a **physical phone and a tablet**: swipe and buttons, mute on and off (no auto-advance when muted), both languages (check Bengali line wrapping with highlighting), both orientations, TalkBack reading the page text and controls. (~35 min)
11. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The reader reducer lives in `packages/types` and both clients use it; the web suite still passes.
- [ ] `story_start` is posted once per reader mount, fire-and-forget, before the child can finish.
- [ ] A story reads end to end on a physical device with both swipe and button navigation working through the same reducer.
- [ ] Narration plays once per page, stops on a page turn, respects mute, and is replayable from a ≥64px speaker; only a clip that was heard turns the page.
- [ ] Highlighting uses the spans' character offsets and `tMs` where `narrationTimings` exist; pages without timings render plain text with no synthesised timing.
- [ ] The highlight is encoded by background **and** weight, not colour alone.
- [ ] No page shows an empty frame; the next two illustrations are prefetched.
- [ ] Finishing posts `story_complete` and calls `POST /api/progress/stories/:id/complete` once per mount, and celebrates from the response — no star or coin beat on a replay.
- [ ] A `409 STORY_NOT_STARTED`, a `423` or a network failure on completion shows the ending without a grant and is not retried by hand.
- [ ] Exiting mid-story leaves immediately with no confirmation, the difference from the lesson player's guard is documented in a comment, and no parent-door control is shown on the reader.
- [ ] A cold-start deep link into a locked story shows the screen-time lock and renders no pages.
- [ ] Portrait and landscape layouts both work on a phone and a tablet; all text ≥20px, all controls ≥64px.
- [ ] TalkBack reads the page text and announces both navigation controls.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The heartbeat hook itself — M24 (this file provides the mount point).
- The full screen-time lock screen — M25.
- Generating narration or timings — the web-only AI pipeline (`apps/server/src/modules/admin/ai/`).
- Per-page resume ("continue where you left off"). Not a requirement, and a story is short enough that restarting is not a cost.
- Read-aloud recording, karaoke mode, or reading-speed controls. Not in the spec.
- Offline story caching — out of scope for the plan (§3.2).
