# M03 — i18n Package & Locale Detection

> **Estimated effort:** 3–4 hours
> **Depends on:** M01
> **Requirement IDs:** FR-I18N-01, FR-I18N-02, FR-I18N-03
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Consume the shared EN/BN copy in `@kidlearn/i18n` (already extracted from `apps/web`), and stand up i18next on mobile with `expo-localization` for first-run detection and the active child's `preferredLanguage` as the eventual source of truth. Also settle the one native-specific risk in this area: verify that Bengali date and number formatting through `Intl` works on Android's Hermes engine, and polyfill it here if it does not.

## Context & Current State

- `packages/i18n` (`@kidlearn/i18n`, raw TypeScript + JSON, no React or i18next dependency) already exists and `apps/web` consumes it (`apps/web/shared/lib/i18n.ts`). Its `"."` entry exports `resources` with four namespaces — `common`, `parent`, `student`, `lesson` (`locales/{en,bn}/*.json`) — plus `Namespace`, `DEFAULT_NAMESPACE`, `PARENT_NAMESPACE`, `STUDENT_NAMESPACE`, `LESSON_NAMESPACE`, `DEFAULT_LOCALE`, `isLocale` and `toLocale`. `src/parity.test.ts` fails a key present in one locale and not the other.
- Its second entry, `"./site"` (`SITE_NAMESPACE`, `siteResources`), is the public homepage and guides — **web-only**. Mobile never imports `@kidlearn/i18n/site`; M01's Biome override fails `pnpm lint` if it does. It is split out precisely so the guides stay out of every app surface's bundle.
- Web-only locale plumbing stays in `apps/web/shared/lib/locale.ts` (`LOCALE_COOKIE_NAME`, cookie read/write); `SUPPORTED_LOCALES` there is re-exported from `@kidlearn/types`' `LOCALES`.
- The web app detects locale from a cookie server-side and writes it back from `LanguageSwitch` in the browser. Neither mechanism exists on native. Web's `createI18n` is the reference for the init options (namespace constants, `escapeValue: false`, `react.useSuspense: false`, `supportedLngs`).
- `i18next` is `^26` on web. v26 accepts only `compatibilityJSON: "v4"`, and the shared JSON uses v4 plural suffixes (`historyMeta_one`, …), which need `Intl.PluralRules` at runtime — on Hermes that is a device check, not an assumption.
- Two pure formatters are still in `apps/web` and platform-free: `features/screen-time/duration.ts` (`formatMinutes(total, translate)`, the "1h 35m" form; imported by `DashboardSummary`, `ReportCard`, `ReportHistoryList`) and `shared/lib/relative-time.ts` (`formatRelative`, `formatAbsolute`). Lift, don't copy (D6).
- `packages/types` exports `LOCALES`, `LocaleSchema` and `type Locale` — the canonical locale list for the whole repo. Do not introduce a second one.
- `ChildProfile.preferredLanguage` (`en` | `bn`, default `en`) is the per-child preference; once a child is active it wins over the device default (wired on mobile in M10).
- **Risk this file closes:** React Native's Hermes engine ships narrower ICU data than a browser. `Intl.RelativeTimeFormat`, `Intl.DateTimeFormat` and `Intl.NumberFormat` with the `bn` locale may fall back to English or throw on Android. The parent dashboard (M26) and reports (M27) depend on all three.

## Detailed Requirements

1. **Consume `@kidlearn/i18n`'s `"."` entry only.** Add it to `apps/mobile` (`workspace:*`). Never import `./site`. If mobile needs something the package lacks, add it to the package (platform-free, no i18next dependency) rather than to `apps/mobile`. `LOCALES` and `type Locale` come from `@kidlearn/types` — never redefine.
2. **Lift the two formatters (D6).** Move `formatMinutes` (+ its `Translate` type) from `apps/web/features/screen-time/duration.ts` and `formatRelative`/`formatAbsolute` from `apps/web/shared/lib/relative-time.ts` into `packages/i18n/src/format.ts`, exported from `"."`, with their existing tests moved alongside. Repoint the web imports and delete the web copies. Behaviour must not change — the moved tests are the proof.
3. **Mobile i18next instance.** `apps/mobile/lib/i18n.ts` initialises one module-level instance (safe here — a mobile app is single-user, unlike the web server) with `resources` from the package, the four namespace constants, `supportedLngs: [...LOCALES]`, `fallbackLng: DEFAULT_LOCALE`, `react.useSuspense: false`. No `compatibilityJSON` override — v4 is the only value i18next 26 accepts; plurals depend on `Intl.PluralRules` (requirement 7).
4. **First-run detection.** Initial language comes from `expo-localization`'s `getLocales()[0].languageCode`, passed through `toLocale` so an unsupported device language falls back to English rather than rendering keys.
5. **Persistence.** The chosen language is stored with `AsyncStorage` under `kidlearn.locale` (a preference, not a secret — SecureStore is reserved for the session). On boot, a stored value wins over device detection; the active child's `language` (M10) wins over both.
6. **Provider.** `app/_layout.tsx` wraps the tree in `I18nextProvider` after fonts resolve and before the splash screen hides, so no screen ever renders a translation key.
7. **`Intl` verification and fallback.** Write a real test asserting `bn` output for `Intl.PluralRules`, `Intl.DateTimeFormat`, `Intl.NumberFormat` and `Intl.RelativeTimeFormat`, and run the same checks on a physical Android device (a test that passes in Jest's Node runtime proves nothing about Hermes). If Bengali output is wrong or throws, add `@formatjs/intl-*` polyfills plus `@formatjs/intl-locale` and `@formatjs/intl-*/locale-data/bn` imported at the very top of `app/_layout.tsx`, before anything else. Record the outcome — polyfilled or not — in a comment in `lib/i18n.ts` so M26 does not have to re-investigate.
8. **A locale-formatting module, not scattered `Intl` calls.** `lib/format.ts` re-exports the lifted `formatRelative`/`formatAbsolute`/`formatMinutes` from `@kidlearn/i18n` (binding `formatMinutes` to the instance's `t` for the `parent` namespace) and adds `formatNumber(value, locale)`. It is the only `apps/mobile` module that reaches `Intl`; the formatters' own unit tests live with the package.
9. **Language switcher.** A minimal `components/LanguageToggle.tsx` (EN / বাংলা) mounted on the placeholder screen for now, purely to prove `changeLanguage` re-renders instantly and offline (FR-I18N-02). Its permanent home is the parent settings screen (M08).

## Technical Approach & Suggestions

```
apps/mobile/lib/i18n.ts               # the instance + init
apps/mobile/lib/format.ts             # formatRelative / formatNumber / formatMinutes
apps/mobile/lib/format.test.ts
apps/mobile/components/LanguageToggle.tsx
```

`apps/mobile/lib/i18n.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_LOCALE,
  DEFAULT_NAMESPACE,
  LESSON_NAMESPACE,
  PARENT_NAMESPACE,
  resources,
  STUDENT_NAMESPACE,
  toLocale,
} from "@kidlearn/i18n";
import { LOCALES, type Locale } from "@kidlearn/types";
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
    supportedLngs: [...LOCALES],
    defaultNS: DEFAULT_NAMESPACE,
    ns: [DEFAULT_NAMESPACE, PARENT_NAMESPACE, STUDENT_NAMESPACE, LESSON_NAMESPACE],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
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
  new Intl.PluralRules("bn").select(1),                // expect "one"
  new Intl.NumberFormat("bn").format(1234.5),          // expect Bengali digits
  new Intl.DateTimeFormat("bn", { dateStyle: "medium" }).format(new Date()),
  new Intl.RelativeTimeFormat("bn", { numeric: "auto" }).format(-2, "day"),
].join(" | ");
```

If any of the four returns English output or throws, install the polyfills and import them first in `app/_layout.tsx`:

```ts
import "@formatjs/intl-locale/polyfill";
import "@formatjs/intl-pluralrules/polyfill";
import "@formatjs/intl-pluralrules/locale-data/bn";
import "@formatjs/intl-numberformat/polyfill";
import "@formatjs/intl-numberformat/locale-data/bn";
import "@formatjs/intl-datetimeformat/polyfill";
import "@formatjs/intl-datetimeformat/locale-data/bn";
import "@formatjs/intl-relativetimeformat/polyfill";
import "@formatjs/intl-relativetimeformat/locale-data/bn";
```

`formatMinutes` is the web's function, moved — not a mirror — so the same minutes cannot read differently on the two clients. It takes a `translate` callback, which keeps the package free of i18next.

## Step-by-Step Plan

1. Lift `formatMinutes` and `formatRelative`/`formatAbsolute` into `packages/i18n/src/format.ts` with their tests; repoint `apps/web`; `pnpm --filter @kidlearn/i18n test && pnpm --filter web test` green. (~30 min)
2. Install mobile deps: `i18next`, `react-i18next` (same majors as `apps/web`), `expo-localization`, `@react-native-async-storage/async-storage`, `@kidlearn/i18n`. Write `lib/i18n.ts`. (~25 min)
3. Wire `initI18n()` + `I18nextProvider` into `app/_layout.tsx` alongside the M02 font gate; render one translated string on the placeholder screen. (~20 min)
4. Add the `Intl` probe to the placeholder screen, run it on a **physical Android device**, and record the result. Install and wire the `@formatjs` polyfills if Bengali output is wrong; re-run the probe until it is right. Remove the probe. (~40 min)
5. Write `lib/format.test.ts` (Bengali digits from `formatNumber`, and `formatMinutes` bound to the real `parent` strings in both locales), then `lib/format.ts`. (~20 min)
6. Add `LanguageToggle`, confirm on device that switching is instant with the network off (FR-I18N-02), and that the choice survives an app restart. (~20 min)
7. `pnpm lint && pnpm build && pnpm typecheck && pnpm test`; open the PR and confirm `gates` with `gh pr checks`; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] The mobile app renders translated copy from the shared bundle, with the device language honoured on first run and an unsupported device language falling back to English.
- [ ] Switching language on device is instant, works with the network disabled, and survives an app restart.
- [ ] `Intl.PluralRules`, `Intl.NumberFormat`, `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat` all produce correct Bengali output **on a physical Android device**, a `_one`/`_other` key renders the right form in both locales, with the polyfill decision recorded in a comment in `lib/i18n.ts`.
- [ ] `lib/format.ts` is the only place in `apps/mobile` that calls `Intl` directly, and its unit tests cover EN and BN.
- [ ] `formatMinutes`, `formatRelative` and `formatAbsolute` live in `@kidlearn/i18n` and both apps import them from there; `apps/web/features/screen-time/duration.ts` and `apps/web/shared/lib/relative-time.ts` are gone and the web suite still passes.
- [ ] Nothing in `apps/mobile` imports `@kidlearn/i18n/site`.
- [ ] Only `LOCALES` from `@kidlearn/types` defines the supported locales — no second list anywhere.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and `gates` is green.

## Out of Scope

- Adding a third language. FR-I18N-04's extensibility is satisfied by the package existing; no new copy in this file.
- Localised audio narration — M14 (`LocalizedAudio` from `@kidlearn/types` already models it).
- The permanent language-switcher UI in parent settings — M08.
- The `site` namespace — web-only, permanently.
- Pushing the active child's `preferredLanguage` into i18next — M10, once there is an active child to read it from.
- Right-to-left layout. Neither `en` nor `bn` is RTL; do not build for a language the product does not ship.
