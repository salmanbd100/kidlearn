# 38 — Deployment: Vercel Frontend, One EC2 Box for the APIs

> **Estimated effort:** 8–9 hours — about two hours of repository work (done) plus the 6–8 hours of
> provisioning in `document/deployment-walkthrough.md`. Natural checkpoint after production is live
> (walkthrough A18); no dev-environment work is needed before it.
> **Depends on:** the web app and API MVP (complete)
> **Requirement IDs:** spec §9, NFR-PERF-02, NFR-PERF-04
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing
>
> **Status.** The repository half is implemented and verified locally: both Dockerfiles, `deploy/`,
> `apps/web/proxy.ts`, `trust proxy`, the `SITE_NOINDEX` headers and the CI image builds. **No AWS,
> Vercel, Cloudflare or Supabase resource has been provisioned yet**, so everything about the running
> system is a plan.
>
> **Where things live.** This file holds the goal, decisions and why, cost, acceptance criteria and
> scope. The repository files under `deploy/`, `apps/*/Dockerfile` and `.github/workflows/ci.yml` are
> the source of truth for what runs. `document/deployment-walkthrough.md` is the one-time
> provisioning procedure. `document/runbook.md` is topology, every value's home, and steady-state
> operations. Nothing below is repeated there.
>
> **Settled 2026-09-10: there is no parental PIN gate.** The parent area is reached by Google sign-in
> alone; account deletion keeps its single-use confirmation token, which is now the whole guard on it.

## Goal

Put KidLearn on **Vercel for the frontend and one `t4g.small` EC2 instance in `ap-south-1` for the
two APIs**, for roughly **$13.73/month**, in two environments: production (`main`) and development
(`dev`). The hostname and database for each are the topology table in `runbook.md` §1.

Caddy fronts the two API hostnames with automatic Let's Encrypt certificates; Vercel terminates TLS
for the three web hostnames itself. Media stays on Cloudinary. Every server secret lives in SSM
Parameter Store under a per-environment path; the frontend's handful of values live in Vercel's
project settings. This file gets both environments working by hand; file 38a automates the API
deploys from GitHub Actions, while Vercel's Git integration deploys the frontend on its own.

The domain being bought *before* the first deploy is what makes this work. Every hostname shares one
registrable domain, so within each environment web and API are the **same site** even though they
are different origins, and `src/config/auth.ts` keeps the `sameSite: "lax"` it already has.
better-auth sets a host-scoped cookie on the API host; the browser sends it back on
`credentials: "include"` fetches because `SameSite=Lax` permits same-site requests. The
`SameSite=None; Secure` cross-origin workaround is never written, Safari's cross-site tracking
prevention never gets a say in whether a parent stays signed in, and moving the frontend to Vercel
changes none of it. Do **not** add a `SameSite=None` override to `advanced.defaultCookieAttributes`.

## Context & Current State

The whole MVP works locally: web on :3000, server on :4000, `pnpm dev` via Turborepo. The deployment
relies on these existing facts and changes none of them:

- `apps/server/src/config/env.ts` Zod-parses every variable and refuses to boot on a missing or
  malformed one. It reads `PORT`, so a container port is configuration, not code.
- `GET /health` is DB-free and cheap (`src/modules/health/health.routes.ts`) — the container
  healthcheck. `/ready` runs one database read.
- `apps/server/src/app.ts` passes `origin: [env.WEB_ORIGIN]` to `cors({ credentials: true })` —
  exactly one origin, no wildcard. Per environment that is exactly right, and it stays right with
  the frontend on Vercel.
- `packages/db/prisma/schema.prisma` already declares `url = env("DATABASE_URL")` and
  `directUrl = env("DIRECT_URL")`.
- `apps/web/shared/api/api-client.ts` reads `NEXT_PUBLIC_API_URL` and sends `credentials: "include"`.
- **`apps/web` makes no server-side API calls** — no route handlers, and the only server-side read is
  `cookies()` in `app/layout.tsx` for the locale. Every call to the Express API is made from the
  browser. That is what makes the frontend a clean fit for Vercel: no server secret ever reaches it,
  and no SSR render blocks on a round trip to Mumbai.
- The repo-root `docker-compose.yml` is a **development** Postgres for `pnpm dev` on your own machine.
  It is not deployed, and is a different thing from the dev environment's Postgres container.

### Costs, at steady state

**The AWS free tier changed on 2025-07-15.** Accounts created on or after that date get a
credit-based plan — $100, rising to $200 on completing onboarding tasks, for six months — *not* the
old twelve months of 750 free EC2 hours. Nothing below is budgeted as free-tier.

| Item | $/month |
|---|---|
| EC2 `t4g.small` on-demand, `ap-south-1` ($0.0112/hr × 730) | 8.18 |
| Public IPv4 address, $0.005/hr — **charged since 2024-02-01 even when attached** | 3.65 |
| EBS gp3 root volume, 20 GB | ~1.70 |
| ECR private storage, two repositories under lifecycle policies | 0.10 |
| S3 nightly `pg_dump` backups (production only) | ~0.10 |
| DNS — Cloudflare free tier | 0.00 |
| Vercel Hobby — both frontend projects | 0.00 |
| Data transfer out — first 100 GB/month free account-wide, and media is on Cloudinary | 0.00 |
| Supabase free · Cloudinary free · Gemini free tier | 0.00 |
| **Total** | **≈ 13.73** |

A one-year no-upfront EC2 Instance Savings Plan takes it to roughly **$11.50**. Verify every figure
in the AWS Pricing Calculator for `ap-south-1` before provisioning — these were checked on
2026-09-06 and AWS moves them.

**`t4g.small` (2 GiB), not `t4g.medium`.** With the frontend on Vercel the box runs `prod-api` at
~250 MB, `dev-api` at ~250 MB, `dev-postgres` at ~250 MB and Caddy at ~30 MB — about **780 MB**, plus
roughly 300 MB for the operating system and the Docker daemon. That is ~1.1 GiB in 2 GiB, leaving
real headroom for a nightly `pg_dump`, an image pull and a Node heap spike at the same time. The two
Next.js containers that forced `t4g.medium` in the previous version of this design are gone, and with
them $8.17/month.

**Not `t4g.micro` (1 GiB).** 780 MB of containers plus the OS does not leave enough room to also run
a `pg_dump`, and the OOM killer does not know which container is production. $4.09/month is the wrong
thing to save here.

**Region is `ap-south-1` (Mumbai), not `ap-southeast-1` (Singapore).** The identical instance is
$0.0112/hr in Mumbai against $0.0212 in Singapore — for a box no further from Dhaka. Before
committing, `ping`/`mtr` both regions from a Bangladeshi connection and record the numbers in the
runbook; if Singapore is decisively faster the difference is defensible, but do not pay it on
assumption.

**What was rejected, and why, so it is not relitigated:** an Application Load Balancer is ~$18/month
and a NAT gateway ~$32/month — each alone costs more than this entire deployment, and one box needs
neither. ECS Fargate plus ALB plus RDS lands near $60–90/month for one environment, let alone two.
Secrets Manager is $0.40 per secret per month, roughly $12/month for ~30 values across two
environments, against $0 for SSM Parameter Store's Standard tier. A second EC2 instance for dev would
add $8.18/month and a second everything to patch. Lightsail's flat 2 GB plan is competitive on price
and includes the IPv4 address, but a Lightsail instance has no IAM instance profile — ECR pull and
SSM Parameter Store would need static access keys sitting on the box, and file 38a's OIDC plus
`ssm:SendCommand` deploy path would not work at all. That is a security regression bought for about
$3/month, so no. GHCR would save ECR's $0.10 and is free for a public repository, but it costs the
in-region pull and the instance-role integration for ten cents; also no.

### What moving the frontend to Vercel does and does not change

- **The session cookie story is completely unchanged** (see Goal). `kidlearn.net` and
  `api.kidlearn.net` were already separate origins under the previous all-Docker design.
- **CORS is unchanged.** `WEB_ORIGIN` is still exactly one origin per environment.
- **Both Google OAuth clients keep the same origins and redirect URIs** (requirement 14).
- **`app.set("trust proxy", 1)` is still required** — Caddy still terminates TLS in front of the API,
  which is where the cookie is set.

### The isolation this design does and does not give you

Say it plainly, because the rest of the file depends on the reader knowing it:

- **Data is properly isolated.** Production is on Supabase; dev is on a container. There is no
  connection string, no credential and no network path from one to the other.
- **The frontends are properly isolated.** Two separate Vercel projects with separate environment
  variables. `dev.kidlearn.net` cannot be built with production's `NEXT_PUBLIC_API_URL` by accident,
  because the value is project scoped rather than passed at build time by a script.
- **API runtime is soft-isolated.** Separate containers, separate Compose projects, separate SSM
  paths, and memory limits on the dev stack. But it is one kernel and one disk. **A dev container
  that fills the EBS volume takes the production API down with it.**
- **CI/CD isolation is a convention, not a boundary.** `ssm:SendCommand` is scoped to an *instance*,
  so a workflow able to deploy the dev API is technically able to run a command that touches
  production's containers. File 38a narrows this as far as IAM allows and then stops, because the
  remaining gap is inherent to sharing a box.

If any of that is unacceptable later, the fix is a second instance, and nothing else in the design
changes.

## Detailed Requirements

Each requirement states the decision and the reason. Procedures are in the walkthrough; values,
tables and operations are in the runbook; running configuration is in the repository files named.

1. **Production database — a new Supabase project in `ap-south-1` (Mumbai)**, so it sits beside the
   instance; every Prisma query pays that round trip. The existing
   `aws-1-ap-southeast-1.pooler.supabase.com` project in `packages/db/.env.example` is your local
   development database and is untouched. This design uses one of the free tier's two project
   slots, because dev deliberately does not touch Supabase. The free-tier ceilings (size, egress,
   inactivity pause, no PITR) are in `runbook.md` §12. Migrations are applied with
   `prisma migrate deploy` against `DIRECT_URL` and never `migrate dev`; the seed and the first
   `AdminUser` (`pnpm --filter server seed:admin`) are run once, from your own machine
   (walkthrough A2, A6).

2. **Development database — a `postgres:16-alpine` container on the box**, on the dev Compose
   project's internal network only, with a named volume and **no published host port**. It is
   **deliberately disposable and never backed up**: dev is where a migration gets tried against a
   real deploy, and a bad one is undone by wiping and reseeding (`runbook.md` §7). Its connection
   string must not copy production's `pgbouncer`/`connection_limit` shape (`runbook.md` §4), and the
   migrate job is gated on a `pg_isready` healthcheck (`deploy/app/compose.dev.yml`).

3. **Frontend on Vercel — two Hobby projects from the same repository**, one tracking `main`, one
   tracking `dev`, each with its own production branch so neither builds the other's commits. Two
   projects rather than one with a branch-scoped domain: per-project environment variables are
   unambiguous and cannot be selected by the wrong scope, and branch domains are a plan-tier feature
   this design would rather not depend on. The cost is one extra project to configure, once.
   Project settings, the Turbo build command (a bare `next build` fails on the missing
   `@kidlearn/types` `dist`), build-time variable behaviour and the Hobby licence and
   no-overage-billing facts are in `runbook.md` §4 and §10; the Hobby facts are what trigger
   requirement 5.

4. **Gating the dev site: basic auth in `apps/web/proxy.ts`.** Caddy no longer sees
   `dev.kidlearn.net`, so its `basic_auth` cannot do this job, and Vercel's Password Protection is a
   paid feature. Next 16 renamed the `middleware` convention to `proxy`; read the docs under
   `node_modules/next/dist/docs/` before editing it, per `apps/web/AGENTS.md`. The gate is active only
   where `DEV_SITE_BASIC_AUTH` is set (dev), and is deliberately not `NEXT_PUBLIC_` — that prefix
   would inline the credential into the client bundle. The comparison is not constant-time and does
   not need to be: this is a speed bump that keeps an unreviewed-content build out of casual reach,
   not a security boundary. The boundary is that dev holds no production data.

   **No basic auth on `api.dev.kidlearn.net`.** The Google OAuth callback lands on the API host, and
   a prompt mid-redirect breaks the flow. After the callback, better-auth redirects back to
   `https://dev.kidlearn.net/parent` — a top-level navigation into the gate, which the browser
   satisfies from the credential it already cached for that origin, so the round trip is silent.

   Both dev hosts also carry `X-Robots-Tag: noindex, nofollow` — the web host via `headers()` in
   `apps/web/next.config.ts` behind a server-only `SITE_NOINDEX` flag, the API host via a Caddy
   `header` directive. Keeping an unreviewed-content build of a children's product out of search
   results is worth two lines in each place.

5. **Keep the web Dockerfile as an escape hatch — built, never deployed.** `apps/web/Dockerfile` and
   `output: "standalone"` in `next.config.ts` stay in the repository even though nothing deploys them.
   Two conditions would end the Vercel arrangement at short notice — a commercial trigger, or a
   paused project on a ceiling (`runbook.md` §10) — and the cost of being ready is one file and about
   thirty minutes. **CI builds it** (the `gates` job in `.github/workflows/ci.yml`, on x86 and never
   pushed) so it cannot rot; that step belongs inside `gates`, whose name is the status-check
   context file 39's ruleset requires, and must not be renamed or split into a second job. No ECR
   repository holds the image and no Compose file references it. The procedure is `runbook.md` §11,
   and running it is a response to a trigger, not a task in this file.

6. **Images: one Dockerfile, two targets, two ECR repositories**, all `linux/arm64` because `t4g` is
   Graviton.

   - `kidlearn-api` — `apps/server` compiled to `dist/`, production dependencies only. Configured
     entirely at runtime, so **one image serves both environments**; tag is a bare `<sha>`.
   - `kidlearn-migrate` — a second `--target` of the *same* `apps/server/Dockerfile`, keeping the
     `prisma` CLI and `packages/db/prisma/`. It is a separate repository rather than a third container
     because `prisma` is a **devDependency** of `packages/db`, so `pnpm deploy --prod` correctly
     strips it out of the runtime image. Its layers are shared with the API builder stage, so it
     costs build seconds, not minutes. Also environment-agnostic; bare `<sha>`.

   Because both images are environment-agnostic, a blanket "keep the last 10 tagged images"
   lifecycle policy per repository is correct — there are no environment-specific images to evict
   each other.

7. **`trust proxy`.** `app.set("trust proxy", 1)` in `apps/server/src/app.ts`, conditional on
   `env.NODE_ENV === "production"`. Caddy terminates TLS and is exactly one hop, so `1` is correct —
   not `true`, which trusts an arbitrary chain and lets a client forge `req.ip`. Without it,
   `req.protocol` is `http` inside the container and better-auth declines to set a `Secure` cookie.

   **Both deployed environments run with `NODE_ENV=production`.** "Development" names the
   environment, not the Node mode: a dev deployment that runs React in development mode, skips the
   Next production build and sets non-`Secure` cookies is not testing what production will do. What
   distinguishes them is hostnames, database, credentials and `ENABLE_API_DOCS` — nothing else.
   Vercel builds both frontend projects as production builds for the same reason.

8. **Caddy as the only exposed process on the box,** in its own Compose project so that redeploying
   either API stack never restarts the thing holding the certificates (`deploy/edge/`). It obtains
   and renews both API certificates itself, and starts on the ACME staging endpoint so a DNS mistake
   costs nothing (`runbook.md` §6). Application containers are reached by network alias, never by
   service name — see `runbook.md` §1. No application container publishes a host port; only Caddy
   binds 80 and 443.

9. **Networking, kept deliberately small.** Default VPC, one public subnet, one security group, an
   Elastic IP so the address survives a stop/start, and **no port 22 rule at all** — shell access is
   SSM Session Manager, which needs no inbound rule and leaves an audit trail (`runbook.md` §2;
   rules in walkthrough A10).

10. **Memory limits on the dev stack only**, and the production API left uncapped. The point is not
    to save memory but to make the kernel's choice deterministic: under pressure the OOM killer
    should take a dev container, and without limits it picks by heuristic. `bootstrap.sh` also
    provisions 2 GB of swap so that a spike degrades instead of being killed. Values and rationale are
    in `deploy/app/compose.dev.yml` and `deploy/bootstrap.sh`.

11. **Secrets in SSM Parameter Store,** every one a `SecureString`, under `/kidlearn/prod/` and
    `/kidlearn/dev/`, Standard tier (free to 10,000 parameters; this needs about 30). Each deploy
    writes its own environment's parameters into a root-owned, mode `0600` file referenced by that
    stack's `env_file`. No secret is committed, baked into an image, or held by GitHub. The frontend's
    values are not secrets and live in each Vercel project's settings. The full variable inventory,
    and where each lives, is `runbook.md` §4; `src/config/env.ts` is the enforcement for the API half.
    `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` stay out of both deployments.

12. **Environment variable matrix — now `runbook.md` §4.** The inventory of every variable, where
    it lives (SSM, Compose or Vercel) and its production and development values is kept there, and
    `src/config/env.ts` is its enforcement for the API half. It is one place, not two.

13. **DNS on Cloudflare, free tier,** proxy off on every record. Route 53 would work identically and
    costs $0.50/month for the hosted zone; Cloudflare is the same job for nothing. `api.dev` is an
    ordinary four-label name that Let's Encrypt issues for with no wildcard and no DNS challenge. The
    five records and why proxying is off are `runbook.md` §5.

14. **Two Google OAuth clients, not one.** Extend the existing client to serve local *and* dev;
    create a **new** client for production only. One client with four entries would work and is
    worse: the production client secret would then be the same string sitting in a dev environment
    that is deliberately less locked down. Origins and redirect URIs are `runbook.md` §13.

15. **Separate third-party accounts where they are free, shared where they are not.** Dev exercising
    the AI Queue must not consume production's daily allowance — the caps are sized right at the
    free-tier ceiling, so one afternoon of dev generation would leave an admin unable to work.

    - **Gemini** — a second free AI Studio key, no billing account.
    - **Cloudinary** — a second free cloud. Also keeps test uploads out of the production media
      library, which the admin UI would otherwise show as real assets.
    - **Google Cloud TTS** — *shared*, because the key needs a billing account attached and a second
      one is friction for no isolation gain. Dev's daily job caps are lower to bound what it can
      spend (`runbook.md` §4).

16. **Nightly database backup — production only.** Supabase's free tier has no point-in-time
    recovery, so the backup is yours to own: a cron entry on the box dumps production to a private
    S3 bucket (`deploy/backup.sh`, `runbook.md` §8). **Restore it once, into the dev Postgres
    container, before declaring this file done** — which is also the fastest way to get realistic
    data into dev, and an unrehearsed backup is a guess. The dev database is not backed up.

17. **Weekly reports cron — production only.** The weekly parent-report job
    (`POST /api/admin/jobs/weekly-reports`, authenticated with `CRON_SECRET`) is triggered from a
    cron entry on the box rather than cron-job.org: one fewer external account, and the secret stays
    in SSM (`deploy/weekly-reports.sh`, `runbook.md` §9). Dev runs no scheduled jobs.

18. **Cold starts are gone; the UX is not.** An always-on instance does not sleep and Vercel serves
    the frontend from its edge network, so NFR-PERF-04's 30–60 second first request disappears along
    with the keep-warm pinger. **Keep** the web API client's retry, backoff and "mascot waking up"
    loader — it still earns its place on a slow mobile connection in Dhaka, the primary device
    profile, and every API call still crosses the public internet to Mumbai. What changes is the
    acceptance criterion: verify the loader under a throttled network, not against a sleeping
    service.

19. **`apps/web` canonical URL, title and noindex.** `app/layout.tsx` sets `metadataBase` from
    `NEXT_PUBLIC_SITE_URL` (falling back to `http://localhost:3000`) and `openGraph`, so a future OG
    image or canonical link resolves absolutely, and the dev build's canonical URLs point at dev
    rather than production. The title casing matches `app.name` in the locale files (`KidLearn`).
    Do **not** attempt per-locale metadata — the locale lives in a cookie read in `layout.tsx`, and
    doing it properly is separate work. Per `apps/web/AGENTS.md`, read the Metadata API docs under
    `node_modules/next/dist/docs/` before editing.

20. **`document/runbook.md` is a deliverable of this file:** shells and logs, deploy and rollback,
    where every value lives, backup and restore, the dev wipe-and-reseed one-liner, the
    Supabase and Vercel ceilings, and the escape-hatch procedure.

21. **A billing alarm, before anything else is switched on:** AWS Budgets at **$20/month**.
    `t4g` instances default to **unlimited** CPU-credit mode, which silently bills surplus credits
    rather than throttling; that is the right default for a live site, but only with an alarm behind
    it. $20 sits comfortably above the $13.73 steady state and still catches a runaway within a day.
    Thresholds are in walkthrough A1.

## Technical Approach & Suggestions

Files to create (all exist in the repository):

```
apps/server/Dockerfile              # two targets: runner, migrate
apps/web/Dockerfile                 # escape hatch only (req 5) — built in CI, never deployed
apps/web/proxy.ts                   # basic auth on the dev site (req 4)
.dockerignore
deploy/edge/compose.yml             # Caddy + the shared external network
deploy/edge/Caddyfile
deploy/app/compose.yml              # one file, parameterised by env — used by both API stacks
deploy/app/compose.dev.yml          # overlay: postgres, mem_limit
deploy/bootstrap.sh                 # EC2 user-data: Docker, compose plugin, cron, swap
deploy/deploy.sh                    # runs on the box, takes the environment as $1
deploy/backup.sh, deploy/weekly-reports.sh
document/runbook.md
```

Files to modify:

```
apps/web/next.config.ts             # output: "standalone" (req 5), headers() for SITE_NOINDEX
apps/web/app/layout.tsx             # metadataBase, openGraph, "KidLearn" casing
apps/server/src/app.ts              # app.set("trust proxy", 1) in production
apps/server/.env.example            # production values
apps/web/.env.local.example         # NEXT_PUBLIC_SITE_URL, MEDIA_ASSET_HOSTS, SITE_NOINDEX, DEV_SITE_BASIC_AUTH
.github/workflows/ci.yml            # the escape-hatch web-image build (req 5), inside `gates`
document/project-requirement-details.md   # §9 — Vercel frontend, two environments
```

### Image builds

Use `node:22-bookworm-slim` for every stage, **not Alpine**. Prisma's query engine and `argon2` both
link against glibc and OpenSSL 3; musl means chasing
`binaryTargets = ["linux-musl-arm64-openssl-3.0.x"]` and native rebuilds for no meaningful size win.
Generating the Prisma client inside the same base image and architecture as the runtime makes `native`
resolve correctly with no `binaryTargets` entry. `argon2` is a native module; its prebuilt binaries
cover `linux/arm64`, and if the builder ever falls back to compiling it the stage needs
`python3 make g++`.

The shape of `apps/server/Dockerfile` is the file itself; the decisions behind it are:

- **Every workspace `package.json` is copied** before `pnpm install --frozen-lockfile`, not just the
  ones the server needs. `pnpm-workspace.yaml` globs `apps/*` and `packages/*`, so a missing manifest
  is a missing lockfile importer and surfaces as `ERR_PNPM_OUTDATED_LOCKFILE`.
- `pnpm deploy --filter=server --prod` runs with the **hoisted** node linker so the `@kidlearn/db`
  and `@kidlearn/types` workspace packages are injected into the output tree, followed by a
  `prisma generate` in that tree.
- The runtime entry is **`dist/server.js`**, never `dist/index.js` — there is no `src/index.ts`, and
  `apps/server/package.json`'s `main` and `start` both name `dist/server.js`. A stale
  `dist/index.js` from before the module reorganisation survives a casual `ls dist/` and only fails
  inside the container, as an immediate exit with `Cannot find module`.

`apps/web/Dockerfile` is the same idea ending at `.next/standalone`, taking `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SITE_URL` and `MEDIA_ASSET_HOSTS` as build arguments. It exists only for requirement 5.

### Three Compose projects on one shared network

`kidlearn-edge` (Caddy), `kidlearn-prod` and `kidlearn-dev`, separate so that deploying dev cannot
restart production and neither can restart Caddy. `deploy/app/compose.yml` describes what the two
API stacks share and `deploy/app/compose.dev.yml` describes exactly how dev differs — which is the
property that stops the environments drifting apart. Production runs `-f compose.yml`; dev runs
`-f compose.yml -f compose.dev.yml`. Both services are named `api`, which collides on the shared
network; the trap and its fix are `runbook.md` §1.

### IAM

The **instance role** needs `AmazonSSMManagedInstanceCore`, ECR pull, `ssm:GetParametersByPath` on
the two parameter paths with `kms:Decrypt`, and S3 access on the backup bucket alone. Nothing wider.
The policy is walkthrough A9. The **GitHub OIDC roles** are file 38a's; do not create them here.
Vercel needs no AWS credential at all — it builds and serves static and rendered output and never
talks to AWS.

### Order of operations

Production first, completely, then dev — so that a half-finished dev environment can never be the
reason production is not up. Within production, the API comes up before the frontend, so that the
first thing the Vercel deployment does is talk to something that already works.

## Step-by-Step Plan

1. Code changes: `trust proxy`, `output: "standalone"`, the `SITE_NOINDEX` `headers()` block,
   `metadataBase` and the casing fix, `apps/web/proxy.ts`, both `.env.example` files.
   `pnpm lint && pnpm typecheck && pnpm test` pass. (~50 min)
2. Write both Dockerfiles and `.dockerignore`; build both for `linux/arm64` locally and run the
   server container against your local Postgres to prove it boots before AWS is involved. This is
   where `pnpm deploy`, `argon2`, the workspace-manifest question and the `dist/server.js` entry
   either work or need the documented fallbacks (`pnpm fetch` then `pnpm install --offline
   --frozen-lockfile` for the manifests; `--legacy` or `inject-workspace-packages=true` for
   `pnpm deploy`) — all cheap here and expensive on the box. Add the web-image build step to `gates`
   in the same commit. **"It boots" means `curl localhost:4000/health` returns the envelope from
   inside the container**, not that `docker run` printed a banner. (~75 min)
3. Provisioning, as the walkthrough's steps (estimates are this file's):

   | Walkthrough | Work | Estimate |
   |---|---|---|
   | A1, A7, A8 | Budget alarm, ECR repositories, first image push | ~35 min |
   | A2 | Production Supabase, migrate, seed | ~30 min |
   | A3–A5 | Cloudinary, backup bucket, production SSM parameters | ~30 min |
   | A9–A11 | IAM role, EC2, Elastic IP, shell, `deploy/` on the box | ~35 min |
   | A12 | Cloudflare zone, nameservers, `api` records | ~25 min, mostly waiting |
   | A13–A14 | Edge on ACME staging, then production; API deploy | ~35 min |
   | A16 | Production Vercel project | ~40 min |
   | A15, A17, A18 | OAuth, crons, smoke test — **checkpoint, production is live** | ~50 min |
   | B1–B2 | Dev Gemini key, Cloudinary cloud, dev SSM parameters | ~30 min |
   | B3–B4 | Dev API stack, restore the production dump into it | ~50 min |
   | B5–B7 | Dev Vercel project, dev OAuth entries, dev smoke test | ~40 min |

4. Verify the isolation claims: dev cannot reach Supabase, production cannot reach the dev Postgres,
   each frontend calls only its own API host, and the dev wipe-and-reseed rebuilds dev from nothing.
   (~25 min)
5. Full smoke test on a real phone against production (`runbook.md` §14), then the runbook
   placeholders (walkthrough Part C), spec §9 and the tracker. (~45 min)

## Acceptance Criteria

**Production**

- [ ] `https://kidlearn.net` serves the app, `https://www.kidlearn.net` redirects to the apex, and
      `https://api.kidlearn.net/health` returns the `{ data: { status: "ok" } }` envelope — all on
      valid, automatically issued certificates.
- [ ] A parent signs in with Google on `https://kidlearn.net` and the session **survives a reload**.
- [ ] The session cookie is `Secure; HttpOnly; SameSite=Lax` — **not** `SameSite=None`.
      `src/config/auth.ts` contains no `SameSite=None` override.
- [ ] The same sign-in works in **Safari on iOS** with cross-site tracking prevention enabled.
- [ ] A request with a forged `Origin` header gets no CORS allow header.
- [ ] The smoke test in `runbook.md` §14 passes end-to-end on a phone. If a deployed build ever
      asks for a PIN, it is running an image older than 2026-09-09 (FR-AUTH-04, retired).
- [ ] `https://api.kidlearn.net/docs` returns **404** — `ENABLE_API_DOCS` is `false` in production.
- [ ] `https://kidlearn.net` carries **no** `X-Robots-Tag` header — `SITE_NOINDEX` is unset there.
- [ ] Media on lesson and story screens is served from `res.cloudinary.com` (NFR-PERF-02).
- [ ] The running app connects on the **pooled** `DATABASE_URL` (:6543) while `migrate deploy` used
      `DIRECT_URL` (:5432) — confirm in Supabase's connection stats.
- [ ] A `pg_dump` from the cron has been **restored into the dev Postgres** and the procedure is in
      the runbook.

**Development**

- [ ] `https://dev.kidlearn.net` returns `401` with a `WWW-Authenticate` header, then serves the app on
      valid credentials; `https://api.dev.kidlearn.net/health` returns the envelope with no prompt;
      both carry `X-Robots-Tag: noindex`.
- [ ] A parent signs in with Google on `https://dev.kidlearn.net` and the session survives a reload —
      proving the OAuth callback works through the basic-auth boundary without a second prompt.
- [ ] `https://api.dev.kidlearn.net/docs` **loads** — `ENABLE_API_DOCS` is `true` in dev.
- [ ] `DEV_SITE_BASIC_AUTH` does **not** appear anywhere in the deployed client bundle.
- [ ] The dev API's `DATABASE_URL` points at `dev-postgres` and contains **no** `pgbouncer` or
      `connection_limit` parameter.
- [ ] The dev wipe-and-reseed (`runbook.md` §7) rebuilds dev from nothing in one documented sequence.
- [ ] The dev Postgres publishes **no** host port: `ss -tlnp` on the box shows only Caddy on 80/443.

**Both**

- [ ] No `localhost` string appears in either deployed web bundle, and each environment's bundle calls
      **its own** API host — fetch the deployed dev bundle, `grep` it for `api.kidlearn.net`, and
      find nothing.
- [ ] `nmap` against the Elastic IP shows **only** 80 and 443 open; port 22 is closed and
      `aws ssm start-session` is the working shell.
- [ ] Dev and production hold **different** `BETTER_AUTH_SECRET`, `CRON_SECRET`, Gemini keys and
      Cloudinary clouds; a session cookie from one environment is rejected by the other.
- [ ] Under a throttled network the web client's loader and retry appear and the request completes —
      never a raw error (NFR-PERF-04).
- [ ] Rollback rehearsed once per environment, **both halves** (`runbook.md` §3).
- [ ] `free -m` on the box under both stacks shows at least ~700 MB available, and the dev containers
      carry their `mem_limit` values (`docker stats`).
- [ ] `apps/web/Dockerfile` builds green in CI even though nothing deploys it (requirement 5) —
      verify from a run log, not from the Dockerfile's existence. The escape-hatch procedure is in
      the runbook.
- [ ] The AWS Budgets alarm exists at $20/month and the first full day's Cost Explorer figure is
      within ~10% of the table above.
- [ ] Every variable in `runbook.md` §4 exists in the right SSM path, Compose file or Vercel project,
      and both `.env.example` files match it.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass locally, and `gates` is green on the pull
      request (`gh pr checks`).
- [ ] The API container's `CMD` starts `dist/server.js` (or `pnpm start`), proven by the container
      answering `/health` — not by the image building.

## Out of Scope

- **Automating these deploys** — file 38a, and only for the API half; Vercel's Git integration already
  deploys the frontend on every push to `main` and `dev`. Both environments are brought up by hand
  once, deliberately: an automated pipeline for a deploy nobody has performed manually is a pipeline
  that fails on something the author never saw.
- **HTTP hardening** — helmet, the per-IP flood guard and the body limit are in the API already
  (`apps/server/src/shared/middleware/security.ts`); the limits are `runbook.md` §12. Anything
  further is a code change with its own tests, not a deployment step.
- **Actually executing the escape hatch.** Requirement 5 keeps the frontend Dockerfile working and
  the runbook writes down the procedure.
- **Anything else in the CI pipeline.** This file adds exactly one step to `gates` — the web-image
  build. The triggers, the coverage reporting and the ruleset amendment are file 39's, and the
  `deploy` job is file 38a's.
- **Hard isolation between the two environments.** The limits are stated above under "The isolation
  this design does and does not give you". Buying more of it means a second instance, and that is a
  cost decision to revisit, not a design to build now.
- Multi-instance, autoscaling, or any load balancer. One box serves both APIs at this traffic.
- Moving the production database into AWS (RDS is ~$18/month plus storage here, more than the rest of
  this deployment combined). The upgrade path is a `DATABASE_URL` change and a `pg_dump` restore —
  write it in the runbook, do not build it.
- A third environment. Nothing in this design forbids one, but two API hostnames and one 2 GiB box is
  the budget.
- CloudFront, IPv6-only addressing to dodge the $3.65 IPv4 charge, and Savings Plan commitments beyond
  noting them.
- Observability past pino to stdout, `docker compose logs` and the Vercel dashboard — error tracking,
  uptime alerting and log shipping are post-MVP.
