# KidLearn — Implementation Progress Tracker (Master File)

> **Source spec:** `document/project-requirement-details.md` (Master Requirements v1.0)
> **How to use:** Implement files in serial order. Each numbered file is a self-contained 3–4 hour chunk. A file may only be started when everything in its **Depends on** column is ✅ Done. Update the **Status** column as you go: `⬜ Not started` → `🟨 In progress` → `✅ Done`.
> **Reference rule:** every PR/commit should reference the file number and the FR IDs it implements (e.g. `feat: lesson player shell (16, FR-LSN-06..07)`).

---

## Phase Overview

| Phase | Files | Theme |
| ----- | ----- | ----- |
| 0–9 — Foundation to AI pipeline | 01–37a | ✅ Shipped; specs retired |
| 10 — Launch | 38–38a | Vercel frontend + one AWS box for both environments' APIs, GitHub Actions CD |
| 11 — Hardening | 39 | CI gates and branch protection |

---

## Progress Table

Files **01–37a** (workspace and database packages, schemas, server, auth, profiles, content API,
OpenAPI, web foundation, lesson/activity/quiz engines, rewards, stories, time and screen-time
controls, parent dashboard, weekly reports, admin CMS, AI pipeline and the free-tier provider
migration) are ✅ Done. Their specs were deleted to keep this directory readable — the code,
`/docs`, `database-design.md` and `standards/` are the record; `git log -- document/implementation`
has the originals. Only unfinished work is listed below.

| # | File | Feature | Requirement IDs | Depends on | Est. | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 38 | `38-deployment-aws-docker.md` | Frontend on Vercel (two Hobby projects); both APIs on one EC2 `t4g.small` (`ap-south-1`) behind Caddy: prod on `api.kidlearn.net` + Supabase, dev on `api.dev.kidlearn.net` + a Postgres container. SSM secrets, Cloudflare DNS, per-env Cloudinary/Gemini — ~$13.75/month | §9, NFR-PERF-02, NFR-PERF-04 | 16, 29, 37, 37a | 8–9h | 🟨 In progress — the repository half is done and verified locally: both Dockerfiles build and their containers answer (`/health` 200, `/docs` 404, Prisma's arm64 engine present), `trust proxy`, the `SITE_NOINDEX` header, `proxy.ts` and the CI escape-hatch build. **No AWS, Vercel, Cloudflare or Supabase resource is provisioned**, so the acceptance criteria — which are almost all about a running deployment — are unmet, and `document/runbook.md` is a plan rather than a record. Not `✅ Done` until the §15 provisioning order has been executed |
| 38a | `38a-github-actions-continuous-deployment.md` | API deploys only (Vercel ships the frontend): `dev` → api.dev.kidlearn.net, `main` → api.kidlearn.net. Per-environment OIDC roles (no stored AWS keys), native arm64 build → ECR, `promotion-guard` on `main`, health-gated SSM rollout, rollback by env + image tag | §9 | 38, 39 | 3–4h | ⬜ Not started |
| 39 | `39-ci-pipeline-and-branch-protection.md` | GitHub Actions gates (lint → build → typecheck → test), pnpm + Turbo caching, coverage reporting, `gates` required on `main` and `dev` | — (makes `general.md §6`'s `[CI]` tier real) | — | 2–3h | 🟨 In progress — pipeline landed and green (#45). Requirement 10 (added 2026-09-10) extends the triggers to `dev`, which had gone unchecked through #46, #47 and #49 — on `39-…-fix-2`, verified by that branch's own PR into `dev`. The ruleset rule is still pending on the Supertest flake |

### Open follow-up fixes

`general.md §7` sends a bug found while implementing one file to its own branch rather than the
current one. Closed entries are removed; they live in git history.

| Branch | What | Found by | Status |
| --- | --- | --- | --- |
| Supertest listener lifecycle in `apps/server` (no branch yet) | `request(app)` binds a fresh ephemeral listener per call, so under load the suite churns ports faster than the OS retires them. **Eleven** files have failed this way across ~40 runs with four signatures: `socket hang up`, `Parse Error: Expected HTTP/`, `Test timed out in 5000ms`, and assertions on a body that never arrived. Each passes 8/8 in isolation. `TURBO_CONCURRENCY=1` does **not** fix it (3 runs in 6 serialised). The fix is one listener per file rather than per request; the real-database suites (`*.db.test.ts`) replace part of that suite, so it belongs with them. **This is what blocks making `gates` a required status check.** | File 39 | ⬜ Not started |

---

## Shared Technical Decisions (apply to every file)

These are fixed across all implementation files so chunks stay consistent:

- **Monorepo:** pnpm 9 + Turborepo. New packages need `package.json` with `name` + `dev`/`build`/`typecheck` scripts (no per-package `lint` — Biome runs repo-wide).
- **Lint/format:** Biome only (`pnpm lint` / `pnpm format`). No ESLint/Prettier.
- **Testing:** Vitest everywhere (`apps/web` with React Testing Library + jsdom, `apps/server` with Supertest). Set up in file 01.
- **Database:** Supabase PostgreSQL via Prisma in `packages/db`; JSONB columns for activity/quiz payloads.
- **Validation:** Zod schemas in `packages/types` — single source of truth shared by frontend renderers, backend validators, and AI generation prompts.
- **API documentation (from file 12a):** every endpoint is registered in the OpenAPI document (`apps/server/src/openapi/paths/`) **in the same change that adds it**. Request schemas come from the route's own Zod validator; response schemas are Zod in `packages/types/src/api/` and are asserted in the route test with `assertContract`. A route missing from the registry fails `apps/server/src/openapi/coverage.test.ts`, so this is not optional. Browse the current API at `/docs`. Frontend files consume `packages/types/src/api/` rather than redeclaring response shapes. See `standards/backend.md §7`.
- **Auth:** Google OAuth only for parents (better-auth on Express with the Prisma adapter; cookie sessions).
- **i18n:** `i18next` + `react-i18next` on the frontend; per-language asset references (text/audio URLs keyed by locale) in the database. Locales: `en`, `bn`.
- **Drag & drop:** `@dnd-kit/core` (touch-friendly, accessible).
- **AI providers (revised in file 37a — every one on a genuinely usable free tier):** text/quizzes and images both run on one Google AI Studio `GEMINI_API_KEY` — `gemini-2.5-flash` answering against a `responseJsonSchema` generated from the `packages/types` schemas, and `gemini-2.5-flash-image` drawing illustrations. Audio: Google Cloud Text-to-Speech, Standard voices, one voice per language (`GOOGLE_TTS_API_KEY`; its Cloud project needs a billing account attached even though free-tier usage bills $0). Video: partially manual at MVP (FR-AI-06 allowance). Claude and ElevenLabs are gone — no key for either is needed anywhere. The `AI_*_JOBS_PER_DAY` caps are sized to trip before Google's own free-tier quota does; Google no longer publishes per-model daily limits, so read aistudio.google.com/rate-limit before raising them.
- **Media:** Cloudinary free tier (images, audio, short video).
- **Publishing rule:** every content row carries `status` (`draft → in_review → approved/rejected → published`); student-facing queries filter `status = published` — always, at the query layer.
- **Server-authoritative:** rewards, streaks, screen time, completion are computed server-side; the client only reports events.
- **CI (from file 39):** `.github/workflows/ci.yml` runs `pnpm lint`, `pnpm build`, `pnpm typecheck` and `pnpm test:coverage` as one `gates` job on every PR and every push to either long-lived branch (`main`, `dev`). A PR is not done until it is green (`gh pr checks`). The test step is serialised (`TURBO_CONCURRENCY=1`) because five concurrent Vitest instances oversubscribe a 4-core runner — not as a flake fix; `apps/server`'s Supertest suites still fail intermittently at the socket level, which is why `gates` is not a required check yet. See file 39's Context. Coverage is reported, never gated on a threshold.

## Working Agreement

1. Read the implementation file fully before starting; it contains the requirement details and technical suggestions.
2. Follow TDD where the chunk produces logic (schemas, APIs, engines): failing test → minimal code → pass → commit.
3. Run `pnpm lint && pnpm typecheck` and the relevant tests before marking a file ✅ Done — and, from file 39, confirm CI is green on the PR (`gh pr checks`). Locally-green and CI-green are no longer independent facts.
4. If a requirement emerges that isn't in the master spec, add it to `document/project-requirement-details.md` first, then to the relevant implementation file.
5. A file that adds or changes an API endpoint is not ✅ Done until the OpenAPI document covers it and `pnpm --filter server test` passes — the coverage test will tell you if it does not.
