# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`kidlearn` is a **pnpm + Turborepo monorepo** — an educational platform for early learners (ages 3–6) with a dual-portal architecture: a gamified Student Portal and a PIN-gated Parent Dashboard. The master requirements are in `document/project-requirement-details.md`; the design system is in `document/design.md`.

## Commands

Run from the repo root:

```bash
pnpm install          # install all workspaces (pnpm 9)
pnpm dev              # turbo run dev — starts web (port 3000) + server (port 4000) together
pnpm build            # turbo run build — caches .next/** and dist/**
pnpm lint             # biome check .        — lint + format-check + import sort (no writes)
pnpm format           # biome check --write . — apply Biome fixes
pnpm typecheck        # turbo run typecheck  — runs tsc --noEmit per package
```

Database (delegates to `packages/db`):

```bash
pnpm db:generate      # prisma generate
pnpm db:migrate       # prisma migrate dev (needs DIRECT_URL)
pnpm db:studio        # prisma studio
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

`.github/workflows/ci.yml` runs one job, `gates`, on every pull request and every push to `main`:

```
pnpm install --frozen-lockfile
pnpm lint
pnpm build            # ^build is required before typecheck and test resolve
pnpm typecheck
pnpm test:coverage    # same suite as pnpm test, plus a coverage report
```

**A PR is not done until `gates` is green** — `gh pr checks` says whether it is. Coverage is reported in the run summary and as an artifact; it is deliberately not gated on a threshold (see `document/standards/general.md §5`).

`gates` is not yet a *required* status check on `main`: the repository ruleset "Protect Main Branch" gets that rule once the flake recorded under **Open follow-up fixes** in `document/implementation/00-progress-tracker.md` is fixed. Until then the pipeline reports; it does not block.

CI needs no secrets, no environment variables and no database: `apps/server/vitest.setup.ts` supplies everything `lib/env.ts` requires, and no test opens a connection. That changes when the test-database harness lands.

## Layout & current state

```
apps/
  web/        Next.js 16 (App Router) + React 19 + Tailwind CSS v4
  server/     Express 5 + TypeScript (ESM, tsx dev) — REST API
packages/
  ui/         @kidlearn/ui — shared React component library (Radix + shadcn primitives)
  db/         @kidlearn/db — Prisma schema + client (Supabase/PostgreSQL)
  types/      placeholder — no package.json yet
  config/     placeholder — no package.json yet
document/     design.md, project-requirement-details.md, key-description.md
```

- **`apps/web`** — Next.js 16 App Router. Path alias `@/*` maps to the app root. Tailwind v4 via `postcss.config.mjs` (no `tailwind.config`). Imports `@kidlearn/ui`. Read `apps/web/AGENTS.md` before writing Next.js code — v16 has breaking changes from prior versions.
- **`apps/server`** — Express 5 ESM, port 4000. Imports `@kidlearn/db`. Copy `packages/db/.env.example` → `packages/db/.env` (Supabase connection strings) before running.
- **`packages/db`** — Prisma 6 against Supabase PostgreSQL. Entry: `src/index.ts` exports `prisma` singleton + all Prisma types. Schema: `Parent` ↔ `Child[]`. Runtime uses the pooled `DATABASE_URL` (port 6543, `?pgbouncer=true`); migrations use `DIRECT_URL` (port 5432).
- **`packages/ui`** — shadcn/ui "new-york" style. `src/primitives/` holds copied shadcn components (own the code — no upstream dependency). `src/styles/tokens.css` is the token contract. `src/lib/cn.ts` is `clsx` + `tailwind-merge`. No build step — exports raw TypeScript via `exports` map.

## Architecture

### Dual-portal & theming

The app has two distinct surfaces sharing one component library:
- **Student Portal** — ages 3–5, visual-first, large touch targets (≥64px), no text below 20px, gamified. Apply `data-theme="kid"` at the layout boundary.
- **Parent Dashboard** — PIN-gated, dense, professional. Apply `data-theme="parent"`.

Token values swap at runtime via CSS variables (`--primary`, `--background`, etc.) — components never branch on theme in JS.

### Content-as-data

Activities (drag-drop, trace, match, puzzle) and quizzes are stored as versioned `JSONB` payloads in Postgres. The frontend ships generic engines that render whatever the JSON describes. New content is data, not code. Shared schemas live in `packages/types` (placeholder — create this package before adding schemas).

### Progress is server-authoritative

Rewards, streaks, screen time, and lesson completion are computed server-side. The client reports events; the server records and validates them.

### API documentation

The server assembles an OpenAPI 3.0 document at boot from `apps/server/src/openapi/`, served as Swagger UI at `/docs` and raw at `/docs.json` (always outside production; in production only with `ENABLE_API_DOCS=true`). Read `/docs` before writing any client code against the API.

Nothing in the document is hand-written twice: request schemas are the Zod objects the routes already validate with (`apps/server/src/schemas/`), response schemas are Zod in `packages/types/src/api/` and shared with `apps/web`. **A new endpoint must be registered in `src/openapi/paths/<resource>.ts` in the same change** — `src/openapi/coverage.test.ts` walks the live Express routers and fails the suite otherwise. Successful responses are asserted against their schemas in the route tests via `assertContract`. Full rules in `document/standards/backend.md §7`.

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
- All strings go through `i18next` — no hard-coded user-facing text.

## Workspace wiring

New packages in `packages/` need their own `package.json` with a `name`, plus `dev`/`build`/`typecheck` scripts, before pnpm/Turbo picks them up. `packages/types` and `packages/config` are not yet active workspaces.
