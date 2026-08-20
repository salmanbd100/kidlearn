# M25 — Screen-Time Controls & Friendly Lockout

> **Estimated effort:** 3–4 hours
> **Depends on:** M24
> **Requirement IDs:** FR-TIME-01, FR-TIME-02, FR-TIME-03, FR-TIME-04, FR-TIME-05
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Two halves of the same feature: the **parent's** screen-time settings screen (daily limit, access window, per child) and the **child's** friendly lockout — the real lock screen that replaces M12's and M22's placeholders, driven by the server's status read and the `423` on content start, and re-checked when the app returns to the foreground.

## Context & Current State

- Server side is complete and its design decisions constrain this file:
  - `GET /api/screen-time/status` (student surface, behind `requireActiveChild`) → `ScreenTimeStatusResponse` with a `reason` (`ScreenTimeBlockCode`: `"TIME_LIMIT_REACHED" | "OUTSIDE_WINDOW"`, or null when allowed) and `windowStart` (`"HH:MM"` when a window is set — "what the lock screen names").
  - `GET /api/children/:id/screen-time` and `PATCH /api/children/:id/screen-time` (parent side, `requirePinVerified` + `loadOwnedChild`) → `ScreenTimeSettingResponse` / `ScreenTimeUpdateSchema`. The PATCH is **not a partial update**: "the three fields are one policy, and a body that could carry a window without a limit would make 'clear the window' indistinguishable from 'leave the window alone'. Every field is required and nullable instead, so turning something off is a value a parent sends rather than a key they omit."
  - `SCREEN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60, 90]` — and `packages/types` carries a compile-time assertion that the picker's options and the schema agree, "so a value added to `SCREEN_TIME_LIMIT_OPTIONS` without widening the schema (or the reverse) is a `pnpm typecheck` failure rather than a picker offering a value the API rejects". Build the picker from that constant.
  - `TIME_OF_DAY_PATTERN` / `TimeOfDaySchema` — anchored 24-hour `"HH:MM"`; `"25:00"` and `"9:5"` are both rejected.
  - `enforceScreenTime` answers **`423 Locked`**, deliberately not `403`: "the request is well-formed and the caller is exactly who they claim to be — the *resource* is unavailable for a reason that will pass on its own. A `403` would be indistinguishable from the PIN gate's, and the client branches on the code for two different mascot screens."
  - The gate sits **only** on lesson-detail and story-detail reads. Step reports, event posts and list endpoints are never gated, so a lesson in progress is always finishable (FR-TIME-03).
- `apps/web/lib/use-screen-time-gate.ts` is the reference and states the two rules that matter most:
  - **checked on load *and* again on the tap** — the load check stops a blocked child seeing a home screen full of lessons they cannot open; the tap check stops a child who has been on the page for twenty minutes walking into a limit that has since been reached;
  - **a failed check never blocks** — "failing closed here would turn a dropped request into a lockout with no explanation, on a surface where the only recourse is a five-year-old asking a grown-up".
- M12 and M22 already branch on `423` and render `ScreenTimeLockPlaceholder`; this file replaces it with the real screen in one change.
- M08's `PinGate` already re-checks on foreground; this file's foreground re-check must behave consistently — the same class of bug, the same fix.
- M09's child cards link to the screen-time screen. M05 gives `Card`, `Sheet`, `BigButton`.

## Detailed Requirements

### Parent side

1. **`lib/screen-time-api.ts`** — `getScreenTimeSetting(childId)`, `updateScreenTimeSetting(childId, update)` (whole policy, every field present and nullable) and `getScreenTimeStatus()` for the student surface. Types from `packages/types`.
2. **Settings screen** (`app/(parent)/children/[id]/screen-time.tsx`) — behind the PIN gate, per child:
   - **Daily limit**: a segmented picker built from `SCREEN_TIME_LIMIT_OPTIONS` plus an explicit "No limit" option that sends `null`.
   - **Access window**: two native time pickers (`start`, `end`) plus a switch to turn the window off (sending `null` for both). Never a free-text time field — `TIME_OF_DAY_PATTERN` exists because "9:5" is a thing people type.
   - A plain-language summary sentence of the current policy ("Rina can learn for 30 minutes a day, between 07:00 and 19:00"), localised, so a parent can confirm the effect without re-reading the controls.
   - Save sends the **whole** policy and shows the server's error mapped by code on failure.
3. **Window validation before submit.** `end` after `start`, both matching `TimeOfDaySchema`. Validate with the schema, not a hand-rolled comparison, and surface the field error inline.
4. **Effect explained honestly.** A note that a lesson already in progress is always finishable (FR-TIME-03) — parents otherwise report it as a bug when a child keeps playing for two more minutes.

### Child side

5. **`lib/use-screen-time-gate.ts`** — ported from the web hook with its semantics preserved: `{ block, windowStart, guardStart(start) }`, where `block` is `undefined` while the first check is in flight, `null` when allowed; `guardStart` re-checks and only then runs the navigation; **a failed check never blocks**.
6. **Foreground re-check.** On `AppState` returning to `active`, re-read the status. A device picked up hours later must not still be showing an unlocked home screen — and the JS timers that would otherwise have noticed were frozen. Behave the same way M08's gate does.
7. **The real lock screen** (`components/student/ScreenTimeLock.tsx`) — full-bleed, kid register, replacing the placeholder in M12 and M22:
   - `TIME_LIMIT_REACHED` → mascot resting, ≤4 words ("All done today!"), narration, and a "come back tomorrow" line;
   - `OUTSIDE_WINDOW` → mascot asleep, and where `windowStart` is set, a localised "Back at 7 o'clock" using `windowStart` (formatted through M03's `lib/format.ts`, not string-concatenated);
   - a single ≥64px way back to the home screen, and **no** retry button that would let a child hammer the endpoint;
   - no scolding, no countdown timer (a clock a child watches tick is a worse experience than a closed door).
8. **Lock placement.** The lock renders where a start is refused — on the world screen's lesson tap and the library's story tap — and as a full screen when the status read at home time says the child is blocked. The home screen and lists stay browsable, exactly as the server's design intends.
9. **Mid-lesson behaviour.** A lesson in progress finishes. Do not add a client-side interruption; the server does not, and cutting a child off between the quiz and the reward would lose the work they just did.
10. **Heartbeat interaction.** While the lock screen is showing, `useHeartbeat` must be `enabled: false` (M24's rule — "a visible tab that is showing … the screen-time lock screen has no child *learning* in front of it"). Verify no beats fire on the lock screen.
11. **Tests** (`lib/use-screen-time-gate.test.tsx`, `components/student/ScreenTimeLock.test.tsx`, `app/(parent)/children/[id]/screen-time.test.tsx`): the gate starts `undefined`, resolves to `null` when allowed and to the code when blocked; a failed status read yields `null` (never a block); `guardStart` re-checks before running and does not run when newly blocked; foregrounding re-reads the status; the lock renders the right copy per code and includes `windowStart` when present; the lock has no retry control; no heartbeat fires while the lock is shown; the parent form sends the whole policy including explicit `null`s; an invalid window is rejected before submit; the limit picker offers exactly `SCREEN_TIME_LIMIT_OPTIONS` plus "No limit".

## Technical Approach & Suggestions

```
apps/mobile/lib/screen-time-api.ts
apps/mobile/lib/use-screen-time-gate.ts
apps/mobile/lib/use-screen-time-gate.test.tsx
apps/mobile/components/student/ScreenTimeLock.tsx
apps/mobile/components/student/ScreenTimeLock.test.tsx
apps/mobile/components/parent/ScreenTimeForm.tsx
apps/mobile/app/(parent)/children/[id]/screen-time.tsx
apps/mobile/app/(parent)/children/[id]/screen-time.test.tsx
```

The gate, ported with its fail-open rule intact:

```ts
export function useScreenTimeGate(): ScreenTimeGate {
  const [block, setBlock] = useState<ScreenTimeBlockCode | null | undefined>(undefined);
  const [windowStart, setWindowStart] = useState<string | null>(null);

  const read = useCallback(async () => {
    const result = await getScreenTimeStatus();
    // A failed read is not a block: failing closed would turn a dropped request
    // into a lockout whose only recourse is a five-year-old asking a grown-up.
    setBlock(result.ok ? result.data.reason : null);
    if (result.ok) setWindowStart(result.data.windowStart);
    return result;
  }, []);

  useEffect(() => { void read(); }, [read]);

  // Timers froze while the app was backgrounded; the server is the only thing
  // that knows what time it is now. Same rule as the PIN gate (M08).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void read();
    });
    return () => sub.remove();
  }, [read]);

  const guardStart = useCallback(async (start: () => void) => {
    const result = await read();
    if (result.ok && result.data.reason) return;   // newly blocked — the lock shows
    start();
  }, [read]);

  return { block, windowStart, guardStart };
}
```

The limit picker, built from the constant that carries the compile-time assertion:

```tsx
import { SCREEN_TIME_LIMIT_OPTIONS } from "@kidlearn/types";

{SCREEN_TIME_LIMIT_OPTIONS.map((minutes) => (
  <SegmentOption
    key={minutes}
    label={t("parent:minutesPerDay", { count: minutes })}
    selected={dailyLimitMinutes === minutes}
    onPress={() => setDailyLimitMinutes(minutes)}
  />
))}
<SegmentOption
  label={t("parent:noLimit")}
  selected={dailyLimitMinutes === null}
  onPress={() => setDailyLimitMinutes(null)}   // an explicit null, not an omitted key
/>
```

Sending the whole policy, every time:

```ts
// Not a partial update: "clear the window" and "leave the window alone" must be
// different requests, so every field is always present and nullable.
await updateScreenTimeSetting(childId, {
  dailyLimitMinutes,          // number | null
  windowStart: windowEnabled ? windowStart : null,
  windowEnd: windowEnabled ? windowEnd : null,
});
```

Format `windowStart` for the lock screen through `lib/format.ts` so Bengali gets Bengali numerals and the right clock convention — never `` `Back at ${windowStart}` ``.

Use the platform time picker (`@react-native-community/datetimepicker` or Expo's equivalent) rather than a custom wheel: parents know their OS's picker, and it produces valid values by construction, which is half the validation problem gone.

## Step-by-Step Plan

1. Write `lib/screen-time-api.ts` and check all three endpoints against the dev server with a live PIN grant. (~25 min)
2. Port `lib/use-screen-time-gate.ts` with tests first (undefined → resolved, fail-open, `guardStart` re-check, foreground re-read). (~45 min)
3. Build the real `ScreenTimeLock` with both block-code variants, `windowStart` formatting, narration, no retry control, and its test. (~40 min)
4. Replace the placeholders in M12's world screen and M22's library with the real lock; confirm both `423` paths land on it. (~20 min)
5. Wire the gate into the home screen so a blocked child sees the lock at entry, while lists stay browsable. (~20 min)
6. Assert the heartbeat is disabled on the lock screen (add the test, then the `enabled` wiring if it is missing). (~15 min)
7. Build `ScreenTimeForm` (limit picker from the constant, native time pickers, off switch, plain-language summary) and the parent screen; test whole-policy submission and window validation. (~50 min)
8. Device pass: set a 15-minute limit, play until it trips, confirm the lock appears at the next content start and that a lesson already running finishes; set a window that has closed and check the "back at" copy in EN and BN; background the app past the window's end and confirm the foreground re-check locks it. (~40 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] A parent can set a daily limit and an access window per child, behind the PIN gate, with the picker offering exactly `SCREEN_TIME_LIMIT_OPTIONS` plus an explicit "No limit".
- [ ] Every save sends the **whole** policy with explicit `null`s; clearing a window is distinguishable from leaving it alone.
- [ ] Window times come from native pickers and are validated with `TimeOfDaySchema` before submit.
- [ ] The parent screen shows a localised plain-language summary of the effective policy.
- [ ] The status is checked on load **and** again on the tap that starts content; a failed check never blocks.
- [ ] Returning the app to the foreground re-reads the status, so a device picked up hours later locks correctly — verified on a device.
- [ ] The lock screen distinguishes `TIME_LIMIT_REACHED` from `OUTSIDE_WINDOW`, names `windowStart` through the locale formatter, has one ≥64px way home, and offers no retry control.
- [ ] Home and list screens remain browsable for a blocked child; the refusal happens at content start, matching the server's design.
- [ ] A lesson already in progress always finishes (FR-TIME-03) — no client-side interruption exists.
- [ ] No heartbeat fires while the lock screen is displayed.
- [ ] Lock copy is kid-register (≤4 words plus narration) in EN and BN, with no scolding and no countdown.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Enforcement logic. Server-side and already built (web file 28); a client-side limit is a limit a restart lifts.
- OS-level parental controls (Screen Time / Family Link / Guided Access). Worth documenting for parents in the store listing (M30), not code.
- Per-day-of-week schedules or multiple windows. Not in the schema.
- A countdown timer on the student surface. Deliberately excluded — see requirement 7.
- Notifying a parent when a limit is reached. Needs push notifications, out of scope for the plan (§3.2).
