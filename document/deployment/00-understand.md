# Part 0 — Understand what you are building

[Guide index](README.md) · [Next →](01-prepare-mac-and-github.md)

> **Where you work:** Read-only — nothing to click yet. About 45 minutes.  
> **You finish with:** a mental model of every moving part, the words you will meet, your values sheet, and what it all costs.

Read this once. It makes every later step make sense. Nothing here asks you to
click or type anything.

## 0.1 The big picture

KidLearn has two halves, and they live in two different places:

```
                         kidlearn.net  (your domain, DNS at Cloudflare)
                                 │
            ┌────────────────────┴─────────────────────┐
            │                                          │
   kidlearn.net, www.kidlearn.net               api.kidlearn.net
            │                                          │
     ┌──────▼──────┐                       ┌───────────▼───────────┐
     │   VERCEL    │   the browser calls   │   AWS EC2 server      │
     │  (apps/web) │ ────────────────────► │   Caddy (HTTPS)       │
     │  the website│                       │     └► API container  │
     └─────────────┘                       │        (apps/server)  │
                                           └───────────┬───────────┘
                                                       │
                          ┌────────────────────────────┼──────────────┐
                          ▼                            ▼              ▼
                   SUPABASE database            CLOUDINARY      GOOGLE (sign-in,
                   (all the data)               (images, audio)  Gemini, voice)
```

- **Vercel** runs the website (the Next.js app in `apps/web`). Vercel is made
  for Next.js and its free plan is enough.
- **An AWS EC2 server** runs the API (the Express app in `apps/server`). The API
  runs for a long time and keeps database connections open, so it needs a real
  computer that is always on. EC2 is a rented computer.
- **Supabase** holds the database. Free plan.
- **Cloudflare** answers the question "where is `api.kidlearn.net`?" (DNS).
  Free plan.

**One important fact about the website:** `apps/web` never talks to the API from
Vercel's side. Every API call is made **by the parent's browser**, straight to
`api.kidlearn.net`. That is why Vercel needs no secret at all — only the public
address of the API.

## 0.2 What happens when a parent opens the site

```
 Parent's phone                Cloudflare DNS          Vercel              EC2 (Mumbai)              Supabase
 ──────────────                ──────────────          ──────              ────────────              ────────
 1. "where is kidlearn.net?" ─────►  "76.76.21.21"
 2. GET https://kidlearn.net ───────────────────────► page + JavaScript
 3. "where is api.kidlearn.net?" ►  "13.x.x.x"
                                    (your Elastic IP)
 4. fetch https://api.kidlearn.net/api/... ─────────────────────────────► Caddy :443
                                                                          │ decrypts HTTPS
                                                                          ▼
                                                                         prod-api :4000 ───SQL──► Postgres
                                                                          │               ◄──rows──
 5. JSON comes back  ◄──────────────────────────────────────────────────── ┘
```

Step 1 and 3 are DNS ([Part 3](03-dns-cloudflare.md) of this guide). Step 2 is Vercel ([Part 7](07-website-vercel.md)). Step 4
is Caddy plus the API container ([Part 6](06-server.md)). The database is [Part 4](04-database-and-services.md).

## 0.3 Why the domain has to exist before the first deploy

Three configuration values tie the two halves together, and all three are
hostnames under `kidlearn.net`:

| Value | Lives in | Says |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Vercel | "the website calls `https://api.kidlearn.net`" |
| `WEB_ORIGIN` | Parameter Store | "the API accepts browser requests only from `https://kidlearn.net`" (CORS) |
| Google OAuth redirect URI | Google Cloud | "after sign-in, send people to `https://api.kidlearn.net/...`" |

Because both hostnames share one domain, the browser treats them as the same
site and the API's login cookie works without special settings. On two
unrelated addresses (say `kidlearn.vercel.app` and a raw AWS address) Safari
would block that cookie — so the domain and DNS come first, the deploys after.

## 0.4 Inside the server

One small computer runs everything server-side. You will build this up piece by
piece in [Part 6](06-server.md); here is the finished picture.

```
┌──────────────── EC2 t4g.small · Amazon Linux 2023 (Arm) · Elastic IP 13.x.x.x ───────────────┐
│ Firewall (security group):  80/tcp  443/tcp  443/udp  open    ·    22 (SSH) CLOSED            │
│                                                                                              │
│  Docker                                                                                      │
│  ┌───────────── project kidlearn-edge ─────────────┐                                        │
│  │  kidlearn-caddy   ports 80, 443  (the ONLY one  │                                        │
│  │                   that listens to the internet) │                                        │
│  │  volume caddy_data = the HTTPS certificates     │                                        │
│  └───────────────┬─────────────────────────────────┘                                        │
│                  │ shared Docker network "kidlearn-edge"                                     │
│                  │ reverse_proxy prod-api:4000                                               │
│  ┌───────────────▼──────── project kidlearn-prod ──┐  ┌─── project kidlearn-dev (Part 11) ─┐  │
│  │  prod-api       image kidlearn-api:<sha>        │  │  dev-api                          │  │
│  │                 env from /opt/kidlearn/prod/... │  │  dev-postgres  (throw-away DB)    │  │
│  │  prod-migrate   image kidlearn-migrate:<sha>    │  │  dev-migrate                      │  │
│  │                 runs ONLY with --migrate        │  └───────────────────────────────────┘  │
│  └─────────────────────────────────────────────────┘                                        │
│                                                                                              │
│  /opt/kidlearn/                         cron (the server's alarm clock)                      │
│    deploy/   scripts, copied from Git     01:30 daily   backup.sh       → S3                 │
│    prod/     app.env, compose.env,        02:00 Monday  weekly-reports.sh → API              │
│              last-good-tag                weekly        docker image prune (keeps 4)          │
│    edge/     caddy.env (your ACME email)                                                     │
│    dev/      (Part 11)                                                                       │
│                                                                                              │
│  SSM agent ◄──── Session Manager: your terminal in the browser, no SSH                       │
│  IAM role kidlearn-instance: may read secrets, pull images, write backups — nothing else      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Three separate Docker Compose **projects** live on one box. They are separate so
that redeploying the API never restarts Caddy (which holds the certificates), and
redeploying dev never restarts production.

## 0.5 Where secrets travel

```
  YOU, once, in the AWS console
        │ type each value
        ▼
  ┌──────────────────────────────────┐
  │ SSM Parameter Store              │   encrypted at rest (KMS)
  │   /kidlearn/prod/DATABASE_URL    │   free (Standard tier)
  │   /kidlearn/prod/BETTER_AUTH_... │
  │   … 16 values                    │
  └───────────────┬──────────────────┘
                  │ deploy.sh reads them, using the SERVER's IAM role
                  │ (no password stored anywhere on the server)
                  ▼
  /opt/kidlearn/prod/app.env      owner root, mode 0600 (only root can read)
                  │ Docker Compose "env_file:"
                  ▼
  prod-api container ── apps/server/src/config/env.ts checks every value
                        and REFUSES TO START if one is missing or malformed
```

What is **not** in this picture: GitHub, your laptop's disk, the Docker image.
No secret ever goes there. Vercel holds only three public, non-secret values.

## 0.6 The whole life cycle of a change

This is the journey of every line of code from your editor to a child's phone.
Parts 1 to 8 set it up once; [Part 10](10-release-life-cycle.md) is how you live with it.

```
 ① WRITE            ② CHECK                ③ INTEGRATE        ④ PROMOTE            ⑤ SHIP
 ───────            ───────                ───────────        ─────────            ──────
 your Mac           GitHub Actions         branch dev         branch main
 feature/x ──PR──►  "gates" job:   green ─► merge ──PR dev→main──► merge ─┬─► AUTOMATIC: Vercel builds
                    lint, build,   ✅                    (gates again)    │   apps/web → kidlearn.net
                    typecheck,                                            │
                    tests, docker                                         └─► MANUAL (for now): you
                    builds                                                    build the 2 images on
                    red ❌ = cannot                                            your Mac → push to ECR →
                    merge                                                     deploy.sh on the server
                                                                              → api.kidlearn.net
 ⑥ RUN                                ⑦ PROTECT                        ⑧ UNDO
 ─────                                ─────────                        ──────
 Caddy renews HTTPS by itself         01:30 every night: database      API:  deploy.sh prod <old sha>
 Docker restarts a crashed API        → S3 (kept 30 days)               Web:  Vercel "Instant Rollback"
 Supabase stores the data             healthchecks.io emails you if
                                      a backup does not arrive
```

Today step ⑤ is half automatic (Vercel) and half by hand (the API). File 38a
will make the API half automatic too — [Part 10.5](10-release-life-cycle.md) shows how. **Doing it by hand
first is deliberate**: an automated pipeline for a deploy nobody has ever done
manually fails on something its author never saw.

## 0.7 What you click, what you type, what a script does

| Job | Who does it | Where in this guide |
|---|---|---|
| Create accounts, buckets, repositories, the server | 🌐 **You**, in web consoles | Parts 2–6 |
| Point the domain at Cloudflare, add DNS records | 🌐 **You** | Steps 6–7, 19, 26 |
| Store secrets | 🌐 **You**, in Parameter Store | [Step 13](05-aws-storage-secrets-images.md) |
| Create database tables | 💻 **You** run one Prisma command | [Step 8c](04-database-and-services.md) |
| Build and upload the API images | 💻 **You** run `docker build` / `docker push` | [Step 16](05-aws-storage-secrets-images.md) |
| Install Docker, cron, swap, folders on the server | ⚙️ **`bootstrap.sh`**, automatically on first boot | [Step 18](06-server.md) |
| Get and renew HTTPS certificates | ⚙️ **Caddy**, forever, by itself | [Step 21](06-server.md) |
| Fetch secrets, pull images, migrate, start, health-check | ⚙️ **`deploy.sh`**, when you run it | [Step 23](06-server.md) |
| Build and host the website | ⚙️ **Vercel**, on every push to `main` | Steps 24–26 |
| Nightly backup, weekly reports | ⚙️ **`backup.sh`, `weekly-reports.sh`** via cron | [Step 27](08-backups-and-smoke-test.md) |
| Delete old images so the disk never fills | ⚙️ a weekly cron job `bootstrap.sh` installed | [Step 18](06-server.md) |
| Check every pull request | ⚙️ **GitHub Actions** (`gates`) | [Part 1.5](01-prepare-mac-and-github.md) |

## 0.8 Words you will meet

| Word | Simple meaning |
|---|---|
| **DNS** | The internet's phone book. It turns `api.kidlearn.net` into an address like `13.200.1.2`. |
| **Nameservers** | Which company runs the phone book for your domain. You will move this from Namecheap to Cloudflare. |
| **A record** | A phone-book line: "this name → this IP address". |
| **CNAME record** | A phone-book line: "this name → look up that other name". |
| **Region** | Which city AWS runs your things in. We use **Mumbai (`ap-south-1`)**, close to Bangladesh. |
| **EC2** | A rented computer in AWS. |
| **Elastic IP** | A fixed IP address for that computer, so DNS never points at the wrong place. |
| **Security group** | A firewall: which doors (ports) on the computer are open. |
| **Port** | A numbered door on a computer. 443 is HTTPS, 80 is HTTP, 22 is SSH. |
| **IAM** | AWS's users and permissions system. |
| **IAM role** | Permissions given to a *machine* instead of a person, so no password sits on the server. |
| **Parameter Store** | A safe place in AWS for secrets (passwords, API keys). Free. Part of "Systems Manager" (SSM). |
| **Session Manager** | A terminal on your server, opened in your web browser. No SSH needed. |
| **User data** | A script AWS runs **once**, as root, the first time a new server boots. Ours is `deploy/bootstrap.sh`. |
| **Docker image** | Your app packed in a box with everything it needs to run. Built once, run anywhere. |
| **Container** | A running copy of an image. |
| **Docker Compose** | A YAML file that says "run these containers, with these settings, on this network". |
| **ECR** | A private place in AWS to store Docker images. |
| **Image tag / SHA** | The label on an image. We use the Git commit ID (`a1b2c3d`), so every image says exactly which code is inside. |
| **Migration** | A file that changes the database's shape (add a table, add a column). Lives in `packages/db/prisma/migrations/`. |
| **S3** | File storage in AWS. We use it for database backups. |
| **Caddy** | A small web server on EC2. It gets the free HTTPS certificate for `api.kidlearn.net` by itself. |
| **Reverse proxy** | A server that receives requests and passes them on to another one. Caddy does this for the API. |
| **Let's Encrypt / ACME** | The free service that gives HTTPS certificates; ACME is the protocol Caddy speaks to it. |
| **cron** | The server's alarm clock: runs a command at a set time. |
| **CI** | "Continuous integration" — GitHub running checks on every pull request. Ours is the `gates` job. |
| **CD** | "Continuous deployment" — the checks passing *also* ships the code. Vercel does this for the website; [Part 12](12-automatic-deploys.md) (file 38a) does it for the API. |

## 0.9 Three places you will work

| Icon | Place | What you do there |
|---|---|---|
| 🌐 | A website (AWS, Vercel, Cloudflare, GitHub…) | Click buttons, fill forms |
| 💻 | Terminal on **your Mac**, inside the `kidlearn` folder | Database setup, building images |
| 🖥️ | Terminal **on the server** (opened in the browser) | Start Caddy and the API, set up cron |

## 0.10 Golden rules — read these twice

1. **AWS region is always Mumbai.** At the top right of every AWS page there
   is a region menu. It must say **Asia Pacific (Mumbai) ap-south-1**. If
   something you made has "disappeared", the region is wrong 99% of the time.
2. **Never put a secret in the repository.** Passwords and keys go in your
   password manager and in AWS Parameter Store. Nowhere else.
3. **Cloudflare cloud icon must be GREY, never orange,** on every record you
   make. Orange breaks HTTPS for this project.
4. **Never open port 22 (SSH)** on the server. You do not need it.
5. **Write things down as you go.** Use the "Values sheet" below.

## 0.11 Your values sheet

Make a new **secure note** in your password manager (1Password, Bitwarden,
Apple Passwords…) called `kidlearn production`. You will fill it during the
guide. **Not** a file in the project folder.

```
AWS account ID:          ____________
AWS IAM user + password: ____________
Supabase DB password:    ____________
DATABASE_URL:            ____________
DIRECT_URL:              ____________
Cloudinary cloud/key/secret: ________
BETTER_AUTH_SECRET:      ____________
CRON_SECRET:             ____________
GEMINI_API_KEY:          ____________
GOOGLE_TTS_API_KEY:      ____________
Google OAuth ID/secret:  ____________
S3 bucket name:          ____________
Healthcheck URLs (2):    ____________
EC2 instance ID:         ____________
Elastic IP:              ____________
Image tag (SHA):         ____________
Admin email/password:    ____________
```

## 0.12 What it costs

Monthly running cost once everything is live. AWS figures are for Mumbai
(`ap-south-1`), taken from the cost table in
`document/implementation/38-deployment-aws-docker.md` (checked 2026-09-06).
AWS changes prices, so check them in the
[AWS Pricing Calculator](https://calculator.aws/) if a bill looks wrong.

| Service | Step | $/month | What would make it cost more |
|---|---|---|---|
| EC2 `t4g.small` server | 18 | 8.18 | A bigger instance type; long periods of heavy CPU ("unlimited" mode bills extra credits) |
| Public IPv4 / Elastic IP | 18c | 3.65 | Every extra Elastic IP, attached or not |
| EBS disk, 20 GiB gp3 | 18 | ~1.70 | A bigger disk; leftover snapshots |
| ECR image storage | 15 | ~0.05–0.45 | Removing the keep-last-10 lifecycle rule on either repository |
| S3 backups | 12 | ~0.10 | Removing the 30-day expiry rule |
| Parameter Store (Standard tier) | 13 | 0.00 | Choosing the **Advanced** tier, or Secrets Manager (~$0.40 per secret) |
| IAM, Budgets, Session Manager | 4, 17, 20 | 0.00 | — |
| Data transfer out of AWS | — | 0.00 | Over 100 GB a month (media is on Cloudinary, so unlikely) |
| Cloudflare DNS (Free plan) | 6 | 0.00 | — |
| Supabase (Free plan) | 8 | 0.00 | Outgrowing the free limits; Pro is $25/month |
| Cloudinary (Free plan) | 9 | 0.00 | Using up the monthly credit allowance |
| Gemini API (free tier) | 10 | 0.00 | Rate limits only; a paid tier is opt-in |
| Google Text-to-Speech | 10 | ~0.00 | Going past Google's free monthly character quota; billed per character after that |
| healthchecks.io (free plan) | 11 | 0.00 | — |
| Google sign-in (OAuth) | 22 | 0.00 | — |
| Vercel (Hobby plan) | 24 | 0.00 | Commercial use needs Pro ($20 per member per month) |
| **Total, monthly** | | **≈ 14.08** | |
| Domain `kidlearn.net`, Namecheap | 7 | ~1 | Billed **yearly** (roughly $10–15) — check your renewal price |

A new AWS account comes with welcome credits that may cover the first months.
Budget as if it does not, so the first real bill is not a surprise. [Step 4](02-accounts.md)'s
alarm is set at $20, about 1.5× the expected total.

## 0.13 How much this server can handle

**These are estimates, not measurements.** Nobody has load-tested this
deployment yet. The numbers below come from the machine's specification, the
memory figures in file 38, and how often the app sends requests. Treat them as
a starting point, and measure (end of this section) before you rely on them.

**What a `t4g.small` is**

| Part | Size | What it means for you |
|---|---|---|
| CPU | 2 vCPU, Arm (Graviton2) | Two cores. A Node.js process uses **one** core at a time |
| Memory | 2 GiB, plus 2 GB swap from `bootstrap.sh` | Usually the first thing to run out |
| Disk | 20 GiB gp3 | Images, logs, the dev database. Logs are capped (10 MB × 3 per container) |
| CPU baseline | 20% of each core, all day | It is a **burstable** machine — see below |

*Burstable* means the server is allowed 20% of each core all the time, and
saves up "CPU credits" while it is quieter than that. In a busy moment it spends
the credits and runs both cores at 100%. If it stays busy so long that the
credits run out, it keeps going at full speed anyway ("unlimited" mode) and AWS
bills the extra — a few cents per busy hour. That is why [Step 4](02-accounts.md)'s budget alarm
exists. In short: **short peaks are free, being busy all day is not.**

**What already runs on it** (file 38's figures)

| Process | Memory |
|---|---|
| `prod-api` (Node.js) | ~250 MB |
| Caddy | ~30 MB |
| Operating system + Docker | ~300 MB |
| `dev-api` + `dev-postgres` ([Part 11](11-dev-environment.md), later) | ~500 MB, capped at 400 MB each |
| **Used** | **~1.1 GiB of 2 GiB** |

**How many more Node.js apps fit?** About **one more** small Node.js service
(~250–400 MB) and the server still has room for the nightly backup, an image
download during a deploy, and a memory spike all at once. Two more is possible
but tight: a spike then pushes the machine into swap, and everything slows
down. Memory, not CPU, is the limit here. CPU-heavy work (image or video
processing, PDF generation) does not belong on this box at all.

**How many visitors?**

Only **API calls** reach this server. Vercel serves the web pages and Cloudinary
serves pictures and audio, so a visitor costs the server far less than you
might expect. While a child plays a lesson or reads a story, the app sends a
heartbeat every 30 seconds (`features/screen-time/use-heartbeat.ts`) plus an
event for each step, roughly **one request every 5–10 seconds**. Parents
browsing the dashboard send a few requests per page.

| Level | Children playing **at the same moment** | Roughly per day* | How the server feels |
|---|---|---|---|
| Comfortable | up to ~200 | ~2,000 | Well inside the CPU baseline; no extra cost |
| Busy peaks | ~500–1,000 for an hour or so | — | Spends saved credits; still fine |
| Time to upgrade | 1,000+ for hours every day | 10,000+ | Credits run out, extra CPU billing starts, replies slow down |

\* Assuming a child plays 15–20 minutes and families use the app at different
times of day, so the busiest moment holds about one in ten of the day's
children.

**What will probably limit you first** — not the EC2 server:

1. **The rate limit per IP address.** The API accepts **300 requests per minute
   from one IP address** (`API_RATE_LIMIT_PER_MINUTE`, default 300). A school
   classroom on one Wi-Fi, or many phones behind one mobile operator's shared
   address (common in Bangladesh), all share one IP. Around **30–50 children
   playing at once behind the same address** will start seeing "Too many
   requests". To raise it, add a parameter
   `/kidlearn/prod/API_RATE_LIMIT_PER_MINUTE` (e.g. `1200`) in Parameter Store
   and redeploy (`deploy.sh` copies every `/kidlearn/prod/*` value into the API).
2. **Supabase Free plan.** It runs on a small shared database machine and holds
   500 MB of data. The database will slow down before this server does. Moving
   to Supabase Pro ($25/month) is the first upgrade to expect.
3. **Database connections.** The API keeps at most 5 open at once
   (`connection_limit=5`). Each request holds one for a few milliseconds, so
   this is fine at the levels above; it matters only past them.

**When to upgrade, and to what**

| You see | Do this |
|---|---|
| Memory full, swap in use all the time | Move to `t4g.medium` (2 vCPU, 4 GiB, ~$8/month more) |
| CPU credit balance keeps falling to zero (CloudWatch) | First take the dev stack off this box. Still zero? Move to `t4g.large` (2 vCPU, 8 GiB, 30% baseline, ~$25/month more). `t4g.medium` does **not** help here: it earns credits at the same rate as `small` |
| Database slow, Supabase usage near its limits | Supabase Pro |
| Many "Too many requests" errors | Raise `API_RATE_LIMIT_PER_MINUTE` (above) |

Changing the instance type: stop the instance → **Actions → Instance settings →
Change instance type** → start it again. The Elastic IP, disk and role stay; the
API is down for a minute or two.

**How to measure it yourself**

- 🖥️ `docker stats --no-stream` — memory and CPU per container, right now.
- 🖥️ `free -m` — whether swap is being used (the "Swap used" column).
- 🌐 **EC2 → your instance → Monitoring** — **CPU utilization** and **CPU credit
  balance**. A balance that keeps going down each day means the box is too small.
- Before a big launch (a school, a campaign), run a load test against the
  **dev** API, never production, with a tool such as `k6` or `autocannon`.

---

[Guide index](README.md) · [Next →](01-prepare-mac-and-github.md)
