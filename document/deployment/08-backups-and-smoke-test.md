# Part 8 — Backups, scheduled jobs, final test

[← Previous](07-website-vercel.md) · [Guide index](README.md) · [Next →](09-paperwork.md)

> **Where you work:** 🖥️ server, 💻 Mac, 📱 phone. Steps 27–28.  
> **You finish with:** nightly backups and weekly reports on a timer, every layer tested end to end, and one rollback rehearsed.  
> **Before you start:** Steps 24–26.

## Step 27 · 🖥️ Nightly backup and weekly reports

**Cost:** $0 beyond the S3 bucket from [Step 12](05-aws-storage-secrets-images.md).

**Why:** cron is the server's alarm clock. Every night at 01:30 it backs up the
database to S3. Every Monday at 02:00 it builds the weekly parent reports.

🖥️ On the server terminal (prompt ends in `#` after `sudo su -`):

```bash
sudo su -
systemctl is-active crond     # must say: active
EDITOR=nano crontab -e
```

`crontab -e` opens root's list of timed jobs in **nano**, a simple text
editor inside the terminal. The file is empty the first time. Paste these
lines exactly (right-click → Paste in the browser terminal), then save and
leave: `Ctrl+O`, `Enter`, `Ctrl+X`. The terminal prints
`crontab: installing new crontab`.

```cron
CRON_TZ=Asia/Dhaka
# Nightly production database dump → S3
30 1 * * *  /opt/kidlearn/deploy/backup.sh >>/var/log/kidlearn-backup.log 2>&1
# Weekly parent reports, Mondays 02:00 Asia/Dhaka
0 2 * * 1  /opt/kidlearn/deploy/weekly-reports.sh >>/var/log/kidlearn-weekly-reports.log 2>&1
```

*Reading a cron line:* `30 1 * * *` = minute 30, hour 1, every day of month,
every month, every weekday. `0 2 * * 1` = 02:00 on weekday 1 (Monday).
`>>…log 2>&1` appends all output to a log file you can read later.
`CRON_TZ=Asia/Dhaka` makes those times Dhaka time, not the server's UTC.

✅ 🖥️ `crontab -l` prints the five lines back.

> **Behind the scenes — `backup.sh`**
>
> ```
>  read DIRECT_URL, BACKUP_S3_BUCKET, BACKUP_HEARTBEAT_URL from Parameter Store
>  │
>  ask the database its Postgres version (psql in a throw-away container)
>  │  → pick the matching postgres:<major>-alpine image for pg_dump
>  │    (a too-old pg_dump refuses a newer server; Supabase upgrades in place)
>  │
>  pg_dump --schema=public  ──gzip──►  s3://<bucket>/prod/.partial/<time>.sql.gz
>  │   streamed: nothing is written to the server's own disk
>  │
>  size < 1 KB?  ──yes──► FAIL (an empty dump is not a backup)
>  │
>  move .partial/<time>.sql.gz → prod/<time>.sql.gz     ← only now is it "real"
>  │
>  ping healthchecks.io ✔
>
>  on ANY failure: delete the .partial file, ping <url>/fail ✖, exit non-zero
> ```
>
> `--schema=public` is everything KidLearn owns. Supabase's own internal schemas
> are skipped because they cannot be restored into plain Postgres. The restore
> procedure is [`runbook.md` §8](../runbook.md) — rehearse it once ([Step 33](11-dev-environment.md) does).
>
> **Behind the scenes — `weekly-reports.sh`**
>
> Reads `CRON_SECRET` from Parameter Store and sends
> `POST https://api.kidlearn.net/api/admin/jobs/weekly-reports` with
> `Authorization: Bearer <CRON_SECRET>`. The API answers `202 Accepted` and does
> the work in the background, so a green ping means "the run started", not
> "every report was written" — failures for individual children are in the API
> log. The secret is passed on stdin, never as a command-line argument, so other
> processes on the server cannot see it.

**Run the backup once now, by hand.** *Why:* a backup you never tested is only
a hope. 🖥️ still as root:

```bash
/opt/kidlearn/deploy/backup.sh
```

It takes a minute or two and ends with a line like
`[backup] wrote s3://kidlearn-backups-salman-2026/prod/2026-10-26T09-15-02Z.sql.gz (48213 bytes)`.

✅ **Check all three:**

- The script prints `wrote … (NNNN bytes)` with no `FAILED` line. (A
  `WARNING: … BACKUP_HEARTBEAT_URL is not set` line means [Step 13](05-aws-storage-secrets-images.md)'s
  heartbeat parameter is missing — add it, or failures will not email you.)
- AWS **S3 → your bucket → `prod/`** has a new `.sql.gz` file (directly in
  `prod/`, **not** in `prod/.partial/`).
- healthchecks.io shows the `kidlearn backup` check **green**.

## Step 28 · 💻📱 Smoke test — every layer, end to end

**Why:** each earlier check proved one piece. This proves the pieces are wired
to each other: DNS → HTTPS → Caddy → container → database, and Vercel → API.

💻 From your Mac:

```bash
dig +short api.kidlearn.net                        # your Elastic IP         (DNS)
curl -s https://api.kidlearn.net/health            # {"data":{"status":"ok",…}}  (Caddy + container)
curl -si https://api.kidlearn.net/docs | head -1   # 404                     (production config)
curl -si https://kidlearn.net | grep -i x-robots   # prints NOTHING          (Vercel, prod settings)
curl -si -H 'Origin: https://kidlearn.net' https://api.kidlearn.net/health \
  | grep -i access-control-allow-origin            # https://kidlearn.net    (CORS / WEB_ORIGIN)
```

🖥️ On the server:

```bash
ss -tlnp            # docker-proxy (Caddy) on 80 and 443; nothing else on 0.0.0.0 except sshd on 22
docker ps           # kidlearn-caddy and prod-api, both "Up", prod-api "(healthy)"
```

(`sshd` on port 22 is Amazon Linux's own and is harmless: the security group
from [Step 18](06-server.md) blocks port 22 from the internet, which the `nmap`
check below proves. Anything on `127.0.0.x` is reachable only from the server
itself.)

📱 Then on your phone, at `https://kidlearn.net` — this is the one test that
crosses every system (Vercel, Cloudflare, Caddy, the API, Supabase, Google):

1. Sign in with Google.
2. **Reload the page — you are still signed in.** If reload logs you out, the
   hostname settings in [Part 0.3](00-understand.md) disagree; fix that first.
3. Sign in with your **admin** account ([Step 14](05-aws-storage-secrets-images.md)) on a computer — it works.
4. Run the full checklist in [`runbook.md` §14](../runbook.md) (child profile, a lesson with
   audio, the dashboard, `/admin/ai-queue`). **There is no PIN step** — a build
   that asks for one is older than 2026-09-09, so you deployed the wrong SHA.

**28b · Prove the security settings, not just that it works.** Each line is one
of file 38's acceptance criteria. Tick them in your sheet.

| Check | How | Expect |
|---|---|---|
| Login cookie is strict | 💻 Chrome on `kidlearn.net` signed in → DevTools → **Application → Cookies → `https://api.kidlearn.net`** → the `better-auth…session_token` row | **Secure** ✓, **HttpOnly** ✓, **SameSite `Lax`** — never `None` |
| Works under Safari's tracking prevention | 📱 iPhone Safari (Settings → Safari → *Prevent Cross-Site Tracking* **on**) → sign in → reload | Still signed in |
| CORS refuses strangers | 💻 `curl -si -H 'Origin: https://evil.example' https://api.kidlearn.net/health \| grep -i access-control-allow-origin` | **Prints nothing** |
| Only two doors open | 💻 `brew install nmap` once, then `nmap -Pn 13.234.56.78` (your Elastic IP) | `80/tcp open`, `443/tcp open`, nothing else (22 **closed/filtered**) |
| App uses the pooled DB | 🖥️ `grep -o '@[^/]*' /opt/kidlearn/prod/app.env` shows `…pooler.supabase.com:6543` for `DATABASE_URL`; then 🌐 Supabase → **SQL Editor** → `select application_name, count(*) from pg_stat_activity group by 1;` while you click around the site | The config names port **6543**, and the live connections come through Supabase's pooler (`Supavisor`) |
| Media comes from Cloudinary | 💻 Chrome DevTools → **Network** while a lesson plays, filter `img` / `media` | Requests go to `res.cloudinary.com` |
| Slow network shows the loader, not an error | 💻 DevTools → **Network → Throttling: Slow 4G** → reload a lesson | The mascot loader appears, then the lesson — never a raw error |

**28c · Rehearse a rollback once, while nothing depends on it.** *Why:* the
first time you roll back must not be during a real outage. You need two image
tags for this, so it waits until your second release ([Part 10.1](10-release-life-cycle.md)) — but do it
then, on purpose, before you forget:

The API half, using two example tags — `b2c3d4e` is the release running now,
`a1b2c3d` the one before (your sheet, or the ECR console, has both):

```bash
# 🖥️ on the server
cat /opt/kidlearn/prod/last-good-tag             # b2c3d4e — the current SHA
/opt/kidlearn/deploy/deploy.sh prod a1b2c3d      # roll back
```

```bash
# 💻 on your Mac
curl -s https://api.kidlearn.net/health          # still {"data":{"status":"ok",…}}
```

```bash
# 🖥️ on the server
/opt/kidlearn/deploy/deploy.sh prod b2c3d4e      # roll forward again
```

✅ Each `deploy.sh` ends with `deploy complete at` and the tag you gave it.

🌐 The website half: Vercel → project → **Deployments** → the previous
production deployment → **⋯ → Instant Rollback**. Check the site, then on the
newest deployment **⋯ → Promote to Production** to go forward again.

> # 🎉 You are live!

---

[← Previous](07-website-vercel.md) · [Guide index](README.md) · [Next →](09-paperwork.md)
