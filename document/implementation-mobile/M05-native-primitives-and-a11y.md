# M05 — Native Primitives & Accessibility Foundation

> **Estimated effort:** 2–3 hours
> **Depends on:** M02
> **Requirement IDs:** NFR-A11Y-01..06, design.md §7, §8
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the small set of native components every later screen composes from — `Screen`, `Card`, `BigButton`, `IconTile`, `Sheet`, `Spinner`, `EmptyState` — plus the accessibility and motion foundations they all depend on: a reduced-motion hook, a screen-reader-aware press feedback pattern, and the touch-target rules from design.md §7 enforced in code rather than by eye. This is the mobile equivalent of `packages/ui/src/primitives` + `apps/web/shared/components/kid`, and it is the last file before product screens begin.

## Context & Current State

- `packages/ui` (Radix + Tailwind + DOM) cannot be consumed by React Native. Its API shape is still the model to follow: `cva`-style variants exposed as props, never `className` overrides passed by callers (design.md §8 "Variants & styling").
- `apps/web/shared/components/kid/BigButton.tsx` and `apps/web/features/content/IconTile.tsx` are the two kid primitives already built for the web. Copy their prop vocabulary — the same names on both clients is what keeps the two surfaces recognisably one product:
  - `BigButton`: `children` (the label), `variant: "primary" | "secondary" | "success" | "danger"`, `size: "md" | "lg" | "xl"` (64px / 80px full-width / 96px full-width, `md` default), `isPulsing`, `icon`, `audioSrc`, `onPress`, `isDisabled`. Spring press to `0.94`, none under reduced motion. There is no `tone` and no `ghost`.
  - `IconTile`: `label`, `icon`, `imageSrc`, `audioSrc`, `onPress`, `size: "md" | "lg"` (96px / 128px square), `isSelected`, `isDisabled`.
- Web's reduced-motion hook is `useIsMotionReduced` (`packages/ui/src/hooks/use-reduced-motion.ts`); it also honours an in-app preference from `packages/ui/src/lib/a11y-prefs.ts`, which is `localStorage`-backed and so cannot be shared with native.
- M02 gives `useTheme()`, the NativeWind class names, `components/ui/Text.tsx` with the §3.2 variants, and `lib/elevation.ts`.
- design.md §7 is non-negotiable: kid touch targets **≥64×64**, parent **≥44×44**; never encode meaning in colour alone; respect reduced motion.
- On a phone there is no keyboard focus ring to honour — the web's focus-ring obligation becomes a **screen-reader labelling** obligation (TalkBack on Android, VoiceOver on iOS) plus a visible pressed state.
- `@kidlearn/ui` is web-only by design (`mobile-app-plan.md` §4.2) and M01's Biome override forbids importing it from `apps/mobile`.
- `react-native-reanimated` and `react-native-gesture-handler` were installed in M02/M01. `GestureHandlerRootView` must wrap the app once, at the root layout.

## Detailed Requirements

1. **`lib/use-reduced-motion.ts`** — `useReducedMotion()`, mirroring `useIsMotionReduced` (`packages/ui/src/hooks/use-reduced-motion.ts`) but reading `AccessibilityInfo.isReduceMotionEnabled()` and subscribes to `reduceMotionChanged`. Every animated component in the app branches on it (design.md §5.2). Returns a boolean, defaults to `false` while resolving. OS setting only: web's hook also honours an in-app `reducedMotion` preference (`packages/ui/src/lib/a11y-prefs.ts`), which is `localStorage`-backed and not ported at MVP (plan §17).
2. **`components/ui/Screen.tsx`** — the layout every route uses: `SafeAreaView` insets from `react-native-safe-area-context`, theme background, optional `scroll` prop switching to a `ScrollView` with `keyboardShouldPersistTaps="handled"`, and `edges` control so a full-bleed kid screen can ignore the top inset while still clearing the home indicator. Replaces the web's `min-h-dvh` + `env(safe-area-inset-*)` pattern.
3. **`components/ui/BigButton.tsx`** — the kid primary action, with web's props: `children: string` (the label), `variant` (`primary | secondary | success | danger`, mapped to theme colours), `size` (`md` 64px default, `lg` 80px full-width, `xl` 96px full-width — every size ≥64×64), `isPulsing`, `icon`, `onPress`, `isDisabled`. `audioSrc` is accepted and wired in M14. Mobile adds `isLoading` (web has none) for the parent-confirm and sign-in cases. Press feedback is a Reanimated scale spring to `0.94`, none under reduced motion. `accessibilityRole="button"`, `accessibilityLabel` defaulting to the label, `accessibilityState={{ disabled: isDisabled, busy: isLoading }}`.
4. **`components/ui/IconTile.tsx`** — the illustrated navigation waypoint used by the home and world screens, with web's props: `label`, `icon`, `imageSrc`, `audioSrc` (M14), `onPress`, `size` (`md` 96px, `lg` 128px, square), `isSelected`, `isDisabled`. Mobile adds an optional `badge` slot (a lock, a star count). The disabled state is visually distinct **by shape and icon, not only colour** (design.md §2.3).
5. **`components/ui/Card.tsx`** — the parent-surface surface: `card` background, `border`, radius and elevation tokens from M02, optional `title`/`footer` slots. Used by the dashboard, screen-time and children screens.
6. **`components/ui/Sheet.tsx`** — the native replacement for the web's Radix `Dialog`: a bottom sheet for parent confirmations (delete a child, confirm exit) built on `Modal` + Reanimated, dismissible by backdrop press and by the Android hardware back button, with `accessibilityViewIsModal` so a screen reader cannot wander behind it. Focus trapping is the DOM's problem; the modal flag is its native equivalent.
7. **`components/ui/Spinner.tsx`** and **`components/ui/EmptyState.tsx`** — the loading and warm-empty states every list screen needs (illustration slot, localised message, optional action). Empty states are a stated requirement in several later files; centralising them here stops six variants appearing.
8. **Touch-target enforcement in code.** `lib/touch-target.ts` exporting `KID_MIN_TARGET = 64` and `PARENT_MIN_TARGET = 44` plus a `hitSlopFor(size, minimum)` helper, so a visually smaller control still meets the target. Every primitive uses these constants — no literal `64` in a component file.
9. **Root layout wiring.** `app/_layout.tsx` wraps the tree in `GestureHandlerRootView` and `SafeAreaProvider`, inside the M02 theme and M03 i18n providers. Order matters: gesture root outermost, then safe area, then theme, then i18n.
10. **Tests** (`components/ui/*.test.tsx`): `BigButton` renders its label, fires `onPress`, does not fire when `isDisabled`, exposes `accessibilityState.busy` when `isLoading`, and reports a layout height ≥64; `IconTile` disabled state renders a non-colour indicator; `Sheet` closes on backdrop press and on hardware back; `useReducedMotion` flips when `AccessibilityInfo` reports a change.

## Technical Approach & Suggestions

```
apps/mobile/lib/use-reduced-motion.ts
apps/mobile/lib/touch-target.ts
apps/mobile/components/ui/Screen.tsx
apps/mobile/components/ui/BigButton.tsx
apps/mobile/components/ui/IconTile.tsx
apps/mobile/components/ui/Card.tsx
apps/mobile/components/ui/Sheet.tsx
apps/mobile/components/ui/Spinner.tsx
apps/mobile/components/ui/EmptyState.tsx
apps/mobile/components/ui/*.test.tsx
```

Reduced motion, read once and shared:

```ts
// apps/mobile/lib/use-reduced-motion.ts
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (current) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      current = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
```

`BigButton` — the pattern every pressable in the app follows (variants as props, animation gated on reduced motion, target size from constants):

```tsx
const HEIGHT = { md: KID_MIN_TARGET, lg: 80, xl: 96 } as const;

export function BigButton({ children, icon, variant = "primary", size = "md", isPulsing, isLoading, isDisabled, onPress }: BigButtonProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(isLoading) }}
      disabled={isDisabled || isLoading}
      onPressIn={() => { if (!reduced) scale.value = withSpring(0.94); }}
      onPressOut={() => { if (!reduced) scale.value = withSpring(1); }}
      onPress={onPress}
      style={{ minHeight: HEIGHT[size], minWidth: KID_MIN_TARGET }}
      className={cn(BASE, VARIANT[variant], size !== "md" && "w-full", isDisabled && "opacity-50")}
    >
      <Animated.View style={style} className="flex-row items-center gap-3">
        {icon}
        <Text variant="label">{children}</Text>
      </Animated.View>
    </Pressable>
  );
}
```

`cn` is `clsx` only here — `tailwind-merge` is a web utility and NativeWind resolves conflicts differently, so add a two-line `lib/cn.ts` wrapping `clsx` rather than importing `@kidlearn/ui/lib/cn`.

Variant maps stay plain records of class strings (`const VARIANT = { primary: "bg-primary", … }`) rather than `cva`: `cva`'s value on the web is composing Tailwind class strings with conflict resolution, and NativeWind's compiler handles that differently. Keep the *prop API* identical to the web components; the internals may differ.

For `Sheet`, register the Android back handler so it closes rather than navigating away:

```tsx
useEffect(() => {
  if (!open) return;
  const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
  return () => sub.remove();
}, [open, onClose]);
```

Test target sizes through `onLayout` rather than by asserting style strings — a style assertion passes while the rendered box is still 40px tall:

```tsx
const { getByRole } = render(<BigButton onPress={noop}>Go</BigButton>);
fireEvent(getByRole("button"), "layout", { nativeEvent: { layout: { height: 64, width: 200 } } });
// then assert the component's own reported height against KID_MIN_TARGET
```

## Step-by-Step Plan

1. Write `lib/touch-target.ts`, `lib/cn.ts` and `lib/use-reduced-motion.ts` with the reduced-motion test (mock `AccessibilityInfo`). (~30 min)
2. Wire `GestureHandlerRootView` + `SafeAreaProvider` into `app/_layout.tsx` in the documented order; confirm on device that a notch phone clears both insets. (~20 min)
3. Build `Screen` (safe-area + scroll variants) and eyeball it on a notched iPhone and a physical Android phone in both orientations. (~25 min)
4. Build `BigButton` with the variant maps and its test (label, press, disabled, busy, ≥64px). (~35 min)
5. Build `IconTile` with its disabled non-colour indicator and test. (~25 min)
6. Build `Card`, `Spinner`, `EmptyState` — small, and they unblock every list screen. (~25 min)
7. Build `Sheet` with backdrop dismiss, hardware-back dismiss, `accessibilityViewIsModal`, and its test. (~30 min)
8. Assemble a throwaway `app/kitchen-sink.tsx` rendering every primitive in both themes; walk it on a device with **TalkBack on**, fixing missing labels; then delete the route or leave it behind a dev-only flag. (~30 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] Every interactive primitive reports a rendered height and width ≥64px on kid surfaces and ≥44px on parent surfaces, asserted from layout in tests — not from style strings.
- [ ] No component contains a literal touch-target number; all come from `lib/touch-target.ts`.
- [ ] Every animation in these primitives has a reduced-motion branch, verified by toggling the OS setting on a real device.
- [ ] TalkBack (Android) and VoiceOver (iOS) announce a role and a meaningful label for every primitive, including the sheet's modal boundary.
- [ ] Disabled and error states are distinguishable without colour (icon, shape or label), per design.md §2.3.
- [ ] `Sheet` closes on backdrop press **and** on the Android hardware back button, and never lets a screen reader reach the content behind it.
- [ ] `Screen` clears notches and home indicators on a physical device in portrait and landscape.
- [ ] `BigButton` and `IconTile` props match `apps/web/shared/components/kid/BigButton.tsx` and `apps/web/features/content/IconTile.tsx` name for name; the only additions are `BigButton.isLoading` and `IconTile.badge`.
- [ ] Nothing in `apps/mobile` imports `@kidlearn/ui`.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- Game widgets: tracing canvas, drag-drop surfaces, puzzle boards — M16–M18 own these, and they are not general primitives.
- Reward animations (star burst, coin count-up, badge reveal) — M21.
- Form inputs. The only text a parent types at MVP is a child's first name (M09) — build that input there, with the screen that needs it.
- Publishing these components to a shared package. They are `apps/mobile`-local until a second RN consumer exists; extracting early would freeze an API that is still moving.
- Full a11y audit across real screens — M28. This file establishes the conventions; M28 verifies them against the finished product.
