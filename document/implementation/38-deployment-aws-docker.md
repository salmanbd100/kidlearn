# 38 — Deployment: Vercel Frontend, One EC2 Box for the APIs

> **Estimated effort:** 8–9 hours (natural checkpoint after step 10 — production is live and usable
> before any dev-environment work begins)
> **Depends on:** 16, 29, 37, 37a
> **Requirement IDs:** spec §9, NFR-PERF-02, NFR-PERF-04
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Put KidLearn on **Vercel for the frontend and one `t4g.small` EC2 instance in `ap-south-1` for the
two APIs**, for roughly **$13.75/month**:

| Environment | Branch | Web (Vercel) | API (EC2) | Database |
|---|---|---|---|---|
| **Production** | `main` | `kidlearn.net`, `www.kidlearn.net` | `api.kidlearn.net` | Supabase free project, `ap-south-1` |
| **Development** | `dev` | `dev.kidlearn.net` | `api.dev.kidlearn.net` | Postgres container on the box |

Caddy fronts the two API hostnames with automatic Let's Encrypt certificates; Vercel terminates TLS
for the three web hostnames itself. Media stays on Cloudinary. Every server secret lives in SSM
Parameter Store under a per-environment path; the frontend's handful of values live in Vercel's
project settings. This file gets both environments working by hand; file 38a automates the API
deploys from GitHub Actions, while Vercel's Git integration deploys the frontend on its own.

The domain being bought *before* the first deploy is what makes this work. Every hostname shares one
registrable domain, so within each environment web and API are the **same site** even though they
are different origins, and `src/lib/auth.ts` keeps the `sameSite: "lax"` it already has. Moving the
frontend to Vercel does not touch that: `kidlearn.net` and `api.kidlearn.net` were already separate
origins under the previous all-Docker design. The `SameSite=None; Secure` cross-origin workaround an
earlier version of this file required is never written, and Safari's cross-site tracking prevention
never gets a say in whether a parent stays signed in.

## Context & Current State

The whole MVP works locally: web on :3000, server on :4000, `pnpm dev` via Turborepo. Nothing has
ever been deployed; no AWS resources, no Vercel projects, no production database, no production
credentials.

What already exists and does *not* need building:

- `apps/server/src/lib/env.ts` Zod-parses every variable and refuses to boot on a missing or
  malformed one (file 08). It reads `PORT`, so a container port is configuration, not code.
- `GET /health` is DB-free and cheap (file 08) — the health gate the deploy script polls.
- `apps/server/src/app.ts` passes `origin: [env.WEB_ORIGIN]` to `cors({ credentials: true })` —
  exactly one origin, no wildcard. Per environment, that is exactly right, and it stays right with
  the frontend on Vercel.
- `apps/server/src/lib/auth.ts` already pins
  `advanced.defaultCookieAttributes = { httpOnly: true, sameSite: "lax", secure: NODE_ENV === "production" }`.
  **Leave it alone.** It is already correct for both environments.
- `packages/db/prisma/schema.prisma` already declares `url = env("DATABASE_URL")` and
  `directUrl = env("DIRECT_URL")`. No schema change is needed.
- `apps/web/lib/api-client.ts` reads `NEXT_PUBLIC_API_URL`, falling back to `http://localhost:4000`,
  and sends `credentials: "include"`.
- **`apps/web` has no route handlers, no `middleware.ts`/`proxy.ts` and no server-side API calls.**
  The only server-side API it touches is `cookies()` in `app/layout.tsx`, to read the locale. Every
  call to the Express API is made from the browser. This is the fact that makes the frontend a clean
  fit for Vercel: no server secret ever reaches it, and no SSR render blocks on a round trip to
  Mumbai.
- The repo-root `docker-compose.yml` runs a **development** Postgres for `pnpm dev` on your own
  machine. It is not the file deployed here, and the dev environment's Postgres is a different
  container on a different host — do not conflate them.

What does not exist: `apps/server/Dockerfile`, `apps/web/Dockerfile`, any `.dockerignore`,
`apps/web/proxy.ts`, `output: "standalone"` in `apps/web/next.config.ts`,
`app.set("trust proxy", …)`, and `document/runbook.md`.

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
Secrets Manager is $0.40 per secret per month, roughly $16/month for ~35 values across two
environments, against $0 for SSM Parameter Store's Standard tier. A second EC2 instance for dev would
add $8.18/month and a second everything to patch. Lightsail's flat 2 GB plan is competitive on price
and includes the IPv4 address, but a Lightsail instance has no IAM instance profile — ECR pull and
SSM Parameter Store would need static access keys sitting on the box, and file 38a's OIDC plus
`ssm:SendCommand` deploy path would not work at all. That is a security regression bought for about
$3/month, so no. GHCR would save ECR's $0.10 and is free for a public repository, but it costs the
in-region pull and the instance-role integration for ten cents; also no.

### What moving the frontend to Vercel does and does not change

- **The session cookie story is completely unchanged.** better-auth sets a host-scoped cookie on
  `api.kidlearn.net`. The browser at `kidlearn.net` sends it back on `credentials: "include"` fetches
  because the two hosts are the **same site** (one registrable domain), which `SameSite=Lax` permits.
  This was already true when Caddy served both; Vercel serving one of them changes nothing.
- **CORS is unchanged.** `WEB_ORIGIN` is still exactly one origin per environment, and file 08's
  lockdown still does the work.
- **Both Google OAuth clients keep the exact origins and redirect URIs in requirement 14.** The
  JavaScript origins are still the web hosts, the redirect URIs are still on the API hosts.
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
  paths, and memory limits on the dev stack. But it is one kernel and one disk. A dev container that
  fills the EBS volume takes the production API down with it.
- **CI/CD isolation is a convention, not a boundary.** `ssm:SendCommand` is scoped to an *instance*,
  so a workflow able to deploy the dev API is technically able to run a command that touches
  production's containers. File 38a narrows this as far as IAM allows and then stops, because the
  remaining gap is inherent to sharing a box.

If any of that is unacceptable later, the fix is a second instance, and nothing else in the design
changes.

## Detailed Requirements

1. **Production database — a new Supabase project.** The existing
   `aws-1-ap-southeast-1.pooler.supabase.com` project in `packages/db/.env.example` is your local
   development database and is untouched by this file. Create the **production** project in
   **`ap-south-1` (Mumbai)** so it sits beside the instance; every Prisma query pays that round trip.

   Free-tier ceilings, verified 2026-09-06: **500 MB database, 5 GB egress per month, two active
   projects per organisation**. This design uses **one** slot for production — the dev environment
   deliberately does not touch Supabase — which leaves one spare. Free projects also **pause after
   seven days of inactivity**, which matters between provisioning and launch, not after real traffic
   arrives. Record both facts in the runbook.

   Apply migrations with `prisma migrate deploy` against `DIRECT_URL` — never `migrate dev` against
   production. Then run the seed and create the first `AdminUser` (file 31's
   `pnpm --filter server seed:admin`), both once, from your own machine.

2. **Development database — a Postgres container on the box.** `postgres:16-alpine`, on the dev
   Compose project's internal network only, with a named volume for its data. **No published host
   port** — nothing outside the dev stack may reach it.

   Two details that will otherwise cost an afternoon:

   - `DATABASE_URL` and `DIRECT_URL` for dev are the **same string**, and it carries **neither**
     `?pgbouncer=true` **nor** `connection_limit=1`. Those flags exist for Supabase's PgBouncer;
     against a plain Postgres, `pgbouncer=true` needlessly disables prepared statements and
     `connection_limit=1` serialises the whole app. Copying the production URL shape here is the
     obvious mistake.
   - The migrate job must not race the database on first boot. Give Postgres a `pg_isready`
     healthcheck and gate the migrate service on `depends_on: { condition: service_healthy }`.

   **This database is deliberately disposable and is never backed up.** That is the point of it: dev
   is where a migration gets tried against a real deploy, and a bad one is undone with
   `docker compose -p kidlearn-dev down -v`, then migrate, then seed. Put that one-liner in the
   runbook where it can be found in a hurry.

3. **Frontend on Vercel — two Hobby projects from the same repository.** One tracks `main` and serves
   `kidlearn.net` plus `www.kidlearn.net`; one tracks `dev` and serves `dev.kidlearn.net`. Each sets
   its own production branch in the Git settings so neither builds the other's commits.

   Two projects rather than one project with a branch-scoped domain: per-project environment
   variables are unambiguous and cannot be selected by the wrong scope, and branch domains are a
   plan-tier feature this design would rather not depend on. The cost is one extra project to
   configure, once.

   **Project settings, both projects:**

   - **Root Directory** `apps/web`, with *Include source files outside of the Root Directory* left
     enabled — the app imports two workspace packages.
   - **Build Command** must go through Turbo, not `next build`. `apps/web` depends on
     `@kidlearn/types`, which compiles to `dist/` and is resolved through its `exports` map; the root
     `turbo.json` gives `build` a `dependsOn: ["^build"]` that produces it. A bare `next build`
     rooted at `apps/web` fails on the missing `dist`. Use
     `cd ../.. && pnpm turbo run build --filter=web`, or accept Vercel's Turborepo detection **and
     then read the first build log to confirm `@kidlearn/types` actually built first**. This is the
     single most likely thing to fail on the first deploy.
     (`@kidlearn/ui` needs nothing — it ships raw TypeScript and `next.config.ts` already lists it in
     `transpilePackages`. `packages/db` is not a dependency of `apps/web`, so no `prisma generate`
     runs on Vercel.)
   - **Install Command** `pnpm install --frozen-lockfile`, run at the repository root.
   - **Function region `bom1` (Mumbai).** Hobby allows one region; the default is `iad1`. Nothing in
     `apps/web` fetches the API server-side, so this affects only the TTFB of the rendered shell —
     but it is one dropdown and there is no reason to serve Dhaka from Virginia.

   **`NEXT_PUBLIC_*` values are inlined into the client bundle at build time.** On Vercel that means
   editing one in the dashboard does nothing until you **redeploy**. The failure mode is
   `dev.kidlearn.net` quietly calling `api.kidlearn.net`, which looks like a CORS bug, is not one,
   and would have a dev build writing to the production database. Check the deployed bundle, not the
   dashboard.

   **Two Hobby-tier facts that belong in the runbook, not in a footnote:**

   - **Hobby is licensed for non-commercial personal projects.** The first paid feature, advert or
     business use puts this in breach and requires Pro at $20/month — which costs more than the
     $8.17 the move saved. The escape hatch is requirement 5; the trigger condition goes in the
     runbook next to it.
   - **Hobby has no overage billing.** Exceeding the plan's transfer or edge-request ceilings pauses
     the project rather than charging for the excess, so production availability now depends on a
     free tier with a hard stop. Media being on Cloudinary keeps the bulk of the bytes off Vercel
     entirely, but turn on Vercel's usage notifications and record the current ceilings in the
     runbook on the day you provision — they move.

4. **Gating the dev site: basic auth in `apps/web/proxy.ts`.** Caddy no longer sees
   `dev.kidlearn.net`, so its `basic_auth` cannot do this job, and Vercel's Password Protection is a
   paid feature. Next 16 renamed the `middleware` file convention to **`proxy`** — read
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` before writing
   it, per `apps/web/AGENTS.md`, rather than assuming the pre-16 shape.

   ```ts
   // apps/web/proxy.ts
   import { NextResponse } from "next/server";
   import type { NextRequest } from "next/server";

   // Set only in the dev Vercel project. Deliberately not NEXT_PUBLIC_ — that
   // prefix would inline the credential into the client bundle.
   const CREDENTIAL = process.env.DEV_SITE_BASIC_AUTH;

   export function proxy(request: NextRequest) {
     if (!CREDENTIAL) return NextResponse.next();
     if (request.headers.get("authorization") === `Basic ${btoa(CREDENTIAL)}`) {
       return NextResponse.next();
     }
     return new NextResponse("Authentication required", {
       status: 401,
       headers: { "WWW-Authenticate": 'Basic realm="kidlearn dev"' },
     });
   }

   export const config = {
     matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
   };
   ```

   Production leaves `DEV_SITE_BASIC_AUTH` unset, so the function returns immediately and the gate
   does not exist there. The comparison is not constant-time and does not need to be: this is a speed
   bump that keeps an unreviewed-content build out of casual reach, not a security boundary. The
   boundary is that dev holds no production data.

   **No basic auth on `api.dev.kidlearn.net`.** The Google OAuth callback lands on the API host, and a
   prompt mid-redirect breaks the flow. After the callback, better-auth redirects back to
   `https://dev.kidlearn.net/parent` — a top-level navigation into the gate, which the browser
   satisfies from the credential it already cached for that origin, so the round trip is silent.

   Both dev hosts also carry `X-Robots-Tag: noindex, nofollow` — the web host via `headers()` in
   `apps/web/next.config.ts` behind a server-only `SITE_NOINDEX` flag, the API host via a Caddy
   `header` directive (requirement 8). Keeping an unreviewed-content build of a children's product out
   of search results is worth two lines in each place.

5. **Keep the web Dockerfile as an escape hatch — built, never deployed.** `apps/web/Dockerfile` and
   `output: "standalone"` in `next.config.ts` stay in the repository even though nothing deploys them.
   Requirement 3 names two conditions that would end the Vercel arrangement at short notice — a
   commercial trigger, or a paused project on a ceiling — and the cost of being ready is one file and
   about thirty minutes. CI builds it so it cannot rot; no ECR repository holds it and no Compose file
   references it.

   `document/runbook.md` carries the procedure: build and push `kidlearn-web:<env>-<sha>` with the
   three `NEXT_PUBLIC_*` build arguments, add a `web` service to `deploy/app/compose.yml` with a
   `${ENV_NAME}-web` alias, add the web hostnames back to the Caddyfile, and repoint the two
   Cloudflare records at the Elastic IP. Note there that the box must go back to `t4g.medium` first —
   two Next.js servers do not fit in 2 GiB.

6. **Images: one Dockerfile, two targets, two ECR repositories.** All `linux/arm64` — `t4g` is
   Graviton.

   - `kidlearn-api` — `apps/server` compiled to `dist/`, production dependencies only. Configured
     entirely at runtime, so **one image serves both environments**; tag is a bare `<sha>`.
   - `kidlearn-migrate` — a second `--target` of the *same* `apps/server/Dockerfile`, keeping the
     `prisma` CLI and `packages/db/prisma/` so `prisma migrate deploy` can run on the box. It is a
     separate repository rather than a third container because `prisma` is a **devDependency** of
     `packages/db`, so `pnpm deploy --prod` correctly strips it out of the runtime image. Its layers
     are shared with the API builder stage, so it costs build seconds, not minutes. Also
     environment-agnostic; bare `<sha>`.

   Both images are environment-agnostic, so a blanket "keep the last 10 tagged images" lifecycle
   policy per repository is correct here — the per-tag-prefix policy the previous design needed
   existed only to stop `dev-` web builds evicting `prod-` ones, and there are no longer any
   environment-specific images.

7. **`trust proxy`.** Add `app.set("trust proxy", 1)` in `apps/server/src/app.ts`, conditional on
   `env.NODE_ENV === "production"`. Caddy terminates TLS and is exactly one hop, so `1` is correct —
   not `true`, which trusts an arbitrary chain and lets a client forge `req.ip`. Without it,
   `req.protocol` is `http` inside the container and better-auth declines to set a `Secure` cookie.

   **Both deployed environments run with `NODE_ENV=production`.** "Development" here names the
   environment, not the Node mode: a dev deployment that runs React in development mode, skips the
   Next production build and sets non-`Secure` cookies is not testing what production will do. What
   distinguishes them is hostnames, database, credentials and `ENABLE_API_DOCS` — nothing else. Vercel
   builds both frontend projects as production builds for the same reason.

   Do **not** touch `advanced.defaultCookieAttributes` in `src/lib/auth.ts`.

8. **Caddy as the only exposed process on the box,** in its own Compose project so that redeploying
   either API stack never restarts the thing holding the certificates. Two hostnames, not five —
   `deploy/edge/Caddyfile`:

   ```caddyfile
   {
     email <ops-address>
   }

   api.kidlearn.net {
     reverse_proxy prod-api:4000
   }

   api.dev.kidlearn.net {
     header X-Robots-Tag "noindex, nofollow"
     reverse_proxy dev-api:4000
   }
   ```

   `prod-api` and `dev-api` are **network aliases, not service names** — see the Compose section,
   because two Compose projects each with a service called `api` on one shared network is a name
   collision that resolves arbitrarily.

   Caddy obtains and renews both certificates itself. **Its `/data` volume is load-bearing:** it holds
   the account key and the certificates, and losing it on every deploy would re-request them until
   Let's Encrypt's rate limit (5 duplicate certificates per week) locks you out. Mount it as a named
   volume, and use the **staging ACME endpoint** for the first end-to-end run so a DNS mistake costs
   nothing.

   No application container publishes a host port. Only Caddy binds 80 and 443.

9. **Networking, kept deliberately small.** Default VPC, one public subnet, one security group.
   Inbound: **443/tcp, 443/udp (HTTP/3) and 80/tcp** (ACME and redirect) from `0.0.0.0/0`. **No port
   22 rule at all** — shell access is SSM Session Manager, which needs no inbound rule and leaves an
   audit trail. Allocate an Elastic IP and associate it so the address survives a stop/start.

10. **Memory limits on the dev stack.** Put `mem_limit` on the dev containers (`dev-api` 400m,
    `dev-postgres` 400m) and leave the production API uncapped. The point is not to save memory; it is
    to make the kernel's choice deterministic. Under pressure the OOM killer should take a dev
    container, and without limits it picks by heuristic. `bootstrap.sh` also provisions 2 GB of swap —
    not to run in, but so that a spike degrades instead of being killed.

11. **Secrets in SSM Parameter Store,** every one a `SecureString`, under **`/kidlearn/prod/`** and
    **`/kidlearn/dev/`**. The Standard tier is free up to 10,000 parameters; this needs about 35. Each
    deploy writes its own environment's parameters into `/opt/kidlearn/<env>/app.env`, owned by root,
    mode `0600`, referenced by that stack's `env_file`. No secret is committed, baked into an image,
    or held by GitHub.

    The frontend's values are not secrets and do not go here — they live in each Vercel project's
    settings, listed in requirement 12. `DEV_SITE_BASIC_AUTH` is the one frontend value worth
    protecting; it is a dev speed bump, Vercel stores it encrypted, and duplicating it into SSM would
    give two places to forget to rotate.

12. **Environment variable matrix.** `src/lib/env.ts` is the enforcement for the API half; this is the
    inventory. "Vercel" means a project-settings variable; a `NEXT_PUBLIC_` one is inlined at build
    time and needs a **redeploy**, not a save, to take effect.

    | Var | Where | Production | Development |
    |---|---|---|---|
    | `NODE_ENV` | api (compose) | `production` | `production` — see requirement 7 |
    | `PORT` | api (compose) | `4000` | `4000` |
    | `DATABASE_URL` | api (SSM) | Supabase pooled, :6543, `?pgbouncer=true&connection_limit=1` | `postgresql://kidlearn:<pw>@dev-postgres:5432/kidlearn` — **no pgbouncer flags** |
    | `DIRECT_URL` | migrate (SSM) | Supabase direct, :5432 | identical to the dev `DATABASE_URL` |
    | `WEB_ORIGIN` | api (SSM) | `https://kidlearn.net` | `https://dev.kidlearn.net` |
    | `BETTER_AUTH_URL` | api (SSM) | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
    | `BETTER_AUTH_SECRET` | api (SSM) | fresh `openssl rand -base64 32` | **a different** fresh value — never shared across environments |
    | `GOOGLE_CLIENT_ID` / `_SECRET` | api (SSM) | production OAuth client | dev OAuth client (requirement 14) |
    | `LOG_LEVEL` | api (compose) | `info` | `debug` |
    | `ENABLE_API_DOCS` | api (compose) | `false` — `/docs` exposes the whole API surface | `true` — this is where you read it |
    | `PARENT_POST_LOGIN_PATH` | api (compose) | `/parent` | `/parent` |
    | `APP_TIMEZONE` | api (compose) | `Asia/Dhaka` | `Asia/Dhaka` |
    | `CRON_SECRET` | api (SSM) | `openssl rand -base64 32` | a different value; dev runs no cron |
    | `CLOUDINARY_*` | api (SSM) | production cloud | **a separate free cloud** (requirement 15) |
    | `GEMINI_API_KEY` | api (SSM) | production AI Studio key | **a separate free key** (requirement 15) |
    | `GEMINI_TEXT_MODEL` / `_IMAGE_MODEL` | api (compose) | `gemini-2.5-flash` / `gemini-2.5-flash-image` | same |
    | `GOOGLE_TTS_API_KEY` | api (SSM) | Cloud TTS key, restricted to that API | same key, shared (requirement 15) |
    | `GOOGLE_TTS_VOICE_EN` / `_BN` | api (compose) | `en-US-Standard-C` / `bn-IN-Standard-A` | same |
    | `AI_TEXT_JOBS_PER_DAY` / `_AUDIO_` / `_IMAGE_` | api (compose) | 8 / 100 / 15 | 4 / 20 / 5 — dev must not be able to spend the shared TTS allowance |
    | `POSTGRES_PASSWORD` | dev postgres (SSM) | — | `openssl rand -base64 24` |
    | `NEXT_PUBLIC_API_URL` | web (**Vercel**, build-time) | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
    | `NEXT_PUBLIC_SITE_URL` | web (**Vercel**, build-time) | `https://kidlearn.net` | `https://dev.kidlearn.net` |
    | `MEDIA_ASSET_HOSTS` | web (**Vercel**, build-time) | `https://res.cloudinary.com` | `https://res.cloudinary.com` |
    | `SITE_NOINDEX` | web (Vercel) | **unset** | `true` |
    | `DEV_SITE_BASIC_AUTH` | web (Vercel) | **unset** | `dev:<password>` — **not** `NEXT_PUBLIC_` |

    `HOSTNAME=0.0.0.0` is gone: it existed only because a containerised Next standalone server binds
    loopback by default, and nothing containerises the frontend now.

    `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` stay out of both deployments: they are read only
    by `seed:admin`, passed inline, exactly as `apps/server/.env.example` documents.

13. **DNS on Cloudflare, free tier.** Point the registrar's nameservers at Cloudflare, then five
    records:

    | Name | Type | Target |
    |---|---|---|
    | `kidlearn.net` | A | the apex address Vercel shows for the production project |
    | `www` | CNAME | the `*.vercel-dns.com` target Vercel shows for the production project |
    | `dev` | CNAME | the same, for the dev project |
    | `api` | A | the Elastic IP |
    | `api.dev` | A | the Elastic IP |

    Take the two Vercel targets from the project's Domains tab on the day you add them rather than
    from any value written down here — Vercel has changed its published apex address before.

    **Proxy off (grey cloud) on all five.** On the Vercel names, orange-cloud proxying puts a second
    TLS terminator in front of Vercel's own and interferes with its certificate issuance; on the API
    names it does the same to Caddy's ACME challenge, for no benefit at this traffic. Route 53 would
    work identically and costs $0.50/month for the hosted zone; Cloudflare is the same job for
    nothing.

    `api.dev.kidlearn.net` is an ordinary four-label name; Let's Encrypt issues for it with no
    wildcard and no DNS challenge. Wait for both Caddy certificates and all three Vercel domains
    before touching anything else — a half-provisioned domain is indistinguishable from a CORS bug.

14. **Two Google OAuth clients, not one.** Unchanged by the move to Vercel. Extend the existing client
    (file 09) to serve local *and* dev; create a **new** client for production only.

    | Client | Authorized JavaScript origins | Authorized redirect URIs |
    |---|---|---|
    | existing (dev) | `http://localhost:3000`, `https://dev.kidlearn.net` | `http://localhost:4000/api/auth/callback/google`, `https://api.dev.kidlearn.net/api/auth/callback/google` |
    | new (production) | `https://kidlearn.net` | `https://api.kidlearn.net/api/auth/callback/google` |

    One client with four entries would work and is worse: the production client secret would then be
    the same string sitting in a dev environment that is deliberately less locked down.

15. **Separate third-party accounts where they are free, shared where they are not.** Dev exercising
    the AI Queue must not consume production's daily allowance — the caps in file 37a are sized right
    at the free-tier ceiling, so one afternoon of dev generation would leave an admin unable to work.

    - **Gemini** — a second free AI Studio key, no billing account, one minute.
    - **Cloudinary** — a second free cloud. Also keeps test uploads out of the production media
      library, which the admin UI would otherwise show as real assets.
    - **Google Cloud TTS** — *shared*, because the key needs a billing account attached and a second
      one is friction for no isolation gain. Dev's `AI_AUDIO_JOBS_PER_DAY` is cut to 20 to bound what
      it can spend.

16. **Nightly database backup — production only.** Supabase's free tier has **no point-in-time
    recovery**, so the backup is yours to own. A cron entry on the box runs `pg_dump` against
    production's `DIRECT_URL`, gzips it, and writes it to a private S3 bucket with versioning on and a
    lifecycle rule expiring objects after 30 days. **Restore it once, into the dev Postgres container,
    before declaring this file done** — which is also the fastest way to get realistic data into dev,
    and an unrehearsed backup is a guess.

    The dev database is explicitly not backed up (requirement 2).

17. **Weekly reports cron — production only.** File 30's `POST /api/admin/jobs/weekly-reports` moves
    off cron-job.org onto the box: a cron entry curling
    `https://api.kidlearn.net/api/admin/jobs/weekly-reports` with the
    `Authorization: Bearer $CRON_SECRET` header, Mondays at 02:00 `Asia/Dhaka`. One fewer external
    account, and the secret stays in SSM. Dev runs no scheduled jobs — trigger it by hand there when
    testing. Update the setup comment in `apps/server/.env.example`, which still describes
    cron-job.org and a Render URL.

18. **Cold starts are gone; the UX is not.** An always-on instance does not sleep and Vercel serves the
    frontend from its edge network, so NFR-PERF-04's 30–60 second first request disappears along with
    the keep-warm pinger. **Keep** file 13's retry, backoff and "mascot waking up" loader — it still
    earns its place on a slow mobile connection in Dhaka, the primary device profile, and every API
    call still crosses the public internet to Mumbai. What changes is the acceptance criterion: verify
    the loader under a throttled network, not against a sleeping service.

19. **`apps/web` canonical URL, title and noindex.** `app/layout.tsx` exports `metadata` with only
    `title` and `description`. Add
    `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")` and
    `openGraph: { siteName, url: "/" }`, so a future OG image or canonical link resolves absolutely
    instead of warning at build — and so the dev build's canonical URLs point at dev rather than at
    production. Fix the casing while there: `title` is `"kidlearn"` while
    `locales/{en,bn}/common.json` `app.name` is `"KidLearn"`.

    Add the `SITE_NOINDEX` header block from requirement 4 to `next.config.ts` in the same change:

    ```ts
    async headers() {
      if (process.env.SITE_NOINDEX !== "true") return [];
      return [{
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      }];
    }
    ```

    Do **not** attempt per-locale metadata — the locale lives in the `LOCALE_COOKIE_NAME` cookie read
    in `layout.tsx` and doing it properly is separate work. Per `apps/web/AGENTS.md`, read the Metadata
    API docs under `node_modules/next/dist/docs/` before editing rather than assuming the pre-16 shape.

20. **`document/runbook.md`.** Both environments' API deploy procedures, the five DNS records and the
    registrar, both SSM parameter paths, both Vercel projects and their settings, how to open a shell
    (`aws ssm start-session`), where the logs are (`docker compose -p kidlearn-<env> logs -f` for the
    API, the Vercel dashboard for the frontend), the production backup and restore procedure, **the
    wipe-and-reseed one-liner for dev**, the Supabase ceilings from requirement 1, the Vercel Hobby
    ceilings and licence trigger from requirement 3, the dev basic-auth credential location, the
    **escape-hatch procedure from requirement 5**, and rollback.

    Rollback has two halves now and they are independent: the API is
    `IMAGE_TAG=<previous-sha> docker compose -p kidlearn-<env> up -d` (file 38a makes it a workflow
    input); the frontend is *Instant Rollback* on the Vercel deployment, or promoting a previous
    deployment. Write both down — under load, nobody derives the second one.

    Migrations are **forward-only** — a bad migration is fixed by a new forward migration, never by
    editing an applied one.

21. **A billing alarm, before anything else is switched on.** AWS Budgets, **$20/month**, alerting to
    your email at 80% actual and 100% forecast. `t4g` instances default to **unlimited** CPU-credit
    mode, which silently bills surplus credits rather than throttling; that is the right default for a
    live site, but only with an alarm behind it. $20 sits comfortably above the $13.73 steady state and
    still catches a runaway within a day.

## Technical Approach & Suggestions

Files to create:

```
apps/server/Dockerfile              # two targets: runner, migrate
apps/web/Dockerfile                 # escape hatch only (req 5) — built in CI, never deployed
apps/web/proxy.ts                   # basic auth on the dev site (req 4)
.dockerignore
deploy/edge/compose.yml             # Caddy + the shared external network
deploy/edge/Caddyfile
deploy/app/compose.yml              # one file, parameterised by env — used by both API stacks
deploy/app/compose.dev.yml          # overlay: postgres, mem_limit
deploy/bootstrap.sh                 # EC2 user-data: Docker, compose plugin, SSM agent, swap
deploy/deploy.sh                    # runs on the box, takes the environment as $1
document/runbook.md
```

Files to modify:

```
apps/web/next.config.ts             # output: "standalone" (req 5), headers() for SITE_NOINDEX
apps/web/app/layout.tsx             # metadataBase, openGraph, "KidLearn" casing
apps/server/src/app.ts              # app.set("trust proxy", 1) in production
apps/server/.env.example            # production values; replace the cron-job.org comment block
apps/web/.env.local.example         # NEXT_PUBLIC_SITE_URL, MEDIA_ASSET_HOSTS, SITE_NOINDEX, DEV_SITE_BASIC_AUTH
document/project-requirement-details.md   # §9 — Vercel frontend, two environments
```

### Image builds

Use `node:22-bookworm-slim` for every stage, **not Alpine**. Prisma's query engine and `argon2` both
link against glibc and OpenSSL 3; musl means chasing
`binaryTargets = ["linux-musl-arm64-openssl-3.0.x"]` and native rebuilds for no meaningful size win.
Generating the Prisma client inside the same base image and architecture as the runtime makes `native`
resolve correctly with no `binaryTargets` entry at all.

`argon2` is a **native module**. Its prebuilt binaries usually cover `linux/arm64`, but if the builder
falls back to compiling from source the stage needs `python3 make g++`. Find out during step 2 rather
than during the first deploy.

Shape of `apps/server/Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @kidlearn/db build && pnpm --filter server build

# Migrations only: keeps the prisma CLI, which is a devDependency and so is
# correctly absent from the runtime image below.
FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM build AS prune
RUN pnpm deploy --filter=server --prod /prod/server

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune /prod/server ./
USER node
CMD ["node", "dist/index.js"]
```

**Verify `pnpm deploy` before building the rest of the file.** pnpm 9's `deploy` has to inject the
`@kidlearn/db` and `@kidlearn/types` workspace packages into the output tree; if it does not under the
default isolated linker, the documented fallbacks are `--legacy` or setting
`inject-workspace-packages=true` in the workspace's pnpm config. Prove it produces a tree that
`node dist/index.js` actually starts from before writing anything downstream of it.

`apps/web/Dockerfile` is the same idea ending at `.next/standalone`, taking `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SITE_URL` and `MEDIA_ASSET_HOSTS` as build arguments. It exists only for requirement 5,
so build it in CI to keep it honest and then leave it alone.

### Three Compose projects on one shared network

`kidlearn-edge` (Caddy), `kidlearn-prod` and `kidlearn-dev`. Separate projects so that deploying dev
cannot restart production and neither can restart Caddy.

The trap is service-name collision. Both application stacks have a service called `api`; on a shared
external network, Compose registers each service name as an alias, and Caddy's
`reverse_proxy api:4000` would then resolve to whichever answered DNS first. **Give every service an
explicit alias on the shared network** and use only those aliases in the Caddyfile:

```yaml
# deploy/app/compose.yml — used by both stacks via -p and an env file
services:
  api:
    image: ${ECR_REGISTRY}/kidlearn-api:${IMAGE_TAG}
    restart: unless-stopped
    env_file: [/opt/kidlearn/${ENV_NAME}/app.env]
    networks:
      kidlearn-edge:
        aliases: ["${ENV_NAME}-api"]
      internal:
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      start_period: 20s

  migrate:
    image: ${ECR_REGISTRY}/kidlearn-migrate:${IMAGE_TAG}
    profiles: [migrate]
    env_file: [/opt/kidlearn/${ENV_NAME}/app.env]
    networks: [internal]

networks:
  kidlearn-edge: { external: true }
  internal:
```

`deploy/app/compose.dev.yml` overlays the dev-only pieces — the Postgres service on `internal` with its
healthcheck and named volume, `depends_on: { dev-postgres: { condition: service_healthy } }` on `api`
and `migrate`, and the `mem_limit` values from requirement 10. Production runs `-f compose.yml`; dev
runs `-f compose.yml -f compose.dev.yml`. One file describes what the two environments share, and the
overlay describes exactly how they differ — which is the property that stops them drifting apart.

### IAM

The **instance role** needs `AmazonSSMManagedInstanceCore` (Session Manager and Send-Command), ECR pull
(`ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`),
`ssm:GetParametersByPath` on `/kidlearn/prod/*` and `/kidlearn/dev/*` with `kms:Decrypt` on the key
those parameters use, and `s3:PutObject` on the backup bucket alone. Nothing wider.

The **GitHub OIDC roles** are file 38a's; do not create them here. Vercel needs no AWS credential at
all — it builds and serves static and rendered output and never talks to AWS.

### Order of operations

Production first, completely, then dev — so that a half-finished dev environment can never be the
reason production is not up. Within production, the API comes up before the frontend, so that the
first thing the Vercel deployment does is talk to something that already works.

(1) AWS account, budget alarm, region `ap-south-1`; (2) production Supabase project in `ap-south-1`,
`migrate deploy` + seed + `seed:admin` from your machine; (3) production Cloudinary cloud;
(4) `/kidlearn/prod/` SSM parameters; (5) two ECR repositories with lifecycle policies; (6) build and
push `kidlearn-api:<sha>` and `kidlearn-migrate:<sha>` from your machine — you are on an arm64 Mac, so
these are native builds; (7) EC2 instance, Elastic IP, security group, instance role, `bootstrap.sh` as
user-data; (8) Cloudflare zone, nameserver delegation, the two `api` A records; (9) edge stack against
**ACME staging**, then the production API stack, confirm `api.kidlearn.net`, switch to production ACME;
(10) production Vercel project, `kidlearn.net` and `www`, region `bom1`; (11) production Google OAuth
client; (12) backup and weekly-report crons; (13) **production smoke test — checkpoint, production is
live**; (14) dev Gemini key and Cloudinary cloud, `/kidlearn/dev/` parameters; (15) dev API stack with
the Postgres overlay, migrate, restore the production dump; (16) extend the Caddyfile with
`api.dev.kidlearn.net`; (17) dev Vercel project with basic auth and `noindex`; (18) dev OAuth client
entries; (19) dev smoke test; (20) runbook and spec §9.

## Step-by-Step Plan

1. Code changes: `trust proxy`, `output: "standalone"`, the `SITE_NOINDEX` `headers()` block,
   `metadataBase` and the `"KidLearn"` casing fix, `apps/web/proxy.ts`, both `.env.example` files.
   `pnpm lint && pnpm typecheck && pnpm test` pass. (~50 min)
2. Write `apps/server/Dockerfile`, `apps/web/Dockerfile` and `.dockerignore`; build both for
   `linux/arm64` locally and run the server container against your local Postgres to prove it boots
   before AWS is involved. This is where `pnpm deploy` and `argon2` either work or need the documented
   fallbacks. (~70 min)
3. AWS account setup: region, $20 budget alarm, two ECR repositories with lifecycle policies, push the
   first `kidlearn-api` and `kidlearn-migrate` images. (~35 min)
4. Production Supabase project in `ap-south-1`; `prisma migrate deploy` against `DIRECT_URL`, then
   seed, then `seed:admin`; confirm the tables in the dashboard. (~30 min)
5. Production Cloudinary cloud; write the `/kidlearn/prod/` SSM parameters. (~30 min)
6. Launch the EC2 `t4g.small` with `bootstrap.sh` as user-data, Elastic IP, security group (443,
   443/udp, 80 — **no 22**), instance role. Reach it with `aws ssm start-session` to prove SSM works
   before anything depends on it. (~35 min)
7. Cloudflare zone, nameserver delegation at the registrar, the `api` and `api.dev` A records; wait for
   propagation. (~25 min, mostly waiting)
8. Edge stack against ACME **staging**, then the production API stack; confirm the certificate; switch
   to production ACME and re-run. `curl https://api.kidlearn.net/health` returns the envelope.
   (~35 min)
9. Production Vercel project: import the repository, root directory `apps/web`, Turbo build command,
   region `bom1`, the three `NEXT_PUBLIC_*` values, then `kidlearn.net` and `www.kidlearn.net`.
   **Read the first build log** to confirm `@kidlearn/types` built before `next build`. Confirm the app
   loads and the browser reaches `api.kidlearn.net`. (~40 min)
10. Production Google OAuth client; sign in on `https://kidlearn.net`; confirm the session cookie is
    `Secure; HttpOnly; SameSite=Lax` and **survives a reload**. Backup and weekly-report crons; run the
    backup once by hand. **Checkpoint — production is live.** (~50 min)
11. Dev Gemini key and Cloudinary cloud; `/kidlearn/dev/` SSM parameters including `POSTGRES_PASSWORD`.
    (~30 min)
12. Dev API stack with the Postgres overlay and memory limits; migrate, then **restore the production
    `pg_dump` into it** so dev has realistic data — which also rehearses the restore. Extend the
    Caddyfile with `api.dev.kidlearn.net`. (~50 min)
13. Dev Vercel project: `dev` as its production branch, `dev.kidlearn.net`, `DEV_SITE_BASIC_AUTH` and
    `SITE_NOINDEX`; add the dev entries to the existing OAuth client; sign in on dev and confirm the
    OAuth redirect passes back through the basic-auth gate without a second prompt. (~40 min)
14. Verify the isolation claims: dev cannot reach Supabase, production cannot reach the dev Postgres,
    each frontend calls only its own API host, and `docker compose -p kidlearn-dev down -v` followed by
    migrate and seed rebuilds dev from nothing. (~25 min)
15. Full smoke test on a real phone against production (checklist below), then `document/runbook.md`
    and spec §9. Update the tracker. (~45 min)

## Acceptance Criteria

**Production**

- [ ] `https://kidlearn.net` serves the app, `https://www.kidlearn.net` redirects to the apex, and
      `https://api.kidlearn.net/health` returns the `{ data: { status: "ok" } }` envelope — all on
      valid, automatically issued certificates.
- [ ] A parent signs in with Google on `https://kidlearn.net` and the session **survives a reload**.
- [ ] The session cookie is `Secure; HttpOnly; SameSite=Lax` — **not** `SameSite=None`.
      `src/lib/auth.ts` contains no `SameSite=None` override.
- [ ] The same sign-in works in **Safari on iOS** with cross-site tracking prevention enabled.
- [ ] A request with a forged `Origin` header gets no CORS allow header — file 08's lockdown intact.
- [ ] Smoke test passes end-to-end on a phone: (1) parent signs in with Google; (2) consent + PIN
      setup; (3) child profile created; (4) a seeded lesson plays through all five steps with audio;
      (5) the parent dashboard shows the learning time just spent; (6) `/admin/ai-queue` loads for the
      admin user and lists and filters jobs.
- [ ] `https://api.kidlearn.net/docs` returns **404** — `ENABLE_API_DOCS` is `false` in production.
- [ ] `https://kidlearn.net` carries **no** `X-Robots-Tag` header — `SITE_NOINDEX` is unset there.
- [ ] Media on lesson and story screens is served from `res.cloudinary.com` (NFR-PERF-02).
- [ ] The running app connects on the **pooled** `DATABASE_URL` (:6543) while `migrate deploy` used
      `DIRECT_URL` (:5432) — confirm in Supabase's connection stats.
- [ ] A `pg_dump` from the cron has been **restored into the dev Postgres** and the procedure is in the
      runbook.

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
- [ ] `docker compose -p kidlearn-dev down -v`, then migrate, then seed, rebuilds dev from nothing in
      one documented sequence.
- [ ] The dev Postgres publishes **no** host port: `ss -tlnp` on the box shows only Caddy on 80/443.

**Both**

- [ ] No `localhost` string appears in either deployed web bundle, and each environment's bundle calls
      **its own** API host — fetch the deployed dev bundle, `grep` it for `api.kidlearn.net`, and find
      nothing.
- [ ] `nmap` against the Elastic IP shows **only** 80 and 443 open; port 22 is closed and
      `aws ssm start-session` is the working shell.
- [ ] Dev and production hold **different** `BETTER_AUTH_SECRET`, `CRON_SECRET`, Gemini keys and
      Cloudinary clouds; a session cookie from one environment is rejected by the other.
- [ ] Under a throttled network the file-13 loader and retry appear and the request completes — never a
      raw error (NFR-PERF-04).
- [ ] Rollback rehearsed once per environment, **both halves**: the API with
      `IMAGE_TAG=<previous-sha> docker compose -p kidlearn-<env> up -d`, the frontend with Vercel's
      Instant Rollback.
- [ ] `free -m` on the box under both stacks shows at least ~700 MB available, and the dev containers
      carry their `mem_limit` values (`docker stats`).
- [ ] `apps/web/Dockerfile` builds green in CI even though nothing deploys it (requirement 5), and the
      escape-hatch procedure is written in the runbook.
- [ ] The AWS Budgets alarm exists at $20/month and the first full day's Cost Explorer figure is within
      ~10% of the table above.
- [ ] Every variable in requirement 12 exists in the right SSM path, Compose file or Vercel project,
      and both `.env.example` files match the matrix.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

## Out of Scope

- **Automating these deploys** — file 38a, and only for the API half; Vercel's Git integration already
  deploys the frontend on every push to `main` and `dev`. Both environments are brought up by hand
  once, deliberately: an automated pipeline for a deploy nobody has performed manually is a pipeline
  that fails on something the author never saw.
- **HTTP hardening** — helmet, body limits, per-IP rate limiting on the auth and PIN routes
  (`improvement-plan.md` P1-2, proposed file 41). Genuinely urgent now that the API is public, but a
  code change with its own tests, not a deployment step.
- **Actually executing the escape hatch.** Requirement 5 keeps the frontend Dockerfile working and
  writes down the procedure. Running it is a response to a trigger, not a task in this file.
- **Hard isolation between the two environments.** The limits are stated above under "The isolation
  this design does and does not give you". Buying more of it means a second instance, and that is a
  cost decision to revisit, not a design to build now.
- Multi-instance, autoscaling, or any load balancer. One box serves both APIs at this traffic; the §9
  architecture lets each layer upgrade independently.
- Moving the production database into AWS (RDS is ~$18/month plus storage here, more than the rest of
  this deployment combined). The upgrade path is a `DATABASE_URL` change and a `pg_dump` restore —
  write it in the runbook, do not build it.
- A third environment. Nothing in this design forbids one, but two API hostnames and one 2 GiB box is
  the budget.
- CloudFront, IPv6-only addressing to dodge the $3.65 IPv4 charge, and Savings Plan commitments beyond
  noting them.
- Observability past pino to stdout, `docker compose logs` and the Vercel dashboard — error tracking,
  uptime alerting and log shipping are post-MVP.
