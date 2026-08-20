# M03 — i18n Package & Locale Detection

> **Estimated effort:** 3–4 hours
> **Depends on:** M01
> **Requirement IDs:** FR-I18N-01, FR-I18N-02, FR-I18N-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Make the EN/BN copy shared rather than copied: extract `apps/web/locales/**` into a new `@kidlearn/i18n` workspace package, keep the web app working from its new import path, and stand up i18next on mobile with `expo-localization` for first-run detection and the active child's `language` column as the eventual source of truth. Also settle the one native-specific risk in this area: verify that Bengali date and number formatting through `Intl` works on Android's Hermes engine, and polyfill it here if it does not.

## Context & Current State

- `apps/web/locales/{en,bn}/` holds four namespace files each: `common.json`, `student.json`, `parent.json`, `lesson.json`. The split is deliberate and documented in `apps/web/lib/i18n.ts` — `parent` copy never ships to a child's surface and vice versa.
- `apps/web/lib/i18n.ts` imports all eight JSON files statically (both locales bundled, so `changeLanguage` cannot fail offline — FR-I18N-02) and exports `DEFAULT_NAMESPACE`, `PARENT_NAMESPACE`, `STUDENT_NAMESPACE`, `LESSON_NAMESPACE`.
- `apps/web/lib/locale.ts` owns locale plumbing with no i18next dependency: `LOCALE_COOKIE_NAME`, `DEFAULT_LOCALE`, `SUPPORTED_LOCALES` (re-exported from `@kidlearn/types`' `LOCALES`), `isLocale`, `toLocale`.
- The web app detects locale from a cookie server-side and registers `i18next-browser-languagedetector` in the browser. Neither mechanism exists on native.
- `packages/types` exports `LOCALES`, `LocaleSchema` and `type Locale` — the canonical locale list for the whole repo. Do not introduce a second one.
- `ChildProfile.language` in the database is the per-child preference; once a child is active it wins over the device default (wired on mobile in M10).
- **Risk this file closes:** React Native's Hermes engine ships narrower ICU data than a browser. `Intl.RelativeTimeFormat`, `Intl.DateTimeFormat` and `Intl.NumberFormat` with the `bn` locale may fall back to English or throw on Android. The parent dashboard (M26) and reports (M27) depend on all three.

## Detailed Requirements

1. **`packages/i18n` workspace package** named `@kidlearn/i18n`, no build step, exporting through an `exports` map: the resource bundle, the namespace constants, and the locale helpers that have no i18next dependency.
2. **Move, don't copy.** `apps/web/locales/{en,bn}/*.json` move to `packages/i18n/locales/{en,bn}/*.json`. `apps/web/lib/i18n.ts` is updated to import from `@kidlearn/i18n`; `apps/web/locales/` is deleted. `pnpm --filter web test` must still pass and the web app must still render both languages — this is a real change to a working app, so it gets verified, not assumed.
3. **Shared exports.** `@kidlearn/i18n` exports `resources` (the `{ en: { common, student, parent, lesson }, bn: {...} }` object), the four namespace constants (`DEFAULT_NAMESPACE`, `STUDENT_NAMESPACE`, `PARENT_NAMESPACE`, `LESSON_NAMESPACE`), `DEFAULT_LOCALE`, and `isLocale` / `toLocale`. `LOCALES` and `type Locale` continue to come from `@kidlearn/types` — re-export them, never redefine.
4. **Web keeps its cookie plumbing.** `LOCALE_COOKIE_NAME` and `LOCALE_COOKIE_MINUTES` are browser concepts and stay in `apps/web/lib/locale.ts`. The package holds only what both clients need.
5. **Mobile i18next instance.** `apps/mobile/lib/i18n.ts` initialises one module-level instance (safe here — a mobile app is single-user, unlike the web server) with `resources` from the package, all four namespaces, `fallbackLng: "en"`, and `compatibilityJSON` set as Expo's docs require for plural rules on Hermes.
6. **First-run detection.** Initial language comes from `expo-localization`'s `getLocales()[0].languageCode`, passed through `toLocale` so an unsupported device language falls back to English rather than rendering keys.
7. **Persistence.** The chosen language is stored with `AsyncStorage` under `kidlearn.locale` (a preference, not a secret — SecureStore is reserved for the session). On boot, a stored value wins over device detection; the active child's `language` (M10) wins over both.
8. **Provider.** `app/_layout.tsx` wraps the tree in `I18nextProvider` after fonts resolve and before the splash screen hides, so no screen ever renders a translation key.
9. **`Intl` verification and fallback.** Write a real test asserting `bn` output for `Intl.DateTimeFormat`, `Intl.NumberFormat` and `Intl.RelativeTimeFormat`, and run the same checks on a physical Android device (a test that passes in Jest's Node runtime proves nothing about Hermes). If Bengali output is wrong or throws, add `@formatjs/intl-*` polyfills plus `@formatjs/intl-locale` and `@formatjs/intl-*/locale-data/bn` imported at the very top of `app/_layout.tsx`, before anything else. Record the outcome — polyfilled or not — in a comment in `lib/i18n.ts` so M26 does not have to re-investigate.
10. **A locale-formatting module, not scattered `Intl` calls.** `lib/format.ts` exports `formatRelative(date, locale)`, `formatNumber(value, locale)` and `formatMinutes(minutes, locale)` (the "1h 35m" form the dashboard needs). Unit-test these once instead of testing dates inside components — the same approach `apps/web/lib/relative-time.ts` and `duration.ts` already take.
11. **Language switcher.** A minimal `components/LanguageToggle.tsx` (EN / বাংলা) mounted on the placeholder screen for now, purely to prove `changeLanguage` re-renders instantly and offline (FR-I18N-02). Its permanent home is the parent settings screen (M08).

## Technical Approach & Suggestions

```
packages/i18n/package.json            # name: @kidlearn/i18n
packages/i18n/src/index.ts            # resources, namespaces, locale helpers
packages/i18n/src/namespaces.ts
packages/i18n/src/locale.ts           # DEFAULT_LOCALE, isLocale, toLocale (re-exports LOCALES from @kidlearn/types)
packages/i18n/locales/en/*.json       # moved from apps/web/locales/en
packages/i18n/locales/bn/*.json       # moved from apps/web/locales/bn

apps/mobile/lib/i18n.ts               # the instance + init
apps/mobile/lib/format.ts             # formatRelative / formatNumber / formatMinutes
apps/mobile/lib/format.test.ts
apps/mobile/components/LanguageToggle.tsx
```

`packages/i18n/src/index.ts`:

```ts
import bnCommon from "../locales/bn/common.json";
import bnLesson from "../locales/bn/lesson.json";
import bnParent from "../locales/bn/parent.json";
import bnStudent from "../locales/bn/student.json";
import enCommon from "../locales/en/common.json";
import enLesson from "../locales/en/lesson.json";
import enParent from "../locales/en/parent.json";
import enStudent from "../locales/en/student.json";

export const resources = {
  en: { common: enCommon, parent: enParent, student: enStudent, lesson: enLesson },
  bn: { common: bnCommon, parent: bnParent, student: bnStudent, lesson: bnLesson },
} as const;

export * from "./namespaces.js";
export * from "./locale.js";
```

`apps/mobile/lib/i18n.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_LOCALE, resources, toLocale } from "@kidlearn/i18n";
import type { Locale } from "@kidlearn/types";
import { getLocales } from "expo-localization";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

const STORAGE_KEY = "kidlearn.locale";

/** Stored preference first, then the device language, then English. */
export async function resolveInitialLocale(): Promise<Locale> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) return toLocale(stored);
  return toLocale(getLocales()[0]?.languageCode ?? DEFAULT_LOCALE);
}

export async function initI18n(): Promise<typeof i18next> {
  const lng = await resolveInitialLocale();
  await i18next.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    ns: ["common", "student", "parent", "lesson"],
    interpolation: { escapeValue: false },
    // Hermes' plural-rule support is narrower than a browser's; v3 JSON keeps
    // Bengali plurals working on Android. Revisit only with a device check.
    compatibilityJSON: "v3",
  });
  return i18next;
}

export async function setLocale(locale: Locale): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, locale);
  await i18next.changeLanguage(locale);
}
```

The Bengali `Intl` check — run this **on the device**, not only in Jest:

```ts
// Temporary probe on the placeholder screen; delete once the outcome is recorded.
const probe = [
  new Intl.NumberFormat("bn").format(1234.5),          // expect Bengali digits
  new Intl.DateTimeFormat("bn", { dateStyle: "medium" }).format(new Date()),
  new Intl.RelativeTimeFormat("bn", { numeric: "auto" }).format(-2, "day"),
].join(" | ");
```

If any of the three returns English output or throws, install the polyfills and import them first in `app/_layout.tsx`:

```ts
import "@formatjs/intl-locale/polyfill";
import "@formatjs/intl-pluralrules/polyfill";
import "@formatjs/intl-numberformat/polyfill";
import "@formatjs/intl-numberformat/locale-data/bn";
import "@formatjs/intl-datetimeformat/polyfill";
import "@formatjs/intl-datetimeformat/locale-data/bn";
import "@formatjs/intl-relativetimeformat/polyfill";
import "@formatjs/intl-relativetimeformat/locale-data/bn";
```

`formatMinutes` matches the web app's existing behaviour (`apps/web/lib/duration.ts`) so the same minutes never read differently on the two clients — check that file and mirror its rounding and its "1h 35m" threshold exactly rather than inventing a second rule.

## Step-by-Step Plan

1. Create `packages/i18n`; `git mv` the eight JSON files from `apps/web/locales`; write `src/index.ts`, `src/namespaces.ts`, `src/locale.ts`. (~30 min)
2. Update `apps/web/lib/i18n.ts` to import `resources` and the namespace constants from `@kidlearn/i18n`, delete the now-empty `apps/web/locales`, then run `pnpm --filter web test && pnpm --filter web typecheck` and load `/parent` and `/home` in both languages to confirm nothing regressed. (~30 min)
3. Install mobile deps: `i18next`, `react-i18next`, `expo-localization`, `@react-native-async-storage/async-storage`, `@kidlearn/i18n`. Write `lib/i18n.ts`. (~25 min)
4. Wire `initI18n()` + `I18nextProvider` into `app/_layout.tsx` alongside the M02 font gate; render one translated string on the placeholder screen. (~20 min)
5. Add the `Intl` probe to the placeholder screen, run it on a **physical Android device**, and record the result. Install and wire the `@formatjs` polyfills if Bengali output is wrong; re-run the probe until it is right. Remove the probe. (~40 min)
6. Write `lib/format.test.ts` first (relative days, hours-and-minutes formatting, Bengali digits), then implement `lib/format.ts` mirroring `apps/web/lib/duration.ts` and `relative-time.ts`. (~35 min)
7. Add `LanguageToggle`, confirm on device that switching is instant with the network off (FR-I18N-02), and that the choice survives an app restart. (~20 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter mobile test && pnpm --filter web test`; commit; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `apps/web/locales/` no longer exists; `apps/web` imports its copy from `@kidlearn/i18n`; `pnpm --filter web test` and `pnpm --filter web typecheck` pass and both languages still render in the browser.
- [ ] The mobile app renders translated copy from the shared bundle, with the device language honoured on first run and an unsupported device language falling back to English.
- [ ] Switching language on device is instant, works with the network disabled, and survives an app restart.
- [ ] `Intl.NumberFormat`, `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat` all produce correct Bengali output **on a physical Android device**, with the polyfill decision recorded in a comment in `lib/i18n.ts`.
- [ ] `lib/format.ts` is the only place in `apps/mobile` that calls `Intl` directly, and its unit tests cover EN and BN.
- [ ] `formatMinutes` produces the same string as the web app's `duration.ts` for the same input (spot-check 5, 59, 60, 95, 310).
- [ ] Only `LOCALES` from `@kidlearn/types` defines the supported locales — no second list anywhere.
- [ ] `pnpm lint`, `pnpm typecheck` and both apps' tests pass.

## Out of Scope

- Adding a third language. FR-I18N-04's extensibility is satisfied by the package existing; no new copy in this file.
- Localised audio narration — M14 (`LocalizedAudio` from `@kidlearn/types` already models it).
- The permanent language-switcher UI in parent settings — M08.
- Pushing the active child's `language` into i18next — M10, once there is an active child to read it from.
- Right-to-left layout. Neither `en` nor `bn` is RTL; do not build for a language the product does not ship.
