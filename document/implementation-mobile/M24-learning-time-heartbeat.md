# M24 — Learning-Time Heartbeat

> **Estimated effort:** 3–4 hours
> **Depends on:** M13
> **Requirement IDs:** FR-TIME-06, FR-DASH-02 (data), FR-LSN-07
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Report presence honestly. Port the web app's heartbeat to native, with `AppState` in place of the Page Visibility API — so a phone left face-down on a table stops billing learning minutes — plus the discrete milestone events (`lesson_start`, `story_complete`, …) that mark what a sitting was spent on. The client measures nothing; the server derives every minute.

## Context & Current State

- `apps/web/features/screen-time/use-heartbeat.ts` is the reference (no docstring any more — the rules below are what it does):
  - **It measures nothing.** No timer whose elapsed value it reports, no accumulator, no stored total. It posts "I am here" every 30 seconds and reads back what the server says, so refreshing, clearing storage or editing state cannot lower a figure that was never held on the client.
  - **Cadence:** `HEARTBEAT_INTERVAL_MS = 30_000`, matching the server's 30s tail credit. One beat fires immediately on mount and again on becoming visible, so a short visit is worth its interval instead of nothing. Beats run only while visible.
  - **Mount on learning surfaces only** — `LessonPlayer.tsx` (`useHeartbeat({ enabled: load.status === "ready" && !isPreview })`) and `StoryReader.tsx` (`useHeartbeat()` inside `ReadingSurface`, so the loading and "put away" states are not reading time). Never the profile picker, home screen, or a parent layout: a dashboard left open would bill an adult's afternoon to the child.
  - **`enabled` is the same rule one level up**: a screen showing a loader or the screen-time lock has no child learning in front of it, and the heartbeat endpoint is not screen-time gated — a caller that mounts the hook above its own ready state would bill a child for staring at "time's up".
  - **No retries:** `retries: 0`. A failed beat is superseded by the next tick, and stale retries would report the timeline out of order. `minutesToday` keeps its previous value until a beat lands; `null` until the first one does.
- `POST /api/events/heartbeat` takes **no body** and answers `200` with `HeartbeatResponse` = `{ recorded, minutesToday }` (whole minutes in the deployment's `APP_TIMEZONE` day). The server drops a beat that lands within `HEARTBEAT_MIN_INTERVAL_MS = 20_000` of the previous one from either source (`recorded: false`, `minutesToday` still honest) — `apps/server/src/modules/progress/session-event.service.ts`.
- **The route is consent-gated.** `/api/events/*` sits behind `requireParent → requireConsent → requireActiveChild` (`apps/server/src/modules/index.ts`). After a `CONSENT_VERSION` bump a beat gets `403 CONSENT_REQUIRED`; M04's global handler (the native `onConsentRequired`, as `apps/web/shared/api/api-client.ts`) routes to consent. The hook does nothing special with it — `retries: 0` already means no loop.
- **Minutes are derived, not counted.** `computeLearningMinutes` (`modules/progress/learning-time.service.ts`) sorts every `sessionEvent` timestamp in the window: a gap over `LEARNING_TIME_GAP_MS = 90_000` starts a new sitting and each sitting earns `LEARNING_TIME_TAIL_MS = 30_000` after its last event. Every step or completion write on a lesson also records a **server-observed beat** (`recordServerObservedBeat`, payload `{ source: "server", activity }`), so a client that never beats is still billed for the lesson it plays — the heartbeat fills gaps, it is not the only source.
- `POST /api/events/activity` records one milestone: `ACTIVITY_EVENT_TYPES` = `["lesson_start", "step_complete", "lesson_complete", "story_start", "story_complete"]` plus `refId`. `201` on success. It counts towards `CLIENT_EVENTS_PER_MINUTE = 30` per child (shared with `/api/progress/events`; heartbeats excluded) → `429 RATE_LIMITED`. `story_start` is screen-time gated (`423`), because a recent one exempts the story's completion from the gate, and it is the evidence `POST /api/progress/stories/:id/complete` needs (`409 STORY_NOT_STARTED` without one in the last 3h).
- `GET /api/children/:id/learning-time?range=today|week|month` (parent session, ownership-checked) returns `{ range, minutes, from, to }` — the dashboard's source in M26, not this file's.
- **The native difference:** there is no `document.visibilityState`. `AppState` reports `active | background | inactive` (iOS reports `inactive` during app-switcher transitions, the notification shade and incoming calls). Backgrounding must stop the beat, exactly as a hidden tab does — otherwise a phone left face-down mid-lesson bills an afternoon, and M25's limit locks a child out of a device they had not been using.
- M13's lesson player and M23's story reader are the two mount sites, both already built with the call site left ready.

## Detailed Requirements

1. **`lib/use-heartbeat.ts`** — `useHeartbeat({ enabled }: { enabled?: boolean }) => { minutesToday: number | null }`. Same signature, same semantics and the same no-retry rule as the web hook. Port the file, then change only what the platform requires.
2. **`AppState` replaces visibility.** Start beating — with an immediate send — when the app becomes `active`, stop on `background` **and** `inactive`. Treat `inactive` as stopped: on iOS it covers the app switcher, a notification shade pull-down and an incoming call, and none of those have a child learning. A short `inactive` blip costs at most one beat, which the server's tail credit already absorbs.
3. **Screen focus matters too.** `AppState` is app-wide; a child who navigates from the lesson player to the home screen is still `active`. The hook is therefore mounted per screen and must also stop when the screen loses focus — combine `AppState` with expo-router's `useIsFocused`/`useFocusEffect` so both conditions must hold. This is the native equivalent of the web hook's "mount on learning surfaces only".
4. **Immediate first beat.** One beat on becoming active-and-focused, then the 30s interval — same as the web hook, so a two-minute story earns its minutes.
5. **`lib/track-event.ts`** — `trackEvent(type: ActivityEventType, refId: string): void`, fire-and-forget, `retries: 0`, no `await` at any call site. Ported from the web app's `trackEvent`, failure logging included (M29 routes console output into crash reporting for production builds). A failed milestone is a precision loss, never a user-facing error. M23 may land first and create this file for `story_start`; if it exists, extend it rather than recreate it.
6. **Call sites, and only these:**
   - lesson player (M13): `useHeartbeat({ enabled: ready })` — a `423` on the lesson read means it never reaches `ready`, and mobile has no admin preview, so web's `!isPreview` has no counterpart. **No `trackEvent` here** — the web lesson player reports `lesson_start` / `step_complete` / `lesson_complete` solely through `POST /api/progress/events` (M13), and sending them to both surfaces would double-count milestones;
   - story reader (M23): `useHeartbeat({ enabled: ready })`, `trackEvent("story_start", storyId)` once per mount, `trackEvent("story_complete", storyId)` when completion is requested (as `StoryReader.tsx` does). A lost `story_start` surfaces later as `409 STORY_NOT_STARTED` on completion, which M23 already treats as non-fatal to the child.
   Nothing else in the app mounts the heartbeat. Add a comment at both call sites naming the rule, because the next person's instinct will be to hoist it into a layout.
7. **Error codes need no local handling.** `403 CONSENT_REQUIRED` goes to M04's global consent handler; `429 RATE_LIMITED` and `423` on `story_start` are dropped like any other failure. Never retry, never loop.
8. **`minutesToday` display.** Where a student surface shows today's minutes, it shows what the server returned and nothing else — no local increment between beats. `null` renders as no figure, never as `0`.
9. **Backgrounding during a lesson does not lose progress.** The beat stops; the lesson state stays; resuming restarts the beat with an immediate tick. Verify the whole cycle on a device, including a long background (10+ minutes) to confirm the server's minutes do not include the gap.
10. **Tests** (`lib/use-heartbeat.test.tsx`, `lib/track-event.test.ts`) with fake timers and mocked `apiFetch`/`AppState`: a beat fires immediately on mount; further beats at 30s intervals; backgrounding stops the beats and returning fires one immediately; `inactive` also stops; losing screen focus stops even while `active`; `enabled: false` never beats; a failed beat is not retried and `minutesToday` keeps its previous value; `minutesToday` starts `null`; a `403 CONSENT_REQUIRED` beat is not retried and the interval keeps its cadence; `trackEvent` posts once with `retries: 0` and never throws to the caller.

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

The long-background check cannot be faked — do it on a device with the server running, and compare `GET /api/children/:id/learning-time` before and after a 10-minute background. Expect at most the 30s tail for the sitting that ended; the 90s gap rule means the background itself is never billed, and the next lesson write's server-observed beat starts a new sitting.

## Step-by-Step Plan

1. Read `apps/web/features/screen-time/use-heartbeat.ts` in full, plus `session-event.service.ts` and `computeLearningMinutes` on the server. (~15 min)
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
- [ ] A failed beat (including `403 CONSENT_REQUIRED`) is not retried and does not lower or clear `minutesToday`; a consent `403` reaches the global handler.
- [ ] A 10-minute background during a lesson is **not** billed, verified against `GET /api/children/:id/learning-time` on a real device.
- [ ] The heartbeat is mounted in exactly two places: the lesson player and the story reader, each with the rule stated in a comment.
- [ ] `trackEvent` posts `story_start` and `story_complete` fire-and-forget with no retries.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Screen-time enforcement — M25 consumes the minutes this file's beats produce.
- The parent dashboard's minute cards — M26.
- Any client-side computation of elapsed time. Deliberately impossible here, and that is the anti-tamper design.
- Background beats. A backgrounded app must be silent; keeping a timer alive would be both a battery cost and a false record.
- Offline queueing of beats. A beat is only meaningful at the moment it arrives.
