# M29 — Performance, Stability & Crash Reporting

> **Estimated effort:** 3–4 hours
> **Depends on:** M28
> **Requirement IDs:** NFR-PERF-01..04, NFR-SAFE-02, plan §12
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Make the app survive contact with real devices and real networks: an asset and bundle budget, image and audio caching, error boundaries so one bad payload cannot white-screen a child, the slow-network experience polished, and crash reporting that tells you what broke **without** collecting a child's data — which on a Kids Category app is a rule, not a preference.

## Context & Current State

- M28 produced measured frame-drop numbers for the four hot surfaces (drag-drop, tracing, the reward celebration, long lists) in `document/implementation-mobile/notes/a11y-device-pass.md`. This file works against that baseline rather than guessing.
- NFR-PERF-04's retry machinery already exists: M04's `apiFetch` retries 5xx and connection failures with `[1500, 4000]` backoff and signals `onColdStart`. Web file 38 put the API on an always-on host, so what that flag now reports is a **slow or flaky mobile connection**, not a sleeping server — the trigger changed, the need did not. What is missing is a consistent, warm experience wherever it fires.
- **The compliance constraint that shapes this file** (`document/mobile-app-plan.md` §12, Apple guideline 1.3/5.1.4): no third-party advertising, and **no third-party analytics without verifiable parental consent**. A crash reporter is a third-party SDK. It can be justified as diagnostic rather than analytic, but only if it collects no personal data, is not used for tracking, is disclosed in the privacy policy and the Play Data Safety form, and is switched off on kid surfaces if any doubt remains. Decide deliberately and record the decision — see requirement 6.
- NFR-SAFE-02: a child's first name is personal data. It must never reach a crash payload, a breadcrumb or a log line.
- Expo gives `expo-image` (memory + disk caching), `expo-updates` (OTA, configured in M31), and Hermes' own bundle metrics. `react-native-bundle-visualizer` or Expo's `--dump-sourcemap` output can show what is actually large.
- `document/standards/general.md` forbids leftover `console.log`; anything that must be observable in production goes through the reporting path chosen here, not a console call.

## Detailed Requirements

1. **Bundle and asset budget, measured then written down.** Produce a production bundle, inspect what is in it, and record the numbers in the notes file. Then act on the obvious: check whether Lottie (M21) and any icon set are pulling more than they earn, confirm no dev-only dependency is in the production graph, and confirm the bundled SFX (M14) total is small. State a budget figure the team will hold to, so a future dependency has something to be measured against.
2. **Image caching.** Set `expo-image`'s cache policy explicitly per surface: world covers, story covers, badge and character art are long-lived (`memory-disk`); activity and quiz option images are per-lesson and can be memory-first. Confirm on a device that re-entering a world does not re-download its covers. Cap the number of prefetch targets per screen — M22's shelves and M12's paths must not prefetch a whole library.
3. **Audio memory.** M14 creates a short-sound player per SFX call; confirm players are released and that rapid tapping does not accumulate them. If they do, pool the players — this is exactly the kind of leak that only shows up after ten minutes of play.
4. **List performance.** Apply the M28 findings: `FlatList` tuning (`initialNumToRender`, `windowSize`, `getItemLayout` for fixed-size cells, `removeClippedSubviews` on Android) for the story library, the world path, and the dashboard's activity timeline. Re-measure and record.
5. **Error boundaries — three levels, deliberately.**
   - **App root**: catches anything unhandled, shows a calm recovery screen with one action (restart), and reports.
   - **Route group**: separate boundaries around `(student)` and `(parent)` so a failure on one surface does not blank the other.
   - **Step and activity level**: a boundary around each lesson step and each activity/quiz renderer so a single malformed payload degrades to "this bit is unavailable, carry on" rather than ending the lesson. M16's and M19's parse-and-skip behaviour already covers *known* bad data; the boundary covers the unknown.
   The kid-facing recovery UI is mascot plus ≤4 words plus one big button, never a stack trace or an error code.
6. **Crash reporting decision — record it explicitly.** Evaluate and choose:
   - **(a)** the store consoles' built-in crash reporting only (Play Console Vitals, Xcode Organizer / App Store Connect). Zero third-party SDK, zero disclosure burden, but native-only crashes and no JS stack detail;
   - **(b)** Sentry (`@sentry/react-native`) configured for **diagnostics only**: no user identification, no breadcrumbs containing content, PII scrubbing on, session replay off, performance tracing off, and disabled entirely on kid surfaces if any doubt remains.
   **Recommendation: start with (a) for launch**, because it needs no disclosure and no SDK on a child's device, and revisit (b) if the store dashboards prove too coarse. Whichever is chosen, write the decision, its reasoning and its data-collection consequences into `document/implementation-mobile/notes/observability.md` — M30's privacy policy and Data Safety form must match it exactly.
7. **If (b) is chosen, scrub aggressively.** A `beforeSend` hook that drops any event whose payload contains a child's first name or a URL with an id, `sendDefaultPii: false`, no `setUser`, and a manual review of one real captured event before shipping. Verify the scrubbing with a deliberate test crash containing a name.
8. **Slow-response experience.** One consistent treatment everywhere `onColdStart` fires: the mascot "waking up" state on kid surfaces, a calm line on parent surfaces, and never a raw error while a retry is still pending. Add a longer-wait escalation ("still waking up — thanks for waiting") so a long stall does not look like a hang. Measure real response times against the deployed API on a throttled connection — the server is always on, so the numbers come from network conditions, not a wake — and tune the copy thresholds to what you measure.
9. **App start time.** Measure cold app start on the low-end Android device. The splash is held for fonts, i18n and the session (M02/M03/M07) — confirm none of them is doing avoidable work, and that a failed session read does not extend the splash indefinitely (it must fall through to the login screen).
10. **No console output in production.** Grep for `console.` and remove or route what remains. Configure the production build to strip any that survive.
11. **Tests** (`components/ErrorBoundary.test.tsx`, plus targeted ones): a throwing child component renders the recovery UI and does not unmount the rest of the app; a step-level boundary keeps the lesson walkable; the boundary reports through the chosen path (mocked); if Sentry is chosen, `beforeSend` drops an event containing a child's name; image cache policy is set per surface (assert the prop, cheap but it catches a regression).

## Technical Approach & Suggestions

```
document/implementation-mobile/notes/observability.md      # the crash-reporting decision + consequences
document/implementation-mobile/notes/performance.md         # measurements, budgets, before/after
apps/mobile/components/ErrorBoundary.tsx
apps/mobile/components/ErrorBoundary.test.tsx
apps/mobile/components/student/KidRecovery.tsx
apps/mobile/lib/report-error.ts                             # single reporting seam
apps/mobile/lib/image-cache.ts                              # per-surface cache policy constants
```

One reporting seam, so the choice in requirement 6 is a one-file change later:

```ts
// apps/mobile/lib/report-error.ts
/**
 * The single place an error leaves the app. Today it is a no-op beyond the store
 * consoles' own native crash capture (see notes/observability.md); if a
 * third-party reporter is ever added, it is added here and nowhere else — which
 * is also what keeps the privacy disclosure accurate.
 */
export function reportError(error: unknown, context?: { screen?: string }): void {
  if (__DEV__) throw error;   // fail loudly in development
  // Production: intentionally silent. No PII, no third-party SDK on a child's device.
  void error;
  void context;
}
```

Error boundary with a surface-appropriate fallback:

```tsx
export class ErrorBoundary extends React.Component<Props, State> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error, { screen: this.props.screen });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Never a stack trace, never an error code on a kid surface.
    return this.props.surface === "kid" ? <KidRecovery onRetry={this.reset} /> : <ParentRecovery onRetry={this.reset} />;
  }
}
```

Step-level boundaries are what turn a content bug into a shrug:

```tsx
<ErrorBoundary surface="kid" screen={`lesson-step-${step}`} fallback="skippable">
  {renderStep(step)}
</ErrorBoundary>
```

Cache policy as data rather than scattered props:

```ts
// apps/mobile/lib/image-cache.ts
export const CACHE = {
  worldCover: "memory-disk",
  storyCover: "memory-disk",
  badgeArt: "memory-disk",
  activityAsset: "memory",     // per-lesson, not worth disk
} as const;
```

Slow-response escalation on a timer, with copy tuned to measured response times:

```tsx
const [waited, setWaited] = useState(0);
useEffect(() => {
  const id = setInterval(() => setWaited((w) => w + 1), 1000);
  return () => clearInterval(id);
}, []);

// Thresholds set from measured throttled-network response times, not invented.
const message = waited < 6 ? t("common:waking") : t("common:stillWaking");
```

## Step-by-Step Plan

1. Read M28's notes for the baseline numbers; create `notes/performance.md` from them. (~15 min)
2. Produce a production bundle, inspect its composition, record the figures and state a budget. Remove anything unjustified. (~40 min)
3. Add `lib/image-cache.ts`, apply per-surface policies, and verify on device that revisiting a world re-uses cached covers. Cap prefetch counts. (~30 min)
4. Audit M14's SFX players for accumulation under rapid tapping; pool them if needed. (~25 min)
5. Apply the `FlatList` tuning from M28's findings and re-measure the library scroll. (~30 min)
6. Build `ErrorBoundary`, `KidRecovery` and `ParentRecovery`; install boundaries at root, per route group, and around each lesson step and activity/quiz renderer. Test each level. (~50 min)
7. Make the crash-reporting decision, write `notes/observability.md`, and implement `lib/report-error.ts` accordingly (including the scrubbing and the deliberate name-containing test crash if Sentry is chosen). (~40 min)
8. Unify the cold-start treatment with the escalation copy in both languages. (~25 min)
9. Measure cold app start on the low-end Android device; confirm a failed session read falls through rather than extending the splash. (~25 min)
10. Grep for `console.`, remove what remains, and confirm the production build strips any survivors. (~15 min)
11. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] Production bundle composition is measured and recorded, with a stated budget and any unjustified dependency removed.
- [ ] Image cache policy is set per surface; revisiting a world or the story library re-uses cached art on a real device.
- [ ] Rapid tapping does not accumulate audio players over a ten-minute session.
- [ ] List performance for the story library, world path and activity timeline is measurably improved against M28's baseline, with numbers recorded.
- [ ] Error boundaries exist at app root, per route group, and around each lesson step and activity/quiz renderer; a thrown error in one step leaves the rest of the lesson walkable.
- [ ] Kid-facing recovery UI is mascot plus ≤4 words plus one big button — no stack trace, no error code.
- [ ] The crash-reporting decision is implemented behind the single `reportError` seam and documented in `notes/observability.md`, and it matches what M30 will declare in the privacy policy and Data Safety form.
- [ ] No child's name, and no personal data, can reach a crash payload — verified deliberately if a third-party reporter was chosen.
- [ ] Cold-start handling is consistent app-wide with a longer-wait escalation, in EN and BN, and never shows a raw error while a retry is pending.
- [ ] Cold app-start time on the low-end Android device is measured and recorded; a failed session read falls through to the login screen rather than holding the splash.
- [ ] No `console.*` call remains in shipped code.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Product analytics of any kind (screen views, funnels, retention). On a Kids Category app this needs verifiable parental consent, and the product has no measurement plan that would justify it at MVP.
- OTA update configuration — M31 (`expo-updates` channels and `runtimeVersion`).
- Server-side performance and hosting — web file 38 and its own tuning.
- Offline mode — out of scope for the plan (§3.2).
- A/B testing or feature flags. No infrastructure for it, and no experiment worth running on children at launch.
