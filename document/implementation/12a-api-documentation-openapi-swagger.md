# 12a — API Documentation (OpenAPI / Swagger)

> **Estimated effort:** 4–5 hours — above the usual 3–4h chunk. The ~15 response schemas in `packages/types` are the bulk of it; the spec assembly and the coverage gate are each under an hour.
> **Depends on:** 08, 09, 10, 11, 12
> **Requirement IDs:** spec §7.3 (API architecture). No FR covers API documentation — see the note under _Context_.
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Publish a browsable, accurate OpenAPI 3.0 description of every endpoint the server already exposes, served as Swagger UI at `/docs`, so that files 13–15 have a contract to build the web app against instead of reading `routes/*.ts`. Response shapes become real Zod contracts in `packages/types/src/api/` — shared with `apps/web`, asserted in the existing Supertest tests — and a Vitest coverage gate makes it impossible for a later file to add an endpoint without documenting it.

The point is not "we have a Swagger page". The point is that the description **cannot drift**: the request half is generated from the Zod validators the routes already run, the response half is asserted against real responses in tests, and an undocumented route fails `pnpm --filter server test`.

## Context & Current State

Files 08–12 are ✅ Done and the server exposes 20 endpoints across five routers, plus better-auth's `/api/auth/{*any}` catch-all:

| Router | Mount | Endpoints |
|---|---|---|
| `health.ts` | root | `GET /`, `GET /health` |
| `auth.ts` | `/api/auth` | `GET /google`, `GET /me` |
| `parent.ts` | `/api/parent` | `POST /pin`, `POST /pin/verify`, `POST /consent`, `POST /account/delete-request`, `DELETE /account` |
| `children.ts` | `/api/children` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/activate` |
| `content.ts` | `/api/content` | `GET /worlds`, `GET /subjects`, `GET /subjects/:id/topics`, `GET /topics/:id/lessons`, `GET /lessons/:id` |

There is **no** API documentation anywhere in the repo — no OpenAPI, no Swagger, no Postman collection. The envelope convention (`{ data }` / `{ error: { code, message, details? } }`) is documented only as a comment block in `lib/errors.ts`; response shapes exist only as TypeScript types in `services/*.ts`, which a client cannot read.

Two asymmetries this file fixes:

- **Requests are already Zod** (`schemas/children.ts`, `schemas/content.ts`, four inline schemas in `routes/parent.ts`), applied at the boundary by `middleware/validate.ts`. Those are usable as-is.
- **Responses are TypeScript only** (`ChildProfileDto`, `ParentSummary`, `WorldSummary`, `LessonDetail`, …). `backend.md §2` already requires shared request/response schemas to live in `packages/types` — this file is where the response half finally gets written.

Requirement note: the master spec has no FR for API documentation. Per Working Agreement #4, if this should carry a requirement ID, add it to `project-requirement-details.md` §7.3 first. This file proceeds under §7.3 as an architecture concern.

## Detailed Requirements

1. **Response contracts in `packages/types/src/api/`** — Zod schemas for every response body the server currently sends, exported from the package root. `packages/types` must stay free of `@kidlearn/db`, Prisma, Express and React (its own module docstring), so Prisma enums are mirrored as plain Zod enums here, and the server asserts at compile time that the mirror still matches.
2. **`ERROR_CODES` moves to `packages/types/src/api/errors.ts`.** The 11 codes are a client contract — files 14–15 must switch on `PIN_REQUIRED` vs `CONSENT_REQUIRED` to route the parent to the right screen. `apps/server/src/lib/errors.ts` re-exports them so `ApiError` and every existing import are untouched.
3. **Dates are ISO strings, not `Date`.** `createdAt`, `consentGivenAt`, `pinVerifiedUntil`, `expiresAt` are typed `Date` in the services but `res.json()` serialises them. Model as `z.string().datetime()`. Mirroring the TypeScript type here would produce a spec that is wrong about every timestamp in the API.
4. **Activity and quiz payloads reference the real unions.** `LessonDetail.activity.definition` and `quiz.questions[].definition` must reference the existing `ActivityDefinitionSchema` / `QuizQuestionSchema` rather than `z.unknown()`, so they surface in the spec as `components.schemas.ActivityDefinition` / `QuizQuestion`. That is precisely the contract files 18–22 need while building the engines.
5. **Response schemas are for documentation and tests only.** Nothing parses or strips an outgoing response at runtime — the cost and the failure mode are not worth it. Drift is caught by tests instead (requirement 9).
6. **Spec assembly in `apps/server/src/openapi/`**, OpenAPI **3.0.3**, converted with `zod-to-json-schema` at `target: "openApi3"` (it emits `nullable: true`, which this API needs on `avatarCharacterId`, `mascot`, `progress`, `introScript` and every `*Url`). The converter stays server-side so `packages/types` never depends on an OpenAPI library that `apps/web` would then inherit.
7. **Guard semantics are documented per operation.** The middleware chain is the least discoverable part of this API, so every operation lists the failures its guards produce: `requireParent` → 401 `UNAUTHORIZED`; `requireConsent` → 403 `CONSENT_REQUIRED`; `requirePinVerified` → 403 `PIN_REQUIRED` / `PIN_VERIFICATION_REQUIRED`; `requireActiveChild` → 403 `FORBIDDEN` "No active child profile"; `loadOwnedChild` → **404, never 403** (NFR-SAFE-02 — another parent's child must be indistinguishable from a missing one, and the spec must say so or someone will "fix" it to a 403).
8. **Swagger UI at `/docs`, gated.** Mounted when `NODE_ENV !== "production"`, or in production only when `ENABLE_API_DOCS=true`. Configured with `withCredentials: true` so **Try It Out works**: the UI is served from the same origin better-auth sets its session cookie on, so a developer who has signed in through Google can exercise every authenticated endpoint from the browser with no token handling. That is the reason to serve a live spec rather than commit a static file.
9. **A coverage gate that bites.** `src/openapi/coverage.test.ts` walks each router's own `stack` (`layer.route.path` + `layer.route.methods` — plain strings in Express 5's `router@2`, no `path-to-regexp` reversing needed), converts `/:id` → `/{id}`, and fails if any live route is missing from the registry or any registry entry no longer exists. Plus response-schema assertions in the existing route tests, which catch the opposite drift: a spec that no longer matches what the server sends.
10. **The rule outlives this file.** `backend.md` gains an API-documentation section and two review-checklist items; `00-progress-tracker.md` gains a Shared Technical Decision (that section applies to every file, which is why the rule goes there rather than being copy-pasted into 25 specs); the endpoint-adding files 16–37 gain an acceptance-criteria bullet; files 13–15 get pointed at `packages/types/src/api/` instead of redeclaring shapes; and `/start-implementation` and `/code-review` both learn to check it.

## Technical Approach & Suggestions

Files:

```
packages/types/src/api/
  errors.ts        # ERROR_CODES + ErrorCode (moved from apps/server)
  envelope.ts      # ok(schema), ErrorEnvelopeSchema
  health.ts  auth.ts  parent.ts  children.ts  content.ts
  index.ts
packages/types/src/index.ts                    # + export * from "./api/index.js"

apps/server/src/openapi/
  to-json-schema.ts   # the one wrapper over zodToJsonSchema
  components.ts       # securitySchemes, shared error responses, definitions map
  document.ts         # buildOpenApiDocument({ serverUrl })
  paths/{health,auth,parent,children,content}.ts + index.ts   # ROUTE_DOCS
  write.ts            # openapi:write script
  coverage.test.ts  document.test.ts
apps/server/src/routes/docs.ts                 # GET /docs, GET /docs.json
apps/server/src/app.ts                         # mount behind isDocsEnabled
apps/server/src/lib/env.ts                     # + ENABLE_API_DOCS, isDocsEnabled
apps/server/src/lib/errors.ts                  # re-export moved ERROR_CODES
```

`openapi/` is a fifth top-level directory under `src/`, alongside the `routes/ services/ middleware/ lib/` that `backend.md §1` lists (`schemas/` and `types/` already extend it). Record it in `backend.md §1` as part of this work — standards document first, code second.

The converter wrapper — one call converts the whole definitions map, so every shared schema lands in `components.schemas` and every reference points at it:

```ts
export function buildComponentSchemas(definitions: Record<string, ZodTypeAny>) {
  const { schemas } = zodToJsonSchema(z.object({}), {
    target: "openApi3",
    definitions,
    definitionPath: "schemas",
    basePath: ["#", "components"],
    $refStrategy: "root",
  }) as { schemas: Record<string, unknown> };
  return schemas;
}
```

Two things JSON Schema cannot express, which the converter drops silently — both need a hand-written `description` or the spec quietly lies:

- `UpdateChildBodySchema`'s `.refine(keys.length > 0, "At least one field required")`.
- Any `.superRefine` reached through the activity/quiz unions (`packages/types/src/refinements.ts`).

`buildOpenApiDocument({ serverUrl })` **must not import `lib/env.ts`** — that module calls `process.exit(1)` on a missing `.env`, which would kill the `openapi:write` script and make the builder untestable. The route passes `env.BETTER_AUTH_URL`; the script passes a default.

Security scheme — better-auth uses cookie sessions, not bearer tokens:

```ts
securitySchemes: {
  sessionCookie: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
}
```

Applied globally, overridden with `security: []` on the three public operations (`GET /`, `GET /health`, `GET /api/auth/google`).

The coverage gate:

```ts
const MOUNTS = [
  { prefix: "", router: healthRouter },
  { prefix: "/api/auth", router: authRouter },
  { prefix: "/api/parent", router: parentRouter },
  { prefix: "/api/children", router: childrenRouter },
  { prefix: "/api/content", router: contentRouter },
];
// walk layer.route.path + layer.route.methods → "GET /api/children/{id}"
// diff both ways against ROUTE_DOCS; name the offender and the file to edit.
```

The prefix map cannot notice a brand-new router mounted on `apiRouter`, so also assert the number of `apiRouter` mounts matches — a new router then fails with a clear message rather than passing silently.

better-auth's four endpoints that `apps/web` will actually call (`POST /api/auth/sign-in/social`, `GET /api/auth/callback/google`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`) are hand-documented under the `Auth` tag and excluded from the gate — they are not in our router stacks. 24 documented operations in total.

New dependencies: `swagger-ui-express`, `zod-to-json-schema`; dev `@types/swagger-ui-express`. `swagger-ui-express` is CJS but `esModuleInterop` is already on, so a default import is fine.

## Step-by-Step Plan

1. Install the three dependencies; add `ENABLE_API_DOCS` to `env.ts` (as `z.enum(["true","false"]).transform()` — **not** `z.coerce.boolean()`, which turns `"false"` into `true`), `.env.example`, and a pure `isDocsEnabled(env)` predicate. (~20 min)
2. Move `ERROR_CODES`/`ErrorCode` to `packages/types/src/api/errors.ts`, re-export from `lib/errors.ts`, add `envelope.ts`. Confirm `pnpm typecheck` still passes with no other file touched. (~20 min)
3. Author the response schemas for health, auth and parent; then children (with the compile-time check that the mirrored `GRADE_LEVELS` still matches Prisma's `GradeLevel`); then content, wiring `activity.definition` to `ActivityDefinitionSchema` and questions to `QuizQuestionSchema`. Export from the package root. (~90 min)
4. Build `to-json-schema.ts` + `components.ts`, then `paths/*.ts` one router at a time, documenting every status code the router's guards and services can actually produce — including the 500 `INTERNAL` on `GET /lessons/:id` for corrupt published JSONB, and the 429 `PIN_LOCKED` on both PIN routes. (~75 min)
5. `document.ts` + `routes/docs.ts` + the `app.ts` mount; boot the server and eyeball `/docs`. (~30 min)
6. TDD the coverage gate: write it, watch it pass, then add a throwaway route and confirm it fails naming that route, then remove it. Add `document.test.ts`. (~30 min)
7. Add `Schema.parse(res.body)` assertions to the successful cases in `routes/{auth,parent,children,content}.test.ts`. Fix whatever they reveal — this step is where a wrong schema surfaces. (~30 min)
8. Documentation and enforcement: `backend.md` §1/§8/§9, tracker Shared Technical Decisions + Working Agreement, the AC bullet in files 16–37, the consumer note in 13–15, both skills, `CLAUDE.md`. (~40 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter server test`; sign in and prove Try It Out returns 200 on `GET /api/children`; confirm `/docs` 404s under `NODE_ENV=production`. Update the tracker. (~25 min)

## Acceptance Criteria

- [ ] `GET /docs` serves Swagger UI and `GET /docs.json` returns a valid OpenAPI 3.0.3 document with **24 operations** across the tags `Health`, `Auth`, `Parent Account`, `Children`, `Content`.
- [ ] Every operation carries a `summary`, at least one documented response, a tag, and an explicit `security` value — asserted in `document.test.ts`, not eyeballed.
- [ ] `components.schemas` includes `ActivityDefinition` and `QuizQuestion` resolved from `@kidlearn/types`, so a frontend developer can read the activity/quiz payload contract from the spec alone.
- [ ] Error responses document the `{ error: { code, message, details? } }` envelope with the full 11-value `code` enum.
- [ ] `coverage.test.ts` passes, and **fails with the offending route named** when a route is added to any router without a registry entry (verified by adding one temporarily and removing it).
- [ ] Every successful response in `routes/{auth,parent,children,content}.test.ts` is asserted against its `packages/types/src/api` schema.
- [ ] `loadOwnedChild`'s routes document 404 and **not** 403 for a child owned by another parent (NFR-SAFE-02), with the reason stated in the operation description.
- [ ] No response is validated or stripped at runtime — `grep -rn "parse(.*res\." apps/server/src/routes apps/server/src/services` finds nothing outside test files.
- [ ] `/docs` and `/docs.json` return 404 when `NODE_ENV=production` and `ENABLE_API_DOCS` is unset.
- [ ] `backend.md` documents the rule, `00-progress-tracker.md` carries it as a Shared Technical Decision, and files 16–37 that add endpoints carry the acceptance-criteria bullet.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter server test` pass.

## Out of Scope

- Generated TypeScript clients for `apps/web` (`openapi-typescript`, `orval`) — files 13–15 import the Zod schemas directly.
- Documenting endpoints that do not exist yet (progress 16, quiz responses 22, rewards 23–24, stories 25–26, time 27–28, dashboards 29–30, admin 31–33, AI 34–37). Each arrives with its own file, under the rule this one establishes.
- A `.github/workflows/` CI pipeline. None exists in the repo today; the gate runs via `pnpm test` and `/code-review`. File 38 owns deployment concerns.
- Runtime response validation, API versioning, rate-limit headers, and request/response examples beyond what the schemas imply.
- Replacing Swagger UI with Redoc or Scalar; publishing the spec to any external portal.
