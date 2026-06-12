# 08 — Server Foundation & API Architecture

> **Estimated effort:** 3–4 hours
> **Depends on:** 02
> **Requirement IDs:** spec §7.3, NFR-PERF-04, NFR-SAFE-07
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Restructure `apps/server` from the create-scaffold single file into a layered Express 5 application — separated `app.ts`/`index.ts`, `routes/`/`middleware/`/`services/`/`lib/` folders, Zod-validated requests, a typed central error handler with a consistent JSON envelope, locked-down CORS, pino request logging, Zod-parsed environment config, and the `@kidlearn/db` PrismaClient wired in — so every later backend file (09–12, 23–37) drops routes into an established pattern instead of inventing one.

## Context & Current State

File 02 is done: `packages/db` exists as a workspace package exporting a singleton `PrismaClient` (e.g. `import { prisma } from "@kidlearn/db"`), pointed at Supabase Postgres via `DATABASE_URL`. `apps/server` is still the skeleton: `src/index.ts` creates the Express app inline, uses `cors()` wide open and `dotenv`, listens on `PORT` (default 4000), and serves `GET /` and `GET /health`. Scripts `dev`/`build`/`start`/`typecheck` exist; Vitest + Supertest were installed in file 01 but no tests exist yet. There are no other routes, no validation, no logging.

## Detailed Requirements

1. **App/listener split:** `src/app.ts` builds and exports the Express `app` (no `.listen`) so Supertest can import it; `src/index.ts` only loads env, calls `app.listen`, and handles graceful shutdown (`SIGTERM`/`SIGINT` → close server, `prisma.$disconnect()`).
2. **Folder layout:** `src/routes/` (one router file per resource), `src/middleware/` (validate, errorHandler, notFound, requestLogger), `src/services/` (business logic, empty for now), `src/lib/` (env, errors, prisma re-export). Routers mount under `/api/...`; `GET /health` stays at the root and returns `{ data: { status: "ok", uptime } }` without touching the DB (NFR-PERF-04: health checks must be cheap and wake-friendly on free-tier hosts).
3. **JSON envelope:** every success response is `{ "data": ... }`; every error response is `{ "error": { "code": string, "message": string, "details"?: unknown } }`. No route ever sends a bare body. Document the envelope in a comment block in `lib/errors.ts`.
4. **Typed errors:** an `ApiError` class (`statusCode`, machine-readable `code` like `"NOT_FOUND" | "VALIDATION_FAILED" | "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "INTERNAL"`, `message`, optional `details`). A central error-handling middleware converts `ApiError` → its envelope, `ZodError` → 400 `VALIDATION_FAILED` with flattened issues, anything else → 500 `INTERNAL` with the real error logged but **never leaked to the client**.
5. **Request validation:** a `validate({ body?, params?, query? })` middleware factory taking Zod schemas; on success it replaces `req.body`/`req.params`/`req.query` with the parsed (typed, stripped) values; on failure it forwards a `ZodError` to the error handler.
6. **CORS locked down (NFR-SAFE-07 supporting):** `cors({ origin: env.WEB_ORIGIN, credentials: true })` — exactly one allowed origin from env, credentials enabled for the cookie sessions coming in file 09. No `*`.
7. **Logging:** `pino` + `pino-http` request logging with request id; pretty transport in dev only (`pino-pretty` as devDependency). Log level from `env.LOG_LEVEL` (default `info`).
8. **Env parsing:** `src/lib/env.ts` parses `process.env` with Zod **once at startup** and exports a typed frozen `env` object; missing/invalid vars crash the process with a readable message before the server listens. Keys for this file: `NODE_ENV`, `PORT`, `DATABASE_URL`, `WEB_ORIGIN`, `LOG_LEVEL`. Update `apps/server/.env.example` to match.
9. **Prisma wiring:** add `"@kidlearn/db": "workspace:*"` to `apps/server` dependencies; `src/lib/prisma.ts` re-exports the singleton so app code imports from one local path.
10. **Smoke tests (Supertest):** health returns the envelope; unknown route returns 404 envelope with code `NOT_FOUND`; a throwaway validated route (or direct test of `validate`) returns 400 `VALIDATION_FAILED` with issue details; CORS header echoes only `WEB_ORIGIN`.

## Technical Approach & Suggestions

Files (all under `/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/app.ts                      # buildApp(): express app, middleware order, route mounting
src/index.ts                    # env → buildApp → listen → graceful shutdown
src/lib/env.ts
src/lib/errors.ts               # ApiError + error codes
src/lib/prisma.ts               # export { prisma } from "@kidlearn/db"
src/middleware/validate.ts
src/middleware/error-handler.ts # errorHandler + notFoundHandler
src/middleware/request-logger.ts
src/routes/health.ts
src/routes/index.ts             # apiRouter aggregating /api/* sub-routers
src/app.test.ts                 # Supertest smoke tests
.env.example                    # updated
```

New deps: `pino`, `pino-http`, `zod`; devDeps: `pino-pretty`, plus `supertest` + `@types/supertest` if file 01 did not add them.

`src/lib/env.ts`:

```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = Object.freeze(parsed.data);
```

`src/lib/errors.ts`:

```ts
export type ErrorCode =
  | "VALIDATION_FAILED" | "UNAUTHORIZED" | "FORBIDDEN"
  | "NOT_FOUND" | "CONFLICT" | "INTERNAL";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  static notFound(msg = "Resource not found") { return new ApiError(404, "NOT_FOUND", msg); }
  static unauthorized(msg = "Authentication required") { return new ApiError(401, "UNAUTHORIZED", msg); }
  static forbidden(msg = "Not allowed") { return new ApiError(403, "FORBIDDEN", msg); }
  static conflict(msg: string) { return new ApiError(409, "CONFLICT", msg); }
}
```

`src/middleware/validate.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

type Schemas = { body?: ZodTypeAny; params?: ZodTypeAny; query?: ZodTypeAny };

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request["params"];
      if (schemas.query) req.query = schemas.query.parse(req.query) as Request["query"];
      next();
    } catch (err) {
      next(err); // ZodError → 400 in the error handler
    }
  };
}
```

(Express 5 note: `req.query` is a getter; if assignment throws, stash parsed values on `res.locals.query` instead and document that pattern — verify against the installed Express 5 version during step 4.)

`src/middleware/error-handler.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../lib/errors";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid request", details: err.flatten() },
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  req.log?.error(err); // pino-http attaches req.log
  return res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
}
```

`src/app.ts` middleware order matters: `pino-http` → `cors` → `express.json()` → routes → `notFoundHandler` → `errorHandler` (4-arg, last). Export `buildApp(): Express` and a default `app` instance for Supertest. In tests, set `LOG_LEVEL=fatal` (or pass a silenced logger into `buildApp`) to keep output clean; provide a dummy `DATABASE_URL` via a Vitest `setupFiles` entry since `env.ts` requires it even though smoke tests never hit the DB.

`src/index.ts` graceful shutdown sketch:

```ts
const server = app.listen(env.PORT, () => logger.info(`listening on :${env.PORT}`));
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  });
}
```

## Step-by-Step Plan

1. Write the failing Supertest smoke test for `GET /health` expecting `{ data: { status: "ok" } }` and the envelope shape; add `src/lib/env.ts` + Vitest setup file exporting test env vars. (~25 min)
2. Create `src/lib/errors.ts` and `src/middleware/error-handler.ts`; unit-test that `ApiError` and `ZodError` map to the right status/code envelopes. (~25 min)
3. Build `src/app.ts` (cors, json, pino-http, health route, notFound + errorHandler) and make the step-1 tests pass. (~25 min)
4. Implement `src/middleware/validate.ts`; add a test mounting a scratch route with `validate({ body: z.object({ name: z.string() }) })` and assert 400 `VALIDATION_FAILED` with flattened issues vs. 200 on valid input. Resolve the Express 5 `req.query` setter question here. (~25 min)
5. Rewrite `src/index.ts` to env → listen → graceful shutdown; delete the old inline app code; keep `GET /` returning a tiny `{ data: { name: "kidlearn-api" } }`. (~15 min)
6. Add `@kidlearn/db` dependency, create `src/lib/prisma.ts`, run `pnpm install`, and verify `pnpm --filter server typecheck` resolves the workspace import. (~15 min)
7. Add the CORS test (request with `Origin: env.WEB_ORIGIN` gets `access-control-allow-origin` + `access-control-allow-credentials: true`; other origins get no allow header) and the unknown-route 404 test. (~20 min)
8. Update `.env.example` with all five keys + comments; run `pnpm lint && pnpm typecheck && pnpm --filter server test`; confirm `pnpm --filter server dev` boots and `curl localhost:4000/health` returns the envelope; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: health envelope, 404 envelope, validation 400 envelope, CORS allow/deny.
- [ ] `pnpm --filter server dev` starts; `curl http://localhost:4000/health` → `{"data":{"status":"ok",...}}` with no DB call involved.
- [ ] Starting the server with `DATABASE_URL` unset exits non-zero printing the offending field name (no stack trace spew).
- [ ] An unhandled `throw new Error("boom")` inside a route returns `{"error":{"code":"INTERNAL","message":"Something went wrong"}}` — the string "boom" never appears in the response body.
- [ ] Responses to requests from a non-`WEB_ORIGIN` origin carry no `access-control-allow-origin` header.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] `apps/server/.env.example` lists `NODE_ENV`, `PORT`, `DATABASE_URL`, `WEB_ORIGIN`, `LOG_LEVEL`.

## Out of Scope

- Authentication, sessions, and `requireParent` (file 09); PIN gate (10).
- Any real resource routes: children (11), content (12), rewards (23), time (27), admin (31+).
- Rate limiting, helmet/security headers hardening, and deployment cold-start UX (file 38).
- Database migrations or schema changes (files 03–06 own the Prisma schema).
