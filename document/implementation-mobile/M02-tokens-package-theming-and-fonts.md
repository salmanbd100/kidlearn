# M02 — Tokens Package, Theming & Fonts

> **Estimated effort:** 3–4 hours
> **Depends on:** M01
> **Requirement IDs:** design.md §2–§4, NFR-A11Y-02, NFR-SCALE-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Give `apps/mobile` the design system: a new `@kidlearn/tokens` workspace package holding the `document/design.md` §2.2 semantic token values (kid + parent) plus spacing, radius, elevation and motion scales as plain TypeScript; NativeWind v4 configured so `bg-primary` and `text-muted-foreground` work in React Native; a `ThemeProvider` that applies `kid` or `parent` at the route-group boundary; and Fredoka / Nunito / Inter loaded through `expo-font` behind the splash screen with the design.md §3.2 type scale expressed as native text styles.

## Context & Current State

- `document/design.md` is the single source of truth. §2.2 is the full semantic token table for both themes; §3.2 is the type scale; §4.1–4.3 are spacing (4px grid), radius and elevation; §5.1 is the motion scale.
- `packages/ui/src/styles/tokens.css` currently holds those values as CSS custom properties, consumed by `apps/web` via Tailwind v4's `@theme`. That file stays exactly as it is — this file does not refactor the web app.
- React Native has no CSS cascade and no `data-theme` attribute, so the web's theming mechanism cannot be reused. Only the *values* travel.
- `apps/web` uses Tailwind v4. `apps/mobile` will use Tailwind 3.4 through NativeWind v4. Two majors coexist without conflict because they are separate apps with separate configs — do not attempt to unify them.
- The kid theme is light-only (design.md §2.3); dark mode is parent-surface-only and deferred.

## Detailed Requirements

1. **`packages/tokens` workspace package** named `@kidlearn/tokens`, no build step, exporting raw TypeScript through an `exports` map — the same pattern `packages/types` uses. Scripts: `typecheck`, `test`.
2. **Semantic colour tokens.** Export `themes.kid` and `themes.parent` objects with one key per design.md §2.2 row: `background`, `foreground`, `card`, `cardForeground`, `popover`, `popoverForeground`, `primary`, `primaryForeground`, `secondary`, `secondaryForeground`, `accent`, `accentForeground`, `muted`, `mutedForeground`, `success`, `warning`, `destructive`, `border`, `input`, `ring`. Values copied verbatim from the design doc — no invented colours, no rounding of hex values.
3. **Scale tokens.** `spacing` (4px grid, §4.1), `radius` (§4.2), `elevation` (§4.3, as an object per level with `ios` shadow props and `android` elevation), `motion` (§5.1 durations and easing names), `fontSize`/`lineHeight` (§3.2, with the phone and tablet value for display sizes since `clamp()` has no native equivalent).
4. **A single exported type.** `export type ThemeName = "kid" | "parent"` and `export type ThemeTokens = typeof themes.kid`, so the parent theme is structurally forced to define every key the kid theme does. A missing key must be a type error, not a runtime `undefined` colour.
5. **NativeWind v4 setup.** `nativewind` pinned to `^4`, `tailwindcss` pinned to `^3.4`, `apps/mobile/tailwind.config.js` generating its `colors` map from `@kidlearn/tokens`, `global.css` with the Tailwind directives, `babel.config.js` with the NativeWind preset, and `metro.config.js` wrapped in `withNativeWind`. `nativewind-env.d.ts` added so `className` typechecks on RN components.
6. **ThemeProvider.** `lib/theme.tsx` exporting `ThemeProvider` and `useTheme(): { name: ThemeName; tokens: ThemeTokens }`. It sets the CSS-variable values NativeWind reads (via `vars()`) on a wrapper `View` so class names resolve to the active theme, **and** exposes the raw tokens for the cases class names cannot cover (Reanimated interpolations, SVG `stroke`, `expo-video` background). Components must prefer class names; the raw tokens are the escape hatch, not the default.
7. **Route-group theming.** `app/(student)/_layout.tsx` wraps in `<ThemeProvider name="kid">`; `app/(parent)/_layout.tsx` in `<ThemeProvider name="parent">`. No component anywhere branches on theme in JS (design.md §8).
8. **Fonts.** `expo-font` loads Fredoka (`--font-display`, kid headings), Nunito (`--font-body`), Inter (`--font-ui`, parent surfaces) from `@expo-google-fonts/*`. `app/_layout.tsx` holds `expo-splash-screen` until fonts resolve, then hides it — no flash of system font, no layout shift.
9. **Type scale components.** `components/ui/Text.tsx` exporting a `Text` with `variant` props matching design.md §3.2 (`display`, `title`, `heading`, `body`, `caption`, `label`) which pick font family, size, line height and weight. Kid variants never resolve below **20px**. Display sizes interpolate between the phone and tablet value using `useWindowDimensions()`.
10. **Elevation helper.** `lib/elevation.ts` turning an elevation token into the right platform props (`shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` on iOS, `elevation` on Android) so no component writes a platform branch inline.
11. **Tests.** Unit test in `packages/tokens` asserting the two themes have identical key sets (catches a token added to one and not the other). Component test in `apps/mobile` asserting a `<Text variant="body">` inside a `kid` provider resolves the kid `foreground` colour and inside a `parent` provider resolves the parent one.

## Technical Approach & Suggestions

**`packages/tokens`:**

```
packages/tokens/package.json          # name: @kidlearn/tokens, exports: { ".": "./src/index.ts" }
packages/tokens/src/index.ts          # re-exports everything below
packages/tokens/src/colours.ts        # themes.kid / themes.parent + ThemeName / ThemeTokens
packages/tokens/src/scales.ts         # spacing, radius, elevation, motion, fontSize, lineHeight
packages/tokens/src/colours.test.ts   # key-parity test
```

```ts
// packages/tokens/src/colours.ts — values verbatim from design.md §2.2
export const themes = {
  kid: {
    background: "#FFFDF7",
    foreground: "#2B2A4A",
    card: "#FFFFFF",
    cardForeground: "#2B2A4A",
    primary: "#36B3F5",
    primaryForeground: "#FFFFFF",
    secondary: "#8B5CF6",
    secondaryForeground: "#FFFFFF",
    accent: "#FFC93C",
    accentForeground: "#2B2A4A",
    success: "#34D399",
    warning: "#FFC93C",
    destructive: "#FF6B6B",
    ring: "#36B3F5",
    // …muted, mutedForeground, border, input, popover, popoverForeground
  },
  parent: {
    background: "#F8FAFC",
    foreground: "#0F172A",
    primary: "#4F46E5",
    // …the full parent column of §2.2
  },
} as const;

export type ThemeName = keyof typeof themes;
export type ThemeTokens = (typeof themes)["kid"];
```

**Tailwind config generated from the tokens** — the reason a token rename cannot silently break a class name:

```js
// apps/mobile/tailwind.config.js
const { themes } = require("@kidlearn/tokens");

// Class names resolve to CSS variables so ThemeProvider can swap values at
// runtime; the kid theme's values are the fallbacks baked into the stylesheet.
const colour = (name) => `var(--${name}, ${themes.kid[name]})`;

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: Object.fromEntries(
        Object.keys(themes.kid).map((name) => [
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
    () => vars(Object.fromEntries(Object.entries(themes[name]).map(([k, v]) => [`--${k}`, v]))),
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

1. Create `packages/tokens` (package.json, tsconfig, `src/`), transcribe the §2.2 table into `colours.ts` and the §4/§3.2/§5.1 scales into `scales.ts`. Add the key-parity test and make it pass. (~50 min)
2. Add `@kidlearn/tokens` as a dependency of `apps/mobile`; install `nativewind@^4`, `tailwindcss@^3.4`, `react-native-reanimated`; add `tailwind.config.js`, `global.css`, `babel.config.js`, `nativewind-env.d.ts`; wrap `metro.config.js` in `withNativeWind`. Verify a `className="bg-primary"` `View` renders sky blue on device. (~45 min)
3. Write `lib/theme.tsx` and the failing component test (`kid` vs `parent` foreground). Implement until green. (~35 min)
4. Add `app/(student)/_layout.tsx` and `app/(parent)/_layout.tsx` with the two providers, plus a throwaway screen in each group to eyeball both palettes side by side on device. (~20 min)
5. Install the three font packages, wire `useFonts` + splash in `app/_layout.tsx`, and confirm on device that no system-font flash occurs. (~25 min)
6. Build `components/ui/Text.tsx` with the §3.2 variant map and `lib/elevation.ts`; add the test asserting every kid variant is ≥20px. (~35 min)
7. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; screenshot both themes on a phone; commit; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `packages/tokens` is a workspace package; its key-parity test fails if a token exists in `kid` but not `parent`.
- [ ] Every colour value in `packages/tokens/src/colours.ts` matches `document/design.md` §2.2 exactly.
- [ ] `className="bg-primary text-primary-foreground"` renders the kid palette inside `(student)` and the parent palette inside `(parent)`, with no JS theme branching in any component.
- [ ] Fredoka, Nunito and Inter all render on a physical device, with the splash screen held until they load — no system-font flash.
- [ ] `<Text variant="…">` covers the design.md §3.2 scale, and a test proves no kid variant resolves below 20px (NFR-A11Y).
- [ ] `lib/elevation.ts` is the only place with a platform branch for shadows.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` all pass.

## Out of Scope

- Refactoring `packages/ui/src/styles/tokens.css` or `apps/web` to consume `@kidlearn/tokens`. Tempting, and a separate change with its own risk — the web app is working.
- Dark mode. Parent-surface-only per design.md §2.3, and not needed until the parent screens exist (M08 onwards). Leave the token block unwritten rather than half-wired.
- Any product component (buttons, cards, tiles) — M05.
- Animation primitives beyond installing Reanimated — M05 owns the reduced-motion hook.
- NativeWind v5. Pre-release, Tailwind-v4-only and yarn-only. Pin v4.x.
