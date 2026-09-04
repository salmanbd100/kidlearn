# 38 — AWS Deployment: Two Environments, Docker on a Single EC2 Box

> **Estimated effort:** 7–8 hours (natural checkpoint after step 9 — production is live and usable
> before any dev-environment work begins)
> **Depends on:** 16, 29, 37, 37a
> **Requirement IDs:** spec §9, NFR-PERF-02, NFR-PERF-04
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Put KidLearn on AWS as **two environments on one `t4g.medium` instance** in `ap-south-1`, for
roughly **$23/month**:

| Environment | Branch | Web | API | Database |
|---|---|---|---|---|
| **Production** | `main` | `kidlearn.net` | `api.kidlearn.net` | Supabase free project, `ap-south-1` |
| **Development** | `dev` | `dev.kidlearn.net` | `api.dev.kidlearn.net` | Postgres container on the box |

One Caddy process fronts all five hostnames with automatic Let's Encrypt certificates. Media stays
on Cloudinary. Every secret lives in SSM Parameter Store under a per-environment path. This file
gets both environments working by hand; file 38a automates the deploys from GitHub Actions.

The domain being bought *before* the first deploy changes the design materially: every hostname
shares one registrable domain, so web and API are the **same site** in both environments, and
`src/lib/auth.ts` keeps the `sameSite: "lax"` it already has. The `SameSite=None; Secure`
cross-origin workaround the earlier Vercel-plus-Render version of this file required is never
written, and Safari's cross-site tracking prevention never gets a say in whether a parent stays
signed in.

## Context & Current State

The whole MVP works locally: web on :3000, server on :4000, `pnpm dev` via Turborepo. Nothing has
ever been deployed; no AWS resources, no production database, no production credentials.

What already exists and does *not* need building:

- `apps/server/src/lib/env.ts` Zod-parses every variable and refuses to boot on a missing or
  malformed one (file 08). It reads `PORT`, so a container port is configuration, not code.
- `GET /health` is DB-free and cheap (file 08) — the health gate the deploy script polls.
- `apps/server/src/app.ts` passes `origin: [env.WEB_ORIGIN]` to `cors({ credentials: true })` —
  exactly one origin, no wildcard. Per environment, that is exactly right.
- `apps/server/src/lib/auth.ts` already pins
  `advanced.defaultCookieAttributes = { httpOnly: true, sameSite: "lax", secure: NODE_ENV === "production" }`.
  **Leave it alone.** It is already correct for both environments.
- `packages/db/prisma/schema.prisma` already declares `url = env("DATABASE_URL")` and
  `directUrl = env("DIRECT_URL")`. No schema change is needed.
- `apps/web/lib/api-client.ts` reads `NEXT_PUBLIC_API_URL`, falling back to `http://localhost:4000`.
- The repo-root `docker-compose.yml` runs a **development** Postgres for `pnpm dev` on your own
  machine. It is not the file deployed here, and the dev environment's Postgres is a different
  container on a different host — do not conflate them.

What does not exist: any application Dockerfile, any `.dockerignore`, `output: "standalone"` in
`apps/web/next.config.ts`, `app.set("trust proxy", …)`, and `document/runbook.md`.

### Costs, at steady state

**The AWS free tier changed on 2025-07-15.** Accounts created on or after that date get a
credit-based plan — $100, rising to $200 on completing onboarding tasks, for six months — *not* the
old twelve months of 750 free EC2 hours. Nothing below is budgeted as free-tier.

| Item | $/month |
|---|---|
| EC2 `t4g.medium` on-demand, `ap-south-1` ($0.0224/hr × 730) | 16.35 |
| Public IPv4 address, $0.005/hr — **charged since 2024-02-01 even when attached** | 3.65 |
| EBS gp3 root volume, 30 GB | ~2.55 |
| ECR private storage, ~2.5 GB under lifecycle policies | 0.25 |
| S3 nightly `pg_dump` backups (production only) | ~0.10 |
| Route 53 hosted zone | 0.50 |
| Data transfer out — first 100 GB/month free account-wide, and media is on Cloudinary | 0.00 |
| Supabase free · Cloudinary free · Gemini free tier | 0.00 |
| **Total** | **≈ 23.40** |

A one-year no-upfront EC2 Instance Savings Plan takes it to roughly **$18.50**. Verify every figure
in the AWS Pricing Calculator for `ap-south-1` before provisioning — these were checked on
2026-09-04 and AWS moves them.

**`t4g.medium` (4 GiB), not `t4g.small`.** Two web containers at ~400 MB, two API containers at
~250 MB, Postgres at ~250 MB and Caddy at ~30 MB is about **1.6 GiB** before the operating system.
That fits in 2 GiB only in the sense that it does not fit: the first Next.js SSR spike invokes the
OOM killer, and the OOM killer does not know which container is production. $8.18/month buys the
headroom that keeps a dev experiment from being a production incident.

**Region is `ap-south-1` (Mumbai), not `ap-southeast-1` (Singapore).** The identical instance is
$0.0224/hr in Mumbai against $0.0424 in Singapore — $175 a year for a box no further from Dhaka.
Before committing, `ping`/`mtr` both regions from a Bangladeshi connection and record the numbers in
the runbook; if Singapore is decisively faster the difference is defensible, but do not pay it on
assumption.

**What was rejected, and why, so it is not relitigated:** an Application Load Balancer is ~$18/month
and a NAT gateway ~$32/month — each alone costs more than this entire deployment, and one box needs
neither. ECS Fargate plus ALB plus RDS lands near $60–90/month for one environment, let alone two.
Secrets Manager is $0.40 per secret per month, roughly $16/month for ~40 values across two
environments, against $0 for SSM Parameter Store's Standard tier. A second EC2 instance for dev
would add $13.53/month and a second everything to patch.

### The isolation this design does and does not give you

Say it plainly, because the rest of the file depends on the reader knowing it:

- **Data is properly isolated.** Production is on Supabase; dev is on a container. There is no
  connection string, no credential and no network path from one to the other.
- **Runtime is soft-isolated.** Separate containers, separate Compose projects, separate SSM paths,
  and memory limits on the dev stack. But it is one kernel and one disk. A dev container that fills
  the EBS volume takes production down with it.
- **CI/CD isolation is a convention, not a boundary.** `ssm:SendCommand` is scoped to an *instance*,
  so a workflow able to deploy dev is technically able to run a command that touches production's
  containers. File 38a narrows this as far as IAM allows and then stops, because the remaining gap
  is inherent to sharing a box.

If any of that is unacceptable later, the fix is a second instance, and nothing else in the design
changes.

## Detailed Requirements

1. **Production database — a new Supabase project.** The existing
   `aws-1-ap-southeast-1.pooler.supabase.com` project in `packages/db/.env.example` is your local
   development database and is untouched by this file. Create the **production** project in
   **`ap-south-1` (Mumbai)** so it sits beside the instance; every Prisma query pays that round
   trip.

   Free-tier ceilings, verified 2026-09-04: **500 MB database, 5 GB egress per month, two active
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

   **This database is deliberately disposable and is never backed up.** That is the point of it:
   dev is where a migration gets tried against a real deploy, and a bad one is undone with
   `docker compose -p kidlearn-dev down -v`, then migrate, then seed. Put that one-liner in the
   runbook where it can be found in a hurry.

3. **Images: two Dockerfiles, four image builds, three ECR repositories.** All `linux/arm64` —
   `t4g` is Graviton.

   - `kidlearn-web` — `apps/web` as a Next.js standalone server. **Built twice**, once per
     environment, because of requirement 4. Tags are prefixed: `prod-<sha>` and `dev-<sha>`.
   - `kidlearn-api` — `apps/server` compiled to `dist/`, production dependencies only. Configured
     entirely at runtime, so **one image serves both environments**; tag is a bare `<sha>`.
   - `kidlearn-migrate` — a second `--target` of the *same* `apps/server/Dockerfile`, keeping the
     `prisma` CLI and `packages/db/prisma/` so `prisma migrate deploy` can run on the box. It is a
     separate repository rather than a fourth container because `prisma` is a **devDependency** of
     `packages/db`, so `pnpm deploy --prod` correctly strips it out of the runtime image. Its layers
     are shared with the API builder stage, so it costs build seconds, not minutes. Also
     environment-agnostic; bare `<sha>`.

   Lifecycle policies must be **per tag prefix**, not a single "keep last 10". A blanket rule sorts
   `dev-` and `prod-` images together and will happily evict the production image you need to roll
   back to in order to keep ten dev builds. Use `tagPrefixList`: keep the last **10** `prod-`, the
   last **5** `dev-`, and the last **10** untagged-prefix `<sha>` images in the api and migrate
   repositories.

4. **`apps/web` must emit a standalone build, and it is environment-specific.** Add
   `output: "standalone"` to `apps/web/next.config.ts`. Without it the runtime image needs the whole
   `node_modules` tree instead of the ~40 MB `.next/standalone` bundle Next traces for you.

   **`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, not read at runtime.**
   `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` and `MEDIA_ASSET_HOSTS` (which `next.config.ts`
   turns into `images.remotePatterns`) are therefore **Docker build arguments**. This is why the web
   image is built twice per commit and why the two builds cannot be shared. Write it in a comment in
   the Dockerfile — the failure mode is `dev.kidlearn.net` quietly calling `api.kidlearn.net`, which
   looks like a CORS bug, is not one, and would have a dev build writing to the production database.

5. **`trust proxy`.** Add `app.set("trust proxy", 1)` in `apps/server/src/app.ts`, conditional on
   `env.NODE_ENV === "production"`. Caddy terminates TLS and is exactly one hop, so `1` is correct —
   not `true`, which trusts an arbitrary chain and lets a client forge `req.ip`. Without it,
   `req.protocol` is `http` inside the container and better-auth declines to set a `Secure` cookie.

   **Both deployed environments run with `NODE_ENV=production`.** "Development" here names the
   environment, not the Node mode: a dev deployment that runs React in development mode, skips the
   Next production build and sets non-`Secure` cookies is not testing what production will do. What
   distinguishes them is hostnames, database, credentials and `ENABLE_API_DOCS` — nothing else.

   Do **not** touch `advanced.defaultCookieAttributes` in `src/lib/auth.ts`.

6. **Caddy as the only exposed process,** in its own Compose project so that redeploying either
   application stack never restarts the thing holding the certificates. `deploy/edge/Caddyfile`:

   ```caddyfile
   {
     email <ops-address>
   }

   (noindex) {
     header X-Robots-Tag "noindex, nofollow"
   }

   kidlearn.net {
     encode zstd gzip
     reverse_proxy prod-web:3000
   }

   www.kidlearn.net {
     redir https://kidlearn.net{uri} permanent
   }

   api.kidlearn.net {
     reverse_proxy prod-api:4000
   }

   dev.kidlearn.net {
     import noindex
     basic_auth {
       dev <bcrypt-hash from: caddy hash-password>
     }
     encode zstd gzip
     reverse_proxy dev-web:3000
   }

   api.dev.kidlearn.net {
     import noindex
     reverse_proxy dev-api:4000
   }
   ```

   Three things here are deliberate. **`noindex` on both dev hosts** keeps an unreviewed-content
   build of a children's product out of search results. **`basic_auth` on `dev.kidlearn.net` but not
   on `api.dev.kidlearn.net`** is not an oversight: the Google OAuth callback lands on the API host,
   and a second basic-auth prompt mid-redirect breaks the flow. The API host is protected by CORS
   and by holding no production data, which is the right amount for dev. And **`prod-web` /
   `dev-web` are network aliases, not service names** — see the Compose section, because two Compose
   projects each with a service called `web` on one shared network is a name collision that resolves
   arbitrarily.

   Caddy obtains and renews all five certificates itself. **Its `/data` volume is load-bearing:** it
   holds the account key and the certificates, and losing it on every deploy would re-request them
   until Let's Encrypt's rate limit (5 duplicate certificates per week) locks you out. Mount it as a
   named volume, and use the **staging ACME endpoint** for the first end-to-end run so a DNS mistake
   costs nothing.

   No application container publishes a host port. Only Caddy binds 80 and 443.

7. **Networking, kept deliberately small.** Default VPC, one public subnet, one security group.
   Inbound: **443/tcp, 443/udp (HTTP/3) and 80/tcp** (ACME and redirect) from `0.0.0.0/0`. **No port
   22 rule at all** — shell access is SSM Session Manager, which needs no inbound rule and leaves an
   audit trail. Allocate an Elastic IP and associate it so the address survives a stop/start.

8. **Memory limits on the dev stack.** Even with 4 GiB, put `mem_limit` on the dev containers
   (`dev-web` 600m, `dev-api` 400m, `dev-postgres` 400m) and leave production uncapped. The point is
   not to save memory; it is to make the kernel's choice deterministic. Under pressure the OOM
   killer should take a dev container, and without limits it picks by heuristic — which on this box
   means it often picks the largest process, which is production's Next.js server.

9. **Secrets in SSM Parameter Store,** every one a `SecureString`, under **`/kidlearn/prod/`** and
   **`/kidlearn/dev/`**. The Standard tier is free up to 10,000 parameters; this needs about 40. Each
   deploy writes its own environment's parameters into `/opt/kidlearn/<env>/app.env`, owned by root,
   mode `0600`, referenced by that stack's `env_file`. No secret is committed, baked into an image,
   or held by GitHub.

10. **Environment variable matrix.** `src/lib/env.ts` is the enforcement; this is the inventory.
    "Build arg" means it is baked into the web image and changing it requires a rebuild, not a
    restart.

    | Var | Where | Production | Development |
    |---|---|---|---|
    | `NODE_ENV` | api (compose) | `production` | `production` — see requirement 5 |
    | `PORT` | api (compose) | `4000` | `4000` |
    | `DATABASE_URL` | api (SSM) | Supabase pooled, :6543, `?pgbouncer=true&connection_limit=1` | `postgresql://kidlearn:<pw>@dev-postgres:5432/kidlearn` — **no pgbouncer flags** |
    | `DIRECT_URL` | migrate (SSM) | Supabase direct, :5432 | identical to the dev `DATABASE_URL` |
    | `WEB_ORIGIN` | api (SSM) | `https://kidlearn.net` | `https://dev.kidlearn.net` |
    | `BETTER_AUTH_URL` | api (SSM) | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
    | `BETTER_AUTH_SECRET` | api (SSM) | fresh `openssl rand -base64 32` | **a different** fresh value — never shared across environments |
    | `GOOGLE_CLIENT_ID` / `_SECRET` | api (SSM) | production OAuth client | dev OAuth client (requirement 12) |
    | `LOG_LEVEL` | api (compose) | `info` | `debug` |
    | `ENABLE_API_DOCS` | api (compose) | `false` — `/docs` exposes the whole API surface | `true` — this is where you read it |
    | `PARENT_POST_LOGIN_PATH` | api (compose) | `/parent` | `/parent` |
    | `APP_TIMEZONE` | api (compose) | `Asia/Dhaka` | `Asia/Dhaka` |
    | `CRON_SECRET` | api (SSM) | `openssl rand -base64 32` | a different value; dev runs no cron |
    | `CLOUDINARY_*` | api (SSM) | production cloud | **a separate free cloud** (requirement 13) |
    | `GEMINI_API_KEY` | api (SSM) | production AI Studio key | **a separate free key** (requirement 13) |
    | `GEMINI_TEXT_MODEL` / `_IMAGE_MODEL` | api (compose) | `gemini-2.5-flash` / `gemini-2.5-flash-image` | same |
    | `GOOGLE_TTS_API_KEY` | api (SSM) | Cloud TTS key, restricted to that API | same key, shared (requirement 13) |
    | `GOOGLE_TTS_VOICE_EN` / `_BN` | api (compose) | `en-US-Standard-C` / `bn-IN-Standard-A` | same |
    | `AI_TEXT_JOBS_PER_DAY` / `_AUDIO_` / `_IMAGE_` | api (compose) | 8 / 100 / 15 | 4 / 20 / 5 — dev must not be able to spend the shared TTS allowance |
    | `POSTGRES_PASSWORD` | dev postgres (SSM) | — | `openssl rand -base64 24` |
    | `NEXT_PUBLIC_API_URL` | web (**build arg**) | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
    | `NEXT_PUBLIC_SITE_URL` | web (**build arg**) | `https://kidlearn.net` | `https://dev.kidlearn.net` |
    | `MEDIA_ASSET_HOSTS` | web (**build arg**) | `https://res.cloudinary.com` | `https://res.cloudinary.com` |
    | `HOSTNAME` | web (compose) | `0.0.0.0` — Next standalone binds loopback otherwise | same |

    `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` stay out of both deployments: they are read only
    by `seed:admin`, passed inline, exactly as `apps/server/.env.example` documents.

11. **DNS on Route 53.** Hosted zone for `kidlearn.net`, registrar nameservers pointed at it, then
    five `A` records — `kidlearn.net`, `www`, `api`, `dev`, `api.dev` — all to the one Elastic IP.
    `api.dev.kidlearn.net` is an ordinary four-label name; Let's Encrypt issues for it with no
    wildcard and no DNS challenge. Wait for all five certificates before touching anything else — a
    half-provisioned domain is indistinguishable from a CORS bug.

    Cloudflare DNS is a free alternative and saves the $0.50. Keep the proxy **off** (grey cloud):
    orange-cloud proxying puts a second TLS terminator in front of Caddy for no benefit here.

12. **Two Google OAuth clients, not one.** Extend the existing client (file 09) to serve local *and*
    dev; create a **new** client for production only.

    | Client | Authorized JavaScript origins | Authorized redirect URIs |
    |---|---|---|
    | existing (dev) | `http://localhost:3000`, `https://dev.kidlearn.net` | `http://localhost:4000/api/auth/callback/google`, `https://api.dev.kidlearn.net/api/auth/callback/google` |
    | new (production) | `https://kidlearn.net` | `https://api.kidlearn.net/api/auth/callback/google` |

    One client with four entries would work and is worse: the production client secret would then be
    the same string sitting in a dev environment that is deliberately less locked down.

13. **Separate third-party accounts where they are free, shared where they are not.** Dev exercising
    the AI Queue must not consume production's daily allowance — the caps in file 37a are sized right
    at the free-tier ceiling, so one afternoon of dev generation would leave an admin unable to work.

    - **Gemini** — a second free AI Studio key, no billing account, one minute.
    - **Cloudinary** — a second free cloud. Also keeps test uploads out of the production media
      library, which the admin UI would otherwise show as real assets.
    - **Google Cloud TTS** — *shared*, because the key needs a billing account attached and a second
      one is friction for no isolation gain. Dev's `AI_AUDIO_JOBS_PER_DAY` is cut to 20 to bound what
      it can spend.

14. **Nightly database backup — production only.** Supabase's free tier has **no point-in-time
    recovery**, so the backup is yours to own. A cron entry on the box runs `pg_dump` against
    production's `DIRECT_URL`, gzips it, and writes it to a private S3 bucket with versioning on and
    a lifecycle rule expiring objects after 30 days. **Restore it once, into the dev Postgres
    container, before declaring this file done** — which is also the fastest way to get realistic
    data into dev, and an unrehearsed backup is a guess.

    The dev database is explicitly not backed up (requirement 2).

15. **Weekly reports cron — production only.** File 30's
    `POST /api/admin/jobs/weekly-reports` moves off cron-job.org onto the box: a cron entry curling
    `https://api.kidlearn.net/api/admin/jobs/weekly-reports` with the
    `Authorization: Bearer $CRON_SECRET` header, Mondays at 02:00 `Asia/Dhaka`. One fewer external
    account, and the secret stays in SSM. Dev runs no scheduled jobs — trigger it by hand there when
    testing. Update the setup comment in `apps/server/.env.example`, which still describes
    cron-job.org and a Render URL.

16. **Cold starts are gone; the UX is not.** An always-on instance does not sleep, so NFR-PERF-04's
    30–60 second first request disappears along with the keep-warm pinger. **Keep** file 13's retry,
    backoff and "mascot waking up" loader — it still earns its place on a slow mobile connection in
    Dhaka, the primary device profile. What changes is the acceptance criterion: verify the loader
    under a throttled network, not against a sleeping service.

17. **`apps/web` canonical URL and title.** `app/layout.tsx` exports `metadata` with only `title` and
    `description`. Add `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")`
    and `openGraph: { siteName, url: "/" }`, so a future OG image or canonical link resolves
    absolutely instead of warning at build — and so the dev build's canonical URLs point at dev
    rather than at production. Fix the casing while there: `title` is `"kidlearn"` while
    `locales/{en,bn}/common.json` `app.name` is `"KidLearn"`.

    Do **not** attempt per-locale metadata — the locale lives in the `LOCALE_COOKIE_NAME` cookie read
    in `layout.tsx` and doing it properly is separate work. Per `apps/web/AGENTS.md`, read the
    Metadata API docs under `node_modules/next/dist/docs/` before editing rather than assuming the
    pre-16 shape.

18. **`document/runbook.md`.** Both environments' deploy procedures, the five DNS records, the
    registrar, both SSM parameter paths, how to open a shell (`aws ssm start-session`), where the
    logs are (`docker compose -p kidlearn-<env> logs -f`), the production backup and restore
    procedure, **the wipe-and-reseed one-liner for dev**, the Supabase ceilings from requirement 1,
    the dev basic-auth credentials location, and rollback. Rollback is
    `IMAGE_TAG=<previous-sha> docker compose -p kidlearn-<env> up -d`; file 38a makes it a workflow
    input. Migrations are **forward-only** — a bad migration is fixed by a new forward migration,
    never by editing an applied one.

19. **A billing alarm, before anything else is switched on.** AWS Budgets, $35/month, alerting to
    your email at 80% actual and 100% forecast. `t4g` instances default to **unlimited** CPU-credit
    mode, which silently bills surplus credits rather than throttling; that is the right default for
    a live site, but only with an alarm behind it.

## Technical Approach & Suggestions

Files to create:

```
apps/web/Dockerfile
apps/server/Dockerfile              # two targets: runner, migrate
.dockerignore
deploy/edge/compose.yml             # Caddy + the shared external network
deploy/edge/Caddyfile
deploy/app/compose.yml              # one file, parameterised by env — used by both stacks
deploy/app/compose.dev.yml          # overlay: postgres, mem_limit
deploy/bootstrap.sh                 # EC2 user-data: Docker, compose plugin, SSM agent, swap
deploy/deploy.sh                    # runs on the box, takes the environment as $1
document/runbook.md
```

Files to modify:

```
apps/web/next.config.ts             # output: "standalone"
apps/web/app/layout.tsx             # metadataBase, openGraph, "KidLearn" casing
apps/server/src/app.ts              # app.set("trust proxy", 1) in production
apps/server/.env.example            # production values; replace the cron-job.org comment block
apps/web/.env.local.example         # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, MEDIA_ASSET_HOSTS
document/project-requirement-details.md   # §9 — both environments
```

### Image builds

Use `node:22-bookworm-slim` for every stage, **not Alpine**. Prisma's query engine and `argon2` both
link against glibc and OpenSSL 3; musl means chasing
`binaryTargets = ["linux-musl-arm64-openssl-3.0.x"]` and native rebuilds for no meaningful size win.
Generating the Prisma client inside the same base image and architecture as the runtime makes
`native` resolve correctly with no `binaryTargets` entry at all.

`argon2` is a **native module**. Its prebuilt binaries usually cover `linux/arm64`, but if the
builder falls back to compiling from source the stage needs `python3 make g++`. Find out during
step 2 rather than during the first deploy.

Shape of `apps/server/Dockerfile` — the web one is the same idea, taking the three build args and
ending at `.next/standalone`:

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
`@kidlearn/db` and `@kidlearn/types` workspace packages into the output tree; if it does not under
the default isolated linker, the documented fallbacks are `--legacy` or setting
`inject-workspace-packages=true` in `.npmrc`. Prove it produces a tree that `node dist/index.js`
actually starts from before writing anything downstream of it.

### Three Compose projects on one shared network

`kidlearn-edge` (Caddy), `kidlearn-prod` and `kidlearn-dev`. Separate projects so that deploying dev
cannot restart production and neither can restart Caddy.

The trap is service-name collision. Both application stacks have a service called `web`; on a shared
external network, Compose registers each service name as an alias, and Caddy's `reverse_proxy web:3000`
would then resolve to whichever answered DNS first. **Give every service an explicit alias on the
shared network** and use only those aliases in the Caddyfile:

```yaml
# deploy/app/compose.yml — used by both stacks via -p and an env file
services:
  web:
    image: ${ECR_REGISTRY}/kidlearn-web:${ENV_NAME}-${IMAGE_TAG}
    restart: unless-stopped
    environment: { HOSTNAME: "0.0.0.0", PORT: "3000" }
    networks:
      kidlearn-edge:
        aliases: ["${ENV_NAME}-web"]

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

`deploy/app/compose.dev.yml` overlays the dev-only pieces — the Postgres service on `internal` with
its healthcheck and named volume, `depends_on: { dev-postgres: { condition: service_healthy } }` on
`api` and `migrate`, and the `mem_limit` values from requirement 8. Production runs
`-f compose.yml`; dev runs `-f compose.yml -f compose.dev.yml`. One file describes what the two
environments share, and the overlay describes exactly how they differ — which is the property that
stops them drifting apart.

### IAM

The **instance role** needs `AmazonSSMManagedInstanceCore` (Session Manager and Send-Command), ECR
pull (`ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`),
`ssm:GetParametersByPath` on `/kidlearn/prod/*` and `/kidlearn/dev/*` with `kms:Decrypt` on the key
those parameters use, and `s3:PutObject` on the backup bucket alone. Nothing wider.

The **GitHub OIDC roles** are file 38a's; do not create them here.

### Order of operations

Production first, completely, then dev — so that a half-finished dev environment can never be the
reason production is not up.

(1) AWS account, budget alarm, region `ap-south-1`; (2) production Supabase project in `ap-south-1`,
`migrate deploy` + seed + `seed:admin` from your machine; (3) production Cloudinary cloud;
(4) `/kidlearn/prod/` SSM parameters; (5) three ECR repositories with per-prefix lifecycle policies;
(6) build and push `kidlearn-web:prod-<sha>`, `kidlearn-api:<sha>`, `kidlearn-migrate:<sha>` from
your machine — you are on an arm64 Mac, so these are native builds; (7) EC2 instance, Elastic IP,
security group, instance role, `bootstrap.sh` as user-data; (8) Route 53 zone, nameserver
delegation, five A records; (9) edge stack against **ACME staging**, then production stack, confirm
`kidlearn.net` and `api.kidlearn.net`, switch to production ACME; (10) production Google OAuth
client; (11) backup and weekly-report crons; (12) **production smoke test — checkpoint, production
is live**; (13) dev Gemini key and Cloudinary cloud, `/kidlearn/dev/` parameters; (14) dev images,
dev stack with the Postgres overlay, migrate and seed; (15) extend the Caddyfile with the two dev
hosts; (16) dev OAuth client entries; (17) dev smoke test; (18) runbook and spec §9.

## Step-by-Step Plan

1. `output: "standalone"`, `trust proxy`, `metadataBase` and the `"KidLearn"` casing fix; both
   `.env.example` files. `pnpm lint && pnpm typecheck && pnpm --filter server test` pass. (~30 min)
2. Write both Dockerfiles and `.dockerignore`; build for `linux/arm64` locally and run the
   containers against your local Postgres to prove they boot before AWS is involved. This is where
   `pnpm deploy` and `argon2` either work or need the documented fallbacks. (~70 min)
3. AWS account setup: region, $35 budget alarm, three ECR repositories with per-prefix lifecycle
   policies, push the first production images. (~35 min)
4. Production Supabase project in `ap-south-1`; `prisma migrate deploy` against `DIRECT_URL`, then
   seed, then `seed:admin`; confirm the tables in the dashboard. (~30 min)
5. Production Cloudinary cloud; write the `/kidlearn/prod/` SSM parameters. (~30 min)
6. Launch the EC2 `t4g.medium` with `bootstrap.sh` as user-data, Elastic IP, security group (443,
   443/udp, 80 — **no 22**), instance role. Reach it with `aws ssm start-session` to prove SSM works
   before anything depends on it. (~35 min)
7. Route 53 zone, nameserver delegation at the registrar, five A records; wait for propagation.
   (~30 min, mostly waiting)
8. Edge stack against ACME **staging**, then the production app stack; confirm both production
   hostnames and their certificates; switch to production ACME and re-run.
   `curl https://api.kidlearn.net/health` returns the envelope. (~40 min)
9. Production Google OAuth client; sign in on `https://kidlearn.net`; confirm the session cookie is
   `Secure; HttpOnly; SameSite=Lax` and **survives a reload**. Backup and weekly-report crons; run
   the backup once by hand. **Checkpoint — production is live.** (~50 min)
10. Dev Gemini key and Cloudinary cloud; `/kidlearn/dev/` SSM parameters including
    `POSTGRES_PASSWORD`. (~30 min)
11. Dev images (`kidlearn-web:dev-<sha>`), the dev stack with the Postgres overlay and memory limits;
    migrate, then **restore the production `pg_dump` into it** so dev has realistic data — which also
    rehearses the restore. (~50 min)
12. Extend the Caddyfile with `dev.kidlearn.net` and `api.dev.kidlearn.net`, basic auth and
    `noindex`; add the dev entries to the existing OAuth client; sign in on dev. (~35 min)
13. Verify the isolation claims: dev cannot reach Supabase, production cannot reach the dev Postgres,
    and `docker compose -p kidlearn-dev down -v` followed by migrate and seed rebuilds dev from
    nothing. (~25 min)
14. Full smoke test on a real phone against production (checklist below), then
    `document/runbook.md` and spec §9. Update the tracker. (~45 min)

## Acceptance Criteria

**Production**

- [ ] `https://kidlearn.net` serves the app, `https://www.kidlearn.net` 301s to the apex, and
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
- [ ] Media on lesson and story screens is served from `res.cloudinary.com` (NFR-PERF-02).
- [ ] The running app connects on the **pooled** `DATABASE_URL` (:6543) while `migrate deploy` used
      `DIRECT_URL` (:5432) — confirm in Supabase's connection stats.
- [ ] A `pg_dump` from the cron has been **restored into the dev Postgres** and the procedure is in
      the runbook.

**Development**

- [ ] `https://dev.kidlearn.net` prompts for basic auth, then serves the app; `https://api.dev.kidlearn.net/health`
      returns the envelope without a prompt; both carry `X-Robots-Tag: noindex`.
- [ ] A parent signs in with Google on `https://dev.kidlearn.net` and the session survives a reload —
      proving the OAuth callback works through the basic-auth boundary.
- [ ] `https://api.dev.kidlearn.net/docs` **loads** — `ENABLE_API_DOCS` is `true` in dev.
- [ ] The dev API's `DATABASE_URL` points at `dev-postgres` and contains **no** `pgbouncer` or
      `connection_limit` parameter.
- [ ] `docker compose -p kidlearn-dev down -v`, then migrate, then seed, rebuilds dev from nothing in
      one documented sequence.
- [ ] The dev Postgres publishes **no** host port: `ss -tlnp` on the box shows only Caddy on 80/443.

**Both**

- [ ] No `localhost` string appears in either shipped web bundle, and each environment's bundle calls
      **its own** API host — `grep` the dev build for `api.kidlearn.net` and find nothing.
- [ ] `nmap` from outside shows **only** 80 and 443 open; port 22 is closed and
      `aws ssm start-session` is the working shell.
- [ ] Dev and production hold **different** `BETTER_AUTH_SECRET`, `CRON_SECRET`, Gemini keys and
      Cloudinary clouds; a session cookie from one environment is rejected by the other.
- [ ] Under a throttled network the file-13 loader and retry appear and the request completes — never
      a raw error (NFR-PERF-04).
- [ ] Rollback rehearsed once per environment:
      `IMAGE_TAG=<previous-sha> docker compose -p kidlearn-<env> up -d` restores the prior version.
- [ ] `free -m` on the box under both stacks shows headroom, and the dev containers carry their
      `mem_limit` values (`docker stats`).
- [ ] The AWS Budgets alarm exists at $35/month and the first full day's Cost Explorer figure is
      within ~10% of the table above.
- [ ] Every variable in requirement 10 exists in the right SSM path or compose file, and both
      `.env.example` files match the matrix.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

## Out of Scope

- **Automating these deploys** — file 38a. Both environments are brought up by hand once,
  deliberately: an automated pipeline for a deploy nobody has performed manually is a pipeline that
  fails on something the author never saw.
- **HTTP hardening** — helmet, body limits, per-IP rate limiting on the auth and PIN routes
  (`improvement-plan.md` P1-2, proposed file 41). Genuinely urgent now that the API is public, but a
  code change with its own tests, not a deployment step.
- **Hard isolation between the two environments.** The limits are stated above under "The isolation
  this design does and does not give you". Buying more of it means a second instance, and that is a
  cost decision to revisit, not a design to build now.
- Multi-instance, autoscaling, or any load balancer. One box serves both environments at this
  traffic; the §9 architecture lets each layer upgrade independently.
- Moving the production database into AWS (RDS is ~$18/month plus storage here). The upgrade path is
  a `DATABASE_URL` change and a `pg_dump` restore — write it in the runbook, do not build it.
- A third environment. Nothing in this design forbids one, but two hostnames per environment and one
  4 GiB box is the budget.
- CloudFront, IPv6-only addressing to dodge the $3.65 IPv4 charge, and Savings Plan commitments
  beyond noting them.
- Observability past pino to stdout and `docker compose logs` — error tracking, uptime alerting and
  log shipping are post-MVP.
