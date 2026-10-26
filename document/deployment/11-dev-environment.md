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

## Once, or every time?

Most of this part is **setup you do one time**. After that, putting new code on
dev is a short routine — [Every time you update dev](#every-time-you-update-dev)
at the end of this page. Each step below also starts with a **When** line.

| Step | What | When |
|---|---|---|
| 29 | Dev accounts (Gemini, Cloudinary) | **Once.** Again only if you replace a key |
| 30 | Dev secrets in Parameter Store | **Once.** Change one value later if a secret changes, then redeploy |
| 31a | DNS record for `api.dev` | **Once** |
| 31b | Caddy fetches the HTTPS certificate | **Once.** Caddy renews it by itself — never after a code change |
| 32 | First start of the dev API and database | **Once** in this form. Later deploys use the routine at the end |
| 32b | Starter data (avatars, worlds, badges) | **Once**, and again after every wipe (33a) |
| 32c | Dev admin account | **Once**, and again after every wipe (33a) |
| 33 | Wipe / restore rehearsal | **Once** as a rehearsal. Later only when you need to undo a bad migration or want fresh data |
| 34 | Dev website on Vercel | **Once.** Afterwards Vercel rebuilds it on every merge into `dev` |
| 35 | Google sign-in for dev | **Once** |
| 36 | Smoke test | **Once** in full. After each update, the short check in the routine |

**Words used on this page, in one line each:**

- **Image** — the API packed into one file, built on your Mac. It is the
  *recipe*; it does not run by itself.
- **Container** — a running copy of an image. `dev-api` and `dev-postgres` are
  containers.
- **ECR** — AWS's private shelf for images. Your Mac puts images there
  (`docker push`); the server takes them from there (`docker pull`).
- **SHA (tag)** — the short commit id, like `a1b2c3d`. Each image is named after
  the commit it was built from, so the SHA says exactly which code runs.
- **Compose project** — a named group of containers. `kidlearn-dev` and
  `kidlearn-prod` are separate groups, so a command for one never touches the
  other.
- **Volume** — the disk space a container keeps its data in. `dev-postgres`
  stores the dev database in a volume, so it survives a restart.

## Step 29 · 🌐 Separate free accounts for dev

**When:** one time only. Do it again only if you replace the Gemini key or the
Cloudinary account — then also update Step 30.

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

**When:** one time only. If a value changes later (a new key, a new password),
edit just that parameter in Parameter Store and **deploy dev again** — the
server reads these values only while `deploy.sh` runs, so the change does
nothing until the next deploy.

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

**When:** one time only — both 31a and 31b. **Do not repeat 31b after a code
change.** Caddy (the program in front of both APIs that handles HTTPS) runs in
its own group, `kidlearn-edge`, which deploying dev or production never
restarts. It keeps the certificate in its `caddy_data` volume and renews it by
itself before it expires.

Repeat 31b only when one of these happens:

1. `deploy/edge/Caddyfile` or `deploy/edge/compose.yml` changed (copy `deploy/`
   to the server first, [Step 20c](06-server.md)).
2. You changed `/opt/kidlearn/edge/caddy.env`.
3. You added a new web address that Caddy must serve.
4. The `caddy_data` volume was deleted.

Restarting it more often is not harmless: Let's Encrypt allows only 5 identical
certificates a week, and a lost certificate past that limit means a week
without HTTPS.

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

**When:** one time only, exactly as written here. Every later dev deploy follows
[Every time you update dev](#every-time-you-update-dev) instead.

**Why production's SHA, this once:** right now the only images in ECR are the
ones you built for production in [Step 16](05-aws-storage-secrets-images.md).
They work for dev too — an image holds no secrets and no environment name; dev's
settings are added when it starts. So the quickest first deploy reuses them.
From the next deploy on, dev runs images built from the `dev` branch.

If anything under `deploy/` changed on `main` since [Step 20c](06-server.md), repeat 20c first.
Then:

```bash
sudo su -
cat /opt/kidlearn/prod/last-good-tag                  # the SHA production runs
/opt/kidlearn/deploy/deploy.sh dev <that SHA> --migrate
```

*Where does `last-good-tag` come from?* `deploy.sh` writes it itself, at the end
of every deploy that passed its health checks — it is simply "the SHA this
environment last deployed successfully". The server never asks GitHub for
anything, so this file is **not** the latest commit on `main`.

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

**When:** once, right after the first deploy above. Again after every wipe
(33a), and after a release that adds new starter rows to
`packages/db/prisma/seed.ts` (for example a new avatar or badge). Running it
when nothing is missing does no harm.

*Why:* `--migrate` creates the tables and nothing else. Without this step the
child-profile form says "No avatars are available right now" and no profile can
be created, because the starter avatars come only from this seed.

**Before you start:** `ssh kidlearn` must work from your Mac. If it says
`Could not resolve hostname kidlearn`, do the one-time setup in `runbook.md`
§2a first — `kidlearn` is a shortcut that setup creates, not a real address.

*How the seed reaches the database.* The seed script runs on your Mac, but
`dev-postgres` lives on the server, publishes no port, and its name exists only
inside dev's Docker network. An **SSH tunnel** bridges the gap: while it is
open, anything your Mac sends to `localhost:15432` comes out on the server and
goes to the container's port 5432.

```
 💻 Mac                                  🖥️ server
 seed ──► localhost:15432 ══ ssh tunnel ══► 172.20.0.x:5432 (dev-postgres)
```

So the same database has **two different addresses**, depending on where you
stand:

| Used from | Database URL host part |
|---|---|
| 🖥️ Inside Docker on the server (the dev API, Parameter Store's `DATABASE_URL`) | `@dev-postgres:5432` |
| 💻 Your Mac, through the tunnel (this step) | `@localhost:15432` |

Copying the Parameter Store URL as-is fails on the Mac with
`Can't reach database server at dev-postgres:5432`.

You need **three terminal moments**: one on the server, one Mac terminal for the
tunnel, one Mac terminal for the seed.

**1. 🖥️ Server — read the container's address.** From your Mac:

```bash
ssh kidlearn
sudo su -
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' dev-postgres
```

It prints something like `172.20.0.2`. Write it down, then `exit` twice to get
back to your Mac prompt. The address changes whenever the container is
recreated (a wipe in 33a), so read it fresh each time.

**2. 💻 Mac, terminal 1 — open the tunnel and leave it open.** Put in the address
from 1:

```bash
ssh -N -L 15432:172.20.0.2:5432 kidlearn
```

It prints **nothing** and does not return to the prompt — that is correct. `-N`
means "no shell, just the tunnel"; `-L 15432:<address>:5432` means "my port
15432 leads to that address's port 5432". The tunnel lasts as long as this
command runs.

**3. 💻 Mac, terminal 2 — run the seed.** Open a second terminal in the
repository folder and run:

```bash
PW=$(aws ssm get-parameter --region ap-south-1 --name /kidlearn/dev/POSTGRES_PASSWORD \
  --with-decryption --query Parameter.Value --output text)
DATABASE_URL="postgresql://kidlearn:$PW@localhost:15432/kidlearn" \
DIRECT_URL="postgresql://kidlearn:$PW@localhost:15432/kidlearn" \
pnpm --filter @kidlearn/db db:seed:reference
```

*Reading it:* the first line fetches the dev database password from Parameter
Store into a variable named `PW`, so you never copy or paste it (and it does not
end up in a chat or a screenshot). The `"` quotes — not `'` — let the shell put
the password where `$PW` is. Setting `DATABASE_URL` and `DIRECT_URL` on the same
command overrides `packages/db/.env` for this one run only.

It ends without an error. Lines such as `warn The configuration property
package.json#prisma is deprecated` and `Environment variables loaded from .env`
are normal.

**4. 💻 Mac, terminal 1 — close the tunnel** with Ctrl-C.

> **Never run plain `db:seed` here either**, for the same reason as Step 8d: its
> sample lessons point at files that exist only on a developer's Mac.

It is safe to run again: it creates only the rows that are missing and leaves
existing ones alone. Run it after every wipe in 33a too. A restore from
production (33b) does not need it — the backup already holds these rows.

✅ **Check** — 🖥️ on the server (`ssh kidlearn`, then `sudo su -`):

```bash
docker exec dev-postgres psql -U kidlearn -d kidlearn -c \
  'SELECT count(*) FILTER (WHERE "isDefault") AS starter, count(*) AS characters FROM "Character"'
```

`starter` is 6 and `characters` is 9. On <https://dev.kidlearn.net>, the
add-a-child form shows six avatars.

| The seed says | What it means | Fix |
|---|---|---|
| `Can't reach database server at dev-postgres:5432` | The URL has the server-side host | Use `@localhost:15432`, as in 3 |
| `Can't reach database server at localhost:15432` | The tunnel is not open | Start 2 in its own terminal and leave it running |
| `channel 2: open failed: connect failed` in terminal 1 | The container address in 2 is stale | Read it again (1) and reopen the tunnel |
| `Authentication failed against database server` | Wrong password, or `PW` is empty | Run `echo ${#PW}` — it should print `48`. If `0`, the `aws ssm` line failed; run it alone to see why |
| `Could not resolve hostname kidlearn` | The SSH shortcut is not set up on this Mac | `runbook.md` §2a |

**32c. Create your dev admin account.**

**When:** once, after 32b. Again after every wipe (33a) — the admin lives in the
database, so a wipe deletes it. After a restore from production (33b), dev has
production's admins instead, with production's passwords.

*Why:* dev has its own empty database, so the admin you made for production in
[Step 14](05-aws-storage-secrets-images.md) does not exist here. There is no
admin sign-up page; the `seed:admin` script is the only way to make one.

It runs on your Mac and writes through the **same tunnel as 32b**, so:

**1. 💻 Mac, terminal 1 — open the tunnel** exactly as in 32b steps 1–2 (read
the container address on the server, then `ssh -N -L 15432:<address>:5432 kidlearn`,
and leave it running).

**2. 💻 Mac, terminal 2 — run the seed.** Change the three `ADMIN_` lines first,
then paste the whole block as one piece. Keep the **space before `cd`**: it
keeps the block, password included, out of your shell history.

```bash
 cd ~/Documents/Me/kidlearn && bash <<'EOF'
set -a
eval "$(aws ssm get-parameters-by-path --path /kidlearn/dev/ --with-decryption \
  --recursive --region ap-south-1 --query 'Parameters[].[Name,Value]' --output text \
  | while IFS=$'\t' read -r n v; do printf '%s=%q\n' "${n##*/}" "$v"; done)"
[ -n "$POSTGRES_PASSWORD" ] || { echo "No POSTGRES_PASSWORD — is the AWS CLI signed in?"; exit 1; }
DATABASE_URL="postgresql://kidlearn:$POSTGRES_PASSWORD@localhost:15432/kidlearn"
DIRECT_URL="$DATABASE_URL"
set +a
echo "Database: $(echo "$DATABASE_URL" | sed -E 's#(//[^:]*):[^@]*@#\1:***@#')"
ADMIN_EMAIL='you@example.com' \
ADMIN_PASSWORD='at-least-12-characters' \
ADMIN_NAME='Your Name' \
  pnpm --filter server seed:admin
EOF
```

*Reading it:*

- `bash <<'EOF' … EOF` runs everything between the two `EOF` lines in a
  separate, short-lived shell. The dev secrets it loads disappear when it ends;
  your terminal stays as it was.
- `set -a` … `set +a` — every variable set in between is handed on to the
  commands that run after it.
- The `eval` line fetches all fourteen `/kidlearn/dev/*` values from Parameter
  Store and sets each one, e.g. `/kidlearn/dev/CRON_SECRET` becomes
  `CRON_SECRET=…`. The script needs them all — it loads the server's settings,
  which refuse to start if any required value is missing, even ones the script
  never uses.
- The two `DATABASE_URL` / `DIRECT_URL` lines **replace** the stored
  `@dev-postgres:5432` address with the tunnel's `@localhost:15432`, the same
  switch as in 32b.
- The `Database:` line prints where it is about to write, with the password
  hidden as `***`. It must say `localhost:15432`.
- Use a password with **no `'`** in it — a single quote ends the value early.
  It is a different password from production's admin; your password manager is
  the right place for it.

✅ The last line is `Created admin …` (or `Updated admin …` if that email already
existed — the same command resets a forgotten password). The script prints that
only after checking that the password really works.

**3. 💻 Mac, terminal 1 — close the tunnel** with Ctrl-C.

**4. 🌐 Sign in** once the dev site exists (Step 34): <https://dev.kidlearn.net>
→ **Admin sign-in**. Type the password — do not let the browser fill in your
saved production one.

| The seed says | Fix |
|---|---|
| `Can't reach database server at localhost:15432` | The tunnel in terminal 1 is not running |
| `Can't reach database server at dev-postgres:5432` | The two `DATABASE_URL` / `DIRECT_URL` lines were left out |
| `No POSTGRES_PASSWORD — is the AWS CLI signed in?` | `aws sts get-caller-identity` to check; `aws configure` if it fails |
| `Invalid environment configuration` listing a variable | That parameter is missing from `/kidlearn/dev/` — Step 30's check should list 14 names |
| `ADMIN_PASSWORD must be at least …` | Use a longer password |

## Step 33 · 🖥️ Rehearse the two database procedures you hope never to need

**When:** one time as a rehearsal. Later, use 33a only when a migration broke
the dev database and you want to start it again from empty, and 33b only when
you want dev filled with a fresh copy of production's data.

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
so repeat 32b before anyone adds a child, and 32c before you sign in as admin.

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

**When:** one time only. After this, Vercel builds and publishes
`dev.kidlearn.net` by itself on every merge into `dev` — the website needs no
manual step. Only the **API** has to be deployed by hand.

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

**When:** one time only.

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

**When:** the whole step one time. After each later update, the short check at
the end of the routine below is enough. Repeat 36b in full if you ever change
the `kidlearn-dev` project's environment variables on Vercel.

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

## Every time you update dev

**When:** each time you want new `dev` code running on `api.dev.kidlearn.net`,
usually after merging a pull request into `dev`. Until
[Part 12](12-automatic-deploys.md) is set up, this is done by hand; after it,
GitHub does steps 2–4 for you.

The website (`dev.kidlearn.net`) already updated itself when you merged —
Vercel did that. This routine is for the **API** only.

```
 💻 your Mac                       ECR                     🖥️ server
 1. get the latest dev code
 2. build two images ──push──►  kidlearn-api:<SHA>     ◄──pull── 4. deploy.sh dev <SHA>
                                kidlearn-migrate:<SHA>
                                        3. (only if deploy/ changed) copy the scripts
```

**Before your first time:** Docker Desktop is open on your Mac (`docker version`
shows a `Server:` section), and the AWS command line is signed in
(`aws sts get-caller-identity` prints your account) — both from Parts 1–2.

### 1. 💻 Get the exact code you want to ship

From the repository root:

```bash
git switch dev
git pull
git status            # must say "nothing to commit, working tree clean"
```

*Why a clean tree?* The image is named after the commit. Unsaved edits would go
into the image without being part of that commit, so the name would lie — and a
later rollback to that SHA would not give you the same code back.

### 2. 💻 Build the two images and upload them

This is [Step 16](05-aws-storage-secrets-images.md) again, from `dev` instead of
`main`:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com"
SHA=$(git rev-parse --short HEAD)

aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin "$REGISTRY"

docker build --platform linux/arm64 -f apps/server/Dockerfile --target runner \
  -t "$REGISTRY/kidlearn-api:$SHA" .
docker build --platform linux/arm64 -f apps/server/Dockerfile --target migrate \
  -t "$REGISTRY/kidlearn-migrate:$SHA" .

docker push "$REGISTRY/kidlearn-api:$SHA"
docker push "$REGISTRY/kidlearn-migrate:$SHA"

echo "IMAGE TAG = $SHA"      # write this down — step 4 needs it
```

*Reading it, line by line:*

- `ACCOUNT_ID`, `REGISTRY`, `SHA` — work out your AWS account number, your ECR
  address in Mumbai, and the commit id that becomes the image's name.
- `aws ecr get-login-password … | docker login …` — lets Docker upload to your
  ECR. The login lasts 12 hours; if a push later says *no basic auth
  credentials*, run this line again.
- The two `docker build` lines make two images from the same
  `apps/server/Dockerfile`. `--target runner` is the API itself;
  `--target migrate` is a small image that only updates database tables.
  `--platform linux/arm64` matches the server's processor (your Apple-chip Mac
  is arm64 too, so this is fast). The final `.` means "build from this folder".
- The two `docker push` lines upload them. The first upload is about 0.4 GB;
  later ones send only what changed, so they are much quicker unless
  dependencies changed.

**Skip step 2** if this exact SHA was already built and pushed before — for
example, it is the same commit production runs. ECR → **Repositories** →
`kidlearn-api` → **Images** lists every SHA that is there.

✅ **Check:** ECR (region Mumbai) → both repositories show an image tagged with
your SHA.

### 3. 🖥️ Only if `deploy/` changed: copy the scripts to the server

Most updates skip this. Check from your Mac:

```bash
git diff --stat <SHA dev ran before>..HEAD -- deploy/    # no output = skip step 3
```

(The SHA dev ran before is in `/opt/kidlearn/dev/last-good-tag` on the server.)

If something under `deploy/` did change, copy it from `dev` — on the server:

```bash
sudo su -
git clone --depth 1 -b dev https://github.com/salmanbd100/kidlearn.git /tmp/kidlearn
cp -r /tmp/kidlearn/deploy/. /opt/kidlearn/deploy/ && rm -rf /tmp/kidlearn
```

> ⚠️ **The server has one `deploy/` folder for both environments.** After this
> copy, the next **production** deploy runs `dev`'s scripts too. That is fine
> when the change is on its way to `main` anyway; if it is experimental, copy
> `main`'s `deploy/` back (Step 20c) before you deploy production.

If the change was inside `deploy/edge/`, also repeat Step 31b above — that is one
of the few reasons to restart Caddy.

### 4. 🖥️ Deploy

On the server:

```bash
sudo su -
/opt/kidlearn/deploy/deploy.sh dev <SHA from step 2> --migrate
```

- **`--migrate`** applies any new database migrations to the **dev** database
  before the new API starts. Include it whenever the new code might add
  migrations — if there are none, it simply applies nothing. It never touches
  production's database.
- `deploy.sh` reads dev's secrets fresh from Parameter Store, downloads the two
  images, starts them, and waits for the health checks.

✅ **Check:** the last line is
`[deploy:dev] healthy and database reachable — deploy complete at <your SHA>`.

### 5. Only if the release adds starter data

If the update added new rows to `packages/db/prisma/seed.ts` — a new avatar,
badge or world — run Step 32b above again. Otherwise skip it.

### 6. 💻 Quick check

```bash
curl -s https://api.dev.kidlearn.net/health      # {"data":{"status":"ok",…}}
```

Then open <https://dev.kidlearn.net>, sign in, and try the thing you changed.

### If it went wrong — roll back

`deploy.sh` prints the rollback command when a deploy fails. To do it yourself,
deploy the last SHA that worked:

```bash
sudo su -
cat /opt/kidlearn/dev/last-good-tag                 # dev's own record — never use prod's here
/opt/kidlearn/deploy/deploy.sh dev <that SHA>
```

No `--migrate` on a rollback: migrations only go forward. If a migration broke
the dev database, wipe it and start again (33a, then 32b and 32c).

### Common errors

| You see | It means | Fix |
|---|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop is closed | Open Docker Desktop, wait for it to start |
| `Unable to locate credentials` | The AWS command line is not signed in | `aws configure` ([Part 2](02-accounts.md)) |
| `no basic auth credentials` on push | The ECR login expired (12 hours) | Run the `aws ecr get-login-password …` line again |
| `name unknown: The repository … does not exist` | Wrong region | Use `ap-south-1` (Mumbai) everywhere |
| `manifest unknown` from `deploy.sh` | No image with that SHA in ECR | Finish step 2, and copy the SHA it printed exactly |
| "No avatars are available right now" on the site | The dev database has no starter data | Run 32b |
| `Could not resolve hostname kidlearn` in 32b | The SSH alias is not set up on this Mac | `runbook.md` §2a |

---

[← Previous](10-release-life-cycle.md) · [Guide index](README.md) · [Next →](12-automatic-deploys.md)
