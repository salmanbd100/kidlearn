# Part 4 — Database and outside services

[← Previous](03-dns-cloudflare.md) · [Guide index](README.md) · [Next →](05-aws-storage-secrets-images.md)

> **Where you work:** 🌐 browser, 💻 one Prisma command. Steps 8–11.  
> **You finish with:** the production database with its tables, Cloudinary, Google keys and two backup monitors.  
> **Before you start:** Steps 6–7 (DNS can still be propagating).

## Step 8 · 🌐💻 Production database — Supabase

**Cost:** $0 — Supabase Free plan. The catches: it pauses after 7 idle days
(see the end of this step), and there is no point-in-time restore
([Step 12](05-aws-storage-secrets-images.md) covers that). Pro is $25/month if
you outgrow it.

**Why:** all KidLearn data (parents, children, lessons, progress) lives here.

**8a. Create the project**

1. Supabase → **New project**.
2. Name: `kidlearn-production`.
3. **Database password:** click **Generate a password**. Then check it has
   **only letters and numbers**; if it has symbols, generate again.
   *Why:* symbols like `@ # $ /` break connection strings in confusing ways.
   Save it in your values sheet.
4. Region: **South Asia (Mumbai)** — same city as the server, so it is fast.
5. Create, and wait ~2 minutes.

**8b. Copy two connection strings**

Click **Connect** (top of the project page). You need two strings. In each,
replace `[YOUR-PASSWORD]` — **square brackets included** — with your database
password: `…postgres.abcd1234:[YOUR-PASSWORD]@aws-…` becomes
`…postgres.abcd1234:Xk3m9QpL2v7RtY8w@aws-…`.

| Name in your sheet | Which one in Supabase | Port | Add to the end |
|---|---|---|---|
| `DATABASE_URL` | **Transaction pooler** | `6543` | `?pgbouncer=true&connection_limit=5` |
| `DIRECT_URL` | **Session pooler** | `5432` | nothing |

They look like this (your project ref and host come from Supabase — copy
them as shown; only the password and the ending are yours to change):

```
DATABASE_URL = postgresql://postgres.abcd1234:Xk3m9QpL2v7RtY8w@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5
DIRECT_URL   = postgresql://postgres.abcd1234:Xk3m9QpL2v7RtY8w@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

*Why two?*

```
 prod-api  ── many short queries ──► :6543 TRANSACTION pooler ─┐
                                     (shares a few real        │
                                      connections among many)  ├──► Postgres
 migrate, backup ── one long ───────► :5432 SESSION pooler ────┘
                    connection        (one real connection,
                                       held until you finish)
```

The app makes many short connections — the **transaction pooler** is built for
that. Migrations and backups need one long, stable connection — the **session
pooler** gives that.

> ⚠️ **Do not use "Direct connection"** (`db.xxxx.supabase.co`) for
> `DIRECT_URL`. It works only over IPv6. Your AWS server has only IPv4, so
> backups would fail every night.
>
> ⚠️ It must be `connection_limit=5`, **not** `=1` like many online guides say.

**8c. Create the tables** — 💻 on your Mac, in the repo
(`cd ~/Documents/Me/kidlearn`). Replace the two example strings with yours from
8b, **keeping the single quotes** around each (the `?` and `&` in the URL would
otherwise confuse the shell):

```bash
DATABASE_URL='postgresql://postgres.abcd1234:Xk3m9QpL2v7RtY8w@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5' \
DIRECT_URL='postgresql://postgres.abcd1234:Xk3m9QpL2v7RtY8w@aws-0-ap-south-1.pooler.supabase.com:5432/postgres' \
pnpm --filter @kidlearn/db exec prisma migrate deploy
```

*Reading it:* `NAME='value'` in front of a command sets that variable for that
one command only. The `\` at a line end means "the command continues on the
next line" — it must be the very last character. `pnpm --filter @kidlearn/db
exec` runs `prisma` inside `packages/db`, where the database schema lives.

*Why:* the empty database has no tables. `migrate deploy` creates them from the
migration files in `packages/db/prisma/migrations/`, and records each one in a
table called `_prisma_migrations` so it never runs twice. The values are typed
in the command, so no secret is saved in a file. Your local development
settings do not interfere: values given on the command line win.

✅ **Check:** the last line says `All migrations have been successfully applied.`

> **Never run `prisma migrate dev` against this database.** It can delete data.
> `migrate deploy` is the only safe one.

**8d. Add the starting structure** (worlds, subjects, characters, badges) — 💻,
the same two strings as 8c:

```bash
DATABASE_URL='postgresql://postgres.abcd1234:Xk3m9QpL2v7RtY8w@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5' \
DIRECT_URL='postgresql://postgres.abcd1234:Xk3m9QpL2v7RtY8w@aws-0-ap-south-1.pooler.supabase.com:5432/postgres' \
pnpm --filter @kidlearn/db db:seed:reference
```

*Why:* this adds only the shapes the app needs before any lesson exists.
Lessons and stories come later, through the admin CMS.

> **Never run plain `db:seed` here.** It also adds the developer sample lessons,
> whose pictures and sounds exist only on a developer's Mac. Children would see
> broken images and hear nothing.

✅ **Check:** it finishes with no red error. In Supabase → **Table Editor**,
`World` has 2 rows, `Badge` has 6, and `Lesson` is empty.

> **Free Supabase projects pause after 7 days with no use.** Until you launch,
> open the Supabase dashboard once a week. If the site breaks later, check
> "is the project paused?" first.

## Step 9 · 🌐 Cloudinary — images and audio

**Cost:** $0 — Cloudinary Free plan. It has a monthly credit allowance; the
dashboard shows how much is used.

**Why:** uploaded pictures and generated audio are stored here, not on your
server, so the server's disk stays small.

Cloudinary → **Dashboard** (or Settings → API Keys). Copy **Cloud name**
(e.g. `dq7xkidln`), **API Key** (15 digits, e.g. `482915736204851`) and **API
Secret** (e.g. `aB3dE5fG7hI9jK1lM3nO5pQ7rS9`) into your sheet.

✅ **Check:** three values in your sheet, none of them blank.

## Step 10 · 🌐 Google keys — Gemini and Text-to-Speech

**Cost:** Gemini is $0 on the free tier (rate-limited, no bill). Text-to-Speech
needs a billing account, but lesson audio stays inside Google's free monthly
character quota; past it, Google bills per character. Add a small budget alert
in **Google Cloud → Billing → Budgets & alerts** too, just as [Step 4](02-accounts.md) does for
AWS.

**Why:** Gemini writes AI content for admins to review; Text-to-Speech makes
the lesson audio.

1. **Gemini key:** <https://aistudio.google.com/apikey> → **Create API key**.
   Free. Save as `GEMINI_API_KEY`.
2. **Text-to-Speech key:** Google Cloud Console → pick your project →
   search **Cloud Text-to-Speech API** → **Enable** (needs a billing account
   on the project). Then **APIs & Services → Credentials → Create credentials →
   API key**. Click the new key → **API restrictions → Restrict key** → choose
   **Cloud Text-to-Speech API** → Save. Save as `GOOGLE_TTS_API_KEY`.
   *Why restrict:* if the key ever leaks, it can only make speech, nothing else.

✅ **Check:** two keys in your sheet. Both start with `AIza`, e.g.
`AIzaSyD4x9…` — they look alike, so label them carefully.

## Step 11 · 🌐 Two backup monitors — healthchecks.io

**Cost:** $0 — the free plan has far more checks than the two you need.

**Why:** the server makes a database backup every night and sends a weekly
parent report. If one of them silently stops, nobody would notice — cron on the
server has no way to email you. healthchecks.io is a **dead man's switch**: it
expects a "ping" every day/week and **emails you when it does not come**.

```
 every night 01:30         backup.sh ──ok──► GET https://hc-ping.com/<id>       → check stays green
                                     ──fail─► GET https://hc-ping.com/<id>/fail  → email NOW
 the server is dead / cron broken:   no ping at all → after 1 day + 2 h grace     → email
```

1. healthchecks.io → **Add Check**. Name `kidlearn backup`. **Period: 1 day**,
   **Grace: 2 hours**. Copy its **ping URL**, e.g.
   `https://hc-ping.com/5b1f2c9e-8d4a-4e7b-9f3c-2a6d8e1b4c70`.
2. **Add Check** again. Name `kidlearn weekly reports`. **Period: 7 days**,
   **Grace: 6 hours**. Copy its ping URL.

✅ **Check:** both URLs are in your sheet, labelled — the backup one goes into
`BACKUP_HEARTBEAT_URL` and the weekly one into `WEEKLY_REPORTS_HEARTBEAT_URL`
in [Step 13](05-aws-storage-secrets-images.md). Both checks show as **new**
(grey) until the server first pings them in [Step 27](08-backups-and-smoke-test.md).

---

[← Previous](03-dns-cloudflare.md) · [Guide index](README.md) · [Next →](05-aws-storage-secrets-images.md)
