# KidLearn — Admin Account Guide

How to create an admin, reset a password, and what an admin does in the CMS.
The full admin narrative is [`user-journey-manual.md §6`](./user-journey-manual.md#6-admin-journey).

---

## 1. What an admin account actually is

There is **no admin sign-up page** and **no password-reset flow**. One script,
`seed:admin`, creates an admin and resets a password. It is the only way to do
either.

The script writes three rows: `user` (identity), `account` (password hash) and
`AdminUser` (permission). The first two let you sign in, and `AdminUser` lets you
into `/api/admin/*`. Admins sign in with a password only. Parents sign in with
Google only.

---

## 2. Local development

**Before you start:** run `pnpm install`, fill in `apps/server/.env` and
`packages/db/.env` from their `.env.example` templates, then run
`pnpm db:generate && pnpm --filter @kidlearn/db build && pnpm db:migrate`.

**Create an admin or reset a password** (the command is the same for both):

```bash
ADMIN_EMAIL=you@example.com \
ADMIN_PASSWORD='a-long-local-password' \
ADMIN_NAME='Your Name' \
  pnpm --filter server seed:admin
```

The output is `Created admin …` for a new email, or `Updated admin …` when it
replaced the password of an existing one. Either line means the password has
been verified and works. A reset also signs that admin out everywhere and
revokes every AI-assistant token they hold, so a leaked password cannot keep
working through a token minted with it.

- The password must be **at least 12 characters**.
- The admin is written to the database in **`apps/server/.env`** (`DATABASE_URL`),
  not the one in `packages/db/.env`.
- The script validates the whole server env, so every variable must be set.
  Placeholders are fine for the ones it does not use (`CLOUDINARY_*`,
  `GEMINI_API_KEY`, …).

**Sign in:** run `pnpm dev`, open http://localhost:3000 and choose **Admin sign-in**.

---

## 3. kidlearn.net and dev.kidlearn.net

Run the seed **from your Mac, inside the repo**, against the deployed database.
You do not SSH to the server. Never store `ADMIN_*` in SSM, Vercel or `app.env`,
because nothing in the running app reads them.

You need the AWS CLI signed in ([deployment Step 3](./deployment/02-accounts.md)).
Paste the block below as one piece. The leading space keeps it out of zsh history:

```bash
 cd ~/Documents/Me/kidlearn && bash <<'EOF'
set -a
eval "$(aws ssm get-parameters-by-path --path /kidlearn/prod/ --with-decryption \
  --recursive --region ap-south-1 --query 'Parameters[].[Name,Value]' --output text \
  | while IFS=$'\t' read -r n v; do printf '%s=%q\n' "${n##*/}" "$v"; done)"
set +a
[ -n "$DATABASE_URL" ] || { echo "No DATABASE_URL — is the AWS CLI signed in?"; exit 1; }
echo "Database: $(echo "$DATABASE_URL" | sed -E 's#(//[^:]*):[^@]*@#\1:***@#')"
ADMIN_EMAIL='you@example.com' \
ADMIN_PASSWORD='<at least 12 characters>' \
ADMIN_NAME='<your name>' \
  pnpm --filter server seed:admin
EOF
```

That block is for **https://kidlearn.net**, whose Supabase database your Mac
reaches directly.

**For https://dev.kidlearn.net** changing `--path` to `/kidlearn/dev/` is not
enough: dev's stored `DATABASE_URL` points at `dev-postgres`, a name that exists
only inside Docker on the server. The seed needs an SSH tunnel and a
`localhost:15432` URL instead — follow
[deployment Step 32c](./deployment/11-dev-environment.md), which has the full
block.

- Check that the printed `Database:` line is the environment you expect.
- Each environment has its own database, so each one needs its own admin.
- The password must not contain `'`.
- Sign in on the site with **Admin sign-in**. Type the password; do not let the
  browser fill in an old saved one.

More detail is in [deployment Step 14](./deployment/05-aws-storage-secrets-images.md).

### Other tasks

| To… | Do this |
|---|---|
| Add another admin | Run the seed with a different email |
| Remove an admin | Delete their `AdminUser` row (`pnpm db:studio`). Their AI-assistant tokens go with it |
| Connect or revoke an AI assistant | CMS → **AI assistants**. Needs `MCP_ENABLED=true` on the API |

An admin session lasts **12 hours** from sign-in and is not extended by activity.

---

## 4. Using the CMS

### 4.1 The workspace

Signing in lands you on **Analytics**. The sidebar has **Curriculum**,
**Stories**, **Media**, **Badges**, **AI Queue**, **Analytics** and the
**Curriculum guide** (`/admin/guide`). Read the guide before you create content.

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

AI content cannot be published without a recorded human decision. The server
enforces this. Hitting a daily generation cap returns `429`, and the count
resets at midnight in `APP_TIMEZONE`.

### 4.5 What an admin cannot do

An admin cannot see any child's personal data, sign in with Google, create
another admin from the UI, reset their own password, or publish AI content
without reviewing it.

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot seed an admin. Fix these variables:` | An `ADMIN_*` value is missing, or the password is under 12 characters |
| Seed fails naming `CRON_SECRET`, `CLOUDINARY_*`, … | Set those variables in the server env. Placeholders are fine |
| Login says *"Those details did not match…"* | This message appears for **every** failure. Test with the `curl` in [Step 14](./deployment/05-aws-storage-secrets-images.md). A `200` means the account is fine, so clear the browser's saved password |
| API log: `User not found` | The seed wrote to a different database. Compare the `Database:` line with `DATABASE_URL` in `/opt/kidlearn/<env>/app.env` |
| API log: `Invalid password` | Run the seed again and type exactly that password |
| Seed fails: *"…does not hold the new password"* | The account has stale duplicate rows. Delete them, then run the seed again: `delete from account a using "user" u where a."userId" = u.id and u.email = '<email>' and a."providerId" = 'credential' and a."updatedAt" < now() - interval '1 minute';` |
| Login works but the CMS bounces you out | The `AdminUser` row is missing. Running the seed again restores it |
| `401` on `/api/admin/*` | The session is over 12 hours old, or `WEB_ORIGIN` / `NEXT_PUBLIC_API_URL` is wrong |

**Key files:** `apps/server/src/scripts/seed-admin.ts` (the seed),
`apps/server/src/config/auth.ts` (auth setup),
`apps/server/src/shared/middleware/require-admin.ts` (the admin gate).
