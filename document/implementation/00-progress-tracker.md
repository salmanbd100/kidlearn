# KidLearn — Implementation Progress Tracker (Master File)

> **Source spec:** `document/project-requirement-details.md` (Master Requirements v1.0)
> **How to use:** Implement files in serial order. Each numbered file is a self-contained 3–4 hour chunk. A file may only be started when everything in its **Depends on** column is ✅ Done. Update the **Status** column as you go: `⬜ Not started` → `🟨 In progress` → `✅ Done`.
> **Reference rule:** every PR/commit should reference the file number and the FR IDs it implements (e.g. `feat: lesson player shell (16, FR-LSN-06..07)`).

---

## Phase Overview

| Phase | Files | Theme |
| ----- | ----- | ----- |
| 0 — Foundation | 01–02 | Workspace packages, test runner, database package |
| 1 — Data Layer | 03–07 | Prisma schemas + shared JSON/Zod schemas |
| 2 — Backend Core | 08–12 | Server architecture, auth, profiles, content APIs |
| 3 — Frontend Foundation | 13–15 | i18n, theming, parent UI, student home |
| 4 — Lesson Experience | 16–22 | Lesson player, activity engine, quiz engine |
| 5 — Gamification | 23–24 | Rewards, badges, characters, streaks |
| 6 — Stories | 25–26 | Story library + narrated reader |
| 7 — Time & Dashboards | 27–30 | Learning time, screen time, parent dashboard, reports |
| 8 — Admin CMS | 31–33 | Admin auth, curriculum management, media + editors |
| 9 — AI Pipeline | 34–37 | Generators, audio/images, review queue |
| 10 — Launch | 38 | Zero-cost deployment |

---

## Progress Table

| # | File | Feature | Requirement IDs | Depends on | Est. | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | `01-workspace-packages-and-test-setup.md` | Real workspace packages (`types`, `ui`, `config`) + Vitest | NFR-SCALE-03, §12.8 | — | 3–4h | ✅ Done |
| 02 | `02-database-package-prisma-supabase.md` | `packages/db`: Prisma + Supabase wiring | §7.2, §9 | 01 | 3–4h | 🟨 In progress (code done; awaiting Supabase project + `.env` for live `/health/db` smoke test) |
| 03 | `03-auth-profile-db-schema.md` | Parent / AdminUser / ChildProfile schema + consent | FR-AUTH-03, FR-PROF-01..02, NFR-SAFE-03 | 02 | 3–4h | ⬜ Not started |
| 04 | `04-curriculum-world-db-schema.md` | Subject / Topic / Lesson / World / MediaAsset schema | FR-CURR-01..04, FR-WORLD-01..05 | 02, 03 | 3–4h | ⬜ Not started |
| 05 | `05-activity-quiz-story-db-schema.md` | Activity / Quiz / Story schema (JSONB payloads) | FR-ACT-06, FR-QUIZ-07, FR-STORY-* (data) | 04 | 3–4h | ⬜ Not started |
| 06 | `06-progress-gamification-db-schema.md` | Progress, rewards, streaks, screen time, reports, AI jobs schema | FR-LSN-06..07, FR-GAM-*, FR-TIME-06, FR-DASH-05, FR-AI-08 (data) | 03, 05 | 3–4h | ⬜ Not started |
| 07 | `07-shared-types-activity-quiz-schemas.md` | Versioned Zod/JSON schemas for activities & quizzes in `packages/types` | FR-ACT-06, FR-QUIZ-07, NFR-SCALE-02 | 01 | 3–4h | ⬜ Not started |
| 08 | `08-server-foundation-api-architecture.md` | Express app structure, middleware, validation, error handling | §7.3, NFR-PERF-04 | 02 | 3–4h | ⬜ Not started |
| 09 | `09-parent-google-oauth.md` | Google OAuth sign-in + profile-scoped sessions | FR-AUTH-02, FR-AUTH-06 | 03, 08 | 3–4h | ⬜ Not started |
| 10 | `10-pin-gate-consent-account-deletion.md` | PIN parental gate, COPPA consent, full account deletion | FR-AUTH-03..05, NFR-SAFE-05..06 | 09 | 3–4h | ⬜ Not started |
| 11 | `11-child-profile-api.md` | Child profile CRUD API (max 5, owner-only access) | FR-PROF-01..07, NFR-SAFE-02 | 09 | 3–4h | ⬜ Not started |
| 12 | `12-curriculum-content-read-api.md` | Published-only, grade+language-filtered content read APIs | FR-PROF-03, FR-CURR-02, §7.3.4 | 04, 05, 08 | 3–4h | ⬜ Not started |
| 13 | `13-web-app-foundation-i18n.md` | Next.js app shell, i18next (EN/BN), theme tokens, audio helper | FR-I18N-01..03, NFR-A11Y-01..06 | 01 | 3–4h | ⬜ Not started |
| 14 | `14-parent-onboarding-profile-ui.md` | Parent sign-in, consent, PIN setup, child profile management UI | FR-AUTH-02..04, FR-PROF-01..02, 05..06 | 10, 11, 13 | 3–4h | ⬜ Not started |
| 15 | `15-student-profile-select-and-home.md` | Profile picker, world-themed home, lesson browsing, streak display | FR-AUTH-06, FR-PROF-03, FR-WORLD-01..03, FR-GAM-06 (display) | 12, 13, 14 | 3–4h | ⬜ Not started |
| 16 | `16-lesson-player-shell-step-engine.md` | Five-step lesson flow state machine, resume, progress saving | FR-LSN-01..07 (shell), FR-LSN-06..07 | 12, 15 | 3–4h | ⬜ Not started |
| 17 | `17-lesson-intro-and-video-steps.md` | Intro greeting step + narrated video step | FR-LSN-01..02, NFR-PERF-02 | 16 | 3–4h | ⬜ Not started |
| 18 | `18-activity-engine-and-drag-drop.md` | Generic JSON-driven activity engine + drag-and-drop activity | FR-ACT-01, FR-ACT-05..06 | 07, 16 | 3–4h | ⬜ Not started |
| 19 | `19-trace-letters-numbers-activity.md` | Letter/number tracing activity (touch + mouse) | FR-ACT-02, FR-ACT-05 | 18 | 3–4h | ⬜ Not started |
| 20 | `20-match-and-puzzle-activities.md` | Match-objects + picture puzzle activities | FR-ACT-03..05 | 18 | 3–4h | ⬜ Not started |
| 21 | `21-quiz-engine-mcq-picture-selection.md` | JSON-driven quiz engine + MCQ + picture selection formats | FR-QUIZ-01, FR-QUIZ-04..05, FR-QUIZ-07 | 07, 16 | 3–4h | ⬜ Not started |
| 22 | `22-quiz-match-drag-and-scoring.md` | Match-pair + drag-answer formats, scoring, response recording | FR-QUIZ-02..03, FR-QUIZ-06, FR-QUIZ-08 | 21 | 3–4h | ⬜ Not started |
| 23 | `23-rewards-engine-and-celebration.md` | Server-side stars/coins grants, reward ledger, celebration screen | FR-LSN-05, FR-GAM-01..02, FR-GAM-07..08 | 06, 16, 22 | 3–4h | ⬜ Not started |
| 24 | `24-badges-characters-streaks.md` | Badge milestone engine, character unlocks, learning streaks | FR-GAM-04..06 | 23 | 3–4h | ⬜ Not started |
| 25 | `25-story-library.md` | Story read API + library browsing UI | FR-STORY-01, FR-STORY-04..05, FR-STORY-08 | 05, 08, 13 | 3–4h | ⬜ Not started |
| 26 | `26-story-reader.md` | Page-by-page narrated story reader + completion reward | FR-STORY-02..03, FR-STORY-06..07 | 23, 25 | 3–4h | ⬜ Not started |
| 27 | `27-learning-time-tracking.md` | Server-side session heartbeats + learning time aggregation | FR-TIME-06, FR-DASH-02 (data), FR-LSN-07 | 06, 09, 16 | 3–4h | ⬜ Not started |
| 28 | `28-screen-time-controls.md` | Daily limits, access windows, friendly lockout enforcement | FR-TIME-01..05 | 14, 27 | 3–4h | ⬜ Not started |
| 29 | `29-parent-dashboard.md` | Per-child summary, subject progress, recent activity | FR-DASH-01..04 | 14, 23, 27 | 3–4h | ⬜ Not started |
| 30 | `30-weekly-reports.md` | Weekly report generation job + report history UI | FR-DASH-05..06 | 29 | 3–4h | ⬜ Not started |
| 31 | `31-admin-auth-cms-foundation.md` | Admin auth, CMS layout, role guard, basic usage analytics | §4.3, FR-CMS-01 (shell), FR-CMS-07 (basic) | 08, 13 | 3–4h | ⬜ Not started |
| 32 | `32-admin-curriculum-management.md` | CRUD for subjects/topics/lessons/worlds, ordering, publish workflow | FR-CURR-04, FR-CMS-01, FR-CMS-06 | 31 | 3–4h | ⬜ Not started |
| 33 | `33-admin-media-upload-and-editors.md` | Media upload (Cloudinary), quiz/activity/badge editors, lesson preview | FR-CMS-02..04, FR-GAM-04 (admin) | 32 | 3–4h | ⬜ Not started |
| 34 | `34-ai-pipeline-foundation-lesson-generator.md` | AI job model/API, Claude integration, AI lesson generator, audit log | FR-AI-01, FR-AI-08 | 07, 31 | 3–4h | ⬜ Not started |
| 35 | `35-ai-story-and-quiz-generators.md` | AI story generator + AI quiz generator (schema-validated JSON) | FR-AI-02..03 | 34 | 3–4h | ⬜ Not started |
| 36 | `36-ai-audio-and-image-generation.md` | ElevenLabs narration (EN/BN) + image generation + character consistency | FR-AI-04..06, FR-AI-09, FR-I18N-05 | 33, 34 | 3–4h | ⬜ Not started |
| 37 | `37-ai-review-queue.md` | Human review queue: approve / edit-then-approve / reject | FR-AI-07, FR-CMS-05..06 | 35, 36 | 3–4h | ⬜ Not started |
| 38 | `38-deployment-zero-cost-launch.md` | Vercel + Render/Fly + Supabase + Cloudinary deployment, cold-start UX | §9, NFR-PERF-04 | 16, 29, 37 | 3–4h | ⬜ Not started |

---

## Shared Technical Decisions (apply to every file)

These are fixed across all implementation files so chunks stay consistent:

- **Monorepo:** pnpm 9 + Turborepo. New packages need `package.json` with `name` + `dev`/`build`/`typecheck` scripts (no per-package `lint` — Biome runs repo-wide).
- **Lint/format:** Biome only (`pnpm lint` / `pnpm format`). No ESLint/Prettier.
- **Testing:** Vitest everywhere (`apps/web` with React Testing Library + jsdom, `apps/server` with Supertest). Set up in file 01.
- **Database:** Supabase PostgreSQL via Prisma in `packages/db`; JSONB columns for activity/quiz payloads.
- **Validation:** Zod schemas in `packages/types` — single source of truth shared by frontend renderers, backend validators, and AI generation prompts.
- **Auth:** Google OAuth only for parents (better-auth on Express with the Prisma adapter; cookie sessions). PIN gate is an app-level check, not a second auth system.
- **i18n:** `i18next` + `react-i18next` on the frontend; per-language asset references (text/audio URLs keyed by locale) in the database. Locales: `en`, `bn`.
- **Drag & drop:** `@dnd-kit/core` (touch-friendly, accessible).
- **AI text/quizzes:** Claude API (latest Sonnet-class model) producing JSON validated against `packages/types` schemas. Audio: ElevenLabs. Images: Gemini image models. Video: partially manual at MVP (FR-AI-06 allowance).
- **Media:** Cloudinary free tier (images, audio, short video).
- **Publishing rule:** every content row carries `status` (`draft → in_review → approved/rejected → published`); student-facing queries filter `status = published` — always, at the query layer.
- **Server-authoritative:** rewards, streaks, screen time, completion are computed server-side; the client only reports events.

## Working Agreement

1. Read the implementation file fully before starting; it contains the requirement details and technical suggestions.
2. Follow TDD where the chunk produces logic (schemas, APIs, engines): failing test → minimal code → pass → commit.
3. Run `pnpm lint && pnpm typecheck` and the relevant tests before marking a file ✅ Done.
4. If a requirement emerges that isn't in the master spec, add it to `document/project-requirement-details.md` first, then to the relevant implementation file.
