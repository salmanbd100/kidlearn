# 02 — Database Package: Prisma + Supabase

> **Estimated effort:** 3–4 hours
> **Depends on:** 01
> **Requirement IDs:** spec §7.2, §8, §9
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal
Establish `packages/db` as the single database access layer for the platform: a Prisma setup pointed at a Supabase PostgreSQL project (pooled runtime connection + direct migration connection), an exported singleton `PrismaClient`, migration/generate scripts wired into the root workspace, and consumption from `apps/server` proven end-to-end with a DB-backed health route. After this file, every later schema file (03–06) only edits `prisma/schema.prisma` and runs a migration.

## Context & Current State
- File 01 is done: `@kidlearn/config` and `@kidlearn/types` exist, Vitest runs in both apps, the server exports `app` from `src/app.ts`.
- **A head start already exists in the repo — verify and complete rather than recreate:**
  - `packages/db/package.json` exists as `@kidlearn/db` with `dev`/`build`/`typecheck` plus `db:generate`, `db:migrate`, `db:studio`, `db:push` scripts and `@prisma/client` ^6 / `prisma` ^6.
  - `packages/db/prisma/schema.prisma` has the `generator` + `datasource` blocks (`url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`) **plus two starter demo models (`Parent`, `Child`)** that file 03 will replace with the real domain models.
  - `packages/db/src/index.ts` has the globalThis-cached singleton `PrismaClient` and re-exports `@prisma/client`.
  - `packages/db/.env.example` documents the pooled (port 6543, `?pgbouncer=true`) and direct (port 5432) Supabase strings; `.gitignore` covers `.env`.
  - Root `package.json` already proxies `db:generate` / `db:migrate` / `db:studio` via `pnpm --filter @kidlearn/db`, and `turbo.json` has uncached `db:generate` / `db:migrate` tasks.
  - `apps/server` already depends on `@kidlearn/db` (`workspace:*`) and imports `prisma` in `src/index.ts` (a demo `/parents` route).
- What is **missing**: an actual Supabase project + filled `.env` files, an initial migration (no `prisma/migrations/` directory exists), `DIRECT_URL` documented in `apps/server/.env.example`, and a clean DB-health route that does not depend on demo models.

## Detailed Requirements
1. A Supabase free-tier PostgreSQL project backs the platform (spec §7.2, §9); its connection strings are configured locally via `.env` files that are git-ignored, with committed `.env.example` templates.
2. Prisma uses **two** connection URLs: `DATABASE_URL` (Supabase transaction pooler, port 6543, `?pgbouncer=true`) for runtime queries and `DIRECT_URL` (port 5432) for CLI operations — required because PgBouncer in transaction mode cannot run migrations (spec §9).
3. `@kidlearn/db` exports exactly one shared `PrismaClient` instance (`prisma`), cached on `globalThis` outside production so dev hot-reloads do not exhaust the Supabase free-tier connection pool.
4. The base schema for this file is **generator + datasource only** — domain models are owned by files 03–06. The existing starter `Parent`/`Child` demo models are removed here (and the server's demo `/parents` route with them) so file 03 starts from a clean slate; the **initial migration is intentionally deferred to file 03** (Prisma cannot migrate an empty schema usefully).
5. `apps/server` proves consumption with `GET /health/db` executing `SELECT 1` through the singleton — no domain model needed (spec §7.2: Prisma "consumed by apps/server").
6. `pnpm db:generate` and `pnpm db:migrate` work from the repo root; `pnpm --filter @kidlearn/db build` runs `prisma generate && tsc`.
7. `apps/server/.env.example` documents `DATABASE_URL` (it already does) — keep it in sync with `packages/db/.env.example`.
8. Supabase project setup is documented step-by-step (below) so a zero-context developer can provision it in minutes.

## Technical Approach & Suggestions

**Files to modify**
- `packages/db/prisma/schema.prisma` — strip demo models, keep generator/datasource.
- `apps/server/src/app.ts` — add `GET /health/db`; remove the demo `/parents` route from `src/index.ts`.
- `apps/server/src/app.test.ts` — add a mocked test for `/health/db`.

**Files to create**
- `packages/db/.env` (local only, never committed) from `.env.example`.
- `apps/server/.env` (local only) from its `.env.example`.

**Supabase project setup (document this verbatim for the team):**
1. Sign in at `https://supabase.com` → New project → name `kidlearn-dev`, region nearest you, generate a strong DB password and store it in a password manager.
2. Project Settings → Database → Connection string. Copy **two** strings:
   - *Transaction pooler* (host `aws-0-<region>.pooler.supabase.com`, port **6543**) → `DATABASE_URL`, append `?pgbouncer=true`.
   - *Direct connection* (port **5432**) → `DIRECT_URL`.
3. Paste both into `packages/db/.env`; paste `DATABASE_URL` into `apps/server/.env`.

`packages/db/prisma/schema.prisma` after this file (exact content):

```prisma
// Prisma schema for kidlearn — Supabase (PostgreSQL).
// Domain models are added incrementally by implementation files 03–06.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  // Pooled connection (Supabase pooler, port 6543, ?pgbouncer=true) — runtime.
  url       = env("DATABASE_URL")
  // Direct connection (port 5432) — Prisma CLI migrations/introspection.
  directUrl = env("DIRECT_URL")
}
```

`packages/db/src/index.ts` (already present — verify it matches):

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
```

Note: with no models in the schema, `prisma generate` still produces a valid client exposing `$queryRaw`/`$connect`; `export * from "@prisma/client"` simply re-exports the `Prisma` namespace until file 03 adds models.

`apps/server/src/app.ts` addition:

```ts
import { prisma } from "@kidlearn/db";

app.get("/health/db", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "reachable" });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});
```

Server test (mock the db package so the unit suite never needs a live database):

```ts
vi.mock("@kidlearn/db", () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) } }));
// then: expect (await request(app).get("/health/db")).status toBe 200
```

`packages/db` tsconfig should now `extend` `@kidlearn/config/tsconfig/node.json` (add the workspace devDependency) to stay consistent with file 01's convention.

`pnpm db:migrate` from the root maps to `prisma migrate dev` inside `packages/db`; it will be exercised for real in file 03. Here, validate wiring with `pnpm --filter @kidlearn/db exec prisma validate` and `pnpm db:generate`.

## Step-by-Step Plan
1. Provision the Supabase project (steps above); fill `packages/db/.env` and `apps/server/.env`; confirm neither is tracked (`git status` clean of `.env`). (~25 min)
2. Strip the starter `Parent`/`Child` models from `prisma/schema.prisma` so only generator + datasource remain; run `pnpm --filter @kidlearn/db exec prisma validate` and `pnpm db:generate`. (~15 min)
3. Remove the demo `/parents` route (and its `prisma` import) from `apps/server/src/index.ts`; run `pnpm --filter server typecheck`. (~15 min)
4. Write the failing Supertest for `GET /health/db` in `apps/server/src/app.test.ts` with `@kidlearn/db` mocked via `vi.mock`. (~20 min)
5. Implement `GET /health/db` in `src/app.ts` using `prisma.$queryRaw\`SELECT 1\``; test goes green (`pnpm --filter server test`). (~20 min)
6. Point `packages/db/tsconfig.json` at `@kidlearn/config/tsconfig/node.json` (keep `outDir`, `rootDir`, `declaration`, `sourceMap` locally); `pnpm --filter @kidlearn/db build` passes. (~15 min)
7. Live smoke test: `pnpm --filter server dev`, then `curl http://localhost:4000/health/db` returns `{"status":"ok","database":"reachable"}` against the real Supabase project. (~15 min)
8. Sync docs: ensure `apps/server/.env.example` and `packages/db/.env.example` describe both URLs accurately; run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. (~20 min)

## Acceptance Criteria
- [ ] `packages/db/.env` and `apps/server/.env` exist locally, are git-ignored, and contain real Supabase pooled + direct URLs.
- [ ] `prisma/schema.prisma` contains only the `generator` and `datasource` blocks (no demo models).
- [ ] `pnpm db:generate` (root) exits 0 and regenerates the client.
- [ ] `pnpm --filter @kidlearn/db exec prisma validate` exits 0.
- [ ] `pnpm --filter @kidlearn/db build` exits 0 (generate + tsc → `dist/`).
- [ ] `pnpm --filter server test` exits 0 including the mocked `/health/db` test.
- [ ] With the server running locally, `curl http://localhost:4000/health/db` returns HTTP 200 `{"status":"ok","database":"reachable"}`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all exit 0 from the root.

## Out of Scope
- Any domain models or migrations (Parent/AdminUser/ChildProfile → file 03; curriculum → file 04; content → file 05; progress/gamification → file 06).
- Seed data (stub in file 03).
- Server architecture/middleware/error handling beyond the one health route — file 08.
- Supabase Auth/Storage features — auth is better-auth on Express (file 09); media is Cloudinary (file 33).
- Production environment provisioning — file 38.
