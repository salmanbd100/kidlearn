# KidLearn Mobile — High-Level Plan (React Native / Expo)

> **Source specs:** `document/project-requirement-details.md` (master requirements),
> `document/design.md` (design system), `document/database-design.md`,
> `document/user-journey-manual.md` (§4 student, §5 parent),
> `document/implementation/00-progress-tracker.md` (web/server build order).
> **Status:** proposed — not started. **Last checked against the code:** 2026-10-08 (`0847cce`).
> **Audience:** the app is for **children and their parents only**. The Admin CMS, the AI review
> pipeline and the public `(site)` homepage and guides stay on the web, permanently.
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

KidLearn has one web client (`apps/web`) with four route groups — the public site `(site)`, the
Student Portal `(student)`, the Parent Dashboard `(parent)` and the Admin CMS `(admin)` — talking to
one Express API. This document plans a **second client**: a native iOS and Android app, built with
React Native via Expo, that carries **only the Student Portal and the Parent Dashboard**, consuming the
*same* API with the *same* functionality and the *same* design system.

Three rules hold throughout and are the reason the plan is shaped the way it is:

- **The server does not fork.** No mobile-only business logic, no mobile-only
  database columns. Rewards, streaks, screen time and completion stay
  server-authoritative (spec §7.3). Where the mobile client genuinely needs a
  server change, this document names it explicitly (§7) rather than leaving it to
  be discovered mid-build.
- **The contract is shared, the UI is not.** `packages/types` is imported by the
  mobile app exactly as `apps/web` imports it. Components are rewritten natively —
  see §4.2 for why sharing them is a trap, not a saving.
- **Functional parity, native behaviour.** Every child- and parent-facing requirement ID the web app
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
| **Repo** | **`apps/mobile` in this monorepo** | Shares `@kidlearn/types` so response shapes cannot drift from the server. One PR can change an endpoint and both clients. |
| **Routing** | **`expo-router`** (file-based) | Mirrors the App Router mental model already in `apps/web`, including route groups for `(student)` / `(parent)`. |
| **Styling** | **NativeWind v4** + a shared token package | Tailwind class names carry over from the web app. v4 is the stable line; **v5 is pre-release, Tailwind-v4-only and yarn-only** — not for this project yet. |
| **Animation** | **React Native Reanimated** (+ `react-native-gesture-handler`) | The native equivalent of Motion: runs on the UI thread, spring-based, honours reduced-motion. Required for tracing and drag activities to feel right. |
| **Auth** | **better-auth Expo plugin** (`@better-auth/expo` + `expo-secure-store`) | Keeps the *existing* cookie session model. No parallel JWT system, no second source of truth for `activeChildProfileId`. The app calls better-auth's own `/sign-in/social`; the web-only `GET /api/auth/google` wrapper is untouched. |
| **Sign-in methods** | Google **and Sign in with Apple**, parents only | App Store Review Guideline 4.8 requires Sign in with Apple where social login is the only option. No password field — that is the admin's sign-in, and admins are not users of the app. §7. |
| **Account linking** | **Stays off** | Turned off on purpose so a social sign-in on the seeded admin's address cannot inherit the admin user. Same email via a second provider is refused, not merged (§7.3). Guarded linking is open question 1. |
| **Tests** | **`jest-expo` + `@testing-library/react-native`** for `apps/mobile`; Vitest everywhere else | React Native cannot run under the existing Vitest/jsdom setup. A documented, contained exception to "Vitest everywhere". The mobile suite runs inside CI `gates` like every other package (§10). |
| **React version** | **Per app, not per repo** | `apps/web` pins `react@19.3.0`; the Expo SDK dictates its own React/React Native pair. Metro resolves React from `apps/mobile` only, and the shared packages (`types`, `tokens`, `i18n`) stay React-free. Two copies *inside one app* broke every hook in the web suite once (`51eaae6`) — the rule is one copy per bundle. |
| **Build & submit** | **EAS Build / EAS Submit / EAS Update** | One command per platform, credentials managed for you, OTA fixes for JS-only bugs without a store review. |
| **Offline mode** | **Out of scope at MVP** | The web app has none; adding it here would break "same functionality as it is" in the other direction and needs a sync design of its own. §3.2. |
| **Admin CMS, AI review, public site** | **Web only, permanently** | Admin is an internal desktop surface; the public site links to GitHub, which NFR-SAFE-07 keeps away from children. The app imports no admin contract and no `site` strings (§4.2). |

---

## 3. Scope

### 3.1 In scope — full parity

**Student Portal** (`data-theme="kid"` equivalent): profile picker, world-themed home,
lesson browsing, the five-step lesson player with resume, all four activity types
(drag-drop, trace, match, puzzle), all four quiz formats (MCQ, picture-select,
match-pair, drag-answer), scoring, the rewards/celebration flow, badges, characters,
streaks, the story library and the narrated story reader, EN/BN narration and copy.

**Parent Dashboard** (`data-theme="parent"` equivalent): sign-in, COPPA consent (versioned),
child profile CRUD (max 5, `MAX_CHILDREN_PER_PARENT`), the per-child progress dashboard,
screen-time limits and access windows, weekly reports, sign-out (FR-AUTH-07), "back to kid mode",
and account deletion — which web does not yet have a screen for, so mobile builds it first (M08).

Requirement families covered: FR-AUTH (02, 03, 05, 06, 07 — 04 is retired), FR-PROF, FR-CURR,
FR-WORLD, FR-LSN, FR-ACT, FR-QUIZ, FR-STORY, FR-GAM, FR-I18N, FR-DASH, FR-TIME, plus NFR-A11Y,
NFR-SAFE (including NFR-SAFE-07, no external links from student screens) and NFR-PERF adapted to
native devices.

### 3.2 Out of scope

- **Anything admin.** The Admin CMS (FR-CMS), the AI generation pipeline and review queue (FR-AI),
  admin password sign-in, the admin lesson preview, and every `/api/admin/*` route. An admin who
  signs in to the app with Google or Apple is refused by the server and told to use the website.
- **The public site** (FR-SITE-01..03): the homepage, the sign-in dialogs that live on it, and the
  `/guide/*` pages. The app opens on its own sign-in or profile picker, not a marketing page.
- **A PIN or parental gate in front of the parent area.** FR-AUTH-04 was retired on 2026-09-09; the
  signed-in session is the only barrier, as on web. Apple's Kids Category adult-verification item is
  separate and conditional (§12.2).
- Offline lessons and media caching beyond what the HTTP layer does for free.
- Push notifications. Attractive for streak reminders; a separate feature with its own
  consent, scheduling and store-declaration work. Note it as a post-launch candidate.
- In-app purchase / subscriptions. None exists on web; adding one on mobile triggers
  App Store guideline 3.1.1 and a far heavier review.
- Tablet-specific redesigns. Layouts must *work* on tablet (they are a primary device
  per design.md §6) but no separate iPad-only navigation at MVP.

### 3.3 Parity dependencies on unfinished web work

Web/server files 01–37a have shipped and their specs were retired (the code and the live `/docs` API
reference are the contract); 39 (CI gates) is done and 40 (public site) is web-only. What remains
outside `apps/mobile`:

| Dependency | State (2026-10-08) | Effect on this plan |
| --- | --- | --- |
| **Web 38 · provisioning** | ⬜ Not started — the *code* half of file 38 is done, but no AWS, Vercel, Cloudflare or Supabase resource exists | **Hard blocker for M31.** A store build cannot point at a LAN IP. Preview builds need `https://api.dev.kidlearn.net` and store builds `https://api.kidlearn.net`, both created by 38 · provisioning. Until then, preview builds run against a dev server on the LAN. 38a (API continuous deployment) is not a blocker. |
| **Server changes for native auth** | ⬜ Owned by M06 | `expo()` plugin, `kidlearn://` trusted origin, Apple provider, Apple-aware parent provisioning. Nothing else on the server changes. |
| **Public account-deletion URL** | ⬜ No web page | Both stores require one beside the in-app path (M08). It needs a requirement and a web file before M30. |
| **Pure logic still inside `apps/web`** | Lift on first use | The lesson machine, step-report serialisation, activity grading, duration formatting and the parent redirect resolver are platform-free but live in `apps/web/features/*`. §4.2 says when to lift each. |

---

## 4. Architecture

### 4.1 Monorepo layout (target)

```
apps/
  web/                   Next.js 16 — public site + Student Portal + Parent Dashboard + Admin CMS
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
  tokens/                SHIPPED — design.md token values as TypeScript (web's tokens.css is generated from it)
  i18n/                  SHIPPED — EN/BN JSON; `.` (common, student, parent, lesson) is shared, `./site` is web-only
  ui/                    WEB ONLY — Radix + Tailwind + DOM. Not consumed by mobile.
  db/                    SERVER ONLY
```

### 4.2 What is shared, what is not

| Layer | Shared with web? | Notes |
| --- | --- | --- |
| API response/request contracts (`packages/types/src/api/`) | **Yes** | The single most valuable share. Mobile parses responses with the same Zod schemas the OpenAPI document is generated from, so a server change surfaces as a mobile type error. |
| Activity & quiz payload schemas (`packages/types/src/activity`, `/quiz`) | **Yes** | The content-as-data contract. The mobile renderers are new; the schemas they render are not. |
| Design tokens | **Yes**, via `packages/tokens` (shipped) | Values only. Web's `tokens.css` is generated from the package; mobile builds a TS theme from the same numbers and adds native-only scales (spacing, elevation props, phone/tablet font sizes) to the package in M02. |
| Locale strings | **Yes**, via `packages/i18n` (shipped) | `apps/web/shared/lib/i18n.ts` already imports `resources` and the namespace constants from it; a parity test fails a key present in one locale only. Mobile adds the i18next instance and `expo-localization` detection (M03). The `site` namespace (`@kidlearn/i18n/site`) is never imported by mobile. |
| Admin contracts (`packages/types/src/api/admin*`) | **No** | Exported from the same barrel, so a path rule cannot catch them: M01's Biome override on `apps/mobile/**` restricts the admin export *names*, bans namespace imports, and a test keeps the name list in step with `api/admin*.ts`. The same override bans `@kidlearn/i18n/site`, `@kidlearn/ui` and `@kidlearn/db`. |
| Pure logic already shared | **Yes** | Quiz grading `evaluateAnswer` (`packages/types/src/quiz/evaluate.ts`, the same function the server grades with), `LESSON_STEPS` and the resume helpers (`domain/progress.ts`), `pickLocale` (`domain/locale.ts`), `MAX_CHILDREN_PER_PARENT` (`domain/children.ts`), the screen-time option sets (`domain/screen-time.ts`), `CONSENT_VERSION` and `hasCurrentConsent` (`api/parent.ts`). |
| Pure logic still in `apps/web` | **Lift on first use** | `features/screen-time/duration.ts` and `shared/lib/relative-time.ts` → `@kidlearn/i18n` (M03); `features/parent/parent-redirect.ts` (M08); the avatar slug→glyph table (M09); the world gradient colours (M11); `features/lesson/lesson-machine.ts`, `step-reports.ts`, `pending-writes.ts`, `asset-fallback.ts` (M13); `features/activities/evaluate.ts` (M16); the trace coverage and geometry maths (M17); the quiz session reducer (M19); the story reader machine (M23). Each moves into a shared package in the mobile file that first needs it, with `apps/web` re-pointed in the same change. `worlds.ts` returns `CSSProperties` and `avatars.ts` carries Tailwind classes — lift only the data, never the presentation. Do not extract anything pre-emptively. |
| React components (`packages/ui`, `apps/web/shared/components`) | **No** | Radix primitives are DOM-bound, Tailwind v4's `@theme` CSS variables do not exist in React Native, and every gesture-driven kid widget needs a native reimplementation regardless. Sharing here means rewriting the web app, not saving mobile work. |
| Fetch helpers (`apps/web/shared/api/*` and each feature's `*-api.ts`) | **No, at first** | Mobile needs its own client because auth headers differ (§7.5). Extracting a shared `packages/api-client` later is a fair refactor once both sides have settled. |

### 4.3 Request flow

```
Native screen
  → lib/api-client.ts     (typed wrapper: base URL, timeout, retry/cold-start, { data } | { error } envelope)
    → authClient fetch    (attaches the SecureStore-held session cookie)
      → Express API       (better-auth session → requireParent → route)
        → Zod parse       (the same packages/types schema the server documents)
          → screen state
```

Same envelope and same error codes as the web app. The only new link in the chain is the
cookie-attaching fetch. As on web (`apps/web/shared/api/api-client.ts`), the client owns the
cross-cutting responses so no screen re-implements them:

| Response | Meaning | Client behaviour |
| --- | --- | --- |
| `401` | Session gone | `onUnauthorized` → signed out → login |
| `403 CONSENT_REQUIRED` | Consent missing or outdated — guards child creation and **every** progress and event write, heartbeat included | `onConsentRequired` → refresh `/api/auth/me` → consent screen |
| other `403 FORBIDDEN` | No active child, an admin account, or a refused cross-origin write — all share the code | Re-read `/api/auth/me` and route from the result (picker, "this app is for parents", or error); never branch on the message |
| `409` with `details.code` | `STEP_OUT_OF_ORDER`, `LESSON_NOT_PLAYED`, `STORY_NOT_STARTED`, consent-version `CONFLICT` | Handled by the owning screen — never retried blindly |
| `423 TIME_LIMIT_REACHED` / `OUTSIDE_WINDOW` | Screen-time gate | Friendly lockout (M25) |
| `429 RATE_LIMITED` | 300/min/IP globally; 30 client events and 30 quiz submissions per child per minute | Never retried in a loop |

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
| The `kidlearn_locale` cookie (read server-side, written by `LanguageSwitch`) | `expo-localization` | Detect device locale, then the same i18next instance and the same JSON. |
| `localStorage` / cookies | `expo-secure-store` (session) + `@react-native-async-storage/async-storage` (preferences) | Never put the session in AsyncStorage. |
| `document.visibilitychange` | `AppState` | Load-bearing for learning-time heartbeats and screen-time enforcement. §9. |
| `window.matchMedia('prefers-reduced-motion')` | `AccessibilityInfo.isReduceMotionEnabled` + change listener | design.md §5.2 still applies. |
| `Intl.RelativeTimeFormat` / `Intl.NumberFormat` | Same API on Hermes — **verify Bengali on Android early** | Android Hermes ICU data is narrower than a browser's. Budget for `@formatjs` polyfills in phase M0. |
| `next/image` | `expo-image` | Caching, blurhash placeholders, Cloudinary URLs unchanged. |
| `@kidlearn/ui` a11y prefs (`localStorage`) | OS settings at MVP | High-contrast, dyslexia font and reduced motion on web are an in-app store; on native, `AccessibilityInfo` and the OS font scale are the source (open question 2). |
| Vitest + jsdom + RTL | `jest-expo` + `@testing-library/react-native` | §10. |

---

## 6. Design-system parity

`document/design.md` remains the single source of truth. What changes is only the
mechanism:

- **Tokens.** `packages/tokens` already exports the §2.2 table as TypeScript
  (`themes.kid.colors.primary`, `themes.parent.colors.background`, plus `radius`, `motion`,
  `brand`), held to design.md by a test. M02 adds the native-only scales (spacing, elevation
  props, phone/tablet font sizes). `tailwind.config.js` builds its colour palette from that object, so
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

The existing model — better-auth, httpOnly cookie session, social sign-in for parents, and
`activeChildProfileId` stored *on the session* — survives intact. What exists today
(`apps/server/src/config/auth.ts`, better-auth 1.7): Google only, no plugins,
`trustedOrigins: [WEB_ORIGIN]`, account linking **off**, a 30-day sliding parent session, a 12-hour
non-sliding admin session, and an `emailAndPassword` provider that only admins use.

### 7.1 Server: register the Expo plugin (M06)

`plugins: [expo()]` and `kidlearn://` added to `trustedOrigins`. The native client calls better-auth's
own `POST /api/auth/sign-in/social` with a **relative** `callbackURL`, which `expoClient` turns into
`kidlearn://…`; the plugin copies the client's `expo-origin` header into `origin` so the scheme passes
`trustedOrigins`, and hands the session cookie back through the deep link. The web-only
`GET /api/auth/google` wrapper (a plain anchor for the homepage dialog, hardcoded to the web callback)
is **not** changed — no `?client=` parameter, no client-supplied callback, so no open redirect.

CORS is unaffected. `rejectCrossOriginWrites` passes requests with no `Origin` (what React Native's
`fetch` sends) and exempts `/api/auth/*`, so native writes need no allow-list entry — M06 pins that
with a test, and M04 checks it on a real device, because a client that *does* send an unlisted
`Origin` is refused with 403.

### 7.2 Server: Sign in with Apple (M06)

App Store Review Guideline **4.8** requires Sign in with Apple whenever third-party social login is
the *only* option, and KidLearn qualifies for no exemption. M06 adds `socialProviders.apple` (Services
ID, client-secret JWT, `appBundleIdentifier` for native `idToken` verification), required in production
only, and teaches parent provisioning (`findOrCreateParentForUser`) that an `apple` account is as good as
a `google` one — it still refuses any admin user.

### 7.3 Identity across providers

Account linking stays **off**: it was disabled so a Google sign-in on the seeded admin's address cannot
inherit the admin user, and turning it on globally reopens that. Consequences, written into M06 and
surfaced by M07's login screen:

- Google on web, then Apple with the **same** email on iOS → refused with `account_not_linked`; the app
  says "use the provider you signed up with".
- Apple "Hide My Email" → a relay address, so a separate parent account. Recovery is the original provider.

Guarded linking (allowed only when the target user has no `credential` account and no `AdminUser` row)
would remove the first case; it is open question 1, not planned work.

### 7.4 Parents only — no admin path

The app has no password field and calls no `/api/admin/*` route. An admin who signs in with Google or
Apple gets `403` from `/api/auth/me` (`findOrCreateParentForUser` refuses an `AdminUser`); M07 treats
that as a terminal "this app is for parents" state and clears the local session.

### 7.5 Client: session storage and the fetch wrapper (M04, M07)

`expoClient({ scheme: "kidlearn", storagePrefix: "kidlearn", storage: SecureStore })`
stores the session cookie in the device keychain/keystore and attaches it to outgoing
requests. Consequences for `lib/api-client.ts`:

- `credentials: "include"` does nothing on native — the cookie comes from the auth
  client, so **all** API calls must go through the wrapper that adds it.
- `authClient.getCookie()` is **async** in better-auth 1.7 — any helper reading it must be `async`.
- Sign-out (FR-AUTH-07) revokes the session server-side — which also ends the active child — then
  clears SecureStore and the client's cached session **before** navigating to the login screen.
  Navigating first lets the parent guard see a still-"ready" session and bounce straight back to the
  dashboard; web hit exactly this while sign-in was the `/parent/login` page.

### 7.6 Consent is versioned — and bundled

`CONSENT_VERSION` (`packages/types/src/api/parent.ts`) ships inside the binary, and
`POST /api/parent/consent` refuses any other version with `409`. Routing uses
`parent.hasCurrentConsent`, never `consentGivenAt`. When the policy changes:

1. Publish the new text and version as an **EAS Update** (JS only, no store review).
2. Then deploy the server bump.
3. A binary that missed the update gets `409` and shows "update the app". It never re-posts the
   server's `details.currentVersion` — that would record consent to text the parent did not see.

Meanwhile `requireConsent` guards every progress and event write, so a child mid-lesson on an
outdated consent is rerouted to the parent's consent screen by the `403 CONSENT_REQUIRED` handler (§4.3).

### 7.7 What does *not* change

The parent area is reached from the signed-in Google/Apple session alone (FR-AUTH-04 is retired). The
server-enforced gates are `requireConsent` (child creation, progress, events), `requireActiveChild`
(content, `/api/me`, progress, events, screen-time status) and the screen-time gate.
`activeChildProfileId` continues to be set only by `POST /api/children/:id/activate`.

---

## 8. Screen parity map

Web route → mobile route, with the porting note that matters:

| Web route | Mobile route | Porting note |
| --- | --- | --- |
| `/` homepage, `/guide/*` | — | Web only (FR-SITE). The app launches into the sign-in screen or the profile picker. |
| homepage `?signin=parent` dialog, `/parent/login` | `(parent)/login` | Google + Apple buttons (§7), `expo-web-browser` session, Apple's native sheet on iOS. No password field. |
| `StudentGuard` | `(student)/_layout` guard | Same order as web: signed out → login; `!hasCurrentConsent` → consent; no active child → profile picker. |
| `/select-profile` | `(student)/select-profile` | Avatar grid; sets active child via `POST /api/children/:id/activate`, not local state. Carries the **named parent chip** (`parent.avatarUrl` + first name from `/api/auth/me`) rather than the anonymous lock the other student screens use — same door, named only here. See `user-journey-manual.md §4.2`. |
| `ParentCorner` lock | lock button in the student layout | Leads to the parent area with no PIN. Top corner, outside the thumb zone; hidden on the lesson and story players, which put their own exit there. |
| `/home` | `(student)/home` | World-themed home, streak from `GET /api/me/rewards/summary`. Full-bleed, no nav chrome; waypoints in the thumb zone. |
| `/world/[worldId]` | `(student)/world/[worldId]` | Lesson map. `expo-image` for world art. |
| `/lesson/[id]` | `(student)/lesson/[id]` | The five-step machine, resume and serialised step reports are lifted, not copied (§4.2). The server enforces step order (`409 STEP_OUT_OF_ORDER` → resync to `currentStep`) and refuses completion without evidence (`LESSON_NOT_PLAYED`). Add hardware-back handling: a child must not be able to swipe out mid-quiz without the exit confirmation. |
| — intro step | `components/lesson/steps/IntroStep` | Narration through `expo-audio`. |
| — video step | `…/VideoStep` | `expo-video`; decide fullscreen + orientation policy; preload the next step as `use-preload-next-step` does. |
| — activity step | `components/activities/*` | Engine + registry pattern ports; each renderer is rewritten on gesture-handler. |
| — quiz step | `components/quiz/*` | Same: engine ports, four renderers rewritten. Responses go up without `isCorrect` — the server grades with the shared `evaluateAnswer`; the client's own grading is instant feedback only. |
| — reward step | `components/rewards/*` | Lottie/Reanimated celebration, coin count-up, badge reveal, streak. |
| `/stories` | `(student)/stories` | Library grid. |
| `/stories/[id]` | `(student)/stories/[id]` | Page-turn gesture instead of buttons-only; keep the narration sync and completion reward. A `story_start` event must precede completion (`STORY_NOT_STARTED`) and is itself screen-time gated. |
| `/parent/onboarding/{consent,child}` | `(parent)/onboarding/*` | Consent text must be legible on a phone. Two steps: consent, then first child. Routing by the shared `resolveParentRedirect` (§4.2). |
| `/parent/children`, `/new`, `/[id]/edit` | `(parent)/children/*` | Max-5 rule is server-enforced; surface the error, do not re-implement. |
| `/parent` (dashboard) | `(parent)/index` | One `GET /api/children/:id/dashboard` call, as on web. Pure-CSS bars become `<View>` widths. Child switcher becomes a native segmented control; the `?child=` URL param becomes a router param. |
| `ParentTopBar` (all `(parent)` pages) | `(parent)/_layout` header + tabs | Web's persistent bar — Dashboard / Children / Reports, language switch, *Back to kid mode* (→ profile picker) and an avatar menu with name, email and sign out (FR-AUTH-07). On native: a bottom tab bar for the three sections, a header with the kid-mode button, and the account menu as an ActionSheet leading to Settings (language, sign out, delete account — M08). The web wordmark's link to the homepage has no counterpart. Hidden during onboarding, as on web. Sign-out ordering per §7.5. |
| — (no web screen yet) | `(parent)/settings/delete-account` | Account deletion over the existing two-step API (FR-AUTH-05). Mobile is the first client to build it; both stores require it. |
| `/parent/children/[id]/screen-time` | `(parent)/children/[id]/screen-time` | Time pickers must be native, not text inputs. |
| `/parent/reports` | `(parent)/reports` | `GET /api/children/:id/reports`; generated weekly by the server job, read-only here. |
| `(admin)` — CMS, review queue, analytics, `/admin/login` | — | Not ported, ever (§3.2). |

---

## 9. Native-only behaviour

Things with no web counterpart, each of which is a real requirement rather than polish:

- **App lifecycle drives time tracking.** `apps/web/features/screen-time/use-heartbeat.ts` beats every
  30 s while the page is visible, sends one immediately on show, and never retries. On mobile,
  `AppState` (`active` / `background` / `inactive`) starts and stops the same loop. The server drops
  beats under 20 s apart, credits time with a 90 s gap / 30 s tail, and records its own beat on every
  lesson step write — so the client loop only has to be honest, not precise. A backgrounded app must
  stop accruing learning minutes (FR-TIME-06) — otherwise a phone left face-down inflates the
  parent's dashboard. The heartbeat is consent-gated like every event write.
- **Screen-time re-check on foreground.** Returning to the app after hours must
  re-evaluate the daily limit and access window (FR-TIME-01..05) before showing content,
  not on a timer that was frozen while backgrounded.
- **Safe areas and orientation.** `react-native-safe-area-context` everywhere;
  both orientations supported per design.md §6, with the friendly rotate prompt for any
  screen that genuinely needs landscape — never a dead end.
- **Hardware back / swipe-back.** Android's back button and iOS's edge swipe must not
  drop a child out of a lesson silently. Explicit interception on kid screens.
- **Slow networks and offline.** Once deployed (web 38 · provisioning) the API is always on, so there is no cold
  start to absorb — but a slow or flaky mobile connection in Dhaka produces the same felt
  experience. Reuse the web's "mascot waking up" idea with retry/backoff, plus a distinct
  offline state driven by `@react-native-community/netinfo` — "no internet" and "this is
  taking a moment" are different messages to a parent (NFR-PERF-04).
- **Deep links.** `kidlearn://` for the OAuth callback; universal/app links only if
  marketing needs them later.
- **Kid-safety in a native shell.** No outbound links from student screens (NFR-SAFE-07 — the web
  enforces it with `app/(student)/no-external-links.test.tsx`; M28 adds the native equivalent), no ads,
  no third-party analytics SDK on kid surfaces (§12), external links on parent screens open
  in a browser sheet. The adult-verification requirement that applies once any external link ships is §12.2.
- **Splash, icon, notch, keyboard.** `expo-splash-screen` held until fonts and session
  resolve; adaptive Android icon; `KeyboardAvoidingView` on the profile forms.

---

## 10. Testing strategy

| Level | Tool | What it covers |
| --- | --- | --- |
| Unit / logic | `jest-expo`; Vitest for anything lifted into a shared package | Mobile-only logic (heartbeat/AppState reducer, auth status, error mapping, relative-time) under `jest-expo`; the lifted lesson machine, activity grading, duration and redirect resolver keep their existing Vitest tests in the package. Zod parsing of fixtures from `packages/types/src/__fixtures__`. |
| Component | `@testing-library/react-native` | Renderers, dashboard cards, empty states, a11y labels. |
| Contract | reuse of `packages/types` | Mobile parses fixtures with the same schemas the server asserts with `assertContract`. Drift becomes a type or parse error, not a runtime surprise. |
| E2E (optional) | Maestro | The two flows worth automating: parent onboarding through the first child profile, and one full lesson to reward. Cheap to write, catches native regressions nothing else does. |
| Manual device matrix | — | A low-end Android phone (the realistic target), a modern iPhone, and one tablet. Screen-reader passes with TalkBack and VoiceOver. |

The existing working agreement holds: TDD for logic-producing chunks; `pnpm lint`,
`pnpm typecheck` and `pnpm test` green before a file is marked done.

**CI.** `apps/mobile` joins the one `gates` job (`.github/workflows/ci.yml`, required on `main` and
`dev`) without changing it: Biome already lints the whole repo, and the app exposes `typecheck`,
`test` and `test:coverage` scripts so `turbo run` picks it up. Its `build` script is a no-op —
native builds are EAS's job, never `pnpm build`'s. A mobile PR is not done until `gates` is green
(`gh pr checks`). Code that moves into a shared package keeps its tests there, under Vitest.

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
  external link or purchase, privacy policy URL. Your "no ads" position satisfies most of
  it — provided nobody adds an analytics SDK to a kid screen.

  Parental gate: required before any external link, purchase or browser sheet. No student screen
  has an outbound link (NFR-SAFE-07; `apps/web/app/(student)/no-external-links.test.tsx` is the web
  check, M28 adds the native one). The parent area is **not** a gate — with no PIN, a child can reach
  it through the lock — so the parent screens follow the same rule: the privacy policy and consent
  text render in-app (M08) rather than in a browser sheet, and the requirement is met by absence.
  The first external link anywhere in the app brings M30's adult-verification challenge with it
  (e.g. typing a spelled-out number).
- **Google Play Families / Designed for Families**: declare the target age group,
  complete the **Data Safety** form honestly (child first name and age *are* personal
  data), complete the IARC content-rating questionnaire, and meet the ads policy (none).
- **Account deletion**: both stores require in-app deletion plus a web URL. The endpoints exist
  (`POST /api/parent/account/delete-request`, `DELETE /api/parent/account`) but web has no deletion
  screen — M08 builds the in-app path, and the public URL is a new web requirement to add before M30.
- **Guideline 4.8** — Sign in with Apple. Covered in §7.2 because it is engineering work,
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
| M1 — Auth & parent onboarding | M06–M09 | Server auth changes, sign-in, consent, child profiles |
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
| M01 | `apps/mobile` Expo scaffold: expo-router, TypeScript, Metro for pnpm workspaces (one React per bundle), Biome import restrictions (no admin contracts, no `site` strings), `typecheck`/`test` in Turbo and CI `gates`, dev-client build running on a device | §7.1, NFR-SCALE-03 | — | 3–4h |
| M02 | Native scales added to `packages/tokens`; NativeWind v4 + ThemeProvider (kid/parent) + `expo-font` (Fredoka/Nunito/Inter) + type scale | design.md §2–4 | M01 | 3–4h |
| M03 | Wire i18next + `expo-localization` over the existing `packages/i18n`; **verify `Intl` for `bn` on Android Hermes**, polyfill if needed; `lib/format.ts` | FR-I18N-01..03 | M01 | 2–3h |
| M04 | `lib/api-client.ts`: typed client over `packages/types`, `{ data } \| { error }` envelope, the §4.3 cross-cutting handlers (401, consent, no active child, 423, 429), retry/backoff, offline states, NetInfo, no-`Origin` write checked on a device | §4.3, §7.5, NFR-PERF-04 | M01 | 3–4h |
| M05 | Native primitives: BigButton, IconTile, Card, Sheet, safe-area layout, reduced-motion hook, a11y label conventions | NFR-A11Y-01..06 | M02 | 2–3h |
| M06 | **Server**: `expo()` plugin, `kidlearn://` trusted origin, Sign in with Apple, Apple-aware parent provisioning, linking kept off, no-`Origin` write test (+ OpenAPI update) | FR-AUTH-02, FR-AUTH-06, guideline 4.8 | M04 | 3–4h |
| M07 | Mobile auth client: `expoClient` + SecureStore, Google + Apple sign-in, session bootstrap behind the splash, admin refusal, sign-out, `/me` | FR-AUTH-02, FR-AUTH-06, FR-AUTH-07 | M06 | 3–4h |
| M08 | Versioned consent (+ update-the-app path), shared `resolveParentRedirect` lifted from web, settings, account deletion | FR-AUTH-03, FR-AUTH-05, NFR-SAFE-03, 05..06 | M07 | 2–3h |
| M09 | Child profile CRUD (max 5), avatar picker, activate-child | FR-PROF-01..07 | M08 | 3–4h |
| M10 | Profile picker + active-child context, incl. the named parent chip | FR-AUTH-06, FR-PROF-03 | M09 | 3–4h |
| M11 | World-themed home: waypoints in the thumb zone, streak display, `expo-image` art, both orientations | FR-WORLD-01..03, FR-GAM-06 | M10 | 3–4h |
| M12 | World/lesson browsing screens over the content API, lesson start with the 423 branch | FR-CURR-02, FR-WORLD-04..05 | M11 | 2–3h |
| M13 | Lesson player shell: lift the lesson machine and serialised step reports, resume, server step-order resync, back-button/exit guard | FR-LSN-01..07 | M12 | 3–4h |
| M14 | Audio layer (`expo-audio`): narration, UI and feedback sounds, mute, ducking, screen narration hook | FR-LSN-02, FR-I18N-05 | M13 | 3–4h |
| M15 | Intro step + video step (`expo-video`), orientation/fullscreen policy, next-step preload | FR-LSN-01..02, NFR-PERF-02 | M14 | 3–4h |
| M16 | Activity engine + registry + feedback layer (lift `evaluate.ts`); drag-drop on gesture-handler/Reanimated | FR-ACT-01, FR-ACT-05..06 | M13 | 3–4h |
| M17 | Tracing activity: `react-native-svg` + gestures, reusing the `svg-path-properties` maths | FR-ACT-02, FR-ACT-05 | M16 | 3–4h |
| M18 | Match + puzzle activities | FR-ACT-03..05 | M16 | 3–4h |
| M19 | Quiz engine + MCQ + picture-select, progress indicator | FR-QUIZ-01, FR-QUIZ-04..05, 07 | M13 | 3–4h |
| M20 | Match-pair + drag-answer formats, response submission (server-graded), score screen | FR-QUIZ-02..03, 06, 08 | M19, M18 | 3–4h |
| M21 | Reward step: star burst, coin count-up, badge reveal, streak celebration (Lottie/Reanimated), reduced-motion variants | FR-LSN-05, FR-GAM-01..08 | M15, M20 | 3–4h |
| M22 | Story library | FR-STORY-01, 04..05, 08 | M12 | 3–4h |
| M23 | Story reader: page-turn gestures, narration sync, completion reward | FR-STORY-02..03, 06..07 | M21, M22 | 3–4h |
| M24 | Learning-time heartbeats driven by `AppState` (30 s, consent-gated, server de-duplicates) | FR-TIME-06, FR-LSN-07 | M13 | 3–4h |
| M25 | Screen-time limits, access windows, friendly lockout, foreground re-check | FR-TIME-01..05 | M24 | 3–4h |
| M26 | Parent dashboard: child switcher, minute cards, subject bars, activity timeline, empty states; the `(parent)` navigation header + account menu (sign out, back to kid mode) | FR-DASH-01..04, FR-AUTH-07 | M08, M09, M10, M24 | 4–5h |
| M27 | Weekly reports screen | FR-DASH-05..06 | M26 | 3–4h |
| M28 | Accessibility & device pass: TalkBack/VoiceOver, target sizes, contrast, reduced motion, tablet + low-end Android, both orientations | NFR-A11Y-*, NFR-PERF-01..03 | M21, M26 | 3–4h |
| M29 | Performance & stability: bundle/asset budget, image and audio caching, cold-start UX, crash reporting, error boundaries | NFR-PERF-* | M28 | 3–4h |
| M30 | App identity & store assets: icon, splash, adaptive icon, bundle IDs, screenshots (EN/BN), listings, privacy policy, Data Safety, IARC, Kids Category answers, adult-verification challenge (§12.2) once any external link ships | §12 | M28 | 4–5h |
| M31 | EAS production builds + TestFlight + Play internal testing; **requires web 38 · provisioning (not started)** | §11, §12 | M29, M30, web 38 · provisioning | 3–4h |
| M32 | Closed testing (12 testers / 14 days), review responses, production release, EAS Update channel and rollback runbook | §12 | M31 | 3–4h |

Roughly **32 files ≈ 95–115 hours** of build time, plus store lead time that runs in
parallel. The critical path to something installable on your own phone is M01 → M04 →
M07 → M13 → M16 — about a third of the work.

---

## 14. Environment & configuration

| Variable / setting | Where | Value |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `apps/mobile` | local: `http://<your-LAN-IP>:4000` — **not** `localhost`; a physical device cannot reach your Mac's loopback. Android emulator: `http://10.0.2.2:4000`. Preview builds: `https://api.dev.kidlearn.net`. Store builds: `https://api.kidlearn.net`. Both hosts are created by web 38 · provisioning (not started). |
| `scheme` | `app.config.ts` | `kidlearn` — must match `expoClient({ scheme })` and the server's `trustedOrigins`. |
| iOS bundle ID / Android package | `app.config.ts` | e.g. `net.kidlearn.app` (aligns with the `kidlearn.net` domain). Changing these after first submission is not possible — decide once. |
| `MOBILE_APP_SCHEME` | `apps/server` (`config/env.ts`) | `kidlearn://`, added to `trustedOrigins` beside `WEB_ORIGIN` (M06). |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | `apps/server`, SSM per environment | Required in production only. The client secret is a JWT that expires within six months — a runbook rotation item. |
| Google OAuth redirect URIs | Google Cloud console | Unchanged for mobile: the callback still lands on the API host. The app never holds a client secret. |
| Apple Services ID + key | Apple developer portal | Return URL `https://api.kidlearn.net/api/auth/callback/apple`; bundle ID `net.kidlearn.app` (§7.2). |
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
| Backend / DB / media | Unchanged — web file 38's AWS stack (one EC2 `t4g.small` behind Caddy, ~$13.73/month for both environments, not yet provisioned) serves the mobile app too, at no extra cost for a second client |

Mobile adds Apple's $99/year and Google's one-off $25 on top of the backend, and nothing else recurring.

---

## 16. Risks & mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Sign in with Apple missed until review** | Rejection, a lost submission cycle | Built in phase M06, before any UI depends on the sign-in shape. |
| **A native auth change reopens the admin-inheritance hole** | An admin's account taken over by a social sign-in | Account linking stays off (§7.3); M06 asserts it in a test; parent provisioning still refuses an `AdminUser`. |
| **Consent version bumped while old binaries are installed** | Those parents cannot record consent; children are locked out of progress writes | Consent text and version ship by EAS Update before the server bump (§7.6); old binaries show "update the app". |
| **Duplicate React in the Metro bundle** | Every hook throws — seen on web in `51eaae6` | Metro resolves React from `apps/mobile` only; shared packages stay React-free (M01). |
| **A native request that sends an `Origin` header** | 403 from `rejectCrossOriginWrites` | M04 verifies a write on a real device; never add an app origin to the allow-list to "fix" it without understanding which library set the header. |
| **Kids Category rejection** (analytics/ads/parental gate) | Weeks of delay | No third-party SDK on kid surfaces; no outbound links. If any external link or purchase ships, M30 adds the adult-verification challenge (§12.2); read guideline 1.3 and 5.1.4 before M30. |
| **New Play account 12-tester / 14-day rule** | Two extra weeks before production | Recruit testers during phase M8; start the closed test as soon as M31 produces a build. |
| **Gesture-driven activities feel worse than the web versions** | Core experience regression | Build M16 early on a real low-end Android; treat it as a spike whose result can change library choices. |
| **NativeWind version churn** | Rework | Pin v4.x. v5 is pre-release, Tailwind-v4-only and yarn-only — do not adopt on this project. |
| **`Intl` gaps for Bengali on Android** | Broken dates/numbers in one of two shipped languages | Verified in M03, polyfilled there if needed. |
| **pnpm + Metro resolution issues** | Confusing early-days breakage | Solved once in M01 with a monorepo Metro config; never worked around per-file. |
| **API not publicly deployed** | Cannot submit at all | Web 38 · provisioning (not started) is a stated prerequisite of M31. |
| **Cookie-session on native is subtly different from web** | Silent 401s | All requests go through one wrapper (M04); `getCookie()` is awaited; sign-out clears SecureStore. |
| **Content thinness on a device demo** | Looks unfinished | Independent of mobile: the admin CMS and AI pipeline (shipped) must have published enough content. |
| **Solo maintenance of two clients** | Sustained cost | The shared contract package is the lever — keep response types and platform-free logic in `packages/*`, never redeclared or copied per client. |

---

## 17. Open questions

1. **Guarded account linking** — let Google and Apple with the same verified email resolve to one
   parent, by allowing linking only when the target user has no `credential` account and no
   `AdminUser` row. Removes the `account_not_linked` dead end (§7.3); must not reopen admin
   inheritance. Decide before M31, when real parents meet it.
2. **In-app accessibility preferences** — web has high-contrast, dyslexia-font and reduced-motion
   toggles (`packages/ui/src/lib/a11y-prefs.ts`, `localStorage`-backed, NFR-A11Y-03..05). Port them at
   MVP, or rely on OS settings only (M05 does the latter)?
3. **Android minimum version** — API 24 or 26? Affects device reach and some libraries.
4. **Tablet layout ambition at MVP** — "works" versus "designed for".
5. **Push notifications** — post-launch feature or never? It changes the store
   declarations if it lands later.
6. **Bengali-first store listing** — is BN the primary market for the store metadata, or
   English with BN as secondary?
7. **Web "Sign in with Apple"** — a parent who signs up with Apple on iOS cannot sign in on the web
   today. Add Apple to the web dialog, or accept that Apple-only parents are app-only?

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
