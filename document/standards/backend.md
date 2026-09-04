# kidlearn — Backend & Database Standards

> **Load this document when the task touches `apps/server`, `packages/db`, `packages/types`, Express, Prisma, API routes, or database schema.**
>
> **Always load alongside it:** [`standards/general.md`](./general.md) — monorepo layout, TypeScript, imports, naming, testing, GitHub flow.
>
> **Also read:**
> - [`document/database-design.md`](../database-design.md) — the authoritative schema design. Load for any `packages/db` schema or migration work.
>
> **Enforcement legend:** **[BIOME]** / **[TS]** / **[CI]** / **[REVIEW]** — see [`general.md`](./general.md).

---

## Table of Contents

1. [Express / Server Structure](#1-express--server-structure)
2. [Route Handlers & Validation](#2-route-handlers--validation)
3. [Database Access](#3-database-access)
4. [Content-Status Guard — Hard Rule](#4-content-status-guard--hard-rule)
5. [Error Handling & Environment](#5-error-handling--environment)
6. [Backend Testing](#6-backend-testing)
7. [API Documentation — OpenAPI](#7-api-documentation--openapi)
8. [Backend Review Checklist](#8-backend-review-checklist)

---

## 1. Express / Server Structure

```
apps/server/src/
├── routes/         # Express Router files — one file per resource (plural noun)
├── services/       # Business logic — plain async functions, no Express types
├── middleware/     # Express middleware (auth, validation, error handling)
├── schemas/        # Zod request schemas, one file per resource
├── openapi/        # The OpenAPI document — see §7
├── lib/            # Pure utility functions
└── index.ts        # App bootstrap only — no routes or business logic inline
```

Naming: route files are plural nouns (`lessons.ts`), service files are singular noun + `Service` (`lessonService.ts`). See [`general.md §4`](./general.md#4-naming-conventions).

---

## 2. Route Handlers & Validation

### Route handlers are thin

Route handlers validate the request and delegate to a service function. No business logic lives inline in a route handler. The test of correctness: you should be able to call every service function from a test without an HTTP layer. **[REVIEW]**

```ts
// Correct
router.get("/:id", validateParams(LessonParamsSchema), async (req, res) => {
  const lesson = await lessonService.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Not found" });
  res.json(lesson);
});

// Wrong — business logic inline
router.get("/:id", async (req, res) => {
  const lesson = await prisma.lesson.findUnique({ ... }); // business logic here
  ...
});
```

Service functions are plain async functions and must not import or reference Express types. **[REVIEW]**

### Validation

- All incoming request bodies and params are validated with Zod at the route boundary before any service call. A missing Zod schema on a route that accepts user input is a bug. **[REVIEW]**
- Zod schemas for request/response shapes that are shared between the frontend and backend live in `packages/types`. **[REVIEW]**
- Invalid input returns `400` with a structured error body before it reaches the database. **[REVIEW]**

---

## 3. Database Access

- The `prisma` singleton from `@kidlearn/db` is the only Prisma client in `apps/server`. Never instantiate `new PrismaClient()`. **[REVIEW]**
- No raw SQL. Use Prisma's query API exclusively. **[REVIEW]**
- Prisma model types (`Parent`, `Child`, Prisma namespace) are imported from `@kidlearn/db` — never redeclared in application code. **[REVIEW]**
- `packages/db` owns both `DATABASE_URL` (pooled, port 6543, runtime) and `DIRECT_URL` (direct, port 5432, migrations). Apps never hold database credentials themselves.
- Activity and quiz JSON payloads are stored as versioned `JSONB`. The schema for those payloads is defined once in `packages/types` and consumed by the frontend renderer, the backend validator, and the AI generation prompts. **[REVIEW]**

---

## 4. Content-Status Guard — Hard Rule

Every Prisma query that serves student-facing content **must** include `where: { status: "published" }`. A missing filter is a content-safety bug, not a style issue. It must have an explicit test. **[REVIEW] [CI]**

```ts
// Correct
const lesson = await prisma.lesson.findUnique({
  where: { id, status: "published" },
});

// Wrong — exposes draft/review content to students
const lesson = await prisma.lesson.findUnique({ where: { id } });
```

Content moves through `draft → in_review → approved/rejected → published`. AI-generated content must pass human admin review before publication — never auto-publish. **[REVIEW]**

---

## 5. Error Handling & Environment

### Error handling

- A single error-handler middleware (last `app.use` in `index.ts`) catches all thrown errors from route handlers. Route handlers do not send error responses directly — they throw. **[REVIEW]**
- HTTP status codes are semantic. Never return `200` with an error payload in the body. **[REVIEW]**

| Status | When to use |
|---|---|
| `200` | Success |
| `201` | Resource created |
| `400` | Validation failure (bad input) |
| `401` | Unauthenticated |
| `403` | Authenticated but forbidden |
| `404` | Resource not found |
| `409` | Conflict (duplicate, state mismatch) |
| `500` | Unhandled server error (caught by error handler) |

### Environment validation

Required environment variables are validated at startup. The server must fail fast at boot with a clear error message if a required variable is missing — never discover a missing variable deep inside a request handler. **[REVIEW]**

---

## 6. Backend Testing

> Shared testing rules — co-location, no mocking `@kidlearn/db`, no snapshot tests, test naming, CI gate — are in [`general.md §5`](./general.md#5-testing-standards--shared-rules). This section covers only what is backend-specific.

| Layer | What to test | How |
|---|---|---|
| `packages/db` | Schema constraints, cascade deletes, index correctness | Vitest against a real test DB |
| `apps/server` — services | All business logic paths, edge cases, error conditions | Vitest unit with real test DB |
| `apps/server` — routes | Request validation, correct status codes, auth guards | Vitest + supertest integration tests |
| Activity/quiz JSON validators | Every activity type, every quiz format, malformed and edge-case payloads | Vitest unit — content-safety critical |

### Content-safety tests — mandatory

The `status: "published"` filter must have an explicit test for every student-facing route. This test is a CI gate. A PR that removes or disables it does not merge.

```ts
it("does not return unpublished lessons to students", async () => {
  await createLesson({ status: "draft" });
  const res = await request(app).get("/lessons");
  expect(res.body).toHaveLength(0);
});
```

---

## 7. API Documentation — OpenAPI

The server publishes an OpenAPI 3.0 document, served as Swagger UI at `/docs` and raw at `/docs.json`. It is assembled at boot in `apps/server/src/openapi/` — there is no checked-in spec file, because a derived artifact in the repository is one more thing to forget to regenerate.

### The rule

**An endpoint is registered in `src/openapi/paths/<resource>.ts` in the same change that adds it.** Not in a follow-up, not "before the PR" — the same change. **[CI]**

This is enforced, not requested: `src/openapi/coverage.test.ts` walks the live Express routers and diffs their registrations against the registry in both directions. An undocumented route fails `pnpm --filter server test` and names itself. A registry entry whose route was deleted fails too.

### Where each half of a contract lives

| | Where | Why |
|---|---|---|
| **Request** schemas | `apps/server/src/schemas/<resource>.ts` | The same Zod object `validate()` runs at the boundary. The spec imports it; it is never restated. |
| **Response** schemas | `packages/types/src/api/<resource>.ts` | Shared with `apps/web`, so the client never redeclares a response shape (§2). |

Both halves are converted to JSON Schema by `src/openapi/to-json-schema.ts`. Nothing in `src/openapi/` may describe a shape by hand that a Zod schema already describes — a hand-written duplicate is a second source of truth and will drift.

### Rules for response schemas

- **Timestamps are `IsoDateTimeSchema`, never `z.date()`.** The services type these as `Date`, but `res.json()` sends an ISO string. A schema mirroring the TypeScript type is wrong about every timestamp in the API.
- **They document and test; they never police.** No route parses or strips an outgoing body at runtime. Drift is caught by the route tests, not by rejecting a response in front of a user.
- **Every successful response is asserted in its route test** with `assertContract(Schema, res.body, "<operation>")`. Because the schemas are `.strict()`, this also catches an accidentally-leaked field — which is a content-safety failure (§4, NFR-SAFE-02), not just an inaccurate document.
- `packages/types` must not depend on `@kidlearn/db`, so Prisma enums are mirrored there by hand. Any mirror needs a compile-time assertion on the server side that it still matches — see `src/openapi/paths/children.ts` for the pattern.

### What a new operation must document

Every status code the route can actually produce, including the ones its middleware produces rather than its handler: `requireParent` → 401; `requireConsent` → 403 `CONSENT_REQUIRED`; `requirePinVerified` → 403 `PIN_REQUIRED` / `PIN_VERIFICATION_REQUIRED`; `requireActiveChild` → 403; `loadOwnedChild` → **404, never 403**.

State the reasoning where a response is deliberately counter-intuitive. The `404` for another parent's child, and the `404` for unpublished content, both exist so that a probe cannot confirm a row exists (§4, NFR-SAFE-02) — an operation description that does not say so invites someone to "fix" it into a `403`.

Restate in a `description` any rule that JSON Schema cannot express. Zod `.refine()` and `.superRefine()` are dropped silently in conversion, so a rule like `UpdateChildBodySchema`'s "at least one field required" is invisible in the spec unless it is written out.

### Exposure

`/docs` is always available outside production. In production it is off unless `ENABLE_API_DOCS=true`, because the document describes the whole API surface. Both routes are mounted behind `isDocsEnabled(env)` in `app.ts`.

---

## 8. Backend Review Checklist

Before considering backend work complete:

- [ ] Route handlers are thin — all business logic lives in a service function callable without HTTP
- [ ] Every route accepting user input has a Zod schema at the boundary; invalid input returns `400`
- [ ] Shared request/response schemas live in `packages/types`, not duplicated per app
- [ ] Every new or changed endpoint is registered in `src/openapi/paths/`, documenting every status code its guards and handler can produce (§7)
- [ ] Every successful response is asserted against its `packages/types/src/api` schema in the route test
- [ ] `prisma` singleton from `@kidlearn/db` used — no `new PrismaClient()`, no raw SQL
- [ ] Every student-facing query filters `status: "published"`, with an explicit test
- [ ] Errors are thrown, not sent — a single error-handler middleware is last in `index.ts`
- [ ] Status codes are semantic (no `200` with an error body)
- [ ] Required env vars validated at boot, failing fast with a clear message
- [ ] Progress, rewards, streaks, and screen time are computed server-side — the client reports events, the server validates and records
- [ ] `pnpm typecheck` and `pnpm lint` pass

---

_Backend & Database Standards v1 — kidlearn. `document/database-design.md` wins on any schema question. Update this document first; update the code second._
