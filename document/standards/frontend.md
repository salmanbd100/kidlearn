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
2. [`apps/web` Layout](#2-appsweb-layout)
3. [React & Next.js Conventions](#3-react--nextjs-conventions)
4. [Assets and Strings](#4-assets-and-strings)
5. [Frontend Testing](#5-frontend-testing)
6. [Frontend Review Checklist](#6-frontend-review-checklist)

---

## 1. `packages/ui` Component Architecture

### Structure

```
packages/ui/src/
├── primitives/     # shadcn/ui components — theme-agnostic, no surface assumptions
├── hooks/          # shared React hooks — no UI rendering
├── lib/            # cn(), a11y prefs, pure utility functions — no JSX
└── styles/         # tokens.css + theme blocks — CSS only, no TS
```

#### Recorded decision — `packages/ui` is the primitive layer, not a component library

**Decided 2026-09-04 , confirmed 2026-10-05.** This section
once specified `kid/` and `parent/` layers inside `packages/ui`. Nothing was ever
placed there, and nothing should be: their only payoff is reuse by a second app,
and [`mobile-app-plan.md §4.2`](../mobile-app-plan.md) rules that out — Radix
primitives are DOM-bound and Tailwind's CSS variables do not exist in React
Native, so the mobile app shares tokens, types and strings, not components.

`packages/ui` therefore holds what is theme-agnostic and app-agnostic. A
surface component lives in the app that renders it. It is promoted into
`packages/ui/src/primitives/` only when a second surface renders it **and** it
depends on nothing app-owned — `BigButton` and `IconTile` fail the second test,
because both call `useAudio`, whose provider loads assets from `apps/web/public`.

### Where a new file goes

If it matches more than one row, use the first.

| Question | Home |
|---|---|
| Is it a copied shadcn/ui primitive, or a component both themes render with no surface assumptions? | `packages/ui/src/primitives/` |
| Is it a React hook with no JSX and no app-owned dependency? | `packages/ui/src/hooks/` |
| Is it a pure function with no JSX and no app-owned dependency? | `packages/ui/src/lib/` |
| Is it a CSS variable declaration or theme block? | `packages/ui/src/styles/` |
| Does one feature use it (a game widget, a stat card, a reward ceremony)? | `apps/web/features/<domain>/` |
| Do two or more features use it on the kid surface? | `apps/web/shared/components/kid/` |
| Do two or more features use it elsewhere? | `apps/web/shared/components/` |

### Rules that apply to every layer

**Variants and styling**

- All variant APIs use `cva` (class-variance-authority) combined with `cn()` from `@kidlearn/ui/lib/cn`. No ad-hoc `className` string concatenation anywhere else. **[REVIEW]**
- Components expose `variant`, `size`, and `tone` props. Callers do not pass long `className` strings to fundamentally restyle a component. If a caller needs a visual treatment that no variant covers, add the variant — do not make the caller responsible for styling internals. **[REVIEW]**
- All color, radius, shadow, and spacing values come from semantic tokens (CSS variables). Components never reference raw hex values, brand hue names, or Tailwind color literals directly. See `document/design.md §2` for the full token contract. **[REVIEW]**

**Theme isolation**

- Components never branch on theme in JavaScript (`if theme === 'kid'`). Theme is applied by `<ThemeScope theme="kid">` or `<ThemeScope theme="parent">` (`@kidlearn/ui`) on a layout boundary; token values cascade automatically. A hand-written `data-theme` div does not reach portalled dialogs and menus, which mount in `<body>`. **[REVIEW]**
- Surface components compose from `packages/ui` primitives — they never duplicate primitive markup inline. **[REVIEW]**

**Adding a shadcn component**

1. Run the shadcn CLI targeting `packages/ui`: `npx shadcn add <component> --path packages/ui`
2. Confirm the output landed in `src/primitives/`
3. Verify it uses only semantic tokens, not shadcn's default color literals
4. Export it from `src/index.ts`

**Exports**

Everything public is exported from `src/index.ts`. Individual `primitives/*` are additionally available via the `exports` map in `package.json` for consumers that want to tree-shake. If you add a new public component, add it to both `src/index.ts` and the `exports` map.

---

## 2. `apps/web` Layout

```
apps/web/
├── app/            # Next.js App Router — route groups, pages, layouts, screens
├── features/       # One directory per domain, named after the server module
├── shared/
│   ├── api/        # api-client + the clients more than one feature calls
│   ├── components/ # Providers and cross-feature components (kid/ surface layer)
│   ├── hooks/      # Cross-feature React hooks
│   └── lib/        # i18n, locale and formatting helpers — no JSX
```

The strings themselves are not here: they are `@kidlearn/i18n`
(`packages/i18n/locales/{en,bn}/`), shared with the mobile app.

A feature owns everything one domain needs: its components, its hooks, its pure
helpers, its API client, and every suite that covers them. `features/screen-time/`
holds the parent's limit form, the student's lock screen, the API client, the
heartbeat hook and the duration formatter — the split by portal that used to
scatter these across `components/parent`, `components/student` and `lib/` is the
mistake this layout exists to prevent.

Rules:

- **Feature names track the server.** Where a domain exists on both sides it has
  the same name in `apps/web/features/` and `apps/server/src/modules/`. Server
  routes grouped under one module group the same way here — dashboard code lives
  in `features/children/`, as `dashboard.routes.ts` does. **[REVIEW]**
- **`shared/` is for the second consumer, not the first.** A component used by
  one feature lives in that feature. It moves to `shared/` when a second feature
  imports it, not in anticipation. **[REVIEW]**
- **`app/` holds routing, not logic.** Pages, layouts and the screen components
  they render stay under `app/`; anything a second route could reuse belongs in a
  feature. **[REVIEW]**
- **No barrel files.** Imports name the file: `@/features/quiz/QuizEngine`. See
  [`general.md §3`](./general.md#3-module--import-rules). **[REVIEW]**
- Components stay PascalCase, everything else kebab-case, per
  [`general.md §4`](./general.md#4-naming-conventions). The server's dotted
  `.service` / `.schema` suffixes are a server convention and do not apply here.

---

## 3. React & Next.js Conventions

> **Read `apps/web/AGENTS.md` before writing any Next.js code.** Next.js 16 has breaking changes from prior versions. Consult `node_modules/next/dist/docs/` for current API behaviour. The principles below are stable across versions; specifics are not.

### Server vs. Client Components

- **Default to Server Components.** Add `'use client'` only when required: event handlers, browser APIs (`window`, `document`), or React hooks that need client state. **[REVIEW]**
- Push the client boundary as far down the tree as possible. A single interactive button must not force its entire parent subtree to become a Client Component. Extract the interactive element into its own file and mark only that file with `'use client'`. **[REVIEW]**
- Never fetch data in a Client Component. Fetch in Server Components or Server Actions and pass data as props. **[REVIEW]**

#### Recorded exception — every surface fetches in the browser

**Status: active. Opened 2026-08-22 for `(admin)` (file 31, widened to the
curriculum tree in file 32); widened on 2026-10-04 to `(student)` and `(parent)`
by the `apps/web` review, which found the code already doing it.** The session
cookie is set by better-auth on the API origin and carries no `domain`
attribute (`apps/server/src/config/auth.ts`), so it is host-only: a Server
Component calling `/api/*` sends no credentials and gets a `401`. See the comment
at the head of `features/admin/admin-api.ts` and the `credentials: "include"` in
`shared/api/api-client.ts`. Server-side fetching is not merely inconvenient on
any of the three surfaces; it cannot authenticate.

The screens therefore hold their own data. Each `page.tsx` stays a Server
Component and the `'use client'` boundary sits on the screen, so the rest of the
rule above still binds: push the boundary down, and keep fetching out of
components that are not screens, guards or providers.

What stays a finding: a Client Component that fetches data no session is needed
for (a public, cacheable read) — that one has no reason to leave the server.

In `(student)` a screen's own reads start only after `ActiveChildProvider`'s
three have resolved, because `StudentGuard` does not mount a screen without a
child. That is one extra round trip, not two cold starts — the provider's
requests wake the API, so the screen's find it awake. It stays serial on
purpose: mounting a screen before the child is known starts its narration and
screen-time gate with no child, and the alternative — a cross-screen prefetch
cache — is the kind of module-level state R-27 deleted from the lesson player
for having no reader.

**Exit condition:** the day the API and the web app share a registrable domain
and the cookie is issued with a `domain` the Next server can read, or a
token-exchange route lets Server Components act as the signed-in parent. Delete
this section then and move the reads to Server Components.

### File naming in `app/`

Next.js App Router reserves specific filenames: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `route.ts`. Only use these names for their intended purpose. All other component files in the `app/` tree are PascalCase (`LessonCard.tsx`).

### Route organisation

The app has three product surfaces and one public site. Each lives in its own App Router route group with its own layout:

```
app/
├── (site)/         # Public homepage and guides — kid theme, unauthenticated
├── (student)/      # Student Portal — kid theme, full-bleed, gamified
├── (parent)/       # Parent Dashboard — parent theme, Google session only (sign-in is the homepage dialog)
└── (admin)/        # Admin CMS — internal, content management
```

A layout file in `(student)` must never import components from `(parent)` or `(admin)`, and vice versa. What two groups share lives in `features/` or `shared/` — see §1 for when it goes further, into `packages/ui`. **[REVIEW]**

`(site)` owns `/` and `/guide/*` (FR-SITE-01..03). It is public, needs no session, and is scoped `<ThemeScope theme="kid">` so it reads as the same product — but it is **not part of the Student Portal**. It carries external links (GitHub), which NFR-SAFE-07 forbids on the child's surface, so the rule runs one way: no `(student)` screen links to a `(site)` route, and `app/(student)/no-external-links.test.tsx` fails if one does. The root `not-found.tsx` is shared by every surface and still links to `/`; the homepage's primary action leads a child straight back to `/select-profile`.

Parent and admin sign-in are dialogs on the homepage, opened by `?signin=parent` (`PARENT_ROUTES.login`) and `?signin=admin` (`ADMIN_ROUTES.login`); there is no sign-in page, and `/parent/login` and `/admin/login` only redirect there. So a signed-out session on the student surface — `StudentGuard` and the profile picker — is *redirected* to `/` with the dialog open. That is a redirect for a device with no parent session, not a link a child can follow from a working screen, but it does put a child on a page with external links if they dismiss the dialog. Recorded 2026-10-07 as a known trade against NFR-SAFE-07; revisit if the homepage gains more outward links. Its pieces live in `features/site/` — a web-only domain with no server module, so the "feature names track the server" rule in §2 does not bind it. **[REVIEW]**

### Component files

- One primary exported component per file. Tightly coupled sub-components and their local types may be co-located in the same file if they are not used anywhere else, but the file is named after the primary export. **[REVIEW]**
- No prop drilling beyond two levels. Use composition patterns or React context. Context is defined in a `context/` directory within the route group that uses it. **[REVIEW]**

---

## 4. Assets and Strings

- All images use `next/image`. No raw `<img>` tags. **[REVIEW]**
- All fonts use `next/font` (self-hosted, no layout shift). No external font `<link>` tags. **[REVIEW]**
- Every user-facing string is routed through `i18next`. No hard-coded text in components, not even in development stubs. See `document/design.md §10` for copy voice guidelines. **[REVIEW]**

#### Recorded exception — the `(admin)` CMS is English-only

**Status: active as of 2026-08-22 (file 31).** It also covers `features/admin/AdminSignInDialog.tsx`, which renders on the homepage but belongs to the CMS. FR-I18N covers the child and parent
surfaces, which are the ones a family reads. The CMS is an internal tool used by
the team, so strings in `app/(admin)/` and `features/admin/`
(including `features/admin/admin-routes.ts`) stay hard-coded English rather than wiring a fourth i18next
namespace — the alternative is a Bangla translation of "AI Queue" that nobody has
asked for.

This is bounded to the `(admin)` surface. A string on any `(student)` or `(parent)`
path is not covered by it, whichever directory the component lives in.

**Exit condition:** the day a reviewer outside the team is onboarded.
`features/admin/admin-routes.ts` holds the nav labels, so it and the screens under
`app/(admin)/` are what change; delete this section then.

---

## 5. Frontend Testing

> Shared testing rules — co-location, no snapshot tests, test naming, CI gate — are in [`general.md §5`](./general.md#5-testing-standards--shared-rules). This section covers only what is frontend-specific.

| Layer | What to test | How |
|---|---|---|
| `packages/ui` — primitives & components | Variant logic, `cn()` output, prop contracts, keyboard interaction | Vitest unit + React Testing Library |
| React components in `apps/web` | Interactive behaviour: click, keyboard, state change, conditional rendering | React Testing Library |
| Activity/quiz JSON engine (renderer side) | Every activity type, every quiz format, malformed and edge-case payloads | Vitest unit — content-safety critical |

Test rendered, observable output — not internal state or markup structure.

---

## 6. Frontend Review Checklist

Before considering frontend work complete:

- [ ] Component sits where §1's table puts it: a component two surfaces render, depending on nothing app-owned, belongs in `packages/ui/src/primitives/`; one a single surface renders stays in `apps/web`
- [ ] Variants built with `cva` + `cn()` — no ad-hoc `className` concatenation
- [ ] Semantic tokens only — no raw hex, brand hue names, or Tailwind color literals
- [ ] No theme branching in JavaScript — `ThemeScope` on the layout boundary only
- [ ] `'use client'` placed as low in the tree as possible; no data fetching in Client Components (except where the session cookie forces it — see §3)
- [ ] All user-facing strings via `i18next` (except the `(admin)` CMS — see §3)
- [ ] Images via `next/image`, fonts via `next/font`
- [ ] Touch targets: ≥64px on kid surfaces, ≥44px on parent surfaces (`document/design.md §7`)
- [ ] Motion respects `prefers-reduced-motion`; animates only `transform` and `opacity` (`document/design.md §5`)
- [ ] New public components exported from both `src/index.ts` and the `package.json` `exports` map
- [ ] `pnpm typecheck` and `pnpm lint` pass

---

_Frontend Standards v1 — kidlearn. `document/design.md` wins on any visual question. Update this document first; update the code second._
