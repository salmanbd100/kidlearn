# Part 11 — The dev environment on the same server

[← Previous](10-release-life-cycle.md) · [Guide index](README.md) · [Next →](12-automatic-deploys.md)

> **Where you work:** 🌐 browser, 💻 Mac, 🖥️ server. Steps 29–36.  
> **You finish with:** `dev.kidlearn.net` and `api.dev.kidlearn.net` on the same server, isolated from production, with both database procedures rehearsed.  
> **Before you start:** Parts 1–10 — production is live.

**Do this once production has been stable for a few days.** Dev is where a
release — and especially a migration — gets tried against a real deployment
before parents see it.

```
                        ONE EC2 server, ONE Caddy, ONE Elastic IP
                    ┌────────────────┴────────────────┐
     api.kidlearn.net                          api.dev.kidlearn.net
           │                                          │
   kidlearn-prod project                       kidlearn-dev project
   prod-api ──► Supabase (backed up)           dev-api ──► dev-postgres container
   secrets /kidlearn/prod/*                    secrets /kidlearn/dev/*  (all DIFFERENT)
   docs OFF, LOG_LEVEL info, no memory cap     docs ON, LOG_LEVEL debug, 400 MB cap each
           ▲                                          ▲
   Vercel project "kidlearn"  (branch main)    Vercel project "kidlearn-dev"  (branch dev)
   kidlearn.net                                dev.kidlearn.net  (open, noindex)
```

**What is shared and what is not** (file 38, "The isolation this design does and
does not give you"):

| | Isolated? | How |
|---|---|---|
| Data | ✅ Fully | Different database, different credentials, no network path between them |
| Websites | ✅ Fully | Two Vercel projects, each with its own variables |
| API processes | ⚠️ Softly | Separate containers and Compose projects, but **one kernel and one disk** — a dev container that fills the disk takes production down too |
| Third-party keys | Mostly | Separate Gemini key and Cloudinary; the Text-to-Speech key is **shared**, and dev's daily job caps are lower so it cannot eat production's allowance |

**Cost:** $0 extra on AWS — same server, same IP. Every other account used here
is free.

## Step 29 · 🌐 Separate free accounts for dev

**Why:** if dev used production's Gemini key, one afternoon of testing the AI
queue would use up the daily allowance and leave the real admin unable to work.

1. **Gemini** — <https://aistudio.google.com/apikey> → **Create API key** →
   choose **Create API key in new project** (name it `kidlearn-dev`). *Why a new
   project:* free-tier limits are counted **per Google Cloud project**, so a
   second key in the same project shares the same allowance. No billing account.
2. **Cloudinary** — a second, separate environment for dev uploads, so test
   images never show up in the production media library. In the Cloudinary
   console, add a second **product environment** if your plan offers one; if it
   does not, sign up for a second free account with another email. Copy its
   **cloud name**, **API key** and **API secret**.
3. **Google Text-to-Speech** — **reuse the production key.** Nothing to create.

✅ **Check:** your sheet has a new section, `kidlearn dev`, with the Gemini key
and the three Cloudinary values.

## Step 30 · 💻🌐 Dev secrets — Parameter Store

**Cost:** $0 (Standard tier).

**30a. Make three new random values** — 💻 on your Mac:

```bash
openssl rand -base64 32   # → dev BETTER_AUTH_SECRET  (must differ from production)
openssl rand -base64 32   # → dev CRON_SECRET         (must differ from production)
openssl rand -hex 24      # → POSTGRES_PASSWORD
```

*Why `-hex` for the database password?* It goes **inside a URL**
(`postgresql://kidlearn:<password>@…`). Base64 can contain `/`, `+` and `=`,
and a `/` in that position ends the password early — the URL then means
something else entirely. Hex is only `0-9a-f`, which is always safe there.

*Why must the secrets differ?* `BETTER_AUTH_SECRET` signs login cookies. If dev
and production shared it, a cookie made by dev would be accepted by production.

**30b. Build the dev database URL** with your password in it:

```
postgresql://kidlearn:<POSTGRES_PASSWORD>@dev-postgres:5432/kidlearn
```

`dev-postgres` is not an internet address — it is the name of the database
container, which only the dev API can see on its private Docker network. Note
what is **missing** compared to production: no `?pgbouncer=true` and no
`connection_limit`. Those exist for Supabase's connection pooler; this is a plain
Postgres (`runbook.md` §4 explains both).

**30c. Store fourteen parameters.** Region menu: **Mumbai**. Same form as Step
13 (**SecureString**, Standard tier, `alias/aws/ssm`):

| Name | Value |
|---|---|
| `/kidlearn/dev/DATABASE_URL` | the URL from 30b |
| `/kidlearn/dev/DIRECT_URL` | **the same URL again** |
| `/kidlearn/dev/POSTGRES_PASSWORD` | the hex value on its own |
| `/kidlearn/dev/WEB_ORIGIN` | `https://dev.kidlearn.net` |
| `/kidlearn/dev/BETTER_AUTH_URL` | `https://api.dev.kidlearn.net` |
| `/kidlearn/dev/BETTER_AUTH_SECRET` | the first new value |
| `/kidlearn/dev/CRON_SECRET` | the second new value |
| `/kidlearn/dev/GOOGLE_CLIENT_ID` | your **existing** local Google client (the one your `apps/server/.env` uses) |
| `/kidlearn/dev/GOOGLE_CLIENT_SECRET` | the same client's secret |
| `/kidlearn/dev/CLOUDINARY_CLOUD_NAME` | dev cloud, Step 29 |
| `/kidlearn/dev/CLOUDINARY_API_KEY` | dev cloud |
| `/kidlearn/dev/CLOUDINARY_API_SECRET` | dev cloud |
| `/kidlearn/dev/GEMINI_API_KEY` | dev key, Step 29 |
| `/kidlearn/dev/GOOGLE_TTS_API_KEY` | **the same value as production** |

No backup or heartbeat parameters: dev is never backed up and runs no cron.

*Does the server need new permissions?* No. The role from [Step 17](06-server.md) already
allows `/kidlearn/dev/*` — it was written for both environments.

✅ **Check** — 💻:

```bash
aws ssm get-parameters-by-path --path /kidlearn/dev/ --region ap-south-1 \
  --query 'Parameters[].Name' --output text | tr '\t' '\n' | sort
```

Exactly **14 names**. Then prove the secrets really differ, without printing
any of them:

```bash
for n in BETTER_AUTH_SECRET CRON_SECRET GEMINI_API_KEY CLOUDINARY_CLOUD_NAME GOOGLE_CLIENT_ID; do
  a=$(aws ssm get-parameter --region ap-south-1 --name /kidlearn/prod/$n --with-decryption --query Parameter.Value --output text)
  b=$(aws ssm get-parameter --region ap-south-1 --name /kidlearn/dev/$n  --with-decryption --query Parameter.Value --output text)
  [ "$a" = "$b" ] && echo "✖ $n is THE SAME in both — fix it" || echo "✔ $n differs"
done
```

Five ✔ lines.

## Step 31 · 🌐🖥️ DNS and HTTPS for `api.dev.kidlearn.net`

**31a. The DNS record** — Cloudflare → `kidlearn.net` → **DNS → Records → Add
record**:

| Type | Name | IPv4 address | Proxy status |
|---|---|---|---|
| A | `api.dev` | **the same Elastic IP** as `api` | **DNS only (grey cloud)** |

✅ **Check** — 💻, a minute later:

```bash
dig +short api.dev.kidlearn.net    # exactly your Elastic IP — same as api.kidlearn.net
```

**Do not go on until this prints your Elastic IP.** Caddy is on *real*
certificates now ([Step 21d](06-server.md)), so every failed attempt counts against Let's
Encrypt's limits.

**31b. Let Caddy fetch the certificate** — 🖥️ on the server:

```bash
sudo su -
cd /opt/kidlearn/deploy/edge
docker compose -p kidlearn-edge -f compose.yml up -d --force-recreate
docker compose -p kidlearn-edge logs --tail 30 caddy
```

Caddy was already retrying this name in the background; the restart just makes
it try now. In the log, look for `certificate obtained successfully` with
`api.dev.kidlearn.net`.

> **Behind the scenes — the `api.dev` block in the Caddyfile**
>
> ```
> api.dev.kidlearn.net {
>     header X-Robots-Tag "noindex, nofollow"   ← search engines: do not list this
>     reverse_proxy dev-api:4000                ← the dev container's network alias
> }
> ```
>
> `dev-api`, not `api`: both stacks name their service `api`, and on the shared
> network that name would resolve to whichever container answered first — dev
> traffic could land on the production database. Each container gets a unique
> alias (`prod-api`, `dev-api`) and Caddy only ever uses those.

✅ **Check** — 💻:

```bash
curl -sI https://api.dev.kidlearn.net/health | head -1
# HTTP/2 502   ← no certificate error, and 502 because dev-api is not running yet
```

## Step 32 · 🖥️ Start the dev API and its database

**Why:** the same image you deployed to production, with dev's configuration.
Nothing is built for dev specifically — that is the point of an
environment-agnostic image.

If anything under `deploy/` changed on `main` since [Step 20c](06-server.md), repeat 20c first.
Then:

```bash
sudo su -
cat /opt/kidlearn/prod/last-good-tag                  # the SHA production runs
/opt/kidlearn/deploy/deploy.sh dev <that SHA> --migrate
```

**`--migrate` is required on the first dev deploy.** The dev database starts
completely empty. Without tables, the API starts but `/ready` fails, and
`deploy.sh` reports "cannot reach the database" when the real problem is "the
database has no tables".

> **Behind the scenes — how `deploy.sh dev` differs from `deploy.sh prod`**
>
> ```
>  reads /kidlearn/dev/*  instead of /kidlearn/prod/*
>  writes /opt/kidlearn/dev/compose.env with:
>      LOG_LEVEL=debug  ENABLE_API_DOCS=true
>      AI_TEXT_JOBS_PER_DAY=4  AI_AUDIO_JOBS_PER_DAY=20  AI_IMAGE_JOBS_PER_DAY=5
>      POSTGRES_PASSWORD=…         (the database container needs it at start)
>  adds a second Compose file:  -f compose.yml -f compose.dev.yml
>      compose.dev.yml adds  dev-postgres  (postgres:16-alpine, NO published port,
>                                           a named volume, a pg_isready healthcheck)
>      and caps dev-api and dev-postgres at 400 MB each
>  Compose project:  kidlearn-dev   ← separate from kidlearn-prod, so this can
>                                     never restart a production container
>  order:  dev-postgres healthy → migrate → dev-api up → health gate
> ```
>
> *Why memory caps on dev only?* Not to save memory — to decide **in advance**
> who dies first. If the server runs out of memory, Linux kills a process. Without
> caps it guesses; with them, dev hits its limit long before production is at
> risk.

✅ **Check** — the last line is
`[deploy:dev] healthy and database reachable — deploy complete at <sha>`. Then:

```bash
# 💻 from your Mac
curl -s  https://api.dev.kidlearn.net/health                       # {"data":{"status":"ok",…}}
curl -si https://api.dev.kidlearn.net/health | grep -i x-robots    # X-Robots-Tag: noindex, nofollow
curl -so /dev/null -w '%{http_code}\n' https://api.dev.kidlearn.net/docs   # 200 — docs are ON in dev
```

Open <https://api.dev.kidlearn.net/docs> in a browser — this is the full API
reference, which production hides.

```bash
# 🖥️ on the server
docker ps --format 'table {{.Names}}\t{{.Status}}'   # kidlearn-caddy, prod-api, dev-api, dev-postgres
ss -tlnp                                             # STILL only Caddy on 80/443 — dev-postgres publishes nothing
docker stats --no-stream                             # dev-api and dev-postgres show "/ 400MiB"
free -m                                              # "available" around 700 MB or more

# the two environments cannot see each other's database
docker exec prod-api getent hosts dev-postgres || echo "✔ production cannot reach dev-postgres"
docker exec dev-api sh -c 'env | grep -ci supabase'  # 0 — dev holds no Supabase credential
```

**32b. Add the starting structure** (worlds, subjects, characters, badges) — the
dev equivalent of [Step 8d](04-database-and-services.md).

*Why:* `--migrate` creates the tables and nothing else. Without this step the
child-profile form says "No avatars are available right now" and no profile can
be created, because the starter avatars come only from this seed.

`dev-postgres` publishes no port, and its name only exists on dev's Docker
network, so reach it through an SSH tunnel (one-time setup: `runbook.md` §2a).

🖥️ On the server, find the container's address:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' dev-postgres
```

💻 On your Mac, in one terminal — leave it open:

```bash
ssh -N -L 15432:<that address>:5432 kidlearn
```

💻 In a second terminal, from the repository root, with the `POSTGRES_PASSWORD`
you stored in Step 30c:

```bash
DATABASE_URL='postgresql://kidlearn:<POSTGRES_PASSWORD>@localhost:15432/kidlearn' \
DIRECT_URL='postgresql://kidlearn:<POSTGRES_PASSWORD>@localhost:15432/kidlearn' \
pnpm --filter @kidlearn/db db:seed:reference
```

Then close the tunnel with Ctrl-C.

> **Never run plain `db:seed` here either**, for the same reason as Step 8d: its
> sample lessons point at files that exist only on a developer's Mac.

It is safe to run again: it creates only the rows that are missing and leaves
existing ones alone. Run it after every wipe in 33a too. A restore from
production (33b) does not need it — the backup already holds these rows.

✅ **Check** — 🖥️:

```bash
docker exec dev-postgres psql -U kidlearn -d kidlearn -c \
  'SELECT count(*) FILTER (WHERE "isDefault") AS starter, count(*) AS characters FROM "Character"'
```

`starter` is 6 and `characters` is 9. On <https://dev.kidlearn.net>, the
add-a-child form shows six avatars.

## Step 33 · 🖥️ Rehearse the two database procedures you hope never to need

**Why:** file 38 is not done until the backup has been **restored** once. A
backup nobody has restored is a hope, not a backup. Dev is the safe place to
find out it works — and it fills dev with realistic data as a bonus.

**33a. Wipe dev and rebuild it from nothing** (`runbook.md` §7). This is the
"undo" for a bad migration on dev:

```bash
sudo su -
cd /opt/kidlearn/deploy/app
dc() { docker compose --env-file /opt/kidlearn/dev/compose.env \
         -p kidlearn-dev -f compose.yml -f compose.dev.yml "$@"; }
dc down -v && dc up -d && dc --profile migrate run --rm migrate
```

*Reading it:* `dc` is a shortcut so you do not type the long Compose command
three times. `down -v` stops dev **and deletes its volume** (the database).
`up -d` starts a fresh, empty Postgres and the API. The migrate job creates the
tables. `-p kidlearn-dev` is what guarantees this never touches production.

✅ `docker ps` shows `dev-api` and `dev-postgres` up again, and
`curl -s https://api.dev.kidlearn.net/health` is ok. The database is empty again,
so repeat 32b before anyone adds a child.

**33b. Restore last night's production backup into dev** (`runbook.md` §8).

> ⚠️ **This copies real children's data into dev**, which logs at `debug` level.
> If you already have real families, decide whether that is acceptable. If not,
> skip 33b, and instead rehearse it against a scratch Postgres container you
> delete afterwards.

```bash
# find the newest backup — a plain .sql.gz directly under prod/, never .partial/
aws s3 ls s3://<BUCKET_NAME>/prod/

dc stop api

# the dump creates everything itself, so it must go into an EMPTY database
docker exec dev-postgres psql -U kidlearn -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS kidlearn WITH (FORCE)' \
  -c 'CREATE DATABASE kidlearn'
docker exec dev-postgres psql -U kidlearn -d kidlearn -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA public'

aws s3 cp s3://<BUCKET_NAME>/prod/<NEWEST FILE>.sql.gz - | gunzip \
  | sed '/^SET transaction_timeout = 0;$/d' \
  | docker exec -i dev-postgres psql -U kidlearn -d kidlearn \
      -v ON_ERROR_STOP=1 --single-transaction

dc start api
```

*Why so strict?* Plain `psql` carries on after an error and still says it
succeeded. `ON_ERROR_STOP` plus `--single-transaction` means: the first error
stops everything and **nothing** is loaded — so "it finished" really means "it
all loaded". The `sed` line removes one setting that newer Postgres versions
write and the dev Postgres 16 does not understand.

✅ **Check** — compare a few row counts. On dev:

```bash
docker exec dev-postgres psql -U kidlearn -d kidlearn -c \
  'SELECT (SELECT count(*) FROM "ChildProfile") AS children,
          (SELECT count(*) FROM "LessonProgress") AS progress,
          (SELECT count(*) FROM _prisma_migrations) AS migrations'
```

…and the same query in 🌐 **Supabase → SQL Editor**. The numbers match (the
backup is from last night, so production may have gained a few rows since).
`migrations` equals the number of folders in `packages/db/prisma/migrations/`.

Write today's date in your sheet as **restore rehearsed**.

## Step 34 · 🌐 The dev website — a second Vercel project

**Why a second project, not a second branch of the first?** Each project has
its own environment variables. There is then no way for the dev site to be built
with production's API address by picking the wrong setting.

**34a. Import the repo again** — <https://vercel.com/new> → **Import**
`salmanbd100/kidlearn` a second time:

- **Project name:** `kidlearn-dev`
- **Framework, Root Directory, Build Command, Install Command:** exactly as
  [Step 24](07-website-vercel.md)
- **Environment Variables** — four this time:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.dev.kidlearn.net` |
| `NEXT_PUBLIC_SITE_URL` | `https://dev.kidlearn.net` |
| `MEDIA_ASSET_HOSTS` | `https://res.cloudinary.com` |
| `SITE_NOINDEX` | `true` |

Apply each one to **Production and Preview**.

*What the new one does:* `SITE_NOINDEX=true` makes the site send
`X-Robots-Tag: noindex` so search engines never list an unreviewed build of a
children's product. It is read **at build time**, so changing it needs a
redeploy.

> **The dev site has no password.** Anyone with the address can open it; only
> `noindex` keeps it out of search results. `apps/web/proxy.ts` still supports
> an optional password prompt: set `DEV_SITE_BASIC_AUTH` to
> `dev:<a password you choose>` on this project (Production and Preview) and
> redeploy. It deliberately has **no** `NEXT_PUBLIC_` prefix — that prefix
> would copy the password into the JavaScript every visitor downloads.

Click **Deploy**. This first build is from `main`; that is fixed next.

**34b. Project settings** — same as [Step 25](07-website-vercel.md), with one difference:

1. **Build and Deployment:** *Include files outside the root directory* **on**;
   Node.js **22.x**.
2. **Environments → Production → Branch Tracking → Branch: `dev`** ← the
   difference. *Why:* this project's
   "production" is the `dev` branch, so every merge into `dev` updates
   `dev.kidlearn.net` by itself.
3. **Functions → Function Region:** Mumbai (`bom1`).

Then get a build of the `dev` branch live: **Deployments** → find the newest
deployment whose branch is `dev` → **⋯ → Promote to Production**. If there is
none yet, use **Create Deployment** on that page and type `dev` as the branch —
or simply merge the next pull request into `dev`.

**34c. The domain** — **Settings → Domains → Add** `dev.kidlearn.net`. Vercel
shows a **CNAME** target. Cloudflare → **Add record**:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `dev` | the `…vercel-dns…` value **this** project shows | **grey cloud** |

✅ **Check:** the domain turns **Valid Configuration**, and
<https://dev.kidlearn.net> opens the homepage.

Your Cloudflare DNS now has all **five** web/API records, every one grey (plus
any `MX` / `TXT` records for email):

```
 Type          Name     Points to                 Served by
 CNAME (or A)  @        …vercel-dns… (or an IP)   Vercel  → kidlearn.net
 CNAME         www      …vercel-dns…              Vercel  → redirects to kidlearn.net
 CNAME         dev      …vercel-dns… (dev)        Vercel  → dev.kidlearn.net
 A             api      Elastic IP                Caddy   → prod-api
 A             api.dev  Elastic IP (same)         Caddy   → dev-api
```

## Step 35 · 🌐 Google sign-in for dev

**Why:** dev uses your **existing** local Google client, not the production
one. The production client's secret should never sit in a less protected
environment.

Google Cloud Console → the project with your local client → **Google Auth
Platform → Clients** → open the local client → **add** (keep the localhost ones):

- **Authorized JavaScript origins:** `https://dev.kidlearn.net`
- **Authorized redirect URIs:** `https://api.dev.kidlearn.net/api/auth/callback/google`

**Save.** Do not touch the `kidlearn production` client.

If that project's consent screen is still in **Testing**, only the Google
accounts listed under **Audience → Test users** can sign in to dev. That is fine
for a dev site — add yourself.

## Step 36 · 💻📱 Dev smoke test — and prove the two are separate

**36a. From your Mac:**

```bash
curl -si https://dev.kidlearn.net | head -1                 # HTTP/2 200
curl -si https://dev.kidlearn.net | grep -i x-robots        # noindex, nofollow
curl -si https://api.dev.kidlearn.net/health | head -1      # 200
```

*Never put a password on the API*, even if you turn on the optional site
password. Google's sign-in sends the browser back to
`api.dev.kidlearn.net/api/auth/callback/google`. A password prompt in the
middle of that redirect breaks sign-in.

**36b. The most important check: the dev site calls the dev API.** The API
address is written into the site's JavaScript files when Vercel builds them, so
check the files themselves, not the dashboard:

```bash
curl -s https://dev.kidlearn.net \
  | grep -oE '/_next/static/[^"]+\.js' | sort -u \
  | while read -r f; do curl -s "https://dev.kidlearn.net$f"; done \
  | grep -oE 'api(\.dev)?\.kidlearn\.net' | sort | uniq -c
```

Expect **only** `api.dev.kidlearn.net`. If `api.kidlearn.net` appears, the dev
site was built with production's address — a dev build writing to the
**production database**. It shows up as a "CORS error", which is misleading.
Fix the variable in the `kidlearn-dev` project and **redeploy**.

Do the same against <https://kidlearn.net>: expect **only**
`api.kidlearn.net`.

If you turned on the optional site password, add `--user 'dev:<password>'` to
the first `curl` above, and confirm the password never reached the browser by
ending the same pipeline with `grep -c '<password>'` — it must print `0`.

**36c. In a browser:**

1. Open <https://dev.kidlearn.net>.
2. Sign in with Google.
3. Reload — still signed in.
4. A login from one environment does not work in the other: DevTools →
   **Application → Cookies** shows the session cookie on `api.dev.kidlearn.net`
   only. Signing in on dev never signs you in on `kidlearn.net`.

**36d. Paperwork — file 38 is done when all of this is true:**

- Fill every `<placeholder>` in `document/runbook.md`: registrar, Cloudflare
  account, Elastic IP, instance ID, bucket name, "ACME endpoint: production",
  Vercel's ceilings and the date, and the restore-rehearsal date. Remove the
  **⬜ not yet done** markers from the sections you have now done.
- Rollback rehearsed **once per environment, both halves** ([Step 28c](08-backups-and-smoke-test.md) for
  production; for dev, the same with `deploy.sh dev …` and the `kidlearn-dev`
  Vercel project).
- Every box in file 38's **Acceptance Criteria** ticked.
- Then set the **38 · provisioning** row in
  `document/implementation/00-progress-tracker.md` to ✅ Done, through a pull
  request into `dev`.

---

[← Previous](10-release-life-cycle.md) · [Guide index](README.md) · [Next →](12-automatic-deploys.md)
