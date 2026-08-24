# kidlearn — Frontend Standards

> **Load this document when the task touches `packages/ui`, `apps/web`, React, Next.js, styling, or anything a user looks at.**
>
> **Always load alongside it:** [`standards/general.md`](./general.md) — monorepo layout, TypeScript, imports, naming, testing, GitHub flow.
>
> **Also read:**
> - [`document/design.md`](../design.md) — visual language, tokens, motion, accessibility. **Single source of truth for visual decisions.** This document cross-references it but does not repeat it.
> - [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) — Next.js 16 breaking changes. **Read before writing any Next.js code.**
>
> **Enforcement legend:** **[BIOME]** / **[TS]** / **[CI]** / **[REVIEW]** — see [`general.md`](./general.md).

---

## Table of Contents

1. [`packages/ui` Component Architecture](#1-packagesui-component-architecture)
2. [React & Next.js Conventions](#2-react--nextjs-conventions)
3. [Assets and Strings](#3-assets-and-strings)
4. [Frontend Testing](#4-frontend-testing)
5. [Frontend Review Checklist](#5-frontend-review-checklist)

---

## 1. `packages/ui` Component Architecture

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

## 2. React & Next.js Conventions

> **Read `apps/web/AGENTS.md` before writing any Next.js code.** Next.js 16 has breaking changes from prior versions. Consult `node_modules/next/dist/docs/` for current API behaviour. The principles below are stable across versions; specifics are not.

### Server vs. Client Components

- **Default to Server Components.** Add `'use client'` only when required: event handlers, browser APIs (`window`, `document`), or React hooks that need client state. **[REVIEW]**
- Push the client boundary as far down the tree as possible. A single interactive button must not force its entire parent subtree to become a Client Component. Extract the interactive element into its own file and mark only that file with `'use client'`. **[REVIEW]**
- Never fetch data in a Client Component. Fetch in Server Components or Server Actions and pass data as props. **[REVIEW]**

#### Recorded exception — the `(admin)` CMS fetches in the browser

**Status: active as of 2026-08-22 (file 31), widened to the curriculum tree in
file 32.** The admin session cookie belongs to the API origin, not the Next
server, so a Server Component calling `/api/admin/*` sends no credentials and
gets a `401` — see the comment at the head of `lib/admin-api.ts`. Server-side
fetching is not merely inconvenient here; it cannot authenticate.

The CMS screens therefore hold their own data: `AnalyticsScreen`,
`CurriculumScreen` and the components under `app/(admin)/`. Each `page.tsx`
stays a Server Component and the `'use client'` boundary sits on the screen, so
the rest of the rule above still binds.

This is bounded to `app/(admin)/`. A `(student)` or `(parent)` route has a
session the Next server can read and gets no exception.

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

---

## 3. Assets and Strings

- All images use `next/image`. No raw `<img>` tags. **[REVIEW]**
- All fonts use `next/font` (self-hosted, no layout shift). No external font `<link>` tags. **[REVIEW]**
- Every user-facing string is routed through `i18next`. No hard-coded text in components, not even in development stubs. See `document/design.md §10` for copy voice guidelines. **[REVIEW]**

#### Recorded exception — the `(admin)` CMS is English-only

**Status: active as of 2026-08-22 (file 31).** FR-I18N covers the child and parent
surfaces, which are the ones a family reads. The CMS is an internal tool used by
the team, so strings in `app/(admin)/`, `components/admin/` and
`lib/admin-routes.ts` stay hard-coded English rather than wiring a fourth i18next
namespace — the alternative is a Bangla translation of "AI Queue" that nobody has
asked for.

This is bounded to the `(admin)` surface. A string on any `(student)` or `(parent)`
path is not covered by it, whichever directory the component lives in.

**Exit condition:** the day a reviewer outside the team is onboarded.
`lib/admin-routes.ts` holds the nav labels, so it and the screens under
`app/(admin)/` are what change; delete this section then.

---

## 4. Frontend Testing

> Shared testing rules — co-location, no snapshot tests, test naming, CI gate — are in [`general.md §5`](./general.md#5-testing-standards--shared-rules). This section covers only what is frontend-specific.

| Layer | What to test | How |
|---|---|---|
| `packages/ui` — primitives & components | Variant logic, `cn()` output, prop contracts, keyboard interaction | Vitest unit + React Testing Library |
| React components in `apps/web` | Interactive behaviour: click, keyboard, state change, conditional rendering | React Testing Library |
| Activity/quiz JSON engine (renderer side) | Every activity type, every quiz format, malformed and edge-case payloads | Vitest unit — content-safety critical |

Test rendered, observable output — not internal state or markup structure.

---

## 5. Frontend Review Checklist

Before considering frontend work complete:

- [ ] Component sits in the correct `packages/ui` layer (`primitives/` / `kid/` / `parent/` / `hooks/` / `lib/` / `styles/`)
- [ ] Variants built with `cva` + `cn()` — no ad-hoc `className` concatenation
- [ ] Semantic tokens only — no raw hex, brand hue names, or Tailwind color literals
- [ ] No theme branching in JavaScript — `data-theme` on the layout boundary only
- [ ] `'use client'` placed as low in the tree as possible; no data fetching in Client Components (except the `(admin)` CMS — see §2)
- [ ] All user-facing strings via `i18next` (except the `(admin)` CMS — see §3)
- [ ] Images via `next/image`, fonts via `next/font`
- [ ] Touch targets: ≥64px on kid surfaces, ≥44px on parent surfaces (`document/design.md §7`)
- [ ] Motion respects `prefers-reduced-motion`; animates only `transform` and `opacity` (`document/design.md §5`)
- [ ] New public components exported from both `src/index.ts` and the `package.json` `exports` map
- [ ] `pnpm typecheck` and `pnpm lint` pass

---

_Frontend Standards v1 — kidlearn. `document/design.md` wins on any visual question. Update this document first; update the code second._
