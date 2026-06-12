# 09 — Parent Google OAuth & Sessions

> **Estimated effort:** 3–4 hours
> **Depends on:** 03, 08
> **Requirement IDs:** FR-AUTH-02, FR-AUTH-06
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Give parents their one and only sign-in path — Google OAuth via better-auth mounted on the Express server with the Prisma adapter and cookie-based sessions — and establish the session-scoping model the whole student portal relies on: the session carries an `activeChildProfileId`, so switching child profiles never requires the parent to re-authenticate (FR-AUTH-06), while parent-area routes get an additional PIN layer in file 10. Ships the `requireParent` middleware and `GET /api/auth/me`.

## Context & Current State

File 03 is done: `packages/db` has `Parent` (with nullable `pinHash`, consent fields) and `AdminUser` models migrated against Supabase. File 08 is done: `apps/server` has the `app.ts`/`index.ts` split, `lib/env.ts` (Zod-parsed), `ApiError` + envelope error handler, `validate()`, pino logging, CORS locked to `WEB_ORIGIN` with `credentials: true`, and Supertest wiring. There is no auth of any kind yet — no better-auth dependency, no session tables, no auth middleware. Per the Shared Technical Decisions: **better-auth on Express with the Prisma adapter; cookie sessions; Google only — no email/password, ever** (spec §4.2 "Only Google login").

## Detailed Requirements

1. **Google-only sign-in (FR-AUTH-02):** better-auth configured with the Google social provider and nothing else — `emailAndPassword` disabled. Sign-in URL is better-auth's standard `/api/auth/sign-in/social` flow with `provider: "google"`; callback lands on the server and redirects to `${WEB_ORIGIN}/parent` (configurable).
2. **Better-auth tables:** better-auth's Prisma adapter needs its core models — `User`, `Session`, `Account`, `Verification`. Generate them with `npx @better-auth/cli generate`, then link our domain model: add `Parent.userId String @unique` referencing better-auth's `User.id`. Document and commit the migration (`add_better_auth_tables`). Our `Parent` row is created lazily on first sign-in (see req 4) — better-auth owns identity, `Parent` owns domain data (PIN, consent, children).
3. **Cookie sessions:** httpOnly, `sameSite: "lax"`, `secure` in production, 30-day expiry with sliding refresh (better-auth defaults are fine; pin them explicitly in config). `trustedOrigins: [env.WEB_ORIGIN]`.
4. **Parent provisioning:** on first authenticated request (in `requireParent`), if no `Parent` row exists for the session user, create one (`userId`, `email` from the session). This keeps sign-up and sign-in a single flow.
5. **`requireParent` middleware:** reads the better-auth session from the request cookies; 401 `UNAUTHORIZED` envelope if absent/expired; otherwise attaches `req.parent` (the `Parent` row) and `req.session` (better-auth session incl. `activeChildProfileId`). All `/api/*` routes except `/api/auth/*` and `/health` will sit behind it from file 10 onward.
6. **Active-child scoping (FR-AUTH-06):** store `activeChildProfileId: string | null` **in the better-auth session** (via better-auth's `additionalFields` on the session model). Decision: session storage, not an `X-Child-Profile-Id` header — the server stays authoritative, the value survives reloads, and a child tapping profiles can't spoof another parent's child by editing a header. The setter endpoint (`POST /api/children/:id/activate`) ships in file 11; this file only makes the field exist and exposes it on `req.session` and `/api/auth/me`. Switching profiles = one API call, **no re-auth** (FR-AUTH-06); PIN enforcement for parent areas is file 10's `requirePinVerified`, layered on top of `requireParent`.
7. **`GET /api/auth/me`:** behind `requireParent`; returns `{ data: { parent: { id, email, hasPin, consentAt }, activeChildProfileId } }`. Never returns `pinHash`.
8. **Env & Google Cloud setup:** new env keys `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` added to `lib/env.ts` and `.env.example`. Document the console steps (see Technical Approach).
9. **Tests:** Supertest tests with a mocked session — `/api/auth/me` 401 without session; 200 with parent payload when mocked; lazy `Parent` provisioning happens once; `pinHash` absent from every response.

## Technical Approach & Suggestions

Files (under `/Users/salmanrahman/Documents/kidlearn/apps/server/` unless noted):

```
src/lib/auth.ts                 # betterAuth(...) instance
src/middleware/require-parent.ts
src/routes/auth.ts              # mounts better-auth handler + GET /api/auth/me
src/types/express.d.ts          # Request augmentation: parent, session
src/middleware/require-parent.test.ts
src/routes/auth.test.ts
packages/db/prisma/schema.prisma          # + User/Session/Account/Verification, Parent.userId
packages/db/prisma/migrations/<ts>_add_better_auth_tables/
.env.example                    # + 4 new keys
```

New dep in `apps/server`: `better-auth`. (Verify the current Express 5 mounting guidance in the better-auth docs during step 2 — the `toNodeHandler` API below is the stable pattern.)

`src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { env } from "./env";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: env.BETTER_AUTH_URL,            // e.g. http://localhost:4000
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  emailAndPassword: { enabled: false },     // Google ONLY (spec §4.2)
  socialProviders: {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      activeChildProfileId: { type: "string", required: false },
    },
  },
});
```

Mounting in `app.ts` — **before** `express.json()` (better-auth reads the raw body):

```ts
import { toNodeHandler } from "better-auth/node";
app.all("/api/auth/*splat", toNodeHandler(auth)); // Express 5 wildcard syntax
// then express.json(), then our routers — including GET /api/auth/me which we
// register on a path better-auth doesn't own, e.g. app.get("/api/auth/me", ...).
```

If `/api/auth/me` collides with the catch-all, mount our route first (Express matches in registration order) or use `/api/me` — prefer registering `GET /api/auth/me` before the better-auth handler since better-auth has no `me` route of its own; verify and pick one, then write it down in `routes/auth.ts`.

`src/middleware/require-parent.ts`:

```ts
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";

export async function requireParent(req: Request, _res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) return next(ApiError.unauthorized());
  let parent = await prisma.parent.findUnique({ where: { userId: session.user.id } });
  if (!parent) {
    parent = await prisma.parent.create({
      data: { userId: session.user.id, email: session.user.email },
    });
  }
  req.parent = parent;
  req.session = session.session; // includes activeChildProfileId
  next();
}
```

`src/types/express.d.ts`:

```ts
import type { Parent } from "@kidlearn/db";

declare global {
  namespace Express {
    interface Request {
      parent?: Parent;
      session?: { id: string; userId: string; activeChildProfileId?: string | null };
    }
  }
}
```

**Testing strategy:** don't drive the real Google flow. Use `vi.mock("../lib/auth")` so `auth.api.getSession` returns `null` (401 case) or a fixture session; mock `prisma.parent` (or use a test-DB transaction pattern if file 02 set one up). Test cases: (1) no cookie → 401 envelope; (2) session for unknown user → `Parent` created, 200; (3) second call → no duplicate create (assert `create` called once / `findUnique` hit); (4) `/api/auth/me` body matches `{ data: { parent: { id, email, hasPin: false, consentAt: null }, activeChildProfileId: null } }` and contains no `pinHash` key.

**Google Cloud console steps (document verbatim in this file's section of `.env.example` comments or `apps/server/README` note):**

1. console.cloud.google.com → create project `kidlearn-dev`.
2. APIs & Services → OAuth consent screen → External → app name "KidLearn", add your email; scopes: `openid`, `email`, `profile`; add yourself as test user.
3. Credentials → Create credentials → OAuth client ID → Web application.
4. Authorized JavaScript origins: `http://localhost:3000`. Authorized redirect URIs: `http://localhost:4000/api/auth/callback/google`.
5. Copy client ID/secret into `apps/server/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`; set `BETTER_AUTH_URL=http://localhost:4000`.

## Step-by-Step Plan

1. Add `better-auth` to `apps/server`; extend `lib/env.ts` + `.env.example` with the four new keys (test setup file gets dummy values). (~15 min)
2. Create `src/lib/auth.ts`; run `npx @better-auth/cli generate` against `packages/db/prisma/schema.prisma`, review the generated `User`/`Session`/`Account`/`Verification` models, add `Parent.userId String @unique` + relation, and run `pnpm --filter @kidlearn/db prisma migrate dev --name add_better_auth_tables`. (~30 min)
3. Mount `toNodeHandler(auth)` in `app.ts` before `express.json()`; smoke-check that existing file-08 tests still pass. (~15 min)
4. Write failing tests for `requireParent` (401 / provision / no-duplicate cases) with `auth.api.getSession` mocked. (~25 min)
5. Implement `require-parent.ts` + `types/express.d.ts`; make tests green. (~25 min)
6. Write failing test then implement `GET /api/auth/me` in `routes/auth.ts` (route order vs. the better-auth catch-all resolved here); assert `pinHash` never serialized. (~25 min)
7. Manual end-to-end: set real Google credentials per the console steps, `pnpm --filter server dev`, hit `http://localhost:4000/api/auth/sign-in/social?provider=google` (or a curl-initiated flow), complete consent, then `curl -b cookies http://localhost:4000/api/auth/me`. (~30 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter server test`; commit migration + code; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes including: `/api/auth/me` → 401 envelope without a session; → 200 with `{ data: { parent, activeChildProfileId } }` with a mocked session.
- [ ] First authenticated request creates exactly one `Parent` row linked by `userId`; subsequent requests reuse it (asserted in tests).
- [ ] No email/password endpoints function: `POST /api/auth/sign-up/email` returns a better-auth error/404, never creates a user.
- [ ] `pinHash` does not appear in any HTTP response body (grep test on the `/me` payload).
- [ ] Migration `add_better_auth_tables` is committed and `pnpm --filter @kidlearn/db prisma migrate dev` runs clean on a fresh database.
- [ ] Session cookie is `HttpOnly` and `SameSite=Lax` (assert on the `set-cookie` header in a test or manual check).
- [ ] Manual Google sign-in round-trip works locally against real credentials.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of Scope

- PIN set/verify, `requirePinVerified`, consent capture, account deletion (file 10).
- Child profile CRUD and `POST /api/children/:id/activate` — the setter for `activeChildProfileId` (file 11); this file only adds the session field.
- Frontend sign-in button, consent screen, and parent UI (file 14); profile picker (15).
- Admin authentication (file 31) — admins are not parents and never log in through this flow.
