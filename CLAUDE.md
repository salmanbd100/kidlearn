# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`kidlearn` is a **pnpm + Turborepo monorepo** — an educational platform for early learners (ages 3–6) with a dual-portal architecture: a gamified Student Portal and a Parent Dashboard. The master requirements are in `document/project-requirement-details.md`; the design system is in `document/design.md`.

## Commands

Run from the repo root:

```bash
pnpm install          # install all workspaces (pnpm 9)
pnpm dev              # turbo run dev — starts web (port 3000) + server (port 4000) together
pnpm build            # turbo run build — caches .next/** and dist/**
pnpm lint             # biome check . + prisma format --check — lint, format-check, import sort (no writes)
pnpm format           # biome check --write . + prisma format — apply the fixes
pnpm typecheck        # turbo run typecheck  — runs tsc --noEmit per package
```

Database (delegates to `packages/db`):

```bash
pnpm db:generate      # prisma generate
pnpm db:migrate       # prisma migrate dev (needs DIRECT_URL)
pnpm db:studio        # prisma studio
pnpm --filter @kidlearn/db db:seed   # dev parent, child, sample curriculum (idempotent)
```

Admin accounts have no sign-up page — the seed script is the only way one is created
(`document/admin-account-guide.md`):

```bash
ADMIN_EMAIL=… ADMIN_PASSWORD='…' ADMIN_NAME='…' pnpm --filter server seed:admin
```

API docs (server must be running — see `/docs` at http://localhost:4000/docs):

```bash
pnpm --filter server openapi:write   # emit apps/server/openapi.json (gitignored) for Postman / codegen
```

**`typecheck` depends on `^build`** — `packages/db` must be built before `apps/server` can typecheck.

**Linting is Biome** — no ESLint anywhere. Biome runs repo-wide from the root; apps have no per-package `lint` scripts.

**Vitest runs in every package that has code to test** — `pnpm test` is `turbo run test`. Note that `pnpm test --force` fails (pnpm parses `--force` itself); use `pnpm turbo run test --force` to bypass the Turbo cache.

Per-app work:

```bash
cd apps/web && pnpm dev        # next dev → http://localhost:3000
cd apps/server && pnpm dev     # tsx watch → http://localhost:4000
```

## CI

`.github/workflows/ci.yml` runs one job, `gates`, on every pull request and every push to `main` or `dev`:

```
pnpm install --frozen-lockfile
pnpm lint
pnpm build            # ^build is required before typecheck and test resolve
pnpm typecheck
pnpm test:coverage    # same suite as pnpm test, plus a coverage report
pnpm --filter server test:db   # *.db.test.ts against the Postgres service
```

**A PR is not done until `gates` is green** — `gh pr checks` says whether it is. Coverage is reported in the run summary and as an artifact; it is deliberately not gated on a threshold (see `document/standards/general.md §5`).

`gates` is a *required* status check on `main` and `dev` — ruleset 17802318 also requires a pull request and forbids force-pushes and deletion on both. The repository-admin role can bypass it, so it is a speed bump, not a wall (`document/standards/general.md §6`).

CI needs no secrets. `apps/server/vitest.setup.ts` supplies everything `config/env.ts` requires, and `pnpm test` opens no database connection. The real-database suites (`*.db.test.ts`) are a separate step, `pnpm --filter server test:db`, against a `postgres:16-alpine` service container — locally, `docker compose up -d postgres` and set `TEST_DATABASE_URL` if your port differs from 5432. The harness refuses any database not named `*_test`. Rules in `document/standards/general.md §5`.

## Testing

- **Server suites mostly stub Prisma.** 35 `apps/server` test files `vi.mock` the client; that is a recorded exception in `document/standards/general.md §5`, with rules a new stubbed suite must follow and cite. Anything a stub cannot prove — the `status` gate on `include`d relations, cascades, unique constraints, transaction races — belongs in a `*.db.test.ts` using the harness in `apps/server/src/shared/testing/`.
- **Every successful response in a route test goes through `assertContract`** (`apps/server/src/openapi/assert-contract.ts`) against its schema in `packages/types/src/api/`.
- **An undocumented route fails the suite** — `src/openapi/coverage.test.ts`, see API documentation below.

## Where decisions live

- **Deployment** — web on Vercel, API + jobs on one AWS EC2 box behind Caddy (`deploy/`). `document/go-live-guide.md` is the first-time walkthrough, `document/runbook.md` the day-two operations.
- **`document/mobile-app-plan.md`** is the architecture of record for what is and is not shared between web and mobile. `packages/ui` is web-only by design (§4.2) — do not hoist `apps/web` components into it without a second consumer.

## Layout & current state

```
apps/
  web/        Next.js 16 (App Router) + React 19 + Tailwind CSS v4
    app/          routing only — route groups, pages, layouts, screens
    features/     one directory per domain, mirroring the server's modules
    shared/       api/ components/ hooks/ lib/ — the second consumer's home
  server/     Express 5 + TypeScript (ESM, tsx dev) — REST API
    modules/      one directory per domain: .routes / .schema / .service / .middleware
    shared/       middleware, errors, utils, types — never imports a module
    config/       configured singletons: env, prisma, auth, logger
    openapi/      the assembled OpenAPI document
packages/
  ui/         @kidlearn/ui — shared React component library (Radix + shadcn primitives)
  db/         @kidlearn/db — Prisma schema + client (Supabase/PostgreSQL)
  types/      @kidlearn/types — versioned content payloads + HTTP contracts
  config/     @kidlearn/config — shared tsconfig bases, no source
  i18n/       @kidlearn/i18n — en/bn UI strings, namespaces, locale helpers (shared with mobile)
  tokens/     @kidlearn/tokens — design-token values as TypeScript (shared with mobile)
deploy/       production scripts (deploy, bootstrap, backup, weekly-reports) + Caddy edge config
docker/       local Postgres init scripts
document/     requirements, design, standards, implementation specs, deploy guides
```

- **`apps/web`** — Next.js 16 App Router. `app/` is routing only, split into four route groups: `(site)`, `(student)`, `(parent)`, `(admin)` (see Architecture). Everything else lives in `features/<domain>/` (named after the server module — `features/site/` is the one web-only exception) or `shared/{api,components,hooks,lib}/`. Path alias `@/*` maps to the app root; there are no barrel files, so imports name the file (`@/features/quiz/QuizEngine`). Tailwind v4 via `postcss.config.mjs` (no `tailwind.config`). Imports `@kidlearn/ui`. Read `apps/web/AGENTS.md` before writing Next.js code — v16 has breaking changes from prior versions.
- **`apps/server`** — Express 5 ESM, port 4000. Imports `@kidlearn/db`. Copy `packages/db/.env.example` → `packages/db/.env` (Supabase connection strings) before running.
- **`packages/db`** — Prisma 6 against Supabase PostgreSQL. Entry: `src/index.ts` exports `prisma` singleton + all Prisma types. Schema: `Parent` ↔ `Child[]`. Runtime uses the pooled `DATABASE_URL` (port 6543, `?pgbouncer=true`); migrations use `DIRECT_URL` (port 5432).
- **`packages/ui`** — shadcn/ui "new-york" style. `src/primitives/` holds copied shadcn components (own the code — no upstream dependency). `src/styles/tokens.css` is the token contract; its `@generated` regions come from `@kidlearn/tokens` — change a value in `packages/tokens/src/index.ts`, run `pnpm --filter @kidlearn/ui tokens:generate`, never edit a region by hand (a test fails if the two disagree, and another if `design.md`'s tables disagree with the TypeScript). `src/lib/` is `cn()` plus the a11y preference store; `src/hooks/` is `useIsMotionReduced`. No build step — exports raw TypeScript via `exports` map.

## Architecture

### Dual-portal & theming

The app has three product surfaces and one public site, sharing one component library:
- **Public site** `(site)` — the homepage at `/` and the parent, admin and engineering guides at `/guide/*` (FR-SITE-01..03). Unauthenticated, `<ThemeScope theme="kid">`, every string in the `site` i18n namespace. It is **not** part of the Student Portal: it links out to GitHub, which NFR-SAFE-07 forbids on the child's surface, so no `(student)` screen may link to a `(site)` route — `app/(student)/no-external-links.test.tsx` fails if one does.
- **Student Portal** `(student)` — ages 3–5, visual-first, large touch targets (≥64px), no text below 20px, gamified. Wrap the layout boundary in `<ThemeScope theme="kid">` from `@kidlearn/ui`.
- **Parent Dashboard** `(parent)` — dense, professional, reached from the signed-in Google session. `<ThemeScope theme="parent">`. A bare `data-theme` div is not enough: Radix dialogs and menus portal into `<body>`, outside it, and only `ThemeScope` carries the theme to them.
- **Admin CMS** `(admin)` — curriculum, media, stories, badges, the AI review queue and analytics, behind a grouped sidebar. Shared CMS pieces (`AdminPageHeader`, `AdminEmptyState`, `AdminFilterChip`, `StatusChip`, …) live in `features/admin/`.

Parent and admin sign-in are dialogs on the homepage, opened by `?signin=parent` (`PARENT_ROUTES.login`) and `?signin=admin` (`ADMIN_ROUTES.login`); `/admin/login` only redirects there. The Student Portal never uses either — a signed-out student session goes to `/parent/login` (`PARENT_ROUTES.signInPage`), the same sign-in on a bare page with no site chrome. Full rules: `document/standards/frontend.md §3` "Route organisation".

Token values swap at runtime via CSS variables (`--primary`, `--background`, etc.) — components never branch on theme in JS.

### Content-as-data

Activities (drag-drop, trace, match, puzzle) and quizzes are stored as versioned `JSONB` payloads in Postgres. The frontend ships generic engines that render whatever the JSON describes. New content is data, not code. Shared schemas live in `packages/types` — `src/activity/` and `src/quiz/` for the payloads, `src/api/` for the HTTP contracts, `src/domain/` for the vocabulary both sides share.

### Progress is server-authoritative

Rewards, streaks, screen time, and lesson completion are computed server-side. The client reports events; the server records and validates them — it enforces step order, requires evidence before paying a lesson completion, rate-limits client events, and refuses progress and event writes without current parental consent.

### Auth and sessions

better-auth, configured in `apps/server/src/config/auth.ts`. Parents sign in with Google only, via `GET /api/auth/google` (better-auth's own `/sign-in/social` is `POST`-only). Admins sign in with a password; their sessions are capped at 12 hours from creation and do not slide, unlike a parent's 30-day session. Account linking is off so a Google sign-in on the admin's address cannot inherit the admin user. `rejectCrossOriginWrites` (`shared/middleware/security.ts`) refuses state-changing requests whose `Origin` is not `WEB_ORIGIN` or `BETTER_AUTH_URL` — the same single `WEB_ORIGIN` that CORS and better-auth's `trustedOrigins` allow, so the web app has exactly one origin per environment.

### API documentation

The server assembles an OpenAPI 3.0 document at boot from `apps/server/src/openapi/`, served as a Scalar API reference at `/docs` and raw at `/docs.json` (always outside production; in production only with `ENABLE_API_DOCS=true`). Read `/docs` before writing any client code against the API. **Send** on that page works off the Google session with no token to paste — Scalar never sets `credentials`, so its requests take the `same-origin` default and the browser attaches the session cookie itself. That holds only because `/docs` shares an origin with `/api/*`; do not set a `proxyUrl`.

Nothing in the document is hand-written twice: request schemas are the Zod objects the routes already validate with (each module's `<domain>.schema.ts`), response schemas are Zod in `packages/types/src/api/` and shared with `apps/web`. **A new endpoint must be registered in `src/openapi/paths/<resource>.ts` in the same change** — `src/openapi/coverage.test.ts` walks the live Express routers and fails the suite otherwise. It also needs a unique `operationId`, and a new tag needs an `x-tagGroups` group in `components.ts` (a tag no group names is silently dropped from the sidebar); `src/openapi/document.test.ts` asserts both. Successful responses are asserted against their schemas in the route tests via `assertContract`, and the hand-written examples in `src/openapi/examples.ts` are parsed against theirs. Full rules in `document/standards/backend.md §7`.

### Publishing workflow

All content has a `status` field (`draft → in_review → approved/rejected → published`). Student-facing queries filter to `published` only. AI-generated content must pass human admin review before publication — never auto-publish.

## Code style

**Minimal comments — only explain non-obvious logic.** Do not restate what the code already says, add section banners, or write JSDoc for self-evident functions. Comment the *why* (a workaround, a spec constraint, a non-obvious invariant), never the *what*. The specific comments `document/standards/general.md` mandates — justifying an `as` cast, a non-obvious side-effect import, a Prisma-stub file header — still apply.

## Design system

`document/design.md` is the **single source of truth** for visual decisions. Key rules that affect every component:

- Use semantic tokens (`bg-primary`, `text-foreground`) — never raw hex or brand hues.
- Build components with **`cva`** (class-variance-authority) + `cn()` from `@kidlearn/ui/lib/cn`.
- Animation via **Motion** (`motion` package). Always check `prefers-reduced-motion`. Animate only `transform` and `opacity`.
- Fonts: `--font-display` (Fredoka) for kid headings, `--font-body` (Nunito) for body, `--font-ui` (Inter) for parent UI. Load via `next/font`.
- All strings go through `i18next` — no hard-coded user-facing text. The JSON lives in `packages/i18n/locales/{en,bn}/`, one file per namespace (`common`, `student`, `parent`, `lesson`, `site`); a key in one locale and not the other fails `@kidlearn/i18n`'s parity test.

## Workspace wiring

New packages in `packages/` need their own `package.json` with a `name`, plus `dev`/`build`/`typecheck` scripts, before pnpm/Turbo picks them up. All six of `ui`, `db`, `types`, `config`, `i18n` and `tokens` are active workspaces.
