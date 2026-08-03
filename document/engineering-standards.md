# kidlearn — Engineering Standards (index)

> **Authority:** These standards govern every file committed to this repository. They apply to all engineers at all times.
>
> **This file is an index.** The standards themselves were split into role-scoped documents under `document/standards/` so that a task loads only what it needs. Nothing was dropped — every rule from the previous single-file version lives in exactly one of the documents below.

---

## Which documents to load

| Document | Load it when | Contents |
|---|---|---|
| **[`standards/general.md`](./standards/general.md)** | **Always — every task, every layer.** | Monorepo layout & package activation, TypeScript conventions, module & import rules, naming conventions, shared testing rules, the enforcement matrix, GitHub flow & progress tracking |
| **[`standards/frontend.md`](./standards/frontend.md)** | The task touches `packages/ui`, `apps/web`, React, Next.js, styling, or anything a user looks at | `packages/ui` layer architecture, `cva`/token rules, theme isolation, Server vs. Client Components, App Router route groups, assets & i18n, frontend testing, frontend review checklist |
| **[`standards/backend.md`](./standards/backend.md)** | The task touches `apps/server`, `packages/db`, `packages/types`, Express, Prisma, API routes, or database schema | Server structure, thin route handlers, Zod validation, Prisma access rules, the `status: "published"` content guard, error handling & env validation, backend testing, backend review checklist |

A full-stack task loads all three. A task that is purely schema or API work does not need `frontend.md`; a task that is purely UI does not need `backend.md`.

---

## Related documents

| Document | Role |
|---|---|
| [`design.md`](./design.md) | **Single source of truth for visual decisions** — visual language, tokens, motion, accessibility, component design rules. Load with `standards/frontend.md`. |
| [`database-design.md`](./database-design.md) | Authoritative schema design. Load with `standards/backend.md` for schema or migration work. |
| [`project-requirement-details.md`](./project-requirement-details.md) | Product requirements and feature scope. |
| [`user-journey-manual.md`](./user-journey-manual.md) | End-to-end user flows across both portals. |
| [`implementation/`](./implementation/) | Per-feature implementation specs; `00-progress-tracker.md` is the source of truth for status. |

---

## Enforcement legend

Used throughout the standards documents:

| Tag | Meaning |
|---|---|
| **[BIOME]** | Auto-enforced on every `pnpm lint` run |
| **[TS]** | Caught by TypeScript at compile time (`pnpm typecheck`) |
| **[CI]** | The pipeline blocks the merge |
| **[REVIEW]** | A human reviewer is responsible — the rule is no less mandatory, but automation cannot yet catch it |

The full breakdown of what each tag covers is in [`standards/general.md §6`](./standards/general.md#6-enforcement-matrix).

---

_Engineering Standards v2 — kidlearn. Update the standards document first; update the code second. If a pattern in the codebase contradicts the standards, the standards win unless a deliberate decision is recorded there._
