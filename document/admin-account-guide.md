# KidLearn — Admin Account Guide

> **Who this is for:** anyone who needs an administrator account — to build curriculum, review AI content, or set one up on a deployed server. No prior knowledge of the auth code is assumed.
>
> **Related:** [`user-journey-manual.md §6`](./user-journey-manual.md#6-admin-journey) is the full narrative of what an admin does. [`implementation/31-admin-auth-cms-foundation.md`](./implementation/31-admin-auth-cms-foundation.md) is the spec this behaviour comes from. [`project-requirement-details.md §9`](./project-requirement-details.md#9-deployment-strategy-vercel-frontend--single-aws-box) is the deployment design Part 2 follows.

---

## Table of contents

1. [What an admin account actually is](#1-what-an-admin-account-actually-is)
2. [Part 1 — Create an admin in local development](#2-part-1--create-an-admin-in-local-development)
3. [Part 2 — Create an admin on a deployed server](#3-part-2--create-an-admin-on-a-deployed-server)
4. [Part 3 — Using the admin account (the admin journey)](#4-part-3--using-the-admin-account-the-admin-journey)
5. [Troubleshooting](#5-troubleshooting)
6. [Where everything lives](#6-where-everything-lives)

---

## 1. What an admin account actually is

There is **no sign-up page for admins**. Password registration is switched off for every caller (`emailAndPassword.disableSignUp: true` in `apps/server/src/config/auth.ts`), so the seed script is the only way an administrator comes into existence. That is deliberate: an admin can publish content to children, so the account cannot be self-served.

One admin is **three rows in the database**, all written by one command:

| Row | Table | What it holds |
|---|---|---|
| Identity | `user` | Email (always lower-cased), name, `emailVerified: true` |
| Credential | `account` | `providerId: "credential"` plus the scrypt password hash — the only password anywhere in the product |
| Authorisation | `AdminUser` | Email, name, `role: "admin"`, and `authUserId` pointing at the identity row |

Both halves are needed. The `user` + `account` pair lets you **sign in**; the `AdminUser` row is what lets you **through the door**. A signed-in person with no `AdminUser` row — a parent, for instance — gets `403 Admin access required` from every `/api/admin/*` path.

Parents are the mirror image: they sign in with Google and have no password. The two account types never overlap.

---

## 2. Part 1 — Create an admin in local development

### 2.1 Before you start

You need the monorepo installed, the database reachable, and a complete server environment file.

```bash
pnpm install

# Copy the two env templates and fill them in:
#   apps/server/.env.example  →  apps/server/.env
#   packages/db/.env.example  →  packages/db/.env

pnpm db:generate
pnpm --filter @kidlearn/db build   # the seed imports @kidlearn/db
pnpm db:migrate                    # creates the tables; needs DIRECT_URL
```

**The one thing that surprises everybody:** the seed script imports the server's config, so the **entire** boot-time environment schema is validated before it does anything. A missing `CRON_SECRET`, `CLOUDINARY_*`, `GEMINI_API_KEY` or `GOOGLE_TTS_API_KEY` stops the seed even though it never uses them. If you only want to create an admin locally, any non-empty placeholder satisfies those; `DATABASE_URL` and `BETTER_AUTH_SECRET` (≥ 32 characters) are the two that must be real.

**Which database gets the admin:** the one named by `DATABASE_URL` in the **`apps/server`** environment file. The script runs with `apps/server` as its working directory, so that is the file it loads — not the one in `packages/db`. If the two point at different databases, the admin lands in the server's one.

### 2.2 Create the admin

Pass the three values inline so the password never lands in a file:

```bash
ADMIN_EMAIL=you@example.com \
ADMIN_PASSWORD='a-long-local-password' \
ADMIN_NAME='Your Name' \
  pnpm --filter server seed:admin
```

Expected output:

```
Created admin you@example.com (3f0c…).
```

Rules the script enforces:

- **`ADMIN_PASSWORD` must be at least 12 characters.** These accounts have no second factor, so the floor is checked by both the script and better-auth.
- **Email is lower-cased.** `You@Example.com` and `you@example.com` are the same admin.
- **Running it twice is safe.** Re-running with the same email leaves exactly one of each row and *replaces the password*. The output says `Updated` instead of `Created`.

### 2.3 Sign in

```bash
pnpm dev     # web on :3000, server on :4000
```

Open **http://localhost:3000/admin/login** and enter the email and password.

What happens behind the scenes: the login screen posts to `http://localhost:4000/api/auth/sign-in/email`, the API sets an httpOnly session cookie, and you land on `/admin/analytics`. Locally you need no frontend environment variable — `NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000`.

The web and API origins must agree, or the browser will refuse the request: `WEB_ORIGIN` on the server has to be exactly `http://localhost:3000`.

### 2.4 Check it worked

Without opening a browser:

```bash
curl -i -X POST http://localhost:4000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"a-long-local-password"}'
```

A `200` with a `Set-Cookie` header means the **credential** is good. Send that cookie to `GET /api/admin/me` to confirm the **authorisation** half:

```bash
curl -s http://localhost:4000/api/admin/me -b 'better-auth.session_token=<token from the cookie>'
```

Easier still: the API reference at **http://localhost:4000/docs** has a **Send** button that reuses your browser session, so there is no token to copy.

### 2.5 Everyday variations

| You want to… | Do this |
|---|---|
| Change or reset a password | Re-run the same command with a new `ADMIN_PASSWORD`. **There is no self-service reset flow** — this is it. |
| Add a second admin | Run it again with a different `ADMIN_EMAIL`. There is no limit and no invite flow. |
| Remove an admin | Delete the `AdminUser` row (`pnpm db:studio`). They can still sign in but every admin path answers `403`. |
| Reset local content | `pnpm db:seed` seeds a dev parent and sample content. It deliberately creates **no admin** — a password in a committed seed file is one nobody ever rotates. |

---

## 3. Part 2 — Create an admin on a deployed server

> **Status note:** the deployment in §9 — Vercel frontend, both APIs on one AWS box — is specified in `implementation/38-deployment-aws-docker.md` but **not built yet** (`implementation/00-progress-tracker.md`, file 38). Treat this section as the procedure to follow when that deployment lands; the principles and the command do not change.

### 3.1 The short version

**You create a production admin from your own machine, pointed at the production database.** You do not log into the server, and you do not put the admin credentials into the deployment.

That sounds surprising, so here is why:

- The seed only writes database rows. It does not need to run where the API runs.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME` are therefore **never** stored in SSM Parameter Store, in Vercel project settings, in `/opt/kidlearn/<env>/app.env`, or in the repository. A password sitting in a deployment's environment is a credential nobody rotates — and the API does not read these three variables at all.
- The password hash is scrypt with its own random salt. It does not depend on `BETTER_AUTH_SECRET`, so rotating that secret signs everyone out but leaves passwords working.

### 3.2 Step by step

**1. Apply migrations first.** The tables must exist before the seed can write to them.

```bash
# DIRECT_URL = the session-mode connection (:5432), never the pooler
pnpm --filter @kidlearn/db exec prisma migrate deploy
```

Use `migrate deploy`, never `migrate dev`, against a real database.

**2. Prepare a throwaway environment for the seed.** In a temporary copy of the server environment file, set `DATABASE_URL` to the **production** pooled connection string (`:6543`, `?pgbouncer=true` for Supabase). The other required variables only have to satisfy the schema — the seed writes nothing that uses them — so placeholders are acceptable and preferable to copying real production secrets onto a laptop.

**3. Create the admin.** Same command, real password:

```bash
ADMIN_EMAIL=admin@kidlearn.net \
ADMIN_PASSWORD='<from your password manager, 12+ characters>' \
ADMIN_NAME='Content Admin' \
  pnpm --filter server seed:admin
```

**4. Delete the throwaway file**, and make sure the password exists only in your password manager. Shell history is a real leak here — a leading space (`  ADMIN_...`) keeps the line out of history in `zsh` with `HIST_IGNORE_SPACE`, or clear the entry afterwards.

**5. Sign in and confirm.** Go to `https://kidlearn.net/admin/login` (or `https://dev.kidlearn.net/admin/login`). You should land on the analytics page. If sign-in succeeds but every page bounces, see [Troubleshooting](#5-troubleshooting).

### 3.3 Rules that must hold in production

| Rule | Why |
|---|---|
| Each environment gets its own admin | Production and dev use separate databases with no shared credential. An admin created against dev does not exist in production. |
| Never reuse a local password | Local passwords are typed in front of people and stored in shell history. |
| `ENABLE_API_DOCS` stays `false` in production | `/docs` describes the whole API surface, and **Send** works off a live admin session. |
| Admin credentials are not a deployment variable | Nothing in the running system reads `ADMIN_*`. Adding them to SSM or Vercel only creates a secret to leak. |
| Rotating an admin password = re-running the seed | No reset email, no reset link. Document who holds the account. |

---

## 4. Part 3 — Using the admin account (the admin journey)

> Full detail, with diagrams, is in [`user-journey-manual.md §6`](./user-journey-manual.md#6-admin-journey). This is the practical walkthrough.

### 4.1 The workspace

Signing in lands you on **Analytics**. A fixed left sidebar (a top bar on narrow screens) holds six sections, and **Sign out** is in the shell:

| Section | Route | What you do there |
|---|---|---|
| **Curriculum** | `/admin/curriculum` | Build and reorder Subjects → Topics → Lessons; edit lessons per language; attach an activity and a quiz |
| **Stories** | `/admin/stories` | Manage the story library — pages, translations, illustrations, narration |
| **Media** | `/admin/media` | Upload video, audio and images; browse the asset library |
| **Badges** | `/admin/badges` | Define badges — name, icon, and the rule that earns them |
| **AI Queue** | `/admin/ai-queue` | Review everything the AI generated. The sidebar shows a live count of items waiting |
| **Analytics** | `/admin/analytics` | The platform counters |

The CMS is deliberately plain and desktop-first — the opposite of the child surface.

### 4.2 The one rule behind every screen

All content, whether a person or the AI wrote it, moves through one status machine:

```
draft → in_review → approved → published
              ↘ rejected → (back to draft to try again)
```

**Children only ever see `published` content.** Every student-facing query filters to it, so a draft cannot leak. There is no shortcut from `rejected` straight to `published` — rejected content has to earn approval again.

### 4.3 Flow A — authoring a lesson by hand

1. **Curriculum** → pick or create a Subject, then a Topic.
2. Create a Lesson. Fill in the English and Bangla tabs: title, intro script, narration script, world, grade levels, video URLs.
3. **Media** → upload the video or audio you need; attach the registered asset to the lesson. Files go straight from your browser to Cloudinary — no byte passes through our server.
4. Build the **activity** and the **quiz** in their editors. Both validate as you type and show a **live preview using the exact component the child will see**.
5. Walk the lesson through the statuses and **publish**. It is now visible to students in that grade.

### 4.4 Flow B — reviewing AI content (the important one)

This is the safety gate, and the main reason admin accounts are locked down.

1. A generator is run (lesson, story, quiz, narration audio, or illustration). It saves the result as **draft** content and creates a job with status `awaiting_review`. **Nothing is ever auto-published.**
2. **AI Queue** → filter by type, language or grade, and open a job. Read the text, listen to the audio, look at the images.
3. Choose one of three outcomes:

| Decision | What happens |
|---|---|
| **Approve** | The content is walked through to `published` and becomes visible to children |
| **Edit, then approve** | The editor opens pre-filled; fix it, save, publish. Logged as `edit_then_approve` |
| **Reject** | A reason of at least 10 characters is required. The content is marked `rejected` and never shown |

4. Publishing is **blocked** while a story still holds placeholder images — you have to replace them first.

**The hard invariant:** AI-originated content cannot reach `published` without a recorded human `approve` or `edit_then_approve` decision. It is enforced on the server and there is no bypass. Every decision records who made it, when, and why.

Daily generation caps (`AI_TEXT_JOBS_PER_DAY` and friends) exist because one click can mean many provider calls. Hitting one returns `429 RATE_LIMITED` and the counter resets at local midnight in `APP_TIMEZONE`.

### 4.5 What an admin cannot do

| Not possible | Why |
|---|---|
| See a child's personal data | The CMS has no parent or child records. Analytics are aggregate counters only |
| Sign in with Google | Admins are password-only; parents are Google-only |
| Create another admin from the UI | There is no invite flow. Only the seed script |
| Reset their own password | No reset flow. Someone re-runs the seed |
| Publish AI content without reviewing it | Blocked server-side |

---

## 5. Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| `Cannot seed an admin. Fix these variables:` | One of the three `ADMIN_*` values is missing or invalid | The message names the offending field. Passwords under 12 characters fail here |
| The seed fails naming `CRON_SECRET`, `CLOUDINARY_*`, `GEMINI_API_KEY`… | The whole server env schema is validated on import | Fill in the server environment file. Placeholders are fine for values the seed does not use |
| Login says *"Those details did not match an administrator account"* | Wrong password, or no `user` row for that email | Re-run the seed with a known password. Remember the email is lower-cased |
| Login works but the CMS bounces you back | A session exists but there is no matching `AdminUser` row — the API returns `403` | Re-run the seed; it re-asserts the link on every run. That is exactly what repairs it |
| `401` from `/api/admin/*` | No session cookie reached the API | Check `WEB_ORIGIN` matches the site origin exactly, and that `NEXT_PUBLIC_API_URL` points at the right API |
| The admin exists but not in the database you expected | The seed used `DATABASE_URL` from the `apps/server` environment file | Point that file at the right database and run it again |
| `403` on `/api/admin/jobs/*` with a valid admin session | That path is not session-guarded — it authenticates with `CRON_SECRET` | Use the bearer token, not a login. It is the scheduler's endpoint, not an admin one |

---

## 6. Where everything lives

| File | Role |
|---|---|
| `apps/server/src/scripts/seed-admin.ts` | The seed script — the only way an admin is created |
| `apps/server/package.json` | The `seed:admin` script entry |
| `apps/server/src/config/auth.ts` | better-auth setup; password sign-up disabled; the 12-character floor |
| `apps/server/src/shared/middleware/require-admin.ts` | The gate on every `/api/admin/*` route (`401` vs `403`) |
| `apps/server/.env.example` | Every environment variable, with setup notes for each credential |
| `apps/web/app/(admin)/admin/login/AdminLoginScreen.tsx` | The login form |
| `apps/web/features/admin/admin-routes.ts` | The CMS routing table and sidebar |
| `packages/db/prisma/schema.prisma` | `AdminUser`, `user`, `account`, `session` models |
| `document/implementation/31-admin-auth-cms-foundation.md` | The spec behind all of the above |
