# M28 — Accessibility & Device Pass

> **Estimated effort:** 3–4 hours
> **Depends on:** M21, M26
> **Requirement IDs:** NFR-A11Y-01..06, NFR-PERF-01, NFR-PERF-02, NFR-PERF-03, design.md §6, §7
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Verify the finished app against the accessibility and device rules the whole plan has been asserting screen by screen, and fix what fails. Earlier files established conventions; this file audits the product. Its deliverable is a completed checklist plus the fixes it forced — and an honest written record of anything deliberately left as-is.

## Context & Current State

- Every previous file carried its own a11y acceptance criteria; none of them saw the whole app. Problems that only appear across screens — inconsistent labels, focus order between a modal and its parent, a font scale that breaks one layout, a contrast pair that only occurs on one composed screen — surface here.
- The non-negotiables (design.md §7): kid touch targets ≥**64×64**, parent ≥**44×44**; visible pressed/focus state on every interactive element; decorative images with no label and meaningful images with real localised labels; the parental gate genuinely hard for a pre-reader; `prefers-reduced-motion` respected.
- Kid text is never below **20px** (design.md §3.3 / §6). Body text contrast ≥**4.5:1**, large text ≥**3:1** (§2.3). Meaning is never colour-alone.
- design.md §6: mobile-first; phones and tablets are the **primary** devices; both orientations on every kid screen; the parent dashboard fully manageable on a phone; no horizontal scroll except intentional carousels.
- NFR-PERF-01..03 target real devices, and the plan names a **low-end Android phone** as the realistic target — the highest-risk surfaces are M16–M18 (gestures), M21 (celebration) and M22 (long lists).
- Mobile-specific a11y mechanics with no web equivalent: OS **font scaling** (a parent may run 130% text and the app must not clip), the difference between `accessibilityLabel` / `accessibilityHint` / `accessibilityRole` / `accessibilityState`, `accessible` grouping so a card is one swipe rather than six, `accessibilityViewIsModal` for sheets, and the fact that a screen reader changes the *interaction model* for gestures (M16's and M18's tap fallbacks).

## Detailed Requirements

1. **Device matrix, actually run.** Every check below is performed on: a **low-end Android phone** (the realistic target), a current iPhone, and one tablet — each in **portrait and landscape**. Record device models and OS versions in the notes file so the next pass can compare.
2. **Screen-reader pass.** Walk every screen with **TalkBack** and **VoiceOver**:
   - every interactive element announces a role, a meaningful label and its state;
   - card-shaped rows (child cards, story covers, activity timeline rows) are grouped with `accessible` so they read as one item;
   - sheets and modals set `accessibilityViewIsModal` and cannot be swiped behind;
   - no element announces a raw key, a slug, an enum value (`KG1`, `TIME_LIMIT_REACHED`) or an untranslated string;
   - the drag-drop and puzzle tap fallbacks (M16/M18) are reachable and complete a lesson end to end;
   - tracing (M17) announces its skip.
   Fix every failure; where a screen genuinely cannot be made screen-reader-operable, provide a way past it and record why.
3. **Touch-target audit.** Measure, do not eyeball: add a temporary dev overlay (or use the OS layout-bounds tool on Android) that outlines every pressable and flags any under the threshold. Kid surfaces ≥64px, parent ≥44px, including the small "grown-ups" affordance, speaker buttons, page-turn controls, quiz options and every icon-only control.
4. **Font scaling.** Set the OS text size to its largest supported value and walk the app. Kid screens must not clip or truncate their ≤4-word copy; parent screens may wrap but must not lose controls off-screen. Decide per component whether to allow scaling or cap it with `maxFontSizeMultiplier` — **cap rather than clip**, and never disable scaling outright on the parent surface, where an older reader may need it most.
5. **Contrast audit.** Check every real composed pairing (not just the token table) against §2.3 with a contrast tool, including: kid text on world gradients, disabled states, chips on cards, the lock screen, and both themes. Fix by changing the composition, never by adding an off-token colour.
6. **Colour-independence audit.** Screenshot every state-carrying screen in greyscale and confirm meaning survives: quiz correct/incorrect, matched pairs, locked worlds, read stories, progress states, dashboard chips.
7. **Orientation and layout audit.** Every kid screen works in both orientations; no horizontal page scroll anywhere; safe areas clear notches and home indicators in both orientations; the keyboard does not cover the field being typed into on the PIN and child-name screens; a 360px-wide phone shows the maximum-size activity, quiz and match layouts with targets intact.
8. **Reduced motion audit.** Turn the OS setting on and walk every animated surface: activity feedback, quiz feedback, the reward celebration (M21's static summary), the world map auto-scroll, sheets, page turns. Every one must still convey what happened.
9. **Performance pass on the low-end Android device.** Measure rather than judge: run the profiler on the drag-drop activity, the tracing stroke, the reward celebration and a 60-story library scroll. Record frame drops and fix the worst offender in each. Note the numbers in the notes file so M29 has a baseline.
10. **Cross-checks against the web app.** Spot-check that the two clients agree where they must: minute formatting, quiz retry limits, reward amounts for the same lesson, and grading of the same activity fixture. A divergence found here is a bug in one of the clients, and it is cheaper to find now than in a store review.
11. **Deliverable: a written record.** `document/implementation-mobile/notes/a11y-device-pass.md` — the checklist with pass/fail per item per device, the fixes made, the measured performance numbers, and anything deliberately accepted with its reason. Store review (M30) and any future accessibility question both draw on this.
12. **Tests for what the audit fixes.** Every bug found here gets a regression test where one is possible (a target size, a missing label, a colour-independent state). An audit that leaves no tests behind will be re-run from scratch next release.

## Technical Approach & Suggestions

```
document/implementation-mobile/notes/a11y-device-pass.md   # the deliverable record
apps/mobile/components/dev/TargetOverlay.tsx               # dev-only measuring aid
apps/mobile/lib/font-scale.ts                              # shared maxFontSizeMultiplier policy
```

A dev-only overlay makes the target audit mechanical instead of subjective:

```tsx
// Rendered only when __DEV__ and a flag is on. Outlines every pressable and
// flags anything under the surface's minimum.
export function TargetOverlay({ minimum }: { minimum: number }) {
  if (!__DEV__) return null;
  // Wrap children in a measuring View and draw a red border when
  // layout.height < minimum || layout.width < minimum.
}
```

A single font-scale policy beats per-component guesses:

```ts
// apps/mobile/lib/font-scale.ts
/**
 * Kid copy is 1–4 words in a fixed-size layout, so it caps; parent copy wraps
 * and must keep scaling, because an older reader needs it more than the layout
 * needs to be tidy.
 */
export const MAX_FONT_SCALE = { kid: 1.3, parent: undefined } as const;
```

For contrast, check the *rendered* pairs — the token table can be compliant while a composition is not:

```
kid text on world gradient  → sample the gradient's darkest and lightest stops
disabled BigButton label    → opacity 0.5 changes the effective ratio
chips on card               → chip background on card background on page background
```

Run the greyscale check with the OS accessibility filter (Android: Colour correction → Greyscale; iOS: Accessibility → Display → Colour Filters → Greyscale) rather than editing screenshots — it catches live states you would not think to capture.

Use React Native's own performance monitor plus the profiler in Expo's dev tools for the frame-drop measurements, and record the actual numbers. "Felt smooth" is not a baseline M29 can improve against.

## Step-by-Step Plan

1. Create the notes file with the checklist skeleton and record the three test devices. (~20 min)
2. Build `TargetOverlay` and run the touch-target audit across every screen on the low-end Android phone; fix failures. (~45 min)
3. TalkBack pass over the whole app, screen by screen, noting and fixing label/role/state/grouping failures. (~60 min)
4. VoiceOver pass on iOS, including the modal and gesture-fallback checks. (~35 min)
5. Font-scaling pass at the largest OS setting; add `lib/font-scale.ts` and apply the policy where text clips. (~35 min)
6. Contrast and greyscale audits with the OS filters; fix compositions. (~35 min)
7. Orientation, safe-area and keyboard audit on all three devices. (~30 min)
8. Reduced-motion pass across every animated surface. (~25 min)
9. Performance measurements on the low-end Android device for the four hot surfaces; fix the worst offender in each and record before/after numbers. (~45 min)
10. Cross-check the four web/mobile agreement points. (~25 min)
11. Write up the notes file, add regression tests for every fix, run `pnpm lint && pnpm typecheck && pnpm --filter mobile test`, commit, update the tracker. (~30 min)

## Acceptance Criteria

- [ ] Every screen has been walked with TalkBack **and** VoiceOver, and every interactive element announces role, meaningful label and state.
- [ ] No element announces a slug, enum, raw translation key or untranslated string.
- [ ] Every pressable measures ≥64px on kid surfaces and ≥44px on parent surfaces, verified by measurement rather than inspection.
- [ ] The drag-drop and puzzle tap fallbacks complete a lesson end to end with a screen reader active; tracing offers its skip.
- [ ] At the largest OS font setting, no kid screen clips its copy and no parent control is pushed off-screen; the cap policy lives in one module.
- [ ] Every real composed text/background pairing meets §2.3 contrast in both themes; no off-token colour was introduced to achieve it.
- [ ] In greyscale, every state-carrying screen remains unambiguous.
- [ ] Every kid screen works in both orientations with safe areas clear; no horizontal page scroll exists anywhere; the keyboard never covers an active field.
- [ ] With reduced motion on, every animated surface still communicates what happened.
- [ ] Frame-drop measurements exist for drag-drop, tracing, the reward celebration and a 60-item list on a **low-end Android device**, with the worst offender in each fixed and the numbers recorded.
- [ ] Minute formatting, quiz retry limits, reward amounts and activity grading agree between the mobile and web clients.
- [ ] `document/implementation-mobile/notes/a11y-device-pass.md` records every check per device, every fix, and every accepted exception with its reason.
- [ ] Each fix has a regression test where one is possible.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- New features or redesigns. If a screen fails badly enough to need redesigning, raise it and schedule it — do not smuggle a redesign into an audit.
- Bundle size, caching, crash reporting and error boundaries — M29.
- Store assets and policy declarations — M30.
- A formal third-party accessibility certification. Out of scope for MVP; the notes file is the evidence trail if one is ever commissioned.
- Automated a11y linting in CI. Worth doing later; this file is a human pass, and the regression tests it leaves are the durable part.
