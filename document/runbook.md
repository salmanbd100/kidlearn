# KidLearn — Operations Runbook

> **What this is for:** the thing you open when production is down, when a deploy
> has to be rolled back, or when you have forgotten where a value lives. It is
> written to be read in a hurry. Design rationale lives in
> `document/implementation/38-deployment-aws-docker.md`; this file is procedure.
>
> **Bringing this into existence for the first time?** You want
> `document/deployment-walkthrough.md`, not this file. It is the same work in
> beginner's order, with every command spelled out and the AWS vocabulary
> explained. Come back here once production is up.
>
> **Status:** the repository half of file 38 is implemented and verified locally.
> **No AWS, Vercel, Cloudflare or Supabase resource has been provisioned yet.**
> Every value written `<like-this>` is a placeholder to be filled in on the day it
> is created. A section marked **⬜ not yet done** describes a procedure that has
> been written but never executed — treat it as a plan, not as a record.

---

## 1. Topology

| Environment | Branch | Web (Vercel) | API (EC2) | Database |
|---|---|---|---|---|
| **Production** | `main` | `kidlearn.net`, `www.kidlearn.net` | `api.kidlearn.net` | Supabase free project, `ap-south-1` |
| **Development** | `dev` | `dev.kidlearn.net` | `api.dev.kidlearn.net` | `dev-postgres` container on the box |

One `t4g.small` in `ap-south-1` runs both API stacks behind Caddy. Vercel serves
the three web hostnames and terminates their TLS itself. Media is on Cloudinary.

Three Compose projects on one box, deliberately separate so that deploying one
cannot restart another:

| Project | Files | Holds |
|---|---|---|
| `kidlearn-edge` | `deploy/edge/compose.yml` | Caddy, and the `kidlearn-edge` network. **Bring up first** — the other two join that network as `external`. |
| `kidlearn-prod` | `deploy/app/compose.yml` | `prod-api`, and the `prod-migrate` job under a profile |
| `kidlearn-dev` | `deploy/app/compose.yml` + `compose.dev.yml` | `dev-api`, `dev-postgres`, `dev-migrate` |

**`prod-api` and `dev-api` are network aliases, not service names.** Both stacks
call the service `api`, and on a shared network Compose registers the service
name as an alias too — so `reverse_proxy api:4000` resolves to whichever stack
answered DNS first. Verified: `dev-api`'s aliases on `kidlearn-edge` are
`["dev-api", "api", "dev-api"]`. The Caddyfile must always name the prefixed
alias.

### What is and is not isolated

- **Data is properly isolated.** Production is on Supabase, dev on a container.
  No connection string, credential or network path joins them.
- **The frontends are properly isolated.** Two Vercel projects, separate
  project-scoped variables.
- **API runtime is soft-isolated.** Separate containers, projects, SSM paths and
  memory limits — but one kernel and one disk. **A dev container that fills the
  EBS volume takes the production API down with it.**
- **CI/CD isolation is a convention, not a boundary.** `ssm:SendCommand` is
  scoped to an *instance*, so a workflow that can deploy dev can technically
  touch production's containers. File 38a narrows this as far as IAM allows.

If any of that stops being acceptable, the fix is a second instance and nothing
else in the design changes.

---

## 2. Getting a shell — and the logs

**The security group has no port 22 rule, and does not need one.** There are
three ways in, all through Session Manager, which needs no inbound rule and
leaves an audit trail.

If none of them works, the instance role has lost `AmazonSSMManagedInstanceCore`
or the agent is down — that is the thing to fix, not a temporary port 22 rule.

**1. Browser.** EC2 console → tick the instance → **Connect** → **Session
Manager** → Connect. Nothing to install; useful from a machine that is not yours.

**2. Terminal, quickest.**

```bash
aws ssm start-session --target <instance-id> --region ap-south-1
sudo su -
```

**3. Real SSH from your own terminal — `ssh`, `scp`, `rsync`, `ssh -L`, VS Code
Remote.** Still over Session Manager: the transport is the SSM tunnel, so there
is no open port and the session is still audited. See §2a for the one-time setup;
afterwards it is:

```bash
ssh kidlearn                                   # a shell
scp -r deploy/ kidlearn:/tmp/                  # copy files up
rsync -az --delete deploy/ kidlearn:/tmp/deploy/
ssh -L 5432:dev-postgres:5432 kidlearn         # tunnel a port to your machine
```

### 2a. One-time setup for SSH over Session Manager

**On your Mac:**

```bash
brew install --cask session-manager-plugin
session-manager-plugin                          # should print a version

ssh-keygen -t ed25519 -f ~/.ssh/kidlearn -C "kidlearn-ec2"   # no passphrase needed
```

**Put the public key on the box**, once, using method 2 above:

```bash
aws ssm start-session --target <instance-id> --region ap-south-1
sudo -u ec2-user bash -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh \
  && echo "<paste the contents of ~/.ssh/kidlearn.pub>" >> ~/.ssh/authorized_keys \
  && chmod 600 ~/.ssh/authorized_keys'
```

**Then add to `~/.ssh/config` on your Mac:**

```sshconfig
Host kidlearn
  HostName <instance-id>          # i-0abc…, NOT the Elastic IP
  User ec2-user
  IdentityFile ~/.ssh/kidlearn
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p' --region ap-south-1"
```

`HostName` is the **instance ID**, not an address — there is no address involved.
`ssh` runs the `ProxyCommand`, which opens an SSM tunnel and speaks SSH through
it.

Your IAM **user** needs `ssm:StartSession` on the instance and on
`arn:aws:ssm:*::document/AWS-StartSSHSession`. An account administrator already
has it; the instance role from the walkthrough's A9 covers the other end.

You land as `ec2-user`; `sudo su -` for root as usual.

> Rotating or revoking access is `authorized_keys` on the box plus the IAM
> permission — there is still nothing listening on port 22 to attack.

```bash
# API logs, per environment
docker compose -p kidlearn-prod logs -f api
docker compose -p kidlearn-dev  logs -f api

# Edge / TLS
docker compose -p kidlearn-edge logs -f caddy

# What is actually listening. Expect ONLY Caddy on 80 and 443.
ss -tlnp

# Memory. Expect ~700 MB available with both stacks up.
free -m
docker stats --no-stream
```

**Frontend logs are in the Vercel dashboard**, per project. Nothing about the web
tier is on the box.

---

## 3. Deploying the API

Both images are environment-agnostic — configured entirely at runtime — so one
bare `<sha>` tag serves both environments.

```bash
# On your own machine (arm64 Mac → native builds), from the repository root:
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin <acct>.dkr.ecr.ap-south-1.amazonaws.com

SHA=$(git rev-parse --short HEAD)
docker build --platform linux/arm64 -f apps/server/Dockerfile --target runner \
  -t <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-api:$SHA .
docker build --platform linux/arm64 -f apps/server/Dockerfile --target migrate \
  -t <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-migrate:$SHA .
docker push <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-api:$SHA
docker push <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-migrate:$SHA
```

Then on the box:

```bash
/opt/kidlearn/deploy/deploy.sh prod $SHA     # or: dev $SHA
```

`deploy.sh` fetches that environment's SSM parameters into
`/opt/kidlearn/<env>/app.env` (root-owned, `0600`), pulls, brings the stack up,
and polls the container healthcheck for 150 seconds. It prints the rollback
command if the gate fails.

### Migrations are a separate step, deliberately

A schema change must be a decision, not a side effect of restarting a container.

```bash
cd /opt/kidlearn/deploy/app
docker compose --env-file /opt/kidlearn/prod/compose.env \
  -p kidlearn-prod -f compose.yml --profile migrate run --rm migrate
# dev also passes: --env-file /opt/kidlearn/dev/compose.env  and  -f compose.dev.yml
```

**The `--env-file` is not optional.** `compose.yml` interpolates `ENV_NAME`,
`ECR_REGISTRY` and `IMAGE_TAG`; nothing sets them in your shell. Without the flag
Compose substitutes blanks and stops on `env file /opt/kidlearn//app.env not
found` — which reads like a missing file and is a missing variable.
`compose.env` is written by `deploy.sh`, so run a deploy before the first
migration.

**Migrations are forward-only.** A bad migration is fixed by a new forward
migration, never by editing an applied one. Never run `prisma migrate dev`
against a deployed database.

### Rollback — two independent halves

Both, because under load nobody derives the second one.

```bash
# 1. API
/opt/kidlearn/deploy/deploy.sh prod <previous-sha>
```

```
# 2. Frontend
Vercel dashboard → the project → Deployments → the last known-good one
  → "Instant Rollback" (or "Promote to Production").
```

The weekly image prune in `bootstrap.sh` runs `docker image prune -f`, never
`-a`, precisely so the previous image is still on the box when you need it.

---

## 4. Where every value lives

`apps/server/src/config/env.ts` is the enforcement — the API refuses to boot on a
missing or malformed variable, naming the field. This table is the inventory.

**Secrets: SSM Parameter Store, every one a `SecureString`**, under
`/kidlearn/prod/` and `/kidlearn/dev/`. Standard tier, free to 10,000 parameters;
this uses about 35. Not Secrets Manager, which would be ~$16/month for the same
values.

| Var | Where | Production | Development |
|---|---|---|---|
| `NODE_ENV` | compose | `production` | `production` — see below |
| `PORT` | compose | `4000` | `4000` |
| `DATABASE_URL` | SSM | Supabase pooled `:6543`, `?pgbouncer=true&connection_limit=1` | `postgresql://kidlearn:<pw>@dev-postgres:5432/kidlearn` — **neither flag** |
| `DIRECT_URL` | SSM | Supabase direct `:5432` | identical to the dev `DATABASE_URL` |
| `WEB_ORIGIN` | SSM | `https://kidlearn.net` | `https://dev.kidlearn.net` |
| `BETTER_AUTH_URL` | SSM | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
| `BETTER_AUTH_SECRET` | SSM | fresh `openssl rand -base64 32` | **a different** fresh value |
| `GOOGLE_CLIENT_ID` / `_SECRET` | SSM | production OAuth client | dev OAuth client |
| `LOG_LEVEL` | compose | `info` | `debug` |
| `ENABLE_API_DOCS` | compose | `false` | `true` |
| `PARENT_POST_LOGIN_PATH` | compose | `/parent` | `/parent` |
| `APP_TIMEZONE` | compose | `Asia/Dhaka` | `Asia/Dhaka` |
| `CRON_SECRET` | SSM | `openssl rand -base64 32` | a different value; dev runs no cron |
| `CLOUDINARY_*` | SSM | production cloud | **a separate free cloud** |
| `GEMINI_API_KEY` | SSM | production AI Studio key | **a separate free key** |
| `GEMINI_TEXT_MODEL` / `_IMAGE_MODEL` | compose | `gemini-3.6-flash` / `gemini-2.5-flash-image` | same |
| `GOOGLE_TTS_API_KEY` | SSM | Cloud TTS key, restricted to that API | **same key, shared** |
| `GOOGLE_TTS_VOICE_EN` / `_BN` | compose | `en-US-Standard-C` / `bn-IN-Standard-A` | same |
| `AI_TEXT_JOBS_PER_DAY` / `_AUDIO_` / `_IMAGE_` | compose | 8 / 100 / 15 | 4 / 20 / 5 |
| `POSTGRES_PASSWORD` | SSM (dev only) | — | `openssl rand -base64 24` |
| `BACKUP_S3_BUCKET` | SSM (prod only) | the backup bucket name, no `s3://` | — ; dev is never backed up |
| `NEXT_PUBLIC_API_URL` | **Vercel**, build-time | `https://api.kidlearn.net` | `https://api.dev.kidlearn.net` |
| `NEXT_PUBLIC_SITE_URL` | **Vercel**, build-time | `https://kidlearn.net` | `https://dev.kidlearn.net` |
| `MEDIA_ASSET_HOSTS` | **Vercel**, build-time | `https://res.cloudinary.com` | `https://res.cloudinary.com` |
| `SITE_NOINDEX` | **Vercel**, build-time | **unset** | `true` |
| `DEV_SITE_BASIC_AUTH` | **Vercel**, runtime | **unset** | `dev:<password>` — **not** `NEXT_PUBLIC_` |

`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` are in neither deployment. They
are read only by `seed:admin` and passed inline — a deployment must not need an
admin password present just to start.

**Two generated files per environment, and they are not interchangeable.**
`deploy.sh` writes both, root-owned `0600`:

| File | Job |
|---|---|
| `/opt/kidlearn/<env>/app.env` | handed to the container as Compose's `env_file:` — the secrets above |
| `/opt/kidlearn/<env>/compose.env` | the `${...}` substitutions the Compose files themselves contain: `ENV_NAME`, `ECR_REGISTRY`, `IMAGE_TAG`, the compose-sourced rows above, and (dev) `POSTGRES_PASSWORD`. Passed with `--env-file` |

**Every `$` in both files is doubled.** Compose interpolates `env_file` *and*
`--env-file`, so a raw `s3cr$tastic` reaches the process as `s3cr` — and since
`/health` is DB-free, a truncated database password deploys "successfully" and
fails on the first query. `$$` round-trips to a literal `$`. The consequence for
you: **do not read a value out of `app.env` and paste it somewhere else** —
`psql`, a `DATABASE_URL` you are debugging with, anything. Read it from SSM
instead, which is what `backup.sh` does.

### Three things in that table that will cost you an afternoon

**Both deployed environments run `NODE_ENV=production`.** "Development" names the
environment, not the Node mode. A dev deployment that runs React in development
mode, skips the production build and sets non-`Secure` cookies is not testing
what production will do. Hostnames, database, credentials and `ENABLE_API_DOCS`
are the whole difference.

**The dev `DATABASE_URL` carries neither `pgbouncer=true` nor
`connection_limit=1`.** Those exist for Supabase's PgBouncer. Against a plain
Postgres, `pgbouncer=true` needlessly disables prepared statements and
`connection_limit=1` serialises the whole app. Copying production's URL shape is
the obvious mistake.

**Four Vercel variables are build-time, and one of them does not look it.**
`NEXT_PUBLIC_*` are inlined into the client bundle — everyone expects that. So is
`MEDIA_ASSET_HOSTS`, and so is **`SITE_NOINDEX`**: Next serialises `headers()`
into `.next/routes-manifest.json` during `next build`, so setting it on a running
server does nothing. Editing any of the four in the dashboard has no effect until
you **redeploy**. `DEV_SITE_BASIC_AUTH` is the one that genuinely is runtime.

> Because they are build-time, all four are declared under `web#build` → `env` in
> `turbo.json`. **Turbo runs in strict env mode**, which means a variable not
> declared there is stripped from `next build` and vanishes silently. `NEXT_PUBLIC_*`
> survive by framework inference; `MEDIA_ASSET_HOSTS` and `SITE_NOINDEX` did not,
> and that is why the `noindex` header did not appear the first time it was tried.
> **Adding a new build-time variable means adding it to `turbo.json` in the same
> change.**

The failure mode this guards against is `dev.kidlearn.net` quietly calling
`api.kidlearn.net`. It looks like a CORS bug, is not one, and would have a dev
build writing to the production database. **Check the deployed bundle, not the
dashboard:**

```bash
curl -s https://dev.kidlearn.net/_next/static/chunks/ -o /dev/null   # find a chunk
curl -s <a deployed dev chunk URL> | grep -c 'api\.kidlearn\.net'    # must be 0
```

---

## 5. DNS — Cloudflare, free tier ⬜ not yet done

Registrar nameservers point at Cloudflare. Five records:

| Name | Type | Target |
|---|---|---|
| `kidlearn.net` | A | the apex address Vercel shows for the production project |
| `www` | CNAME | the `*.vercel-dns.com` target Vercel shows for the production project |
| `dev` | CNAME | the same, for the dev project |
| `api` | A | the Elastic IP |
| `api.dev` | A | the Elastic IP |

**Take the two Vercel targets from the project's Domains tab on the day you add
them**, not from any value written down here — Vercel has changed its published
apex address before.

**Proxy off (grey cloud) on all five.** On the Vercel names, orange-cloud
proxying puts a second TLS terminator in front of Vercel's own and interferes
with its certificate issuance; on the API names it does the same to Caddy's ACME
challenge, for no benefit at this traffic.

`api.dev.kidlearn.net` is an ordinary four-label name — Let's Encrypt issues for
it with no wildcard and no DNS challenge.

**Wait for both Caddy certificates and all three Vercel domains before touching
anything else.** A half-provisioned domain is indistinguishable from a CORS bug.

- Registrar: `<registrar>`
- Cloudflare account: `<account>`
- Elastic IP: `<a.b.c.d>`
- Instance ID: `<i-…>`

---

## 6. TLS — Caddy, and the one way to lock yourself out

Caddy obtains and renews both API certificates itself. Vercel handles the three
web hostnames.

**`deploy/edge/Caddyfile` ships with the ACME *staging* endpoint enabled.** That
is deliberate: Caddy begins requesting certificates the instant it starts, there
is no dry run, and Let's Encrypt's production endpoint allows 5 duplicate
certificates per week and rate-limits failed validations. A wrong A record burns
them without asking.

First run:

1. Leave `acme_ca …acme-staging-v02…` alone. `docker compose -p kidlearn-edge -f deploy/edge/compose.yml up -d`.
2. Confirm both hostnames answer on an untrusted (staging) certificate.
3. Comment the line out, then
   `docker compose -p kidlearn-edge -f deploy/edge/compose.yml up -d --force-recreate`.
4. **Record here which endpoint the box is currently on:** `<staging | production>`.

**The `caddy_data` volume is load-bearing.** It holds the ACME account key and
both certificates. Losing it on every deploy re-requests them until the rate
limit locks you out — a week with no TLS, not an inconvenience. It is a named
volume, never a bind mount into a directory a deploy script might clean. Do not
run `docker volume prune` on this box without checking what it would take.

---

## 7. The dev database

A `postgres:16-alpine` container on the dev stack's internal network. **No
published host port** — nothing outside that stack can reach it.

**It is deliberately disposable and is never backed up.** That is the point of
it: dev is where a migration gets tried against a real deploy.

```bash
# THE WIPE-AND-RESEED ONE-LINER. Destroys the dev database completely.
cd /opt/kidlearn/deploy/app
dc() { docker compose --env-file /opt/kidlearn/dev/compose.env \
         -p kidlearn-dev -f compose.yml -f compose.dev.yml "$@"; }
dc down -v && dc up -d && dc --profile migrate run --rm migrate
```

Then reseed — either the repository seed, or (better, and it rehearses the
restore) the latest production `pg_dump`, per §8.

The `dev-postgres` healthcheck gates the migrate job with
`depends_on: { condition: service_healthy }`. Without it the migrate job races
the database on first boot and fails in a way that looks like a bad migration.

---

## 8. Backups — production only ⬜ not yet done

Supabase's free tier has **no point-in-time recovery**, so this is yours to own.

`deploy/backup.sh` runs `pg_dump` against production's `DIRECT_URL`, gzips it,
and streams it to a private S3 bucket with versioning on and a lifecycle rule
expiring objects after 30 days. It reads both `DIRECT_URL` and
`BACKUP_S3_BUCKET` from SSM, dumps through the `postgres:16-alpine` image the
dev stack already pulls (so the box needs no postgres-client package), pipes
straight to S3 rather than staging on the 20 GB volume, and fails if the
uploaded object is under 1 KB — a gzip of nothing uploads perfectly happily.

`sudo crontab -e`:

```cron
CRON_TZ=Asia/Dhaka
# Nightly production database dump → S3
30 1 * * *  /opt/kidlearn/deploy/backup.sh
```

**Both cron entries need a cron daemon, and AL2023 ships none** — `bootstrap.sh`
installs `cronie` and enables `crond` for exactly this. If the box was built
before that was added, `dnf install -y cronie && systemctl enable --now crond`
first, or nothing in this section or §9 has ever run.

**Restore it once, into the dev Postgres container, before declaring this done.**
An unrehearsed backup is a guess — and it is also the fastest way to get
realistic data into dev.

```bash
aws s3 cp s3://<backup-bucket>/<object> - | gunzip \
  | docker exec -i dev-postgres psql -U kidlearn -d kidlearn
```

- Bucket: `<bucket>`
- Last restore rehearsal: `<date>` — **⬜ never**

---

## 9. Scheduled jobs — production only ⬜ not yet done

File 30's weekly report job, moved off cron-job.org onto the box. One fewer
external account, and the secret stays in SSM.

`sudo crontab -e`:

```cron
CRON_TZ=Asia/Dhaka
# Weekly parent reports, Mondays 02:00 Asia/Dhaka
0 2 * * 1  /opt/kidlearn/deploy/weekly-reports.sh
```

The `curl` lives in `deploy/weekly-reports.sh`, not inline, because **cron has no
line continuation** — a crontab command is one line, to the newline, and a
backslash-wrapped `curl` is handed to `/bin/sh` a fragment at a time. Same reason
`backup.sh` is a script in §8.

**Dev runs no scheduled jobs.** Trigger it by hand there when testing.

---

## 10. Vercel — two Hobby projects ⬜ not yet done

One project tracks `main` and serves `kidlearn.net` + `www`; one tracks `dev` and
serves `dev.kidlearn.net`. Each sets its own production branch so neither builds
the other's commits.

Two projects rather than one with a branch-scoped domain: per-project variables
cannot be selected by the wrong scope, and branch domains are a plan-tier feature
this design would rather not depend on.

**Settings, both projects:**

| Setting | Value |
|---|---|
| Root Directory | `apps/web`, with *Include source files outside of the Root Directory* **enabled** |
| Build Command | `cd ../.. && pnpm turbo run build --filter=web` |
| Install Command | `pnpm install --frozen-lockfile`, at the repository root |
| Function region | `bom1` (Mumbai) — Hobby allows one; the default is `iad1` |

**The build command must go through Turbo, not `next build`.** `apps/web`
depends on `@kidlearn/types`, which compiles to `dist/` and is resolved through
its `exports` map; a bare `next build` rooted at `apps/web` fails on the missing
`dist`. If you accept Vercel's Turborepo detection instead, **read the first
build log and confirm `@kidlearn/types` built first.** This is the single most
likely thing to fail on the first deploy.

`@kidlearn/ui` needs nothing — it ships raw TypeScript and `next.config.ts`
already lists it in `transpilePackages`. `packages/db` is not a dependency of
`apps/web`, so no `prisma generate` runs on Vercel.

### Two Hobby facts that are operational, not footnotes

- **Hobby is licensed for non-commercial personal projects.** The first paid
  feature, advert or business use puts this in breach and requires Pro at
  $20/month — more than the $8.17 the move saved. **That is a trigger for the
  escape hatch in §11.**
- **Hobby has no overage billing.** Exceeding the transfer or edge-request
  ceiling **pauses the project** rather than charging for the excess, so
  production availability depends on a free tier with a hard stop. Media being on
  Cloudinary keeps the bulk of the bytes off Vercel. **Turn on Vercel's usage
  notifications**, and record the ceilings here on the day you provision — they
  move.
  - Ceilings as at `<date>`: `<transfer>`, `<edge requests>`

---

## 11. Escape hatch — moving the frontend back onto the box

**Trigger:** either Hobby condition in §10 — a commercial trigger, or a paused
project on a ceiling. Running this is a response to a trigger, not routine work.

`apps/web/Dockerfile` and `output: "standalone"` stay in the repository even
though nothing deploys them, and CI builds the image on every run so it cannot
rot. Expect about thirty minutes.

1. **Resize the box to `t4g.medium` first.** Two Next.js servers do not fit in
   2 GiB. This is a stop, change instance type, start — the Elastic IP survives it.
2. Build and push, one image per environment because `NEXT_PUBLIC_*` are baked in:
   ```bash
   docker build --platform linux/arm64 -f apps/web/Dockerfile \
     --build-arg NEXT_PUBLIC_API_URL=https://api.kidlearn.net \
     --build-arg NEXT_PUBLIC_SITE_URL=https://kidlearn.net \
     --build-arg MEDIA_ASSET_HOSTS=https://res.cloudinary.com \
     -t <acct>.dkr.ecr.ap-south-1.amazonaws.com/kidlearn-web:prod-$SHA .
   # the dev image adds --build-arg SITE_NOINDEX=true
   ```
   You will need to create the `kidlearn-web` ECR repository — it does not exist.
3. Add a `web` service to `deploy/app/compose.yml` with a `${ENV_NAME}-web`
   network alias, taking `DEV_SITE_BASIC_AUTH` as a runtime variable on the dev
   stack.
4. Add the web hostnames to `deploy/edge/Caddyfile`, reverse-proxying to those
   aliases on port 4000.
5. Repoint the `kidlearn.net`, `www` and `dev` Cloudflare records at the Elastic
   IP. Caddy will obtain three more certificates — go through the staging
   endpoint again (§6).

---

## 12. Ceilings and limits worth knowing before they bite

| Thing | Limit | Checked |
|---|---|---|
| Supabase free: database | 500 MB | 2026-09-06 |
| Supabase free: egress | 5 GB/month | 2026-09-06 |
| Supabase free: active projects | 2 per organisation — this design uses **one** | 2026-09-06 |
| Supabase free: inactivity pause | **7 days** — matters between provisioning and launch | 2026-09-06 |
| Supabase free: PITR | **none** — see §8 | 2026-09-06 |
| Let's Encrypt | 5 duplicate certificates per week | — |
| SSM Parameter Store Standard | 10,000 parameters, free — this uses ~35 | — |
| AWS Budgets alarm | **$20/month**, 80% actual + 100% forecast | ⬜ not yet created |

`t4g` instances default to **unlimited** CPU-credit mode, which silently bills
surplus credits rather than throttling. That is the right default for a live
site, but only with the budget alarm behind it.

Steady state is ≈ $13.75/month: EC2 `t4g.small` $8.18, the public IPv4 address
$3.65 (charged since 2024-02-01 even when attached), 20 GB gp3 ~$1.70, ECR $0.10,
S3 backups ~$0.10. Cloudflare, Vercel Hobby, Supabase free, Cloudinary free and
the Gemini free tier are $0.

---

## 13. Google OAuth — two clients, not one

| Client | Authorized JavaScript origins | Authorized redirect URIs |
|---|---|---|
| existing (local + dev) | `http://localhost:3000`, `https://dev.kidlearn.net` | `http://localhost:4000/api/auth/callback/google`, `https://api.dev.kidlearn.net/api/auth/callback/google` |
| new (production) | `https://kidlearn.net` | `https://api.kidlearn.net/api/auth/callback/google` |

One client with four entries would work and is worse: the production client
secret would then be sitting in a dev environment that is deliberately less
locked down.

**The session cookie stays `SameSite=Lax`.** `kidlearn.net` and
`api.kidlearn.net` are different origins but the **same site** — one registrable
domain — which is exactly what `Lax` permits on a `credentials: "include"` fetch.
`src/config/auth.ts` is already correct; **do not add a `SameSite=None`
override.** That is what keeps Safari's cross-site tracking prevention out of the
question of whether a parent stays signed in.

**No basic auth on `api.dev.kidlearn.net`.** The OAuth callback lands on the API
host and a prompt mid-redirect breaks the flow. After the callback better-auth
redirects to `https://dev.kidlearn.net/parent` — a top-level navigation into the
gate, which the browser satisfies from the credential it already cached for that
origin, so the round trip is silent.

**Dev basic-auth credential:** stored as `DEV_SITE_BASIC_AUTH` in the dev Vercel
project's settings. That is its only home — it is deliberately not duplicated
into SSM, which would give two places to forget to rotate.

---

## 14. Smoke test

Run on a real phone, against production, after any deploy you are unsure about.

1. Parent signs in with Google on `https://kidlearn.net`.
2. The parent area opens on consent alone — **there is no PIN step.** A deployed
   build that asks for a PIN is running an image older than 2026-09-09, which
   makes this a useful check on *which* build you actually deployed.
3. Create a child profile.
4. A seeded lesson plays through all five steps, with audio.
5. The parent dashboard shows the learning time just spent.
6. `/admin/ai-queue` loads for the admin user and lists and filters jobs.

Plus, from anywhere:

```bash
curl -s https://api.kidlearn.net/health          # {"data":{"status":"ok",…}}
curl -si https://api.kidlearn.net/docs | head -1 # 404 — docs are off in production
curl -si https://kidlearn.net | grep -i x-robots # nothing — noindex is dev-only
curl -si https://dev.kidlearn.net | head -1      # 401
curl -si https://api.dev.kidlearn.net/health     # 200, X-Robots-Tag: noindex
nmap <elastic-ip>                                # only 80 and 443 open
```

---

## 15. First-time provisioning order ⬜ not yet done

**`document/deployment-walkthrough.md` is this list with the commands filled in.**
Follow that; this is the summary to check yourself against.

Production first, completely, then dev — so a half-finished dev environment can
never be the reason production is not up. Within production, the API comes up
before the frontend, so the first thing the Vercel deployment does is talk to
something that already works.

1. AWS account, **$20 budget alarm**, region `ap-south-1`.
2. Production Supabase project in `ap-south-1`; `prisma migrate deploy` against
   `DIRECT_URL`, then seed, then `seed:admin` — all from your own machine.
3. Production Cloudinary cloud.
4. `/kidlearn/prod/` SSM parameters, including `BACKUP_S3_BUCKET`, plus the
   backup bucket itself: private, versioning on, a 30-day expiry lifecycle rule.
5. Two ECR repositories (`kidlearn-api`, `kidlearn-migrate`) with
   "keep the last 10 tagged images" lifecycle policies. Both images are
   environment-agnostic, so a blanket policy is correct — there are no
   environment-specific tags to evict each other.
6. Build and push `kidlearn-api:<sha>` and `kidlearn-migrate:<sha>`.
7. EC2 `t4g.small`, Elastic IP, security group (**443/tcp, 443/udp, 80/tcp from
   `0.0.0.0/0`; no port 22 rule**), instance role, `deploy/bootstrap.sh` as
   user-data. Prove `aws ssm start-session` works before anything depends on it.
   Then put the repository's `deploy/` tree on the box — `bootstrap.sh` creates
   the directory but deliberately pulls nothing, so this is a copy you make:

   ```bash
   # from the repository root, on your own machine
   tar cz deploy | aws ssm start-session --target <instance-id> \
     --document-name AWS-StartInteractiveCommand \
     --parameters 'command=["sudo tar xz -C /opt/kidlearn --strip-components=1"]'
   # or simply: clone the repo on the box and copy deploy/ into /opt/kidlearn/deploy
   ```

   `deploy.sh`, `backup.sh` and `weekly-reports.sh` must be executable, and
   `app/compose.yml`, `app/compose.dev.yml` must land in
   `/opt/kidlearn/deploy/app/`. Re-copy it whenever any of them changes — the box
   has no other way to hear about it until file 38a.
8. Cloudflare zone, nameserver delegation, the two `api` A records.
9. Edge stack against **ACME staging**, then the production API stack; confirm
   `https://api.kidlearn.net/health`; switch to production ACME.
10. Production Vercel project; `kidlearn.net` and `www`; region `bom1`.
11. Production Google OAuth client. **Confirm the session survives a reload**,
    and that the cookie is `Secure; HttpOnly; SameSite=Lax`.
12. Backup and weekly-report crons (§8, §9). Confirm `systemctl is-active crond`
    first — `bootstrap.sh` installs it, and without it both entries are inert.
    Run `backup.sh` once by hand and check the object size in S3.
13. **Production smoke test — checkpoint, production is live.**
14. Dev Gemini key and Cloudinary cloud; `/kidlearn/dev/` parameters including
    `POSTGRES_PASSWORD`.
15. Dev API stack with the Postgres overlay; migrate; **restore the production
    dump into it**, which also rehearses the restore.
16. Extend the Caddyfile with `api.dev.kidlearn.net`.
17. Dev Vercel project with `DEV_SITE_BASIC_AUTH` and `SITE_NOINDEX`.
18. Dev entries on the existing OAuth client.
19. Dev smoke test.
20. Fill in every `<placeholder>` in this file and delete the ⬜ markers.

**IAM, for reference.** The instance role needs
`AmazonSSMManagedInstanceCore`, ECR pull (`ecr:GetAuthorizationToken`,
`ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`), `ssm:GetParametersByPath` on
`/kidlearn/prod/*` and `/kidlearn/dev/*` with `kms:Decrypt` on their key, and
`s3:PutObject` on the backup bucket alone. Nothing wider. The GitHub OIDC roles
are file 38a's. Vercel needs no AWS credential at all.
