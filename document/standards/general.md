# kidlearn — General Standards

> **Load this document for every task.** It governs every file committed to this repository regardless of which layer you are working in.
>
> **Role-specific companions — load only the ones your task touches:**
> - [`standards/frontend.md`](./frontend.md) — `packages/ui`, `apps/web`, React, Next.js, components, styling
> - [`standards/backend.md`](./backend.md) — `apps/server`, Express, Prisma, `packages/db`, API design
>
> **Enforcement legend:** **[BIOME]** auto-enforced on every `pnpm lint` run. **[TS]** caught by TypeScript at compile time. **[CI]** the pipeline blocks the merge. **[REVIEW]** a human reviewer is responsible — the rule is no less mandatory, but automation cannot yet catch it.

---

## Table of Contents

1. [Monorepo Layout Rules](#1-monorepo-layout-rules)
2. [TypeScript Conventions](#2-typescript-conventions)
3. [Module & Import Rules](#3-module--import-rules)
4. [Naming Conventions](#4-naming-conventions)
5. [Testing Standards — Shared Rules](#5-testing-standards--shared-rules)
6. [Enforcement Matrix](#6-enforcement-matrix)
7. [GitHub Flow](#7-github-flow)

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

## 2. TypeScript Conventions

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

## 3. Module & Import Rules

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

## 4. Naming Conventions

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
| Zod schemas | PascalCase + `Schema` suffix | `ActivityDefinitionSchema`, `McqQuestionSchema` |
| `cva` variant objects | camelCase + `Variants` suffix | `buttonVariants` |
| React hooks | `use` prefix | `useScreenTime`, `useChildProfile` |
| Context objects | noun + `Context` | `ChildProfileContext` |
| Event handler props | `on` + noun + verb | `onLessonComplete` |
| Event handler implementations | `handle` + noun + verb | `handleLessonComplete` |
| Express route files | plural noun | `lessons.ts`, `children.ts` |
| Service files | singular noun + `Service` | `lessonService.ts` |

### Additional rules

- **No unexplained abbreviations.** `id`, `url`, `api`, `db` are universally understood and permitted. `qty`, `usr`, `btn`, `cfg` are not. **[REVIEW]**
- **Zod schemas are PascalCase** so each schema reads as a pair with the type inferred from it — `McqQuestionSchema` declares `McqQuestion`. A camelCase schema next to a PascalCase type makes the pairing hard to scan, and a Zod schema is a type declaration in practice. **[REVIEW]**
- **Boolean variables and props use an `is`, `has`, or `can` prefix.** `isPublished`, `hasChildren`, `canRetry`. A prop named `published` is ambiguous; `isPublished` is not. **[REVIEW]**

  #### Recorded exception — verb-phrase option booleans

  **Status: active as of 2026-08-24 (file 32).** A name that opens with an
  imperative verb — `includeArchived`, `showDrafts`, `skipCache`, `forceRefresh` —
  states the action a caller is requesting, not a predicate about a thing. The
  ambiguity this rule exists to remove is not present: `published` could be a
  status, a date or a flag, whereas `includeArchived` can only be an instruction.
  Prefixing it produces `isArchivedIncluded`, which reads worse and, where the
  name is an HTTP query parameter, worsens the API surface too.

  Bounded to names whose first word is a verb. An adjective or past participle
  (`published`, `enabled`, `attempted`) is still covered by the rule and still
  takes a prefix.
- **Route group directories** follow Next.js App Router convention: parentheses notation, lowercase — `(student)`, `(parent)`, `(admin)`. **[REVIEW]**

---

## 5. Testing Standards — Shared Rules

> **Tooling is not yet configured.** Vitest is the chosen runner for `apps/server` and `packages/*`. React Testing Library is the chosen tool for component tests in `apps/web`. This section defines the standards that apply once tooling is added. The standards are not aspirational — they are required before any feature is considered production-ready.
>
> Layer-specific "what to test" guidance lives in [`frontend.md §4`](./frontend.md#4-frontend-testing) and [`backend.md §6`](./backend.md#6-backend-testing).

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

### No mocking `@kidlearn/db`

Service tests and route integration tests run against a real test database. Do not mock Prisma. The lesson from `document/project-requirement-details.md §12` (assumption 8) applies: mock/real divergence masks broken migrations. The only permitted mocks are external network boundaries — AI generation APIs, media hosting APIs, ElevenLabs. **[REVIEW]**

#### Recorded exception — `apps/server` stubs `lib/prisma.js` until the test database lands

**Status: active as of 2026-08-05. Remove this section the day the harness exists.**

No test database is provisioned yet, so every route and service suite in `apps/server` stubs `../lib/prisma.js` instead. This is a deliberate, documented deviation, not an oversight — recording it here is what keeps it from reading as an unnoticed violation on review.

The deviation is bounded by four rules. A suite that breaks one of them is not covered by this exception:

1. **Stub state, not answers.** The stub models the store — `children.test.ts` keeps an in-memory array; `parent.test.ts` applies Prisma's `{ increment: n }` to a row it carries across writes. A chain of one-shot `mockResolvedValue`s asserts nothing about behaviour and is not permitted.
2. **Assert the query, not just the result.** A stubbed suite cannot show that a draft row stayed in the database, so it asserts the `where` clause that keeps it there. This is how the content-safety guard is testable at all before the harness exists — see `content.test.ts`.
3. **`where` clauses are not the whole guard.** Relations loaded with `include` carry their own `status`, and no `where`-clause assertion can see them. Gate them explicitly and assert on the response body — see the `related rows carry their own status gate` block in `content.test.ts`.
4. **Name what the stub cannot prove.** Anything resting on the database's own behaviour — `ON DELETE CASCADE`, transaction isolation, unique constraints — gets an assertion against the declaration it rests on (`children.test.ts` reads `schema.prisma` for the cascades and asserts the isolation level passed to `$transaction`) plus a comment saying a real test replaces it later.

**What this exception costs, so the cost is on the record:** two defects shipped through it in files 10–12 — a content-safety leak through `include`d relations, invisible to `where`-clause assertions, and a lost-update on the PIN counter that a fixed-row stub could not express. Rules 1, 3 and 4 above are the direct response. Rule 2 is not a substitute for the real thing; it is what is possible in the meantime.

**Exit condition:** once the Vitest test-database harness exists, port these suites to it and delete this section. Until then, a new suite that stubs Prisma must cite this exception in its file-header comment.

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

## 6. Enforcement Matrix

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

| Rule | Layer | Why automation can't catch it |
|---|---|---|
| Semantic tokens only — no raw hex, brand hues, or Tailwind color literals in component code | frontend | CSS string values are not type-checked |
| All user-facing strings via `i18next` — no hard-coded text | frontend | No static analysis for JSX string literals |
| `'use client'` boundary placed as low as possible | frontend | Architectural judgment |
| Component placed in the correct `packages/ui` layer (`primitives/`, `kid/`, `parent/`) | frontend | Requires understanding of surface assumptions |
| Design rules: touch targets, motion, accessibility — see `document/design.md §7, §5, §11` | frontend | Visual and accessibility review |
| Service layer holds business logic; route handlers are thin | backend | Structural, not syntactic |
| Zod validation present on every route that accepts user input | backend | Requires reading the full route |
| `status: "published"` filter on every student-facing Prisma query | backend | Query logic, not type error |
| `@kidlearn/db` singleton used — no `new PrismaClient()` in `apps/server` | backend | Import source alone is ambiguous |
| No cross-package dependency in wrong direction (`packages` never import `apps`) | general | Turborepo does not enforce direction statically |
| No barrel files inside packages beyond `src/index.ts` | general | Not yet a linter rule |
| No `enum` — `as const` only | general | Biome's `noEnum` rule is not enabled by default |
| `as` casts have an explanatory comment | general | Comment presence is not enforced |

---

## 7. GitHub Flow

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
3. Read the implementation file, load the standards documents relevant to the layers it touches, and begin the work described in it.
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

_General Standards v1 — kidlearn. Update this document first; update the code second. If a pattern in the codebase contradicts this document, the document wins unless a deliberate decision is recorded here._
