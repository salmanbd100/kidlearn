# 31 — Admin Auth & CMS Foundation

> **Estimated effort:** 3–4 hours
> **Depends on:** 08, 13
> **Requirement IDs:** spec §4.3, FR-CMS-01 (shell), FR-CMS-07 (basic)
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Stand up the administrator surface that files 32–37 build inside: email+password credential auth for internal admins (kept as a **separate principal** from Google-authenticated parents), a `requireAdmin` Express middleware that rejects parent sessions outright, a seed script (`pnpm --filter server seed:admin`) since admins never self-register, the `/admin` route group with its own desktop-first plain layout (sidebar: Curriculum, Stories, Media, Badges, AI Queue, Analytics — completely separate from the kid visual language), placeholder pages for every sidebar section, and the first real admin feature: a basic platform analytics page backed by `GET /api/admin/analytics/overview` (FR-CMS-07 basic).

## Context & Current State

- File 03 delivered the `AdminUser` Prisma model (separate from `Parent` — spec §4.3 keeps roles disjoint); file 06 added its `aiReviews` back-relation. No admin can authenticate yet.
- File 09 runs better-auth on Express (Prisma adapter, cookie sessions) configured for Google-only parent sign-in; file 08 gives the route/envelope/`ApiError`/`validate` patterns and Zod-parsed env.
- File 13 created `app/(admin)/layout.tsx` with `data-theme="parent"` but no pages; shadcn/ui primitives live in `packages/ui` (file 14 precedent) and are acceptable on admin/parent surfaces.
- File 27's `rangeBounds(range, now, tz)` helper exists for `APP_TIMEZONE` day/week edges; `SessionEvent` rows (`childId`, `occurredAt`) and `LessonProgress.completedAt` exist for counting.
- File 32 (already specced) assumes from this file: `requireAdmin` populating `req.admin` (with `.id`), admin sessions riding the file-09 auth, the `/admin` sidebar layout with a Curriculum section, and `apps/web/lib/admin-api.ts` to extend.

## Detailed Requirements

1. **Auth decision (binding) — same better-auth instance, credential plugin, signup disabled.** Enable better-auth's `emailAndPassword` on the existing file-09 instance with `disableSignUp: true`; admins exist as better-auth users **linked** to an `AdminUser` row via a new `authUserId String? @unique` column (additive migration). `requireAdmin` = valid session **and** an `AdminUser` row for `session.user.id`.
   - *Why this over a second better-auth instance:* one session store, one cookie, one CORS/cookie-domain configuration, zero hand-rolled crypto; the parent/admin separation is enforced by the `AdminUser` lookup, not by infrastructure.
   - *Tradeoff accepted:* parents and admins share the better-auth `user` table. Mitigations: password signup is disabled (only the seed script creates credential accounts), Google users never get an `AdminUser` row, and `requireParent` (file 09) keeps requiring a `Parent` row — so an admin session is rejected by parent routes and vice versa. The rejected alternative (hand-rolled credential route + separate signed admin cookie) is documented in a code comment for the Phase-2 reviewer.
2. **Separate principals (§4.3)** — `requireAdmin` returns `401 UNAUTHORIZED` with no session and `403 FORBIDDEN` for any authenticated session lacking an `AdminUser` row (i.e. every parent). Conversely, admin accounts have no `Parent` row, so `requireParent` rejects them — assert both directions in tests.
3. **Seed script** — `pnpm --filter server seed:admin` runs `tsx src/scripts/seed-admin.ts`: reads `ADMIN_EMAIL`, `ADMIN_PASSWORD` (min 12 chars — refuse shorter), `ADMIN_NAME` from env, creates the better-auth credential user via the server-side API (`auth.api.signUpEmail` invoked internally before `disableSignUp` is consulted, or better-auth's admin-create path — verify against the installed version in step 2), then upserts the linked `AdminUser` row. Idempotent: re-running with an existing email updates the link and exits 0.
4. **Admin login UI** — `/admin/login`: plain email + password form posting to better-auth's `POST /api/auth/sign-in/email` (via `lib/admin-api.ts`), inline error on bad credentials, redirect to `/admin/analytics` on success. No "sign up" or "forgot password" links at MVP (admins are seeded; resets happen by re-running the seed).
5. **Admin layout (FR-CMS-01 shell)** — `app/(admin)/admin/layout.tsx` inside file 13's `(admin)` group: fixed left sidebar with exactly six items — **Curriculum** (`/admin/curriculum`), **Stories** (`/admin/stories`), **Media** (`/admin/media`), **Badges** (`/admin/badges`), **AI Queue** (`/admin/ai-queue`), **Analytics** (`/admin/analytics`) — active-item highlight, the signed-in admin's name + sign-out at the bottom. Desktop-first (sidebar collapses to a top bar under 768px — admins use laptops; don't over-invest), plain shadcn/ui styling, `data-theme="parent"`, **no kid fonts, mascots, or oversized buttons**. An `AdminGuard` client boundary checks `GET /api/admin/me` and redirects to `/admin/login` when unauthenticated; `/admin` redirects to `/admin/analytics`.
6. **Placeholder pages** — one page per non-analytics section rendering the section title + "Coming in file NN" (Curriculum → 32, Stories/Media/Badges → 33, AI Queue → 34–37). They exist so the sidebar never 404s and later files replace content, not routing.
7. **Basic analytics (FR-CMS-07 basic)** — `GET /api/admin/analytics/overview` behind `requireAdmin`:
   ```json
   { "data": { "totalParents": 0, "totalChildren": 0, "lessonsCompletedThisWeek": 0, "dauToday": 0, "generatedAt": "…" } }
   ```
   `lessonsCompletedThisWeek` counts `LessonProgress.completedAt` within the current `APP_TIMEZONE` week (file 27's `rangeBounds("week", …)`); `dauToday` counts **distinct children** with ≥1 `SessionEvent` today. `/admin/analytics` renders the four numbers as plain stat cards with a refresh button. Detailed analytics are Phase 2 — resist adding charts.
8. **`GET /api/admin/me`** — returns `{ data: { id, name, email } }` for the session admin (401/403 per requirement 2); consumed by `AdminGuard` and the sidebar footer.
9. **Tests** — Supertest: `requireAdmin` rejects no-session (401) and parent-session (403) and passes admin-session; analytics endpoint returns exact counts on fixture data (2 parents, 3 children, seeded completions/events); seed-script idempotency exercised via its exported function.

## Technical Approach & Suggestions

**Server files** (`/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/lib/auth.ts                        # modify file-09 config: emailAndPassword { enabled: true, disableSignUp: true }
src/middleware/require-admin.ts        # session → AdminUser lookup → req.admin
src/routes/admin/index.ts              # adminRouter: /me, /analytics/overview (files 32+ mount more here)
src/routes/admin/admin.test.ts         # guard + analytics Supertest
src/services/admin-analytics.ts        # getOverview() — counts via Promise.all
src/scripts/seed-admin.ts              # exported seedAdmin(opts) + CLI entry
package.json                           # + "seed:admin": "tsx src/scripts/seed-admin.ts"
packages/db/prisma/schema.prisma       # AdminUser + authUserId String? @unique (migration: admin_auth_link)
```

`require-admin.ts` (Express 5; mirrors file 09's `requireParent` shape):

```ts
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { getSession } from "../lib/auth"; // file 09's session reader

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const session = await getSession(req);
  if (!session) return next(ApiError.unauthorized());
  const admin = await prisma.adminUser.findUnique({ where: { authUserId: session.user.id } });
  if (!admin) return next(ApiError.forbidden("Admin access required"));
  req.admin = { id: admin.id, name: admin.name, email: admin.email }; // declare via Express namespace augmentation in src/types.d.ts
  next();
}
```

`admin-analytics.ts`:

```ts
export async function getOverview(now = new Date()) {
  const day = rangeBounds("today", now, env.APP_TIMEZONE);
  const week = rangeBounds("week", now, env.APP_TIMEZONE);
  const [totalParents, totalChildren, lessonsCompletedThisWeek, activeToday] = await Promise.all([
    prisma.parent.count(),
    prisma.childProfile.count(),
    prisma.lessonProgress.count({ where: { completedAt: { gte: week.from, lt: week.to } } }),
    prisma.sessionEvent.findMany({
      where: { occurredAt: { gte: day.from, lt: day.to } },
      distinct: ["childId"], select: { childId: true },
    }),
  ]);
  return { totalParents, totalChildren, lessonsCompletedThisWeek, dauToday: activeToday.length, generatedAt: now.toISOString() };
}
```

`seed-admin.ts` exports `seedAdmin({ email, password, name })` (testable without spawning a process): create-or-find the credential user through better-auth's server API, then `prisma.adminUser.upsert({ where: { email }, update: { authUserId }, create: { email, name, authUserId } })`. The CLI entry validates env vars and prints the admin email on success — never the password.

**Web files** (`/Users/salmanrahman/Documents/kidlearn/apps/web/`):

```
app/(admin)/admin/layout.tsx           # sidebar shell + <AdminGuard>
app/(admin)/admin/page.tsx             # redirect("/admin/analytics")
app/(admin)/admin/login/page.tsx
app/(admin)/admin/analytics/page.tsx
app/(admin)/admin/{curriculum,stories,media,badges,ai-queue}/page.tsx   # placeholders
components/admin/sidebar.tsx
components/admin/admin-guard.tsx
components/admin/stat-card.tsx         # plain — do not reuse the parent dashboard's themed card
components/admin/sidebar.test.tsx      # active item, six entries
lib/admin-api.ts                       # adminFetch (apiFetch preset), signIn, signOut, getMe, getAnalyticsOverview — file 32 extends this
```

Admin strings may stay English-only at MVP (internal tool; FR-I18N covers child/parent surfaces) — note this in a comment rather than wiring a new locale namespace. Sign-in posts `{ email, password }` to `${NEXT_PUBLIC_API_URL}/api/auth/sign-in/email` with `credentials: "include"`, matching the parent cookie flow.

## Step-by-Step Plan

1. Migration: add `authUserId String? @unique` to `AdminUser`; `pnpm db:migrate` (name `admin_auth_link`) + `pnpm db:generate`. (~15 min)
2. Enable `emailAndPassword { enabled: true, disableSignUp: true }` in the better-auth config; verify against the installed better-auth version how to create credential users server-side despite `disableSignUp` (internal API vs. temporary flag inside the seed) and write `seedAdmin()` + the CLI entry + `package.json` script. Test: run twice, one `AdminUser` row, sign-in works via `curl`. (~35 min)
3. Write failing Supertest specs for `requireAdmin` + `GET /api/admin/me`: no session → 401, parent session → 403, seeded admin session → 200 with id/name/email; also assert a parent route returns 403 for the admin session (principal separation both ways). (~25 min)
4. Implement `require-admin.ts` (+ `req.admin` type augmentation) and `routes/admin/index.ts` with `/me`; green. (~20 min)
5. Write failing Supertest specs for `/api/admin/analytics/overview` on fixtures: 2 parents, 3 children, 2 lesson completions this week + 1 last week, session events for 2 distinct children today → expect `{2,3,2,2}`. Implement `admin-analytics.ts` + route; green. (~30 min)
6. Build `/admin/login` + `lib/admin-api.ts` (signIn/getMe) + `AdminGuard`; manual check: bad password shows inline error, good login lands on analytics. (~25 min)
7. Build the sidebar layout (six items, active state, sign-out), the five placeholder pages, and the root `/admin` redirect; RTL test for the sidebar. (~30 min)
8. Build the analytics page (four stat cards + refresh); manual pass: parent account visiting `/admin/*` gets bounced to `/admin/login` and its session is rejected by the API (403); `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update tracker. (~25 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: `requireAdmin` 401/403/200 matrix, both directions of principal separation, analytics fixture counts, `/api/admin/me`.
- [ ] `pnpm --filter web test` passes the sidebar suite (six exact sections, active highlight).
- [ ] `ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_NAME=… pnpm --filter server seed:admin` exits 0 twice and yields exactly one `AdminUser` row linked via `authUserId`; the password never appears in output.
- [ ] No self-service admin signup exists: `POST /api/auth/sign-up/email` is rejected (disableSignUp) and the login page has no signup affordance.
- [ ] A Google-authenticated parent session receives `403 FORBIDDEN` from every `/api/admin/*` route; an admin session receives 403 from parent-only routes (§4.3).
- [ ] `GET /api/admin/analytics/overview` returns the documented envelope; `/admin/analytics` renders the four numbers (FR-CMS-07 basic).
- [ ] All six sidebar routes render (placeholders included) with the plain desktop-first admin look — no kid theme tokens, fonts, or mascots anywhere under `/admin`.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.

## Out of Scope

- Curriculum CRUD, status transitions, and the three-pane tree — file 32 (it mounts under this file's `adminRouter` and extends `lib/admin-api.ts`).
- Media upload, quiz/activity/badge editors, lesson preview — file 33; story management — files 33/35/37.
- The AI pipeline, job model APIs, and review queue — files 34–37 (the AI Queue placeholder just reserves the route).
- Detailed analytics (per-subject usage, retention curves, charts) — Phase 2 per FR-CMS-07.
- Admin password reset flows, 2FA, and role tiers (single flat admin role at MVP); rate limiting on the login route lands with file 38's hardening pass.
