# KidLearn Mobile — Implementation Progress Tracker (Master File)

> **Source plan:** `document/mobile-app-plan.md` (high-level plan)
> **Source specs:** `document/project-requirement-details.md`, `document/design.md`
> **Web/server tracker:** `document/implementation/00-progress-tracker.md` — several files here depend on web files, and those dependencies are named per row.
> **How to use:** implement in serial order. Each `MNN` file is a self-contained 3–4 hour chunk. A file may only be started when everything in its **Depends on** column is ✅ Done. Update the **Status** column as you go: `⬜ Not started` → `🟨 In progress` → `✅ Done`.
> **Reference rule:** every PR/commit references the file number and FR IDs — e.g. `feat(mobile): lesson player shell (M13, FR-LSN-01..07)`.

---

## Phase Overview

| Phase | Files | Theme |
| ----- | ----- | ----- |
| M0 — Foundation | M01–M05 | Expo scaffold, monorepo wiring, tokens, i18n, API client, primitives |
| M1 — Auth & parent onboarding | M06–M09 | Server auth changes, sign-in, consent, PIN, child profiles |
| M2 — Student shell | M10–M12 | Profile picker, world home, lesson browsing |
| M3 — Lesson player | M13–M15 | Step engine, audio, intro/video |
| M4 — Activities | M16–M18 | Engine + drag-drop, tracing, match/puzzle |
| M5 — Quiz | M19–M20 | Engine + four formats, scoring |
| M6 — Gamification | M21 | Rewards, badges, characters, streaks |
| M7 — Stories | M22–M23 | Library, narrated reader |
| M8 — Time & parent dashboard | M24–M27 | Heartbeats, screen-time, dashboard, reports |
| M9 — Hardening & release | M28–M32 | A11y, performance, store assets, builds, launch |

---

## Progress Table

| # | File | Feature | Requirement IDs | Depends on | Est. | Status |
| --- | --- | --- | --- | --- | --- | --- |
| M01 | `M01-expo-scaffold-and-monorepo-wiring.md` | `apps/mobile` Expo + expo-router + Metro for pnpm + Turbo/Biome wiring + dev client on a device | §7.1, NFR-SCALE-03 | — | 3–4h | ⬜ Not started |
| M02 | `M02-tokens-package-theming-and-fonts.md` | `@kidlearn/tokens`, NativeWind v4, `ThemeProvider` (kid/parent), Fredoka/Nunito/Inter, type scale | design.md §2–4 | M01 | 3–4h | ⬜ Not started |
| M03 | `M03-i18n-package-and-locale-detection.md` | `@kidlearn/i18n` (locales moved out of `apps/web`), i18next + `expo-localization`, `Intl` check for `bn` on Android | FR-I18N-01..03 | M01 | 3–4h | ⬜ Not started |
| M04 | `M04-api-client-and-network-states.md` | `lib/api-client.ts` over `@kidlearn/types`, envelope, retry/cold start, offline detection | §7.3, NFR-PERF-04 | M01 | 3–4h | ⬜ Not started |
| M05 | `M05-native-primitives-and-a11y.md` | `BigButton`, `IconTile`, `Card`, `Sheet`, `PinKeypad`, safe-area screen, reduced-motion hook, a11y conventions | NFR-A11Y-01..06 | M02 | 3–4h | ⬜ Not started |
| M06 | `M06-server-expo-auth-and-apple-signin.md` | **Server**: `expo()` plugin, `kidlearn://` trusted origin, whitelisted mobile OAuth callback, Sign in with Apple, OpenAPI update | FR-AUTH-02, guideline 4.8 | M04 | 3–4h | ⬜ Not started |
| M07 | `M07-mobile-auth-client-and-session.md` | `expoClient` + SecureStore, Google + Apple sign-in, session bootstrap behind splash, sign-out | FR-AUTH-02, FR-AUTH-06 | M06 | 3–4h | ⬜ Not started |
| M08 | `M08-consent-pin-gate-and-deletion.md` | Consent screen, PIN setup, PIN gate + 15-minute grant, account deletion entry point | FR-AUTH-03..05, NFR-SAFE-05..06 | M07 | 3–4h | ⬜ Not started |
| M09 | `M09-child-profile-management.md` | Child profile CRUD (max 5), avatar picker, activate-child | FR-PROF-01..07 | M08 | 3–4h | ⬜ Not started |
| M10 | `M10-profile-picker-and-active-child.md` | Profile picker + `ActiveChildProvider` | FR-AUTH-06, FR-PROF-03 | M09 | 3–4h | ⬜ Not started |
| M11 | `M11-student-home-and-streak.md` | World-themed home, thumb-zone waypoints, streak display, both orientations | FR-WORLD-01..03, FR-GAM-06 | M10 | 3–4h | ⬜ Not started |
| M12 | `M12-world-and-lesson-browsing.md` | World screen + lesson list, published + grade filtering | FR-CURR-02, FR-WORLD-04..05 | M11 | 3–4h | ⬜ Not started |
| M13 | `M13-lesson-player-shell.md` | Five-step machine, resume, progress saving, back/exit guard | FR-LSN-01..07 | M12 | 3–4h | ⬜ Not started |
| M14 | `M14-audio-layer-and-narration.md` | `expo-audio`: narration, UI + feedback sounds, mute, ducking, screen narration | FR-LSN-02, FR-I18N-05 | M13 | 3–4h | ⬜ Not started |
| M15 | `M15-intro-and-video-steps.md` | Intro step + `expo-video` step, orientation policy, next-step preload | FR-LSN-01..02, NFR-PERF-02 | M14 | 3–4h | ⬜ Not started |
| M16 | `M16-activity-engine-and-drag-drop.md` | Activity engine + registry + feedback layer; drag-drop on gesture-handler/Reanimated | FR-ACT-01, FR-ACT-05..06 | M13 | 3–4h | ⬜ Not started |
| M17 | `M17-trace-activity.md` | Tracing on `react-native-svg` + gestures, reusing `svg-path-properties` | FR-ACT-02, FR-ACT-05 | M16 | 3–4h | ⬜ Not started |
| M18 | `M18-match-and-puzzle-activities.md` | Match-objects + picture puzzle | FR-ACT-03..05 | M16 | 3–4h | ⬜ Not started |
| M19 | `M19-quiz-engine-mcq-and-picture.md` | Quiz engine + MCQ + picture-select + progress indicator | FR-QUIZ-01, 04..05, 07 | M13 | 3–4h | ⬜ Not started |
| M20 | `M20-quiz-match-drag-and-scoring.md` | Match-pair + drag-answer, scoring, response recording, score screen | FR-QUIZ-02..03, 06, 08 | M19, M18 | 3–4h | ⬜ Not started |
| M21 | `M21-rewards-and-celebration.md` | Star burst, coin count-up, badge reveal, streak celebration, reduced-motion variants | FR-LSN-05, FR-GAM-01..08 | M15, M20 | 3–4h | ⬜ Not started |
| M22 | `M22-story-library.md` | Story library browsing | FR-STORY-01, 04..05, 08 | M12 | 3–4h | ⬜ Not started |
| M23 | `M23-story-reader.md` | Page-turn gestures, narration sync, completion reward | FR-STORY-02..03, 06..07 | M21, M22 | 3–4h | ⬜ Not started |
| M24 | `M24-learning-time-heartbeat.md` | Heartbeats driven by `AppState` | FR-TIME-06, FR-LSN-07 | M13 | 3–4h | ⬜ Not started |
| M25 | `M25-screen-time-gate-and-lockout.md` | Limits, access windows, friendly lockout, foreground re-check | FR-TIME-01..05 | M24 | 3–4h | ⬜ Not started |
| M26 | `M26-parent-dashboard.md` | Child switcher, minute cards, subject bars, activity timeline, empty states | FR-DASH-01..04 | M09, M24 | 3–4h | ⬜ Not started |
| M27 | `M27-weekly-reports.md` | Weekly report list + detail — **blocked on web file 30** | FR-DASH-05..06 | M26, web 30 | 3–4h | ⬜ Not started |
| M28 | `M28-accessibility-and-device-pass.md` | TalkBack/VoiceOver, target sizes, contrast, reduced motion, tablet + low-end Android, orientations | NFR-A11Y-*, NFR-PERF-01..03 | M21, M26 | 3–4h | ⬜ Not started |
| M29 | `M29-performance-and-crash-reporting.md` | Asset budget, image/audio caching, cold-start UX, error boundaries, crash reporting | NFR-PERF-* | M28 | 3–4h | ⬜ Not started |
| M30 | `M30-store-assets-and-compliance.md` | Icon, splash, bundle IDs, screenshots (EN/BN), listings, privacy policy, Data Safety, IARC, Kids Category | plan §12 | M28 | 4–5h | ⬜ Not started |
| M31 | `M31-eas-production-builds-and-testing.md` | Production builds, TestFlight, Play internal testing — **requires web file 38 deployed** | plan §11–12 | M29, M30, web 38 | 3–4h | ⬜ Not started |
| M32 | `M32-closed-testing-and-release.md` | Closed test (12 testers / 14 days), review responses, production release, OTA + rollback runbook | plan §12 | M31 | 3–4h | ⬜ Not started |

---

## Shared Technical Decisions (apply to every file)

Fixed across all mobile files so chunks stay consistent:

- **Workspace name:** the package in `apps/mobile/package.json` is named `mobile`, so every command is `pnpm --filter mobile <script>` (matching `web` and `server`).
- **Path alias:** `@/*` → `apps/mobile/*`, same convention as `apps/web`.
- **Naming:** components are `PascalCase.tsx` under `components/`; everything under `lib/` is `kebab-case.ts`. Mirrors `apps/web`.
- **Routing:** `expo-router`, route groups `(student)` and `(parent)` mirroring the web app's groups.
- **Styling:** NativeWind **v4.x** (pinned — v5 is pre-release, Tailwind-v4-only and yarn-only). Class names come from `tailwind.config.js`, whose palette is generated from `@kidlearn/tokens`. Never a raw hex in a component.
- **Animation:** `react-native-reanimated` + `react-native-gesture-handler`. Animate `transform`/`opacity` only; every animation has a reduced-motion branch.
- **Types:** every request and response shape is imported from `@kidlearn/types`. Never redeclared in `apps/mobile`.
- **Auth:** better-auth cookie session via `@better-auth/expo` + `expo-secure-store`. `credentials: "include"` does nothing on native — every call goes through `lib/api-client.ts`.
- **Tests:** `jest-expo` + `@testing-library/react-native` in `apps/mobile` (`pnpm --filter mobile test`). Vitest stays everywhere else. This is the one documented deviation from the web tracker's "Vitest everywhere".
- **Lint/format:** Biome, repo-wide from the root (`pnpm lint` / `pnpm format`). No per-app lint script.
- **i18n:** `@kidlearn/i18n` holds the EN/BN JSON; namespaces are `common`, `student`, `parent`, `lesson` — identical to the web app's.
- **App identity:** scheme `kidlearn`, iOS bundle ID and Android package `net.kidlearn.app`. Both are permanent after first submission.
- **API base URL:** `EXPO_PUBLIC_API_URL`. Never a secret in an `EXPO_PUBLIC_*` variable — those are readable in the shipped bundle.
- **Server-authoritative:** unchanged from the web app. The mobile client reports events and renders answers; it never computes rewards, minutes, streaks or lockouts.
- **Server changes:** only M06 touches `apps/server`. Any other file that thinks it needs a server change must add the requirement to `document/project-requirement-details.md` first, then to a numbered file.

## Working Agreement

1. Read the file fully before starting; it carries the requirement detail and the technical approach.
2. TDD where the chunk produces logic (reducers, grading, gates, parsing): failing test → minimal code → pass → commit.
3. Run `pnpm lint && pnpm typecheck && pnpm --filter mobile test` before marking a file ✅ Done.
4. Every file is verified on **a real Android device** at least once, not only a simulator. Phase M0 exists partly to make that loop cheap.
5. A file that changes an API endpoint is not ✅ Done until the OpenAPI document covers it and `pnpm --filter server test` passes (`standards/backend.md §7`).
6. If a requirement emerges that is not in the master spec, add it to `document/project-requirement-details.md` first, then to the relevant file here.
