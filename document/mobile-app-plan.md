# KidLearn Mobile — High-Level Plan (React Native / Expo)

> **Source specs:** `document/project-requirement-details.md` (master requirements),
> `document/design.md` (design system), `document/database-design.md`,
> `document/implementation/00-progress-tracker.md` (web/server build order).
> **Status:** proposed — not started.
> **Scope of this document:** the *high-level* plan only. Every phase below is later
> expanded into numbered 3–4 hour implementation files under
> `document/implementation-mobile/`, in the same format as `document/implementation/`.

---

## Table of Contents

1. [Purpose & how to use this document](#1-purpose--how-to-use-this-document)
2. [Decisions of record](#2-decisions-of-record)
3. [Scope](#3-scope)
4. [Architecture](#4-architecture)
5. [Toolchain & library substitutions](#5-toolchain--library-substitutions)
6. [Design-system parity](#6-design-system-parity)
7. [Authentication & session on native](#7-authentication--session-on-native)
8. [Screen parity map](#8-screen-parity-map)
9. [Native-only behaviour](#9-native-only-behaviour)
10. [Testing strategy](#10-testing-strategy)
11. [Build & release pipeline](#11-build--release-pipeline)
12. [Store accounts, compliance & timelines](#12-store-accounts-compliance--timelines)
13. [Phased roadmap](#13-phased-roadmap)
14. [Environment & configuration](#14-environment--configuration)
15. [Costs](#15-costs)
16. [Risks & mitigations](#16-risks--mitigations)
17. [Open questions](#17-open-questions)
18. [Beginner orientation](#18-beginner-orientation)

---

## 1. Purpose & how to use this document

KidLearn currently has two clients — the Next.js Student Portal and the Parent
Dashboard — talking to one Express API. This document plans a **third client**: a
native iOS and Android app, built with React Native via Expo, consuming the *same*
API with the *same* functionality and the *same* design system.

Three rules hold throughout and are the reason the plan is shaped the way it is:

- **The server does not fork.** No mobile-only business logic, no mobile-only
  database columns. Rewards, streaks, screen time and completion stay
  server-authoritative (spec §7.3). Where the mobile client genuinely needs a
  server change, this document names it explicitly (§7) rather than leaving it to
  be discovered mid-build.
- **The contract is shared, the UI is not.** `packages/types` is imported by the
  mobile app exactly as `apps/web` imports it. Components are rewritten natively —
  see §4.2 for why sharing them is a trap, not a saving.
- **Functional parity, native behaviour.** Every requirement ID the web app
  satisfies is satisfied on mobile. *How* it behaves (app backgrounding, safe
  areas, hardware back button) follows platform convention, not the browser's.

Read §13 first if you want the build order; read §12 before you write any code, because
store compliance changes what you build, not just how you ship it.

---

## 2. Decisions of record

Settled. Revisit only with a dated note appended to this section.

| Decision | Choice | Why |
| --- | --- | --- |
| **Framework** | **React Native via Expo** (managed workflow, config plugins) | Cloud native builds (no local Xcode/Gradle wrangling), OTA updates, first-class libraries for audio/video/fonts/secure storage. The realistic choice for a first mobile app. |
| **Repo** | **`apps/mobile` in this monorepo** | Shares `@kidlearn/types` so response shapes cannot drift from the server. One PR can change an endpoint and all three clients. |
| **Routing** | **`expo-router`** (file-based) | Mirrors the App Router mental model already in `apps/web`, including route groups for `(student)` / `(parent)`. |
| **Styling** | **NativeWind v4** + a shared token package | Tailwind class names carry over from the web app. v4 is the stable line; **v5 is pre-release, Tailwind-v4-only and yarn-only** — not for this project yet. |
| **Animation** | **React Native Reanimated** (+ `react-native-gesture-handler`) | The native equivalent of Motion: runs on the UI thread, spring-based, honours reduced-motion. Required for tracing and drag activities to feel right. |
| **Auth** | **better-auth Expo plugin** (`@better-auth/expo` + `expo-secure-store`) | Keeps the *existing* cookie session model. No parallel JWT system, no second source of truth for `pinVerifiedUntil` / `activeChildProfileId`. |
| **Sign-in methods** | Google **and Sign in with Apple** | App Store Review Guideline 4.8 requires Sign in with Apple where social login is the only option. This is an addition to the server, not optional. See §7.3 and §16. |
| **Tests** | **`jest-expo` + `@testing-library/react-native`** for `apps/mobile`; Vitest everywhere else | React Native cannot run under the existing Vitest/jsdom setup. A documented, contained exception to "Vitest everywhere". |
| **Build & submit** | **EAS Build / EAS Submit / EAS Update** | One command per platform, credentials managed for you, OTA fixes for JS-only bugs without a store review. |
| **Offline mode** | **Out of scope at MVP** | The web app has none; adding it here would break "same functionality as it is" in the other direction and needs a sync design of its own. §3.2. |
| **Admin CMS** | **Web only, permanently** | An internal desktop surface. Porting it buys nothing. |

---

## 3. Scope

### 3.1 In scope — full parity

**Student Portal** (`data-theme="kid"` equivalent): profile picker, world-themed home,
lesson browsing, the five-step lesson player with resume, all four activity types
(drag-drop, trace, match, puzzle), all four quiz formats (MCQ, picture-select,
match-pair, drag-answer), scoring, the rewards/celebration flow, badges, characters,
streaks, the story library and the narrated story reader, EN/BN narration and copy.

**Parent Dashboard** (`data-theme="parent"` equivalent): sign-in, COPPA consent, PIN
setup and the PIN gate, child profile CRUD (max 5), the per-child progress dashboard,
screen-time limits and access windows, weekly reports, and account deletion.

Requirement families covered: FR-AUTH, FR-PROF, FR-CURR, FR-WORLD, FR-LSN, FR-ACT,
FR-QUIZ, FR-STORY, FR-GAM, FR-I18N, FR-DASH, FR-TIME, plus NFR-A11Y, NFR-SAFE and
NFR-PERF adapted to native devices.

### 3.2 Out of scope

- Admin CMS (FR-CMS) and the AI generation pipeline (FR-AI) — server/web surfaces.
- Offline lessons and media caching beyond what the HTTP layer does for free.
- Push notifications. Attractive for streak reminders; a separate feature with its own
  consent, scheduling and store-declaration work. Note it as a post-launch candidate.
- In-app purchase / subscriptions. None exists on web; adding one on mobile triggers
  App Store guideline 3.1.1 and a far heavier review.
- Tablet-specific redesigns. Layouts must *work* on tablet (they are a primary device
  per design.md §6) but no separate iPad-only navigation at MVP.

### 3.3 Parity dependencies on unfinished web work

Mobile cannot be "the same as the web app" for features the web app does not yet have.
As of this plan, `document/implementation/00-progress-tracker.md` shows files 30–38a not
started:

| Web file | Feature | Effect on this plan |
| --- | --- | --- |
| 30 | Weekly reports (FR-DASH-05..06) | Mobile phase M8 depends on the report API existing. Build web file 30 first, or ship the mobile dashboard without the reports tab and add it later. |
| 31–33 | Admin CMS | Not ported. But without it there is no way to author content except seeds/SQL — which limits what you can demo on a device. |
| 34–37 | AI pipeline | Same: content volume. A device demo with one seeded lesson is thin. |
| **38 / 38a** | **Deployment** | **Hard blocker for store submission.** A store build cannot point at `localhost`. The API must be publicly reachable over HTTPS with a stable hostname before you can submit. Web file 38 delivers exactly that — `https://api.kidlearn.net` on a permanent host — so do it before mobile phase M9. File 38a only automates the deploy and is not a blocker. |

---

## 4. Architecture

### 4.1 Monorepo layout (target)

```
apps/
  web/                   Next.js 16 — Student Portal + Parent Dashboard + Admin CMS
  server/                Express 5 — the one API for every client
  mobile/                NEW — Expo (React Native), iOS + Android
    app/                 expo-router routes
      (student)/         profile picker, home, world, lesson, stories
      (parent)/          sign-in, onboarding, children, dashboard, screen-time
      _layout.tsx        providers: theme, i18n, auth, safe area, gesture handler
    components/          native components — kid/, parent/, activities/, quiz/, rewards/
    lib/                 api client, auth client, audio, heartbeat, theme hooks
    assets/              fonts, icons, splash, Lottie
    app.config.ts        app identity, scheme, plugins, EAS project link
    eas.json             build profiles: development / preview / production
    metro.config.js      monorepo-aware resolver
    tailwind.config.js   NativeWind — consumes @kidlearn/tokens
packages/
  types/                 SHARED — Zod contracts (activities, quizzes, every API response)
  tokens/                NEW  — design.md §2.2 token values as plain TypeScript
  i18n/                  NEW  — the EN/BN locale JSON, moved out of apps/web/locales
  ui/                    WEB ONLY — Radix + Tailwind + DOM. Not consumed by mobile.
  db/                    SERVER ONLY
```

### 4.2 What is shared, what is not

| Layer | Shared with web? | Notes |
| --- | --- | --- |
| API response/request contracts (`packages/types/src/api/`) | **Yes** | The single most valuable share. Mobile parses responses with the same Zod schemas the OpenAPI document is generated from, so a server change surfaces as a mobile type error. |
| Activity & quiz payload schemas (`packages/types/src/activity`, `/quiz`) | **Yes** | The content-as-data contract. The mobile renderers are new; the schemas they render are not. |
| Design tokens | **Yes**, via new `packages/tokens` | Values only. Web keeps `tokens.css`; mobile builds a TS theme from the same numbers. |
| Locale strings | **Yes**, via new `packages/i18n` | Requires moving `apps/web/locales/*` and updating `apps/web/lib/i18n.ts`. Small, real change to the web app. |
| Pure logic worth lifting | **Case by case** | `evaluate.ts` (activity grading), `evaluate-answer.ts` (quiz grading), `duration.ts`, `worlds.ts`, `avatars.ts` are platform-free. Lift into a shared package **only when the mobile file would otherwise be a copy-paste** — do not pre-emptively extract. |
| React components (`packages/ui`, `apps/web/components`) | **No** | Radix primitives are DOM-bound, Tailwind v4's `@theme` CSS variables do not exist in React Native, and every gesture-driven kid widget needs a native reimplementation regardless. Sharing here means rewriting the web app, not saving mobile work. |
| Fetch helpers (`apps/web/lib/*-api.ts`) | **No, at first** | Mobile needs its own client because auth headers differ (§7.2). Extracting a shared `packages/api-client` later is a fair refactor once both sides have settled. |

### 4.3 Request flow

```
Native screen
  → lib/api-client.ts     (typed wrapper: base URL, timeout, retry/cold-start, { data } | { error } envelope)
    → authClient fetch    (attaches the SecureStore-held session cookie)
      → Express API       (better-auth session → requireParent → requirePinVerified → route)
        → Zod parse       (the same packages/types schema the server documents)
          → screen state
```

Same envelope, same error codes, same PIN-grant semantics as the web app. The only new
link in the chain is the cookie-attaching fetch.

---

## 5. Toolchain & library substitutions

Every web dependency that cannot cross to native, and its replacement:

| Web (`apps/web`) | Mobile (`apps/mobile`) | Note |
| --- | --- | --- |
| `next` App Router | `expo-router` | File-based; route groups behave similarly. |
| `next/font` | `expo-font` | Fredoka, Nunito, Inter loaded at boot behind the splash screen. |
| Tailwind CSS v4 (`@theme`) | `nativewind@4` + `tailwind.config.js` (Tailwind 3.4) | Two Tailwind majors coexist because they are separate apps with separate configs. |
| `motion` | `react-native-reanimated` | Optionally `moti` for a Motion-like declarative API. |
| `@dnd-kit/core` | `react-native-gesture-handler` + Reanimated | Drag-drop, match and drag-answer are hand-built. Biggest single porting cost. |
| `svg-path-properties` | **keep** + `react-native-svg` | Pure JS, works natively — the tracing maths ports as-is; only rendering and touch capture change. |
| `canvas-confetti` | `lottie-react-native` or a Reanimated particle burst | Lottie also covers badge reveals. |
| `<audio>` / `Audio()` | `expo-audio` | `expo-av` is deprecated — do not start on it. Narration, UI sounds, feedback sounds. |
| `<video>` | `expo-video` | Lesson video step; needs an explicit fullscreen/orientation policy. |
| `i18next-browser-languagedetector` | `expo-localization` | Detect device locale, then the same i18next instance and the same JSON. |
| `localStorage` / cookies | `expo-secure-store` (session) + `@react-native-async-storage/async-storage` (preferences) | Never put the session in AsyncStorage. |
| `document.visibilitychange` | `AppState` | Load-bearing for learning-time heartbeats and screen-time enforcement. §9. |
| `window.matchMedia('prefers-reduced-motion')` | `AccessibilityInfo.isReduceMotionEnabled` + change listener | design.md §5.2 still applies. |
| `Intl.RelativeTimeFormat` / `Intl.NumberFormat` | Same API on Hermes — **verify Bengali on Android early** | Android Hermes ICU data is narrower than a browser's. Budget for `@formatjs` polyfills in phase M0. |
| `next/image` | `expo-image` | Caching, blurhash placeholders, Cloudinary URLs unchanged. |
| Vitest + jsdom + RTL | `jest-expo` + `@testing-library/react-native` | §10. |

---

## 6. Design-system parity

`document/design.md` remains the single source of truth. What changes is only the
mechanism:

- **Tokens.** New `packages/tokens` exports the §2.2 table as TypeScript:
  `tokens.kid.primary`, `tokens.parent.background`, plus spacing, radius, elevation and
  motion scales. `tailwind.config.js` builds its colour palette from that object, so
  `bg-primary` and `text-muted-foreground` keep working in class names.
- **Theming.** There is no `data-theme` attribute and no CSS cascade in React Native.
  A `ThemeProvider` context supplies the active theme and NativeWind's `dark:`/variant
  mechanism (or a `vars()` call) applies it at the route-group boundary — `(student)`
  gets `kid`, `(parent)` gets `parent`. Components still never branch on theme in JS;
  they read tokens.
- **Typography.** The §3.2 scale is reproduced as native text styles. `clamp()` has no
  equivalent — use `useWindowDimensions()` to interpolate between the phone and tablet
  sizes for display type. Kid text stays **≥20px**, always.
- **Touch targets.** Kid **≥64×64**, parent **≥44×44** — easier to honour natively, but
  remember `hitSlop` exists for cases where the visual is smaller than the target.
- **Elevation.** iOS uses `shadow*` props, Android uses `elevation`. The §4.3 shadow
  tokens need one platform-split helper rather than a literal port.
- **Focus ring** becomes pressed/active state plus TalkBack/VoiceOver labels. There is no
  keyboard focus on a phone; screen-reader labelling replaces it as the a11y obligation.
- **Motion.** §5.1 durations and easings carry over to Reanimated. Animate `transform`
  and `opacity` only — the same rule, and on native it also keeps work on the UI thread.

---

## 7. Authentication & session on native

The existing model — better-auth, httpOnly cookie session, Google-only for parents, PIN
grant and `activeChildProfileId` stored *on the session* — survives intact. Three
concrete changes are needed.

### 7.1 Server: register the Expo plugin

`apps/server/src/lib/auth.ts` gains `plugins: [expo()]` and adds the app scheme
(`kidlearn://`) to `trustedOrigins` alongside `WEB_ORIGIN`. Without this, better-auth
refuses the native redirect as an untrusted origin. CORS is unaffected — native requests
carry no browser `Origin`.

### 7.2 Server: a mobile-aware OAuth callback

`apps/server/src/routes/auth.ts` today hardcodes
`callbackURL: ${env.WEB_ORIGIN}${env.PARENT_POST_LOGIN_PATH}`. A phone cannot follow that
back into the app. The route needs to resolve its callback per client — a validated
`?client=mobile` (or a separate `/api/auth/google/mobile`) returning the `kidlearn://`
deep link — with the allowed callbacks whitelisted server-side. **Never** accept an
arbitrary `callbackURL` from the client; that is an open-redirect.

### 7.3 Server: add Sign in with Apple

App Store Review Guideline **4.8** requires Sign in with Apple whenever third-party
social login is the *only* option, and KidLearn qualifies for no exemption. This means:
a `apple` entry in `socialProviders`, an Apple Services ID and key, `expo-apple-authentication`
on the client, and a decision about `Parent` linking when the same person signs in with
Google on web and Apple on mobile (match on verified email; document what happens when
Apple's private relay hides it). Plan this in the auth phase — discovering it during
review costs a full submission cycle.

### 7.4 Client: session storage and the fetch wrapper

`expoClient({ scheme: "kidlearn", storagePrefix: "kidlearn", storage: SecureStore })`
stores the session cookie in the device keychain/keystore and attaches it to outgoing
requests. Consequences for `lib/api-client.ts`:

- `credentials: "include"` does nothing on native — the cookie comes from the auth
  client, so **all** API calls must go through the wrapper that adds it.
- `authClient.getCookie()` is **async** in current better-auth — any helper reading it
  must be `async`.
- Sign-out must clear SecureStore, not just call the endpoint.

### 7.5 What does *not* change

The PIN gate (FR-AUTH-04) stays a server-side 15-minute grant on the session; the mobile
app just renders a native numeric keypad and calls `POST /api/parent/pin/verify`. The gate
must remain genuinely hard for a pre-reader (design.md §7) — no biometric shortcut that a
child's face or finger unlocks. `activeChildProfileId` continues to be set only by
`POST /api/children/:id/activate`.

---

## 8. Screen parity map

Web route → mobile route, with the porting note that matters:

| Web route | Mobile route | Porting note |
| --- | --- | --- |
| `/select-profile` | `(student)/select-profile` | Avatar grid; sets active child via the API, not local state. |
| `/home` | `(student)/home` | World-themed home, streak display. Full-bleed, no nav chrome; waypoints in the thumb zone. |
| `/world/[worldId]` | `(student)/world/[worldId]` | Lesson map. `expo-image` for world art. |
| `/lesson/[id]` | `(student)/lesson/[id]` | The five-step machine and resume logic port almost directly — it is state, not DOM. Add hardware-back handling: a child must not be able to swipe out mid-quiz without the exit confirmation. |
| — intro step | `components/lesson/steps/IntroStep` | Narration through `expo-audio`. |
| — video step | `…/VideoStep` | `expo-video`; decide fullscreen + orientation policy; preload the next step as `use-preload-next-step` does. |
| — activity step | `components/activities/*` | Engine + registry pattern ports; each renderer is rewritten on gesture-handler. |
| — quiz step | `components/quiz/*` | Same: engine and scoring port, four renderers rewritten. |
| — reward step | `components/rewards/*` | Lottie/Reanimated celebration, coin count-up, badge reveal, streak. |
| `/stories` | `(student)/stories` | Library grid. |
| `/stories/[id]` | `(student)/stories/[id]` | Page-turn gesture instead of buttons-only; keep the narration sync and completion reward. |
| `/parent/login` | `(parent)/login` | Google + Apple buttons (§7.3), `expo-web-browser` session. |
| `/parent/onboarding/{consent,pin,child}` | `(parent)/onboarding/*` | Consent text must be legible on a phone; PIN keypad native. |
| `/parent/children`, `/new`, `/[id]/edit` | `(parent)/children/*` | Max-5 rule is server-enforced; surface the error, do not re-implement. |
| `/parent` (dashboard) | `(parent)/index` | One `GET /api/children/:id/dashboard` call, as on web. Pure-CSS bars become `<View>` widths. Child switcher becomes a native segmented control; the `?child=` URL param becomes a router param. |
| `/parent/children/[id]/screen-time` | `(parent)/children/[id]/screen-time` | Time pickers must be native, not text inputs. |
| weekly reports (web file 30) | `(parent)/reports` | Gated on web file 30 existing. §3.3. |
| Admin CMS | — | Not ported. |

---

## 9. Native-only behaviour

Things with no web counterpart, each of which is a real requirement rather than polish:

- **App lifecycle drives time tracking.** `apps/web/lib/use-heartbeat.ts` keys off page
  visibility. On mobile, `AppState` transitions (`active` / `background` / `inactive`)
  start and stop the heartbeat. A backgrounded app must stop accruing learning minutes
  (FR-TIME-06) — otherwise a phone left face-down inflates the parent's dashboard.
- **Screen-time re-check on foreground.** Returning to the app after hours must
  re-evaluate the daily limit and access window (FR-TIME-01..05) before showing content,
  not on a timer that was frozen while backgrounded.
- **Safe areas and orientation.** `react-native-safe-area-context` everywhere;
  both orientations supported per design.md §6, with the friendly rotate prompt for any
  screen that genuinely needs landscape — never a dead end.
- **Hardware back / swipe-back.** Android's back button and iOS's edge swipe must not
  drop a child out of a lesson silently. Explicit interception on kid screens.
- **Slow networks and offline.** The API is always on (web file 38), so there is no cold
  start to absorb — but a slow or flaky mobile connection in Dhaka produces the same felt
  experience. Reuse the web's "mascot waking up" idea with retry/backoff, plus a distinct
  offline state driven by `@react-native-community/netinfo` — "no internet" and "this is
  taking a moment" are different messages to a parent (NFR-PERF-04).
- **Deep links.** `kidlearn://` for the OAuth callback; universal/app links only if
  marketing needs them later.
- **Kid-safety in a native shell.** No outbound links from student screens, no ads, no
  third-party analytics SDK on kid surfaces (§12), external links on parent screens open
  in a browser sheet behind the PIN gate.
- **Splash, icon, notch, keyboard.** `expo-splash-screen` held until fonts and session
  resolve; adaptive Android icon; `KeyboardAvoidingView` on the PIN and profile forms.

---

## 10. Testing strategy

| Level | Tool | What it covers |
| --- | --- | --- |
| Unit / logic | `jest-expo` | Grading (`evaluate`, `evaluate-answer`), lesson step machine, heartbeat/AppState reducer, duration and relative-time helpers, Zod parsing of fixtures from `packages/types/src/__fixtures__`. |
| Component | `@testing-library/react-native` | Renderers, PIN gate, dashboard cards, empty states, a11y labels. |
| Contract | reuse of `packages/types` | Mobile parses fixtures with the same schemas the server asserts with `assertContract`. Drift becomes a type or parse error, not a runtime surprise. |
| E2E (optional) | Maestro | The two flows worth automating: parent onboarding through PIN, and one full lesson to reward. Cheap to write, catches native regressions nothing else does. |
| Manual device matrix | — | A low-end Android phone (the realistic target), a modern iPhone, and one tablet. Screen-reader passes with TalkBack and VoiceOver. |

The existing working agreement holds: TDD for logic-producing chunks; `pnpm lint` and
`pnpm typecheck` green before a file is marked done.

---

## 11. Build & release pipeline

| Stage | Command / channel | Purpose |
| --- | --- | --- |
| Local dev | `pnpm --filter mobile dev` → Expo Dev Client on device/simulator | Day-to-day work. A **development build** (not Expo Go) is required as soon as native modules are in — which is immediately, because of secure-store and gesture-handler. |
| Internal build | `eas build --profile preview` | Installable link (Android APK / iOS ad-hoc or simulator build) for testing on a real device without a store. |
| Store build | `eas build --profile production` | AAB for Play, IPA for App Store. |
| Submit | `eas submit` | Uploads to TestFlight / Play Console. |
| OTA fix | `eas update --branch production` | JS-only fixes reach users without a review. **Cannot** ship native changes (new modules, permissions, SDK bumps) — those need a new build. |

Notes: keep `runtimeVersion` policy explicit so an OTA update never lands on an
incompatible native binary. Set up crash reporting (Sentry via `@sentry/react-native`, or
the store consoles' own crash dashboards) — but see §12 on SDKs and kid surfaces before
adding any analytics.

---

## 12. Store accounts, compliance & timelines

Neither developer account exists yet. Start this in parallel with phase M0 — it has
calendar lead time that code cannot compress.

### 12.1 Accounts

| | Apple | Google |
| --- | --- | --- |
| Cost | **$99/year** (Apple Developer Program) | **$25 one-off** (Play Console) |
| Setup | Enrolment can take days; identity verification required | Identity verification required; days |
| Extra rule | — | **New personal accounts must run a closed test with ≥12 testers opted in for 14 continuous days before production access.** Plan two extra weeks. |

### 12.2 Children's-app compliance — affects the build, not just the listing

- **Apple Kids Category** (guideline 1.3, 5.1.4): no third-party advertising, no
  third-party analytics without verifiable parental consent, a parental gate before any
  external link or purchase, privacy policy URL. Your PIN gate satisfies the gate
  requirement; your existing "no ads" position satisfies the rest — provided nobody adds
  an analytics SDK to a kid screen.
- **Google Play Families / Designed for Families**: declare the target age group,
  complete the **Data Safety** form honestly (child first name and age *are* personal
  data), complete the IARC content-rating questionnaire, and meet the ads policy (none).
- **Account deletion**: both stores require in-app deletion plus a web URL. Web file 10
  already implements the endpoint — surface it in the mobile parent settings and publish
  the URL.
- **Guideline 4.8** — Sign in with Apple. Covered in §7.3 because it is engineering work,
  not paperwork.
- **COPPA/GDPR-K posture** is unchanged: the parent holds the account, children have
  profiles rather than accounts, consent is recorded (NFR-SAFE-03).

### 12.3 Listing assets

App name, subtitle, promotional text, description (EN and BN), keywords, 3–8 screenshots
per required device size, an optional preview video, a 1024×1024 icon, feature graphic
(Play), privacy policy and support URLs, and the age rating questionnaires. Budget a
full session for this; it is not a 20-minute task.

### 12.4 Realistic timeline after the code is done

Apple review 1–3 days typically, longer for a Kids Category first submission. Google
review days, **plus** the 14-day closed test for a new account. First-submission
rejections are normal — assume one round trip.

---

## 13. Phased roadmap

Each row becomes one implementation file in `document/implementation-mobile/`, in the
existing format (goal, context, detailed requirements, technical approach, tests,
definition of done). Estimates are the same 3–4 hour chunks used for web.

| Phase | Files | Theme |
| --- | --- | --- |
| M0 — Foundation | M01–M05 | Expo scaffold, monorepo wiring, tokens, i18n, API client |
| M1 — Auth & parent onboarding | M06–M09 | Server auth changes, sign-in, consent, PIN, child profiles |
| M2 — Student shell | M10–M12 | Profile picker, home, world navigation |
| M3 — Lesson player | M13–M15 | Step engine, intro/video, audio layer |
| M4 — Activities | M16–M18 | Engine + drag-drop, tracing, match/puzzle |
| M5 — Quiz | M19–M20 | Engine + four formats, scoring |
| M6 — Gamification | M21 | Rewards, badges, characters, streaks |
| M7 — Stories | M22–M23 | Library, narrated reader |
| M8 — Time & parent dashboard | M24–M27 | Heartbeats, screen-time, dashboard, reports |
| M9 — Hardening & release | M28–M32 | A11y, performance, store assets, builds, launch |

| # | Feature | Requirement IDs | Depends on | Est. |
| --- | --- | --- | --- | --- |
| M01 | `apps/mobile` Expo scaffold: expo-router, TypeScript, Metro for pnpm workspaces, Biome + typecheck in Turbo, dev-client build running on a device | §7.1, NFR-SCALE-03 | — | 3–4h |
| M02 | `packages/tokens` + NativeWind v4 + ThemeProvider (kid/parent) + `expo-font` (Fredoka/Nunito/Inter) + type scale | design.md §2–4 | M01 | 3–4h |
| M03 | `packages/i18n`: move `apps/web/locales` out, wire i18next + `expo-localization` on mobile and keep web working; **verify `Intl` for `bn` on Android Hermes**, polyfill if needed | FR-I18N-01..03 | M01 | 3–4h |
| M04 | `lib/api-client.ts`: typed client over `packages/types`, `{ data } \| { error }` envelope, retry/backoff, cold-start + offline states, NetInfo | §7.3, NFR-PERF-04 | M01 | 3–4h |
| M05 | Native primitives: BigButton, IconTile, Card, Sheet, keypad, safe-area layout, reduced-motion hook, a11y label conventions | NFR-A11Y-01..06 | M02 | 3–4h |
| M06 | **Server**: `expo()` plugin, `kidlearn://` trusted origin, whitelisted mobile OAuth callback, Sign in with Apple provider (+ OpenAPI update) | FR-AUTH-02, guideline 4.8 | M04 | 3–4h |
| M07 | Mobile auth client: `expoClient` + SecureStore, Google + Apple sign-in, session bootstrap behind the splash, sign-out, `/me` | FR-AUTH-02, FR-AUTH-06 | M06 | 3–4h |
| M08 | Consent screen, PIN setup, PIN gate + 15-minute grant, account deletion entry point | FR-AUTH-03..05, NFR-SAFE-05..06 | M07 | 3–4h |
| M09 | Child profile CRUD (max 5), avatar picker, activate-child | FR-PROF-01..07 | M08 | 3–4h |
| M10 | Profile picker + active-child context | FR-AUTH-06, FR-PROF-03 | M09 | 3–4h |
| M11 | World-themed home: waypoints in the thumb zone, streak display, `expo-image` art, both orientations | FR-WORLD-01..03, FR-GAM-06 | M10 | 3–4h |
| M12 | World/lesson browsing screens, published+grade filtering via the content API | FR-CURR-02, FR-WORLD-04..05 | M11 | 3–4h |
| M13 | Lesson player shell: five-step machine, resume, progress saving, back-button/exit guard | FR-LSN-01..07 | M12 | 3–4h |
| M14 | Audio layer (`expo-audio`): narration, UI and feedback sounds, mute, ducking, screen narration hook | FR-LSN-02, FR-I18N-05 | M13 | 3–4h |
| M15 | Intro step + video step (`expo-video`), orientation/fullscreen policy, next-step preload | FR-LSN-01..02, NFR-PERF-02 | M14 | 3–4h |
| M16 | Activity engine + registry + feedback layer; drag-drop on gesture-handler/Reanimated | FR-ACT-01, FR-ACT-05..06 | M13 | 3–4h |
| M17 | Tracing activity: `react-native-svg` + gestures, reusing the `svg-path-properties` maths | FR-ACT-02, FR-ACT-05 | M16 | 3–4h |
| M18 | Match + puzzle activities | FR-ACT-03..05 | M16 | 3–4h |
| M19 | Quiz engine + MCQ + picture-select, progress indicator | FR-QUIZ-01, FR-QUIZ-04..05, 07 | M13 | 3–4h |
| M20 | Match-pair + drag-answer formats, scoring, response recording, score screen | FR-QUIZ-02..03, 06, 08 | M19 | 3–4h |
| M21 | Reward step: star burst, coin count-up, badge reveal, streak celebration (Lottie/Reanimated), reduced-motion variants | FR-LSN-05, FR-GAM-01..08 | M15, M20 | 3–4h |
| M22 | Story library | FR-STORY-01, 04..05, 08 | M12 | 3–4h |
| M23 | Story reader: page-turn gestures, narration sync, completion reward | FR-STORY-02..03, 06..07 | M21, M22 | 3–4h |
| M24 | Learning-time heartbeats driven by `AppState` | FR-TIME-06, FR-LSN-07 | M13 | 3–4h |
| M25 | Screen-time limits, access windows, friendly lockout, foreground re-check | FR-TIME-01..05 | M24 | 3–4h |
| M26 | Parent dashboard: child switcher, minute cards, subject bars, activity timeline, empty states | FR-DASH-01..04 | M09, M24 | 3–4h |
| M27 | Weekly reports screen (**blocked on web file 30**) | FR-DASH-05..06 | M26 | 3–4h |
| M28 | Accessibility & device pass: TalkBack/VoiceOver, target sizes, contrast, reduced motion, tablet + low-end Android, both orientations | NFR-A11Y-*, NFR-PERF-01..03 | M21, M26 | 3–4h |
| M29 | Performance & stability: bundle/asset budget, image and audio caching, cold-start UX, crash reporting, error boundaries | NFR-PERF-* | M28 | 3–4h |
| M30 | App identity & store assets: icon, splash, adaptive icon, bundle IDs, screenshots (EN/BN), listings, privacy policy, Data Safety, IARC, Kids Category answers | §12 | M28 | 4–5h |
| M31 | EAS production builds + TestFlight + Play internal testing; **requires web file 38 deployed** | §11, §12 | M29, M30 | 3–4h |
| M32 | Closed testing (12 testers / 14 days), review responses, production release, EAS Update channel and rollback runbook | §12 | M31 | 3–4h |

Roughly **32 files ≈ 100–120 hours** of build time, plus store lead time that runs in
parallel. The critical path to something installable on your own phone is M01 → M04 →
M07 → M13 → M16 — about a third of the work.

---

## 14. Environment & configuration

| Variable / setting | Where | Value |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `apps/mobile` | local: `http://<your-LAN-IP>:4000` — **not** `localhost`; a physical device cannot reach your Mac's loopback. Android emulator: `http://10.0.2.2:4000`. Staging builds: `https://api.dev.kidlearn.net`. Store builds: `https://api.kidlearn.net` (web file 38). |
| `scheme` | `app.config.ts` | `kidlearn` — must match `expoClient({ scheme })` and the server's `trustedOrigins`. |
| iOS bundle ID / Android package | `app.config.ts` | e.g. `net.kidlearn.app` (aligns with the `kidlearn.net` domain in web file 38). Changing these after first submission is not possible — decide once. |
| `BETTER_AUTH_URL`, `trustedOrigins` | `apps/server` | Must include the deployed API origin and `kidlearn://`. |
| Google OAuth redirect URIs | Google Cloud console | Add the deployed API callback; the app itself never holds a client secret. |
| Apple Services ID + key | Apple developer portal | For Sign in with Apple (§7.3). |
| EAS project ID, credentials | `eas.json` / EAS servers | Managed signing; never commit certificates or keystores. |

No secret belongs in `EXPO_PUBLIC_*` — anything prefixed that way is embedded in the app
bundle and readable by anyone who downloads it.

---

## 15. Costs

| Item | Cost |
| --- | --- |
| Google Play Console | $25 one-off |
| Apple Developer Program | $99/year — the only recurring cost this plan adds |
| EAS Build | Free tier is workable (queued builds, monthly limits). `eas build --local` on your Mac is the escape hatch for both platforms. |
| Backend / DB / media | Unchanged — web file 38's AWS stack (~$23/month for both environments) serves the mobile app too, at no extra cost for a second client |

The backend is no longer zero-cost: web file 38 moved it to a single EC2 box running both a
production and a development environment, for roughly $23/month. Mobile adds Apple's $99/year and
Google's one-off $25 on top of that, and nothing else recurring.

---

## 16. Risks & mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Sign in with Apple missed until review** | Rejection, a lost submission cycle | Built in phase M06, before any UI depends on the sign-in shape. |
| **Kids Category rejection** (analytics/ads/parental gate) | Weeks of delay | No third-party SDK on kid surfaces; PIN gate before every external link; read guideline 1.3 and 5.1.4 before M30. |
| **New Play account 12-tester / 14-day rule** | Two extra weeks before production | Recruit testers during phase M8; start the closed test as soon as M31 produces a build. |
| **Gesture-driven activities feel worse than the web versions** | Core experience regression | Build M16 early on a real low-end Android; treat it as a spike whose result can change library choices. |
| **NativeWind version churn** | Rework | Pin v4.x. v5 is pre-release, Tailwind-v4-only and yarn-only — do not adopt on this project. |
| **`Intl` gaps for Bengali on Android** | Broken dates/numbers in one of two shipped languages | Verified in M03, polyfilled there if needed. |
| **pnpm + Metro resolution issues** | Confusing early-days breakage | Solved once in M01 with a monorepo Metro config; never worked around per-file. |
| **API not publicly deployed** | Cannot submit at all | Web file 38 is a stated prerequisite of M31. |
| **Cookie-session on native is subtly different from web** | Silent 401s | All requests go through one wrapper (M04); `getCookie()` is awaited; sign-out clears SecureStore. |
| **Content thinness on a device demo** | Looks unfinished | Independent of mobile: needs web files 31–37 or expanded seeds. |
| **Solo maintenance of three clients** | Sustained cost | The shared contract package is the lever — keep response types in `packages/types`, never redeclared per client. |

---

## 17. Open questions

1. **Sign in with Apple identity linking** — when a parent signs in with Google on web
   and Apple on mobile, do they get one `Parent` or two? Decide in M06; email matching is
   the usual answer, and Apple's private relay is the edge case to write down.
2. **Reports before or after launch** — ship the mobile dashboard without weekly reports
   (M27 deferred) or block on web file 30?
3. **Android minimum version** — API 24 or 26? Affects device reach and some libraries.
4. **Tablet layout ambition at MVP** — "works" versus "designed for".
5. **Push notifications** — post-launch feature or never? It changes the store
   declarations if it lands later.
6. **Bengali-first store listing** — is BN the primary market for the store metadata, or
   English with BN as secondary?

---

## 18. Beginner orientation

You know React, TypeScript and Next.js. What is genuinely new, in the order you will meet
it — do not try to learn it all before M01:

1. **The dev loop.** Metro bundler, a development build installed on your phone, fast
   refresh, and reading a native crash log. Expect the first day to be tooling.
2. **There is no DOM.** `View`, `Text`, `Pressable`, `ScrollView`/`FlatList`. No CSS
   cascade, no `%` heights that behave like the web, flexbox with `flexDirection: column`
   as the default. This is the biggest mental shift, and NativeWind hides less of it than
   you would hope.
3. **`FlatList` over `.map()`** for any list that can grow — story library, activity feed.
4. **Gestures and Reanimated.** Worklets run on the UI thread and cannot touch React
   state directly. Learn this properly before M16; it is the difference between a tracing
   activity that feels native and one that stutters.
5. **App lifecycle.** `AppState`, backgrounding, and why your timers lie. Phase M24
   exists because of this.
6. **Native builds and signing.** Bundle IDs, provisioning profiles, keystores — EAS
   manages them, but you need to understand what it is managing.
7. **Store review as part of engineering.** Guideline 4.8 and the Kids Category rules
   changed §7 and §9 of this plan. On mobile, policy is an input to architecture.

Two habits that will save you the most time: test on a **real low-end Android phone**
from week one, not just a simulator; and when something behaves oddly, check whether it is
a React problem or a *native* problem before you start editing components.
