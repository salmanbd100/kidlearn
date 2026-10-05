# M02 — Tokens Package, Theming & Fonts

> **Estimated effort:** 3–4 hours
> **Depends on:** M01
> **Requirement IDs:** design.md §2–§4, NFR-A11Y-02, NFR-SCALE-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Give `apps/mobile` the design system: consume the existing `@kidlearn/tokens` package (colour themes, radius, motion, shadow) and extend it with the native-only scales (spacing, elevation props, phone/tablet font sizes); NativeWind v4 configured so `bg-primary` and `text-muted-foreground` work in React Native; a `ThemeProvider` that applies `kid` or `parent` at the route-group boundary; and Fredoka / Nunito / Inter loaded through `expo-font` behind the splash screen with the design.md §3.2 type scale expressed as native text styles.

## Context & Current State

- `document/design.md` is the single source of truth. §2.2 is the full semantic token table for both themes; §3.2 is the type scale; §4.1–4.3 are spacing (4px grid), radius and elevation; §5.1 is the motion scale.
- `packages/tokens` (`@kidlearn/tokens`) already exists and is the machine-readable source: `brand`, `radius` (px), `shadow` (CSS `box-shadow` strings), `motion`, `typeScale` (only the `lg` step that differs from Tailwind's default) and `themes.kid` / `themes.parent` (`ThemeName`, `ThemeTokens`, checked structurally against a `Theme` type). `src/design.test.ts` holds it to `design.md`; `packages/ui/src/styles/tokens.css` has regions generated from it (`pnpm --filter @kidlearn/ui tokens:generate`). Do not touch the web side.
- Not in the package yet: `spacing`, native `elevation` (iOS shadow props + Android `elevation`), and the phone/tablet `fontSize` pairs. Those are this file's additions.
- React Native has no CSS cascade and no `data-theme` attribute, so the web's theming mechanism cannot be reused. Only the *values* travel.
- `apps/web` uses Tailwind v4. `apps/mobile` will use Tailwind 3.4 through NativeWind v4. Two majors coexist without conflict because they are separate apps with separate configs — do not attempt to unify them.
- The kid theme is light-only (design.md §2.3); dark mode is parent-surface-only and deferred.

## Detailed Requirements

1. **Extend `@kidlearn/tokens`; do not recreate it.** Read colours, `radius`, `motion` and `brand` from the package — never copy hex values into `apps/mobile`. Add `apps/mobile` as a consumer (`"@kidlearn/tokens": "workspace:*"`).
2. **Add the native-only scales to `packages/tokens/src/index.ts`:** `spacing` (4px grid, design.md §4.1), `elevation` (§4.3 as an object per level with iOS shadow props and an Android `elevation` number — `shadow` today is CSS strings and unusable in React Native) and `fontSize` / `lineHeight` (§3.2, with phone and tablet values for display sizes since `clamp()` has no native equivalent). Extend `design.test.ts` so the new tables are held to design.md the same way the existing ones are.
3. **Colour keys.** `themes.kid` and `themes.parent` already carry one key per §2.2 row (including `popover*`, `*Foreground`, `success`/`warning`/`destructive` foregrounds and `shine`). A missing key is already a type error; no new parity test is needed here.
4. **NativeWind v4 setup.** `nativewind` pinned to `^4`, `tailwindcss` pinned to `^3.4`, `apps/mobile/tailwind.config.js` generating its `colors` map from `@kidlearn/tokens`, `global.css` with the Tailwind directives, `babel.config.js` with the NativeWind preset, and `metro.config.js` wrapped in `withNativeWind`. `nativewind-env.d.ts` added so `className` typechecks on RN components.
5. **ThemeProvider.** `lib/theme.tsx` exporting `ThemeProvider` and `useTheme(): { name: ThemeName; tokens: ThemeTokens }`. It sets the CSS-variable values NativeWind reads (via `vars()`) on a wrapper `View` so class names resolve to the active theme, **and** exposes the raw tokens for the cases class names cannot cover (Reanimated interpolations, SVG `stroke`, `expo-video` background). Components must prefer class names; the raw tokens are the escape hatch, not the default.
6. **Route-group theming.** `app/(student)/_layout.tsx` wraps in `<ThemeProvider name="kid">`; `app/(parent)/_layout.tsx` in `<ThemeProvider name="parent">`. No component anywhere branches on theme in JS (design.md §8).
7. **Fonts.** `expo-font` loads Fredoka (`--font-display`, kid headings), Nunito (`--font-body`), Inter (`--font-ui`, parent surfaces) from `@expo-google-fonts/*`. `app/_layout.tsx` holds `expo-splash-screen` until fonts resolve, then hides it — no flash of system font, no layout shift.
8. **Type scale components.** `components/ui/Text.tsx` exporting a `Text` with `variant` props matching design.md §3.2 (`display`, `title`, `heading`, `body`, `caption`, `label`) which pick font family, size, line height and weight. Kid variants never resolve below **20px**. Display sizes interpolate between the phone and tablet value using `useWindowDimensions()`.
9. **Elevation helper.** `lib/elevation.ts` turning an elevation token into the right platform props (`shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` on iOS, `elevation` on Android) so no component writes a platform branch inline.
10. **Tests.** `packages/tokens` tests for the new scales (above). Component test in `apps/mobile` asserting a `<Text variant="body">` inside a `kid` provider resolves the kid `foreground` colour and inside a `parent` provider resolves the parent one.

## Technical Approach & Suggestions

**`packages/tokens`** (extend the single existing `src/index.ts`; split into files only if it grows unwieldy):

```ts
// packages/tokens/src/index.ts — additions
export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const; // design.md §4.1, px
export const elevation = {
  sm: { ios: { shadowColor: brand.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 }, android: 1 },
  // …md, lg, pop from design.md §4.3
} as const;
```

**Tailwind config generated from the tokens** — the reason a token rename cannot silently break a class name:

```js
// apps/mobile/tailwind.config.js
const { themes } = require("@kidlearn/tokens");

// Class names resolve to CSS variables so ThemeProvider can swap values at
// runtime; the kid theme's values are the fallbacks baked into the stylesheet.
const colour = (name) => `var(--${name}, ${themes.kid.colors[name]})`;

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: Object.fromEntries(
        Object.keys(themes.kid.colors).map((name) => [
          name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
          colour(name),
        ]),
      ),
      fontFamily: {
        display: ["Fredoka_600SemiBold"],
        body: ["Nunito_400Regular"],
        ui: ["Inter_400Regular"],
      },
    },
  },
};
```

**ThemeProvider:**

```tsx
// apps/mobile/lib/theme.tsx
import { type ThemeName, type ThemeTokens, themes } from "@kidlearn/tokens";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { View } from "react-native";
import { vars } from "nativewind";

const ThemeContext = createContext<{ name: ThemeName; tokens: ThemeTokens } | null>(null);

export function ThemeProvider({ name, children }: { name: ThemeName; children: ReactNode }) {
  const value = useMemo(() => ({ name, tokens: themes[name] }), [name]);
  const cssVars = useMemo(
    () => vars(Object.fromEntries(Object.entries(themes[name].colors).map(([k, v]) => [`--${k}`, v]))),
    [name],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, cssVars]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside a ThemeProvider");
  return value;
}
```

**Fonts and splash** in `app/_layout.tsx`:

```tsx
import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka";
import { Nunito_400Regular, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { useEffect } from "react";
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready] = useFonts({
    Fredoka_600SemiBold,
    Nunito_400Regular,
    Nunito_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

Keep the `Text` variant map data-driven (a record from variant → style) rather than a switch, so the a11y rule "kid text never below 20px" can be asserted in one test that walks every kid variant.

## Step-by-Step Plan

1. Add `spacing`, `elevation` and `fontSize`/`lineHeight` to `packages/tokens/src/index.ts`, with `design.test.ts` coverage; `pnpm --filter @kidlearn/tokens test` green. (~30 min)
2. Add `@kidlearn/tokens` as a dependency of `apps/mobile`; install `nativewind@^4`, `tailwindcss@^3.4`, `react-native-reanimated`; add `tailwind.config.js`, `global.css`, `babel.config.js`, `nativewind-env.d.ts`; wrap `metro.config.js` in `withNativeWind`. Verify a `className="bg-primary"` `View` renders sky blue on device. (~45 min)
3. Write `lib/theme.tsx` and the failing component test (`kid` vs `parent` foreground). Implement until green. (~35 min)
4. Add `app/(student)/_layout.tsx` and `app/(parent)/_layout.tsx` with the two providers, plus a throwaway screen in each group to eyeball both palettes side by side on device. (~20 min)
5. Install the three font packages, wire `useFonts` + splash in `app/_layout.tsx`, and confirm on device that no system-font flash occurs. (~25 min)
6. Build `components/ui/Text.tsx` with the §3.2 variant map and `lib/elevation.ts`; add the test asserting every kid variant is ≥20px. (~35 min)
7. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; screenshot both themes on a phone; commit; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `packages/tokens` gains `spacing`, `elevation` and phone/tablet `fontSize`, each held to `document/design.md` by `design.test.ts`.
- [ ] `apps/mobile` reads every colour from `@kidlearn/tokens`; no hex value appears in `apps/mobile`.
- [ ] `className="bg-primary text-primary-foreground"` renders the kid palette inside `(student)` and the parent palette inside `(parent)`, with no JS theme branching in any component.
- [ ] Fredoka, Nunito and Inter all render on a physical device, with the splash screen held until they load — no system-font flash.
- [ ] `<Text variant="…">` covers the design.md §3.2 scale, and a test proves no kid variant resolves below 20px (NFR-A11Y).
- [ ] `lib/elevation.ts` is the only place with a platform branch for shadows.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` all pass.

## Out of Scope

- Any change to `packages/ui/src/styles/tokens.css` or `apps/web` — the web side already consumes the package.
- Dark mode. Parent-surface-only per design.md §2.3, and not needed until the parent screens exist (M08 onwards). Leave the token block unwritten rather than half-wired.
- Any product component (buttons, cards, tiles) — M05.
- Animation primitives beyond installing Reanimated — M05 owns the reduced-motion hook.
- NativeWind v5. Pre-release, Tailwind-v4-only and yarn-only. Pin v4.x.
