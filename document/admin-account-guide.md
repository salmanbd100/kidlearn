# KidLearn — Admin Account Guide

How to create an admin, reset a password, and what an admin does in the CMS.
The full admin narrative is [`user-journey-manual.md §6`](./user-journey-manual.md#6-admin-journey).

Every command is marked 💻 **Mac** (a normal Terminal window, prompt like
`salman@MacBook kidlearn %`) — **none of them runs on the server**. If your prompt
is `sh-5.2$` or `[root@ip-…]#`, type `exit` until you are back on the Mac. More
on telling the two apart: [`runbook.md` §0](./runbook.md#0-before-you-type-anything).

---

## 1. What an admin account actually is

There is **no admin sign-up page** and **no password-reset flow**. One script,
`seed:admin`, creates an admin and resets a password. It is the only way to do
either.

The script writes three rows: `user` (identity), `account` (password hash) and
`AdminUser` (permission). The first two let you sign in, and `AdminUser` lets you
into `/api/admin/*`. Admins sign in with a password only; parents with Google
only — so an admin needs an email that is **not** also a parent's Google account.

---

## 2. Local development

**Before you start** (💻, once): `pnpm install`, fill in `apps/server/.env` and
`packages/db/.env` from their `.env.example` templates, then
`pnpm db:generate && pnpm --filter @kidlearn/db build && pnpm db:migrate`.

**Create an admin or reset a password** — the command is the same for both. 💻
Mac, anywhere inside the repo:

```bash
ADMIN_EMAIL=salman.admin@example.com \
ADMIN_PASSWORD='plum-ferry-orbit-2026' \
ADMIN_NAME='Salman Rahman' \
  pnpm --filter server seed:admin
```

✅ It prints `Created admin salman.admin@example.com (…)` for a new email, or
`Updated admin …` when it replaced an existing password. Either line means the
password has been re-read and verified the way sign-in checks it.

- The password must be **at least 12 characters**.
- A reset also signs that admin out everywhere and revokes every AI-assistant
  token they hold, so a leaked password cannot keep working through a token.
- The admin is written to the database in **`apps/server/.env`** (`DATABASE_URL`),
  not the one in `packages/db/.env`.
- The script validates the whole server env, so every variable must be set.
  Placeholders are fine for the ones it does not use (`CLOUDINARY_*`,
  `GEMINI_API_KEY`, …).

**Sign in:** `pnpm dev`, open http://localhost:3000 and choose **Admin sign-in**.

---

## 3. kidlearn.net and dev.kidlearn.net

Run the seed **from your Mac, inside the repo**, against the deployed database —
you do not go on the server. Never store `ADMIN_*` in SSM, Vercel or `app.env`;
nothing in the running app reads them.

**Production (https://kidlearn.net).** Needs `pnpm install` done and the AWS CLI
signed in ([deployment Step 3](./deployment/02-accounts.md) — check with
`aws sts get-caller-identity`). 💻 Mac — first replace the three `CHANGE-ME`
values, then paste the whole block as one piece. Keep the space before `cd`: it
keeps the block, password included, out of zsh history.

```bash
 cd ~/Documents/Me/kidlearn && bash <<'EOF'
set -a
eval "$(aws ssm get-parameters-by-path --path /kidlearn/prod/ --with-decryption \
  --recursive --region ap-south-1 --query 'Parameters[].[Name,Value]' --output text \
  | while IFS=$'\t' read -r n v; do printf '%s=%q\n' "${n##*/}" "$v"; done)"
set +a
[ -n "$DATABASE_URL" ] || { echo "No DATABASE_URL — is the AWS CLI signed in?"; exit 1; }
echo "Database: $(echo "$DATABASE_URL" | sed -E 's#(//[^:]*):[^@]*@#\1:***@#')"
ADMIN_EMAIL='CHANGE-ME' \
ADMIN_PASSWORD='CHANGE-ME' \
ADMIN_NAME='CHANGE-ME' \
  pnpm --filter server seed:admin
EOF
```

Filled in, those three lines look like `ADMIN_EMAIL='salman.admin@example.com'`,
`ADMIN_PASSWORD='plum-ferry-orbit-2026'`, `ADMIN_NAME='Salman Rahman'`. Left as
`CHANGE-ME`, the seed refuses (not an email, under 12 characters) — nothing is
written.

*What it does:* opens a separate `bash` that loads every `/kidlearn/prod/*`
parameter from SSM as an environment variable, prints which database it will
write to (password masked), runs the seed, and exits — taking the secrets with
it. Line-by-line explanation: [deployment Step 14](./deployment/05-aws-storage-secrets-images.md).

✅ Two lines:

```
Database: postgresql://postgres.abcdefghijklmnop:***@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5
Created admin salman.admin@example.com (…).
```

The `Database:` host must be the **production** Supabase project (`ap-south-1`).
Then sign in on https://kidlearn.net with **Admin sign-in** — type the password;
do not let the browser fill in an old saved one.

**Development (https://dev.kidlearn.net).** Changing `--path` to `/kidlearn/dev/`
is **not** enough: dev's `DATABASE_URL` points at `dev-postgres`, a name that
exists only inside Docker on the server. The seed goes through an SSH tunnel to
`localhost:15432` instead — follow [deployment Step 32c](./deployment/11-dev-environment.md),
which has the full block.

- Each environment has its own database, so each needs its own admin.
- The password must not contain `'` — a single quote ends the value early.

### Other tasks

| To… | Do this |
|---|---|
| Add another admin | Run the seed with a different email |
| Reset a forgotten password | Run the seed again with the same email and a new password |
| Remove an admin | Delete their `AdminUser` row — production: 🌐 Supabase → **Table Editor** → `AdminUser`. (`pnpm db:studio` opens your *local* database, not production.) Their AI-assistant tokens are deleted with it |
| Connect or revoke an AI assistant | CMS → **AI assistants**. Needs `MCP_ENABLED=true` on the API ([`runbook.md` §12](./runbook.md#ai-assistants-over-mcp-file-41)) |

An admin session lasts **12 hours** from sign-in and is not extended by activity.

---

## 4. Using the CMS

### 4.1 The workspace

Signing in lands you on **Analytics**. The sidebar has **Curriculum**,
**Stories**, **Media**, **Badges**, **AI Queue**, **Analytics**, **AI assistants**
and the **Curriculum guide** (`/admin/guide`). Read the guide before you create content.

### 4.2 The one rule behind every screen

```
draft → in_review → approved → published
              ↘ rejected → (back to draft)
```

Children only ever see `published` content.

### 4.3 Flow A — authoring by hand

Create a Subject, then a Topic, then a Lesson. Fill in the English and Bangla
tabs, attach media, build the activity and quiz (each with a live preview), then
publish.

### 4.4 Flow B — reviewing AI content (the important one)

AI output is always saved as a **draft** and appears in the **AI Queue**. Open a
job and choose:

| Decision | Result |
|---|---|
| **Approve** | Published and visible to children |
| **Edit, then approve** | Fix it in the editor, then publish |
| **Reject** | Needs a reason of 10 or more characters. Never shown |

AI content cannot be published without a recorded human decision; the server
enforces this. Hitting a daily generation cap returns `429`, and the count
resets at midnight in `APP_TIMEZONE`.

### 4.5 What an admin cannot do

An admin cannot see any child's personal data, sign in with Google, create
another admin from the UI, reset their own password, or publish AI content
without reviewing it.

---

## 5. Troubleshooting

The sign-in dialog says *"Those details did not match an administrator account"*
for **every** failure. Find the real reason first: 💻 test the account directly
(keep the leading space; replace email and password):

```bash
 curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.kidlearn.net/api/auth/sign-in/email \
  -H 'Origin: https://kidlearn.net' -H 'Content-Type: application/json' \
  -d '{"email":"salman.admin@example.com","password":"plum-ferry-orbit-2026"}'
```

`200` means the account is fine — clear the browser's saved password. Anything
else: read the API log ([`runbook.md` §2b](./runbook.md#2b-logs-and-health-at-a-glance))
for a `better auth` line and match it below. For dev, use
`api.dev.kidlearn.net` and `Origin: https://dev.kidlearn.net`.

| Symptom | Fix |
|---|---|
| `Cannot seed an admin. Fix these variables:` | An `ADMIN_*` value is missing or still `CHANGE-ME`, or the password is under 12 characters |
| Seed fails naming `CRON_SECRET`, `CLOUDINARY_*`, … | Set those variables in the server env. Placeholders are fine locally; in production, the parameter is missing from SSM |
| Seed fails: *"…already belongs to a Google sign-in"* | That email is a parent account. Use a different email for the admin |
| API log: `User not found` | The seed wrote to a different database. 💻 compare the seed's `Database:` line with the deployed one: `aws ssm get-parameter --name /kidlearn/prod/DATABASE_URL --with-decryption --region ap-south-1 --query Parameter.Value --output text \| sed -E 's#(//[^:]*):[^@]*@#\1:***@#'` |
| API log: `Invalid password` | Run the seed again and type exactly that password |
| API log: `Credential account not found` | The user exists without a password row (an interrupted seed). Run the seed again — it adds the missing row |
| Seed fails: *"…does not hold the new password"* | The account has stale duplicate rows. Delete them (production: 🌐 Supabase → **SQL Editor**), then run the seed again: `delete from account a using "user" u where a."userId" = u.id and u.email = 'salman.admin@example.com' and a."providerId" = 'credential' and a."updatedAt" < now() - interval '1 minute';` |
| Login works but the CMS bounces you out | The `AdminUser` row is missing. Running the seed again restores it |
| `401` on `/api/admin/*` | The session is over 12 hours old (sign in again), or `WEB_ORIGIN` / `NEXT_PUBLIC_API_URL` is wrong ([`runbook.md` §4](./runbook.md#4-where-every-value-lives)) |

**Key files:** `apps/server/src/scripts/seed-admin.ts` (the seed),
`apps/server/src/config/auth.ts` (auth setup),
`apps/server/src/shared/middleware/require-admin.ts` (the admin gate).
