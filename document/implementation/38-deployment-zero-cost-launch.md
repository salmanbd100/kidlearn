# 38 — Zero-Cost Deployment & Launch

> **Estimated effort:** 3–4 hours
> **Depends on:** 16, 29, 37
> **Requirement IDs:** spec §9, NFR-PERF-02, NFR-PERF-04
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Put KidLearn on the internet for $0: `apps/web` on Vercel (monorepo-aware build), `apps/server` on Render's free tier (cold starts absorbed by the file-13 retry/"mascot waking up" UX per NFR-PERF-04), a production Supabase Postgres reached through PgBouncer pooling with a direct connection reserved for migrations, production Cloudinary credentials (CDN-served media per NFR-PERF-02), cross-origin cookie auth that actually works in production, a complete environment-variable matrix covering every var introduced in files 02–36, a keep-warm option, a post-deploy smoke-test checklist, and rollback notes.

## Context & Current State

The whole MVP works locally: web on :3000, server on :4000, `pnpm dev` via Turborepo. The server's `lib/env.ts` Zod-parses all configuration and refuses to boot incomplete (file 08); `GET /health` is DB-free and cheap (cold-start friendly). The web app's `apiFetch` (file 13) already retries with backoff and exposes a `coldStart` flag for the friendly loader. better-auth issues cookie sessions from the server origin (file 09) — locally same-site, in production cross-origin (Vercel domain ↔ Render domain) unless a custom domain is used. `packages/db` holds all Prisma migrations; the seed creates worlds/subjects/badges/characters and one playable lesson. Nothing has ever been deployed; no production projects, databases, or credentials exist. Note: the spec's generic `AUTH_SECRET` is named `BETTER_AUTH_SECRET` in this codebase (file 09).

## Detailed Requirements

1. **Supabase production database:** new project; the app connects via the **pooled** connection (PgBouncer, port **6543**, `?pgbouncer=true&connection_limit=1`) as `DATABASE_URL`; migrations use the **direct** connection (port **5432**) as `DIRECT_URL`. `packages/db/prisma/schema.prisma` `datasource` must declare `directUrl = env("DIRECT_URL")` (add it if file 02 didn't). Apply all migrations with `prisma migrate deploy` (never `migrate dev` against prod) and run the seed once.
2. **`apps/server` on Render (free tier):** Web Service, runtime Node 22, **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @kidlearn/db db:generate && pnpm --filter @kidlearn/db exec prisma migrate deploy && pnpm --filter server build` — migrations run in the build step (free tier has no pre-deploy hook), using `DIRECT_URL`. **Start command:** `node apps/server/dist/index.js`. **Health check path:** `/health` (DB-free by design, file 08). Bind to `process.env.PORT` (Render injects it — already how `lib/env.ts` works).
3. **`apps/web` on Vercel:** import the repo, **Root Directory: `apps/web`**, enable "Include source files outside of the Root Directory" (monorepo). Vercel auto-detects Turborepo + pnpm from the lockfile; build command stays the default (`next build`, turbo-aware). Set `NEXT_PUBLIC_API_URL` to the Render URL. Preview deployments get the same env (previews talk to the one free backend — acceptable for MVP, documented risk).
4. **Cross-origin auth (production CORS + cookies):** `WEB_ORIGIN` = the exact Vercel production URL (file-08 CORS already allows exactly one origin with credentials). better-auth cookies must be `SameSite=None; Secure` in production and the Express app needs `app.set("trust proxy", 1)` (Render terminates TLS) — make both conditional on `NODE_ENV === "production"`. Google OAuth console gains the production redirect URI `https://<render-host>/api/auth/callback/google`, and `BETTER_AUTH_URL` = the Render origin. **Documented alternative (preferred once a domain exists):** put web on `kidlearn.example` and the API on `api.kidlearn.example` — same site, so cookies go back to `SameSite=Lax` and third-party-cookie blocking (Safari ITP) stops being a concern. MVP launches cross-origin; revisit at custom-domain time.
5. **Environment variable matrix** — every var, per app, secret vs public (binding; `lib/env.ts` is the enforcement):

   | Var | App | Secret? | Production value / note |
   |---|---|---|---|
   | `NODE_ENV` | server | no | `production` |
   | `PORT` | server | no | injected by Render — do not set |
   | `DATABASE_URL` | server | **yes** | Supabase pooled, port 6543, `?pgbouncer=true&connection_limit=1` (file 02) |
   | `DIRECT_URL` | server (build) | **yes** | Supabase direct, port 5432 — migrations only (file 02) |
   | `WEB_ORIGIN` | server | no | `https://<project>.vercel.app` (file 08) |
   | `LOG_LEVEL` | server | no | `info` (file 08) |
   | `BETTER_AUTH_SECRET` | server | **yes** | fresh `openssl rand -base64 32` — never reuse dev (file 09) |
   | `BETTER_AUTH_URL` | server | no | `https://<service>.onrender.com` (file 09) |
   | `GOOGLE_CLIENT_ID` | server | no | prod OAuth client (file 09) |
   | `GOOGLE_CLIENT_SECRET` | server | **yes** | prod OAuth client (file 09) |
   | `APP_TIMEZONE` | server | no | `Asia/Dhaka` (file 27) |
   | `CLOUDINARY_CLOUD_NAME` | server | no | production cloud (file 33) |
   | `CLOUDINARY_API_KEY` | server | no | (file 33) |
   | `CLOUDINARY_API_SECRET` | server | **yes** | (file 33) |
   | `ANTHROPIC_API_KEY` | server | **yes** | (file 34) |
   | `ANTHROPIC_MODEL` | server | no | `claude-sonnet-4-5` default (file 34) |
   | `ELEVENLABS_API_KEY` | server | **yes** | (file 36) |
   | `ELEVENLABS_VOICE_ID_EN` / `_BN` | server | no | chosen child-friendly voices (file 36) |
   | `GEMINI_API_KEY` | server | **yes** | (file 36) |
   | `GEMINI_IMAGE_MODEL` | server | no | default `gemini-2.5-flash-image` (file 36) |
   | `AI_TEXT_JOBS_PER_DAY` / `AI_AUDIO_JOBS_PER_DAY` / `AI_IMAGE_JOBS_PER_DAY` | server | no | 50 / 200 / 100 — tighten for launch (file 36) |
   | `NEXT_PUBLIC_API_URL` | web | no (public) | `https://<service>.onrender.com` (file 13) |

6. **Cold starts (NFR-PERF-04):** Render free services sleep after ~15 min idle; first request takes 30–60 s. Verify the file-13 UX end-to-end against a genuinely sleeping service (mascot loader + retry, no error flash). **Keep-warm option:** an external pinger (cron-job.org or UptimeRobot, free) hitting `GET /health` every 10 minutes — permitted within Render's free-tier ToS but burns the 750 free instance-hours/month faster only if you have multiple services (one service = always within budget). Ship the pinger; document how to turn it off.
7. **Smoke-test checklist (post-deploy, manual):** documented as a runnable list in this file's Acceptance Criteria — sign-in through real Google, child creation, a seeded lesson played end-to-end on a phone, dashboard time visible, admin review queue loads.
8. **Rollback notes:** Vercel — promote the previous deployment ("Instant Rollback") from the dashboard; Render — "Manual Deploy → Deploy previous commit" (free tier has no one-click rollback; redeploying a pinned commit is the procedure). Database — migrations are forward-only; a bad migration is fixed by a new forward migration, never by editing applied ones. Write these into `document/runbook.md`.

## Technical Approach & Suggestions

Files to create/modify:

```
packages/db/prisma/schema.prisma          # datasource: directUrl = env("DIRECT_URL") (if missing)
apps/server/src/lib/env.ts                # + DIRECT_URL optional at runtime (build-time only)
apps/server/src/app.ts                    # app.set("trust proxy", 1) in production
apps/server/src/lib/auth.ts               # cookie sameSite/secure switched on NODE_ENV
apps/server/.env.example                  # final authoritative list (matches the matrix)
apps/web/.env.local.example               # NEXT_PUBLIC_API_URL
document/runbook.md                       # deploy, keep-warm, smoke test, rollback
```

Datasource block:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled: PgBouncer :6543, pgbouncer=true&connection_limit=1
  directUrl = env("DIRECT_URL")     // direct :5432 — used by prisma migrate only
}
```

Production cookie config (better-auth options in `lib/auth.ts`):

```ts
advanced: {
  useSecureCookies: env.NODE_ENV === "production",
  defaultCookieAttributes: env.NODE_ENV === "production"
    ? { sameSite: "none", secure: true, partitioned: false }
    : { sameSite: "lax" },
},
```

Order of operations matters — deploy back-to-front: (1) Supabase project + both URLs; (2) Cloudinary production cloud; (3) Render service with the full env (use a placeholder `WEB_ORIGIN`, e.g. the predicted Vercel URL); (4) Vercel project with `NEXT_PUBLIC_API_URL`; (5) correct `WEB_ORIGIN` to the real Vercel URL and redeploy the server; (6) update the Google OAuth client (prod redirect URI + authorized JS origin) and set `BETTER_AUTH_URL`; (7) seed (`pnpm --filter @kidlearn/db db:seed` run locally against `DIRECT_URL` — one-time, from a trusted machine); (8) create the first `AdminUser` row the same way (file 31's bootstrap procedure); (9) configure the cron pinger.

Vercel specifics: framework preset Next.js; Node 22; `pnpm` picked up from `packageManager`; no `vercel.json` needed. Turbo remote caching is optional — skip for MVP (zero-config local cache is fine; document `npx turbo link` as the upgrade path). Render specifics: region closest to Bangladesh users (Singapore), instance type Free, auto-deploy on push to `main`, and set `pnpm` via `corepack enable` in the build command (Render images ship Node + corepack).

## Step-by-Step Plan

1. Add `directUrl` to the Prisma datasource and `DIRECT_URL` handling to env files; verify `prisma migrate deploy` works against a local Postgres using split URLs. (~20 min)
2. Make the production switches: `trust proxy`, `SameSite=None; Secure` cookies behind `NODE_ENV`; add a Supertest asserting dev keeps `lax` (prod path is verified live in step 7). (~25 min)
3. Create the Supabase project; run `prisma migrate deploy` + seed + first `AdminUser` against `DIRECT_URL`; confirm tables in the Supabase dashboard. (~25 min)
4. Create the Render service (build/start/health-check per Requirements 2) with the full env matrix; deploy; `curl https://<service>.onrender.com/health` returns the `{ data: { status: "ok" } }` envelope. (~30 min)
5. Create the Vercel project (root `apps/web`, outside-files enabled, `NEXT_PUBLIC_API_URL`); deploy; fix `WEB_ORIGIN` on Render to the real URL and redeploy. (~25 min)
6. Update the Google OAuth client with production origins/redirects; sign in on the production site; verify the session cookie arrives `SameSite=None; Secure` and survives a reload. (~20 min)
7. Let the service sleep (or suspend/resume it), then load the production site cold: confirm the mascot "waking up" loader and successful retry, not an error (NFR-PERF-04); then configure the cron-job.org pinger on `/health` every 10 min. (~20 min)
8. Run the full smoke test on a real phone (checklist below); write `document/runbook.md` (deploy order, env matrix pointer, keep-warm on/off, rollback steps); `pnpm lint && pnpm typecheck` still pass; update the tracker — MVP launched. (~30 min)

## Acceptance Criteria

- [ ] `https://<service>.onrender.com/health` returns the JSON envelope; Render's health check shows green; the build log shows `prisma migrate deploy` applying all migrations with zero pending.
- [ ] The production web app loads on the Vercel URL; all API traffic goes to `NEXT_PUBLIC_API_URL` (no localhost references in the bundle — check the network tab).
- [ ] Smoke test passes end-to-end on a phone: (1) parent signs in with Google; (2) consent + PIN setup; (3) child profile created; (4) seeded lesson plays through all five steps with audio; (5) parent dashboard shows the learning time just spent; (6) `/admin/ai-queue` loads for the admin user and lists/filters jobs.
- [ ] A cold request (service slept ≥15 min) shows the friendly loading state and completes — never a raw error (NFR-PERF-04).
- [ ] Auth works cross-origin: the session cookie is `Secure; SameSite=None`, requests from the Vercel origin carry credentials, and a request with a forged `Origin` gets no CORS allow header (file-08 lockdown intact in prod).
- [ ] `prisma migrate deploy` uses `DIRECT_URL` (5432) while the running app uses the pooled `DATABASE_URL` (6543) — confirm via Supabase connection stats showing app connections only on the pooler.
- [ ] Media (images/audio) on lesson and story screens is served from `res.cloudinary.com` (CDN, NFR-PERF-02).
- [ ] Rollback rehearsed once: redeploy the previous commit on Render and instant-rollback on Vercel, both restoring the prior version; the procedure is written in `document/runbook.md`.
- [ ] Every var in the matrix exists in the respective platform's env settings and `apps/server/.env.example` / `apps/web/.env.local.example` match the matrix exactly.

## Out of Scope

- Custom domain purchase/setup and the same-site cookie migration it enables (documented above as the upgrade path; do when a domain exists).
- Paid-tier upgrades (Render always-on instances, Supabase Pro, Turbo remote caching) — the §9 architecture lets each layer upgrade independently.
- CI pipelines (GitHub Actions test gates, preview-env databases) — post-MVP hardening.
- Observability beyond pino logs (error tracking, uptime alerting dashboards) — post-MVP.
- Load testing and CDN tuning beyond Cloudinary defaults (NFR-PERF-03 monitoring continues post-launch).
