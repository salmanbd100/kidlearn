# kidlearn — Engineering Standards

> **Authority:** This document governs every file committed to this repository. All standards here apply to all engineers at all times.
>
> **Related documents:**
> - [`document/design.md`](./design.md) — visual language, tokens, motion, accessibility, component design rules. This document cross-references it but does not repeat it.
> - [`document/project-requirement-details.md`](./project-requirement-details.md) — product requirements and feature scope.
>
> **Enforcement:** Standards marked **[BIOME]** are auto-enforced on every `pnpm lint` run. **[TS]** means TypeScript catches it at compile time. **[CI]** means the pipeline blocks the merge. **[REVIEW]** means a human reviewer is responsible — the rule is no less mandatory, but automation cannot yet catch it.

---

## Table of Contents

1. [Monorepo Layout Rules](#1-monorepo-layout-rules)
2. [`packages/ui` Component Architecture](#2-packagesui-component-architecture)
3. [TypeScript Conventions](#3-typescript-conventions)
4. [Module & Import Rules](#4-module--import-rules)
5. [React & Next.js Conventions](#5-react--nextjs-conventions)
6. [Express / Server Conventions](#6-express--server-conventions)
7. [Testing Standards](#7-testing-standards)
8. [Naming Conventions](#8-naming-conventions)
9. [Enforcement Matrix](#9-enforcement-matrix)
10. [GitHub Flow](#10-github-flow)

---

## 1. Monorepo Layout Rules

### Where code lives

| Location | Purpose | Rule |
|---|---|---|
| `apps/*` | Deployable applications only | No shared code lives here. Anything needed by two apps is extracted to `packages/*`. |
| `packages/*` | Shared libraries | Each must have a `package.json` with `name`, `exports`, and `dev`/`build`/`typecheck` scripts before Turborepo picks it up. |
| `document/` | Authoritative prose — requirements, design, standards | No source files, no config, no scripts. |
| Repo root | Config only | `biome.json`, `turbo.json`, `pnpm-workspace.yaml`, `package.json`. No application code. |

### Package activation checklist

A new package in `packages/` is not a workspace package until:

- [ ] It has a `package.json` with a scoped `name` (`@kidlearn/<name>`)
- [ ] It has `exports` defined (TypeScript-first: raw `.ts` exports for source-only packages, built `.js`/`.d.ts` for packages with a build step)
- [ ] It has `dev`, `build`, and `typecheck` scripts (no `lint` — Biome runs repo-wide from root)
- [ ] Its consumer app lists it as a workspace dependency (`"@kidlearn/<name>": "workspace:*"`)
- [ ] `turbo.json` has any required `dependsOn` wiring for the pipeline

`packages/types` and `packages/config` are placeholders and are **not active workspaces** until this checklist is completed.

### Environment files

- Each app or package that needs secrets owns its own `.env.example`. Never a root-level `.env`.
- `packages/db` owns both `DATABASE_URL` (pooled, runtime) and `DIRECT_URL` (direct, migrations). Apps import `@kidlearn/db` — they never hold database credentials themselves.
- Consuming apps copy the example: `cp packages/db/.env.example packages/db/.env`.

### Turborepo pipeline rule

`typecheck` depends on `^build` — consuming packages must build before their dependents can typecheck. When you add a new inter-package dependency, add the corresponding `dependsOn` entry in `turbo.json` before the pipeline will resolve correctly.

---

## 2. `packages/ui` Component Architecture

### Full intended structure

```
packages/ui/src/
├── primitives/     # shadcn/ui components — theme-agnostic, no surface assumptions
├── kid/            # kid-surface components & game widgets
├── parent/         # parent dashboard components
├── hooks/          # shared React hooks — no UI rendering
├── lib/            # cn() and pure utility functions — no JSX
└── styles/         # tokens.css + theme blocks — CSS only, no TS
```

### Layer decision rules

Use this table to decide where a new file goes. If it matches more than one row, use the most specific match.

| Question | Layer |
|---|---|
| Is it a copied shadcn/ui primitive? | `primitives/` |
| Does it work identically in both `kid` and `parent` themes with no surface assumptions? | `primitives/` |
| Is it a game widget (balloon-pop, tracing, drag-drop matching, puzzle)? | `kid/` |
| Is it a kid-portal-specific composed component (world map, reward ceremony, character selector)? | `kid/` |
| Is it a parent-dashboard-specific component (stat card, weekly report card, data table)? | `parent/` |
| Is it a React hook with no JSX? | `hooks/` |
| Is it a pure function with no JSX? | `lib/` |
| Is it a CSS variable declaration or theme block? | `styles/` |

### Rules that apply to every layer

**Variants and styling**

- All variant APIs use `cva` (class-variance-authority) combined with `cn()` from `@kidlearn/ui/lib/cn`. No ad-hoc `className` string concatenation anywhere else. **[REVIEW]**
- Components expose `variant`, `size`, and `tone` props. Callers do not pass long `className` strings to fundamentally restyle a component. If a caller needs a visual treatment that no variant covers, add the variant — do not make the caller responsible for styling internals. **[REVIEW]**
- All color, radius, shadow, and spacing values come from semantic tokens (CSS variables). Components never reference raw hex values, brand hue names, or Tailwind color literals directly. See `document/design.md §2` for the full token contract. **[REVIEW]**

**Theme isolation**

- Components never branch on theme in JavaScript (`if theme === 'kid'`). Theme is applied by setting `data-theme="kid"` or `data-theme="parent"` on a layout boundary; token values cascade automatically. **[REVIEW]**
- `kid/` and `parent/` components compose from `primitives/` — they never duplicate primitive markup inline. **[REVIEW]**

**Adding a shadcn component**

1. Run the shadcn CLI targeting `packages/ui`: `npx shadcn add <component> --path packages/ui`
2. Confirm the output landed in `src/primitives/`
3. Verify it uses only semantic tokens, not shadcn's default color literals
4. Export it from `src/index.ts`

**Exports**

Everything public is exported from `src/index.ts`. Individual `primitives/*` are additionally available via the `exports` map in `package.json` for consumers that want to tree-shake. If you add a new public component, add it to both `src/index.ts` and the `exports` map.

---

## 3. TypeScript Conventions

### Strictness

- `strict: true` in every `tsconfig.json`. No exceptions, no per-file overrides. **[TS]**
- `noImplicitReturns: true` — every code path in a function that returns a value must explicitly return. **[TS]**

### `any`, `unknown`, and type assertions

- `any` is banned. Use `unknown` and narrow with type guards. **[BIOME]**
- `as` casts are permitted **only** at verified external boundaries (JSON.parse, external API responses, Prisma raw queries). Every `as` cast must have an inline comment explaining why narrowing is not possible. **[REVIEW]**
- `// @ts-ignore` is banned. `// @ts-expect-error` is permitted only when suppressing a confirmed upstream library type bug, and must reference the issue (e.g., `// @ts-expect-error: next/font types don't include X — tracked in issue #123`). **[REVIEW]**

### Type declarations

- Exported functions have explicit return types. Internal/private functions may rely on inference. **[REVIEW]**
- `interface` for object shapes that describe domain entities and may be extended. `type` for unions, intersections, mapped types, and aliases. Never use one where the other is semantically correct. **[REVIEW]**
- No `enum`. Use `as const` objects and derive union types with `typeof X[keyof typeof X]`. Enums produce runtime objects that don't tree-shake cleanly in ESM. **[REVIEW]**

### Cross-package types

- Prisma model types (`Parent`, `Child`, Prisma namespace) are imported from `@kidlearn/db`. Never redeclare Prisma types in application code. **[REVIEW]**
- Activity and quiz JSON payload types live in `packages/types` (once activated). One definition is consumed by the frontend renderer, the backend validator, and the AI generation prompts. **[REVIEW]**
- Prefer `undefined` over `null` in application code. Use `null` only where a database column or external API mandates it. **[REVIEW]**

---

## 4. Module & Import Rules

### Import order

Import order is auto-organised by Biome's `organizeImports` on every `pnpm format` run. Never manually sort imports. **[BIOME]**

### Cross-package imports

- Always import from the package name, never via a relative path that crosses a package boundary. **[REVIEW]**

  ```ts
  // Correct
  import { prisma } from "@kidlearn/db";

  // Wrong — never do this
  import { prisma } from "../../packages/db/src/index";
  ```

- `packages/*` must never import from `apps/*`. Dependency arrows flow one way: `apps` → `packages`. **[REVIEW]**

### Intra-app imports

- Inside `apps/web`, use the `@/*` path alias for all intra-app imports. Never use `../../../` chains. **[REVIEW]**
- Inside a package, use relative imports.

### Circular dependencies

- No circular dependencies between packages. If package A needs something from package B and B needs something from A, the shared piece belongs in a third package (`packages/types` is the usual home). **[REVIEW]**

### Barrel files

- Barrel files (`index.ts` that re-exports everything) are permitted **only** at the public entry point of a package (`src/index.ts`). Deep internal barrel files obscure the dependency graph, slow TypeScript's module resolution, and make tree-shaking unreliable. Do not create them. **[REVIEW]**

### Side-effect imports

Side-effect-only imports (CSS files, polyfills) go at the top of the file before named imports. Add an inline comment if the side effect is non-obvious:

```ts
import "@kidlearn/ui/styles/tokens.css"; // design token contract
import { Button } from "@kidlearn/ui";
```

---

## 5. React & Next.js Conventions

> **Read `apps/web/AGENTS.md` before writing any Next.js code.** Next.js 16 has breaking changes from prior versions. Consult `node_modules/next/dist/docs/` for current API behaviour. The principles below are stable across versions; specifics are not.

### Server vs. Client Components

- **Default to Server Components.** Add `'use client'` only when required: event handlers, browser APIs (`window`, `document`), or React hooks that need client state. **[REVIEW]**
- Push the client boundary as far down the tree as possible. A single interactive button must not force its entire parent subtree to become a Client Component. Extract the interactive element into its own file and mark only that file with `'use client'`. **[REVIEW]**
- Never fetch data in a Client Component. Fetch in Server Components or Server Actions and pass data as props. **[REVIEW]**

### File naming in `app/`

Next.js App Router reserves specific filenames: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `route.ts`. Only use these names for their intended purpose. All other component files in the `app/` tree are PascalCase (`LessonCard.tsx`).

### Route organisation

The app has three distinct surfaces. Each lives in its own App Router route group with its own root layout:

```
app/
├── (student)/      # Student Portal — kid theme, full-bleed, gamified
├── (parent)/       # Parent Dashboard — parent theme, PIN-gated
└── (admin)/        # Admin CMS — internal, content management
```

A layout file in `(student)` must never import components from `(parent)` or `(admin)`, and vice versa. Shared components live in `packages/ui`. **[REVIEW]**

### Component files

- One primary exported component per file. Tightly coupled sub-components and their local types may be co-located in the same file if they are not used anywhere else, but the file is named after the primary export. **[REVIEW]**
- No prop drilling beyond two levels. Use composition patterns or React context. Context is defined in a `context/` directory within the route group that uses it. **[REVIEW]**

### Assets and strings

- All images use `next/image`. No raw `<img>` tags. **[REVIEW]**
- All fonts use `next/font` (self-hosted, no layout shift). No external font `<link>` tags. **[REVIEW]**
- Every user-facing string is routed through `i18next`. No hard-coded text in components, not even in development stubs. See `document/design.md §10` for copy voice guidelines. **[REVIEW]**

---

## 6. Express / Server Conventions

### Structure

```
apps/server/src/
├── routes/         # Express Router files — one file per resource (plural noun)
├── services/       # Business logic — plain async functions, no Express types
├── middleware/     # Express middleware (auth, validation, error handling)
├── lib/            # Pure utility functions
└── index.ts        # App bootstrap only — no routes or business logic inline
```

### Route handlers are thin

Route handlers validate the request and delegate to a service function. No business logic lives inline in a route handler. The test of correctness: you should be able to call every service function from a test without an HTTP layer. **[REVIEW]**

```ts
// Correct
router.get("/:id", validateParams(lessonParamsSchema), async (req, res) => {
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

### Validation

- All incoming request bodies and params are validated with Zod at the route boundary before any service call. A missing Zod schema on a route that accepts user input is a bug. **[REVIEW]**
- Zod schemas for request/response shapes that are shared between the frontend and backend live in `packages/types`. **[REVIEW]**
- Invalid input returns `400` with a structured error body before it reaches the database. **[REVIEW]**

### Database access

- The `prisma` singleton from `@kidlearn/db` is the only Prisma client in `apps/server`. Never instantiate `new PrismaClient()`. **[REVIEW]**
- No raw SQL. Use Prisma's query API exclusively. **[REVIEW]**

### Content-status guard — hard rule

Every Prisma query that serves student-facing content **must** include `where: { status: "published" }`. A missing filter is a content-safety bug, not a style issue. It must have an explicit test. **[REVIEW] [CI once tests are configured]**

```ts
// Correct
const lesson = await prisma.lesson.findUnique({
  where: { id, status: "published" },
});

// Wrong — exposes draft/review content to students
const lesson = await prisma.lesson.findUnique({ where: { id } });
```

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

## 7. Testing Standards

> **Tooling is not yet configured.** Vitest is the chosen runner for `apps/server` and `packages/*`. React Testing Library is the chosen tool for component tests in `apps/web`. This section defines the standards that apply once tooling is added. The standards are not aspirational — they are required before any feature is considered production-ready.

### File co-location

Test files live next to the file under test:

```
src/
├── services/
│   ├── lessonService.ts
│   └── lessonService.test.ts     # ← co-located
├── primitives/
│   ├── button.tsx
│   └── button.test.tsx           # ← co-located
```

No separate `__tests__` directories. **[REVIEW]**

### What to test by layer

| Layer | What to test | How |
|---|---|---|
| `packages/ui` — primitives & components | Variant logic, `cn()` output, prop contracts, keyboard interaction | Vitest unit + React Testing Library |
| `packages/db` | Schema constraints, cascade deletes, index correctness | Vitest against a real test DB |
| `apps/server` — services | All business logic paths, edge cases, error conditions | Vitest unit with real test DB |
| `apps/server` — routes | Request validation, correct status codes, auth guards | Vitest + supertest integration tests |
| Activity/quiz JSON engine | Every activity type, every quiz format, malformed and edge-case payloads | Vitest unit — content-safety critical |
| React components | Interactive behaviour: click, keyboard, state change, conditional rendering | React Testing Library |

### Content-safety tests — mandatory

The `status: "published"` filter must have an explicit test for every student-facing route. This test is a CI gate. A PR that removes or disables it does not merge.

```ts
it("does not return unpublished lessons to students", async () => {
  await createLesson({ status: "draft" });
  const res = await request(app).get("/lessons");
  expect(res.body).toHaveLength(0);
});
```

### No mocking `@kidlearn/db`

Service tests and route integration tests run against a real test database. Do not mock Prisma. The lesson from `document/project-requirement-details.md §12` (assumption 8) applies: mock/real divergence masks broken migrations. The only permitted mocks are external network boundaries — AI generation APIs, media hosting APIs, ElevenLabs. **[REVIEW]**

### No snapshot tests

Snapshot tests couple tests to markup structure rather than behaviour. They create false confidence and rot silently when markup changes for valid reasons. Use explicit assertions on rendered output instead. **[REVIEW]**

### Test naming

Test descriptions describe observable behaviour, not implementation:

```ts
// Correct
it("returns 404 when the lesson does not exist")
it("excludes draft lessons from student responses")
it("applies the kid size class when size='kid'")

// Wrong
it("test lesson endpoint")
it("lessonService.findById")
it("button renders")
```

### CI gate

Once Vitest is configured, `pnpm test` joins `pnpm typecheck` and `pnpm lint` as a required CI check. A PR that reduces test coverage on a service layer or disables a content-safety test does not merge. **[CI]**

---

## 8. Naming Conventions

### Files and directories

| Thing | Convention | Example |
|---|---|---|
| React component files | PascalCase | `LessonCard.tsx` |
| All other source files | kebab-case | `lesson-service.ts` |
| Directories | kebab-case | `game-widgets/`, `kid/` |
| Next.js reserved files | lowercase per framework | `page.tsx`, `layout.tsx` |
| Test files | same name as file under test + `.test` | `lessonService.test.ts` |

### Identifiers

| Thing | Convention | Example |
|---|---|---|
| React components | PascalCase | `LessonCard`, `RewardCeremony` |
| Functions and variables | camelCase | `fetchLessonById`, `childProfile` |
| True constants (never change at runtime) | SCREAMING_SNAKE_CASE | `MAX_CHILDREN_PER_PARENT` |
| TypeScript types and interfaces | PascalCase — no `I` prefix, no `Type` suffix | `LessonPayload`, `ActivityKind` |
| Zod schemas | camelCase + `Schema` suffix | `activityPayloadSchema` |
| `cva` variant objects | camelCase + `Variants` suffix | `buttonVariants` |
| React hooks | `use` prefix | `useScreenTime`, `useChildProfile` |
| Context objects | noun + `Context` | `ChildProfileContext` |
| Event handler props | `on` + noun + verb | `onLessonComplete` |
| Event handler implementations | `handle` + noun + verb | `handleLessonComplete` |
| Express route files | plural noun | `lessons.ts`, `children.ts` |
| Service files | singular noun + `Service` | `lessonService.ts` |

### Additional rules

- **No unexplained abbreviations.** `id`, `url`, `api`, `db` are universally understood and permitted. `qty`, `usr`, `btn`, `cfg` are not. **[REVIEW]**
- **Boolean variables and props use an `is`, `has`, or `can` prefix.** `isPublished`, `hasChildren`, `canRetry`. A prop named `published` is ambiguous; `isPublished` is not. **[REVIEW]**
- **Route group directories** follow Next.js App Router convention: parentheses notation, lowercase — `(student)`, `(parent)`, `(admin)`. **[REVIEW]**

---

## 9. Enforcement Matrix

### Automatic — Biome `[BIOME]`

Biome runs on `pnpm lint` (read-only) and `pnpm format` (auto-fix). These violations block CI:

- Import order and organisation (`organizeImports`)
- Formatting: 2-space indent, double quotes, line length
- Recommended lint rules: unused variables, no explicit `any`, unreachable code, and others from `linter.rules.recommended`
- CSS formatting with Tailwind `@theme` / `@apply` directive awareness

### Automatic — TypeScript `[TS]`

Checked by `pnpm typecheck` (blocks CI):

- All `strict` mode flags
- `noImplicitReturns`
- Type mismatches, missing exports, incorrect generic usage

### Automatic — CI `[CI]`

Blocks merge (once Vitest is configured):

- All tests pass, including explicit content-safety guard tests
- `pnpm build` succeeds across all packages
- `pnpm typecheck` passes across all packages
- `pnpm lint` passes (Biome clean)

### Human review gate `[REVIEW]`

A reviewer is responsible for catching these. **They are mandatory — not optional.** "Automation doesn't catch it" does not mean "it's acceptable to violate it."

| Rule | Why automation can't catch it |
|---|---|
| Semantic tokens only — no raw hex, brand hues, or Tailwind color literals in component code | CSS string values are not type-checked |
| All user-facing strings via `i18next` — no hard-coded text | No static analysis for JSX string literals |
| `'use client'` boundary placed as low as possible | Architectural judgment |
| Component placed in the correct `packages/ui` layer (`primitives/`, `kid/`, `parent/`) | Requires understanding of surface assumptions |
| Service layer holds business logic; route handlers are thin | Structural, not syntactic |
| Zod validation present on every route that accepts user input | Requires reading the full route |
| `status: "published"` filter on every student-facing Prisma query | Query logic, not type error |
| `@kidlearn/db` singleton used — no `new PrismaClient()` in `apps/server` | Import source alone is ambiguous |
| No cross-package dependency in wrong direction (`packages` never import `apps`) | Turborepo does not enforce direction statically |
| Design rules: touch targets, motion, accessibility — see `document/design.md §7, §5, §11` | Visual and accessibility review |
| No barrel files inside packages beyond `src/index.ts` | Not yet a linter rule |
| No `enum` — `as const` only | Biome's `noEnum` rule is not enabled by default |
| `as` casts have an explanatory comment | Comment presence is not enforced |

---

## 10. GitHub Flow

### The rule

Every implementation file in `document/implementation/` maps to exactly one feature branch. The branch name is the implementation filename without the `.md` extension.

```
document/implementation/01-workspace-packages-and-test-setup.md
→ branch: 01-workspace-packages-and-test-setup
```

### Starting work on an implementation file

Use the `/start-implementation <filename-without-extension>` skill. It will:

1. Verify the current branch is `main` and that `main` is clean.
2. Create the feature branch from `main`: `git checkout -b <filename>`.
3. Read the implementation file and begin the work described in it.
4. **Stop before committing.** Leave all changes unstaged (or staged but not committed) for the engineer to review manually.

Do not start implementation work directly on `main`. Do not create ad-hoc branch names — the branch name must match the implementation filename exactly.

### Committing

The engineer reviews the changes, then commits manually. Claude does not commit implementation work. This is intentional: a human must own every commit on a feature branch.

### Opening a pull request

Use the `/pr-description` skill after implementation is complete. It reads the implementation file for the current branch, diffs against `main`, and produces a structured PR description ready to paste into GitHub.

### Branch lifecycle

| Stage | State |
|---|---|
| Work in progress | Feature branch, no commits yet (engineer reviews) |
| Ready for review | Feature branch pushed, PR opened with `/pr-description` output |
| Merged | PR squash-merged to `main`; feature branch deleted |

### Progress tracking — mandatory

`document/implementation/00-progress-tracker.md` is the single source of truth for what is done and what is not. It must be kept current at every stage:

| Moment | Action |
|---|---|
| When the feature branch is created | Change the row's **Status** from `⬜ Not started` → `🟨 In progress` |
| When implementation is complete (before committing) | Change the row's **Status** from `🟨 In progress` → `✅ Done` |

Both edits to `00-progress-tracker.md` are left unstaged alongside the implementation work so the engineer reviews and commits them together. Never push a feature branch without the tracker reflecting the correct status. **[REVIEW]**

### One branch per implementation file

Do not combine two implementation files into one branch. If work on file `07` reveals a bug in file `05`'s output, fix it in a separate branch named `05-<filename>-fix` and open a separate PR.

---

_Engineering Standards v1 — kidlearn. Update this document first; update the code second. If a pattern in the codebase contradicts this document, the document wins unless a deliberate decision is recorded here._
