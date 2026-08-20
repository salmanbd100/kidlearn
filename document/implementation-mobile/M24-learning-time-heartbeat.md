# M24 — Learning-Time Heartbeat

> **Estimated effort:** 3–4 hours
> **Depends on:** M13
> **Requirement IDs:** FR-TIME-06, FR-DASH-02 (data), FR-LSN-07
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Report presence honestly. Port the web app's heartbeat to native, with `AppState` in place of the Page Visibility API — so a phone left face-down on a table stops billing learning minutes — plus the discrete milestone events (`lesson_start`, `story_complete`, …) that mark what a sitting was spent on. The client measures nothing; the server derives every minute.

## Context & Current State

- `apps/web/lib/use-heartbeat.ts` is the reference and its docstring is the specification for this file:
  - **"This file measures nothing."** No timer whose elapsed value it reports, no accumulator, no stored total. It posts "I am here" every 30 seconds and reads back what the server says. "That is the whole anti-tamper design: refreshing the page, closing the tab, clearing storage or editing React state cannot lower a figure that was never held here."
  - **Cadence:** `HEARTBEAT_INTERVAL_MS = 30_000` — "the cadence the server's 30s tail credit is calibrated against". One beat fires immediately on mount and again on becoming visible, "so a short visit is worth its 30-second interval instead of nothing".
  - **Mount on learning surfaces only** — "the lesson player and the story reader. Not on the profile picker, not on the home screen, and never in a parent or admin layout: the figure it feeds is 'how long has this child been learning', and a dashboard left open would answer that question with an adult's afternoon."
  - **`enabled` is the same rule one level up**: a visible screen showing a loader or the screen-time lock has no child learning in front of it, and the heartbeat endpoint is deliberately ungated — so a caller that mounts the hook above its own ready state "would bill a child for staring at 'time's up'".
  - **No retries, ever.** "A beat that failed has already been superseded by the next tick 30 seconds later, and a queue of stale retries would report a child's timeline out of order." `minutesToday` keeps its previous value until a beat lands; `null` until the first one does.
- `POST /api/events/heartbeat` takes **no body** — "the client's entire contribution is that the request arrived; the server stamps the row, throttles the cadence, and derives the minutes". It answers `200` with `HeartbeatResponse` including `minutesToday` and a `recorded` flag (sent even on a throttled beat "so a throttled client still sees an honest total").
- `POST /api/events/activity` records one discrete milestone: `ACTIVITY_EVENT_TYPES` = `["lesson_start", "step_complete", "lesson_complete", "story_start", "story_complete"]` plus a `refId` (the lesson or story id — "which of the two is decided by `type` rather than by a second field"). `201` on success, no cadence floor, and the web app's `trackEvent` sends it fire-and-forget with `retries: 0`.
- `GET /api/children/:id/learning-time` (PIN-gated, parent side) returns minutes per `LEARNING_TIME_RANGES` — the dashboard's source in M26, not this file's.
- **The native difference:** there is no `document.visibilityState`. `AppState` reports `active | background | inactive` (iOS adds `inactive` during app-switcher transitions and incoming calls). Backgrounding must stop the beat, exactly as a hidden tab does — otherwise "a lesson left open in another window would bill a whole afternoon of screen time — and file 28 would lock a child out of a device they had not been using". On a phone, that is not a hypothetical: children put devices down mid-lesson constantly.
- M13's lesson player and M23's story reader are the two mount sites, both already built with the call site left ready.

## Detailed Requirements

1. **`lib/use-heartbeat.ts`** — `useHeartbeat({ enabled }: { enabled?: boolean }) => { minutesToday: number | null }`. Same signature, same semantics and the same no-retry rule as the web hook. Port the file, then change only what the platform requires.
2. **`AppState` replaces visibility.** Start beating when the app is `active`, stop on `background` **and** `inactive`. Treat `inactive` as stopped: on iOS it covers the app switcher, a notification shade pull-down and an incoming call, and none of those have a child learning. A short `inactive` blip costs at most one beat, which the server's tail credit already absorbs.
3. **Screen focus matters too.** `AppState` is app-wide; a child who navigates from the lesson player to the home screen is still `active`. The hook is therefore mounted per screen and must also stop when the screen loses focus — combine `AppState` with expo-router's `useIsFocused`/`useFocusEffect` so both conditions must hold. This is the native equivalent of the web hook's "mount on learning surfaces only".
4. **Immediate first beat.** One beat on becoming active-and-focused, then the 30s interval — same as the web hook, so a two-minute story earns its minutes.
5. **`lib/track-event.ts`** — `trackEvent(type: ActivityEventType, refId: string): void`, fire-and-forget, `retries: 0`, no `await` at any call site. Ported from the web app's `trackEvent`, minus the `console.warn` (`document/standards/general.md` — no console output in shipped code; a failed milestone is a silent precision loss by design).
6. **Call sites, and only these:**
   - lesson player (M13): `useHeartbeat({ enabled: ready && !locked })`, `trackEvent("lesson_start", lessonId)` on mount, `trackEvent("lesson_complete", lessonId)` after the completion call;
   - story reader (M23): `useHeartbeat({ enabled: ready })`, `trackEvent("story_start", storyId)` on mount, `trackEvent("story_complete", storyId)` after completion.
   Nothing else in the app mounts the heartbeat. Add a comment at both call sites naming the rule, because the next person's instinct will be to hoist it into a layout.
7. **`minutesToday` display.** Where a student surface shows today's minutes, it shows what the server returned and nothing else — no local increment between beats. `null` renders as no figure, never as `0`.
8. **Backgrounding during a lesson does not lose progress.** The beat stops; the lesson state stays; resuming restarts the beat with an immediate tick. Verify the whole cycle on a device, including a long background (10+ minutes) to confirm the server's minutes do not include the gap.
9. **Tests** (`lib/use-heartbeat.test.tsx`, `lib/track-event.test.ts`) with fake timers and mocked `apiFetch`/`AppState`: a beat fires immediately on mount; further beats at 30s intervals; backgrounding stops the beats and returning fires one immediately; `inactive` also stops; losing screen focus stops even while `active`; `enabled: false` never beats; a failed beat is not retried and `minutesToday` keeps its previous value; `minutesToday` starts `null`; `trackEvent` posts once with `retries: 0` and never throws to the caller.

## Technical Approach & Suggestions

```
apps/mobile/lib/use-heartbeat.ts
apps/mobile/lib/use-heartbeat.test.tsx
apps/mobile/lib/track-event.ts
apps/mobile/lib/track-event.test.ts
apps/mobile/app/(student)/lesson/[id].tsx        # + heartbeat + lesson milestones
apps/mobile/app/(student)/stories/[id].tsx       # + heartbeat + story milestones
```

The hook, with both gates combined:

```ts
const HEARTBEAT_INTERVAL_MS = 30_000;

export function useHeartbeat({ enabled = true }: { enabled?: boolean } = {}): {
  minutesToday: number | null;
} {
  const [minutesToday, setMinutesToday] = useState<number | null>(null);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!enabled || !isFocused) return;

    let isCurrent = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const send = () => {
      void apiFetch<HeartbeatResponse>("/api/events/heartbeat", {
        method: "POST",
        // No retries: the next tick supersedes a dropped beat, and a queue of
        // stale retries would report a child's timeline out of order.
        retries: 0,
      }).then((result) => {
        if (!isCurrent || !result.ok) return;
        setMinutesToday(result.data.minutesToday);
      });
    };

    const start = () => {
      if (timer !== undefined) return;
      send();                                     // a short visit still earns its interval
      timer = setInterval(send, HEARTBEAT_INTERVAL_MS);
    };

    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    // A backgrounded app has no child in front of it. `inactive` counts as
    // stopped: on iOS it is the app switcher, the notification shade and an
    // incoming call, none of which is learning.
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") start();
      else stop();
    });

    if (AppState.currentState === "active") start();

    return () => {
      isCurrent = false;
      stop();
      subscription.remove();
    };
  }, [enabled, isFocused]);

  return { minutesToday };
}
```

`trackEvent`, unchanged in spirit from the web version:

```ts
export function trackEvent(type: ActivityEventType, refId: string): void {
  const body: ActivityEventReport = { type, refId };
  // Fire-and-forget. A missing milestone costs a report some precision; a
  // duplicate from a retry would put two milestones in the log for one crossing.
  void apiFetch<{ event: ActivityEventResponse }>("/api/events/activity", {
    method: "POST",
    body: JSON.stringify(body),
    retries: 0,
  });
}
```

Test the interval with fake timers and drive `AppState` through its mock rather than trying to background a real app in Jest:

```ts
jest.useFakeTimers();
const { result } = renderHook(() => useHeartbeat());
expect(apiFetch).toHaveBeenCalledTimes(1);          // immediate beat
jest.advanceTimersByTime(30_000);
expect(apiFetch).toHaveBeenCalledTimes(2);
act(() => emitAppState("background"));
jest.advanceTimersByTime(90_000);
expect(apiFetch).toHaveBeenCalledTimes(2);          // silent while backgrounded
```

The long-background check cannot be faked — do it on a device with the server running, and compare `GET /api/children/:id/learning-time` before and after a 10-minute background.

## Step-by-Step Plan

1. Read `apps/web/lib/use-heartbeat.ts` in full, including the docstring rules. (~15 min)
2. Write the failing hook tests (immediate beat, interval, background stop, `inactive` stop, focus loss, `enabled: false`, no retry, `null` start). (~45 min)
3. Implement `lib/use-heartbeat.ts` with the combined `AppState` + focus gate until green. (~35 min)
4. Write `lib/track-event.ts` + its test. (~20 min)
5. Mount the hook and the milestones in the lesson player, with the "learning surfaces only" comment. (~20 min)
6. Mount the hook and the milestones in the story reader, same comment. (~20 min)
7. Device check: start a lesson, watch minutes climb via the parent dashboard endpoint (curl is fine at this stage), background the app for 10+ minutes, return, and confirm the gap is not billed. (~35 min)
8. Grep the app for any other `useHeartbeat` call site and confirm there are exactly two. (~10 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] The client holds no timer, accumulator or stored total; `minutesToday` is whatever the last successful beat returned, and `null` before the first.
- [ ] A beat fires immediately on becoming active-and-focused, then every 30 seconds.
- [ ] Backgrounding **and** `inactive` both stop the beats; returning to `active` fires one immediately.
- [ ] Losing screen focus stops the beats even while the app is `active`.
- [ ] `enabled: false` never beats — a loading screen or a lock screen bills nothing.
- [ ] A failed beat is not retried and does not lower or clear `minutesToday`.
- [ ] A 10-minute background during a lesson is **not** billed, verified against `GET /api/children/:id/learning-time` on a real device.
- [ ] The heartbeat is mounted in exactly two places: the lesson player and the story reader, each with the rule stated in a comment.
- [ ] `trackEvent` posts `lesson_start`, `lesson_complete`, `story_start` and `story_complete` fire-and-forget with no retries and no console output.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Screen-time enforcement — M25 consumes the minutes this file's beats produce.
- The parent dashboard's minute cards — M26.
- Any client-side computation of elapsed time. Deliberately impossible here, and that is the anti-tamper design.
- Background beats. A backgrounded app must be silent; keeping a timer alive would be both a battery cost and a false record.
- Offline queueing of beats. A beat is only meaningful at the moment it arrives.
