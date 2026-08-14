# kidlearn — Design System & Typography Guide

> **Single source of truth** for the visual language of kidlearn. Every component,
> page, and theme decision must trace back to this document. If something here is
> wrong, fix it here first — then change the code. Do not hard-code values that
> exist as tokens below.
>
> Companion docs: [`document/key-description.md`](./key-description.md) (product brief),
> [`.claude/skills/create-component`](../.claude/skills/create-component/SKILL.md) (how to build a component).

---

## 0. Decisions of record

These are settled. Revisit only with a deliberate ADR-style note appended to this file.

| Decision | Choice | Why |
| --- | --- | --- |
| **Component foundation** | **shadcn/ui** (Radix primitives, copied into `packages/ui`) | You own the code — no upstream breaking changes, full a11y, Tailwind v4-native, zero lock-in. Best for long-term SaaS maintainability. |
| **Animation** | **Motion** (`motion`, formerly Framer Motion) | Declarative, spring-based, accessible (respects reduced-motion). Drives all micro-interactions and kid game feedback. |
| **Kid game widgets** | **Custom**, built on Tailwind + Motion | No library ships balloon-pop / tracing / drag-drop matching. Built in-house on the shared token contract. |
| **Theming model** | **One token contract, two themes** (`kid`, `parent`) | Shared primitives + components; only token *values* swap. Max consistency and reuse across the dual-portal product. |
| **Kid aesthetic** | **Bright & playful, rounded** | High engagement for ages 3–5; chunky tactile targets, bouncy motion, rounded display type. |
| **Layout target** | **Mobile-first** — phones & tablets are primary, scaling up to desktop | Children use kidlearn mostly on small touch devices; desktop is the enhancement, not the baseline. See §6 + the `responsive-design` skill. |
| **Styling** | Tailwind CSS v4 (`@theme`, CSS variables) — no `tailwind.config` | Matches existing `apps/web` setup. Tokens live in CSS variables so themes swap at runtime. |

---

## 1. Design principles

1. **Visual-first, text-last.** For the Student Portal, never rely on text a 3–5
   year-old can't read. Every action has an icon, illustration, color, and (where it
   matters) a voice cue. Text is reinforcement, not the interface.
2. **Big, forgiving, tactile.** Large hit areas, generous spacing, obvious affordances.
   A child mis-taps constantly — nothing destructive should be one easy tap away.
3. **One thing at a time.** Each kid screen has a single primary action. The
   chunked-learning flow (5-min video → 10-min puzzle → reward) means no dense menus.
4. **Motion is feedback, not decoration.** Every animation answers "what just happened?"
   or "what do I do next?". It celebrates, guides, or confirms — never just moves.
5. **Two voices, one system.** The kid surface is loud, round, and playful; the parent
   surface is calm, dense, and trustworthy. They share components and tokens — only the
   theme changes. A parent should *feel* the same product made both.
6. **Accessible by default.** WCAG 2.1 AA minimum. This is not optional for an
   education product used internationally and by parents on behalf of children.
7. **Internationalization-safe.** Layouts must absorb ±40% text-length swings (German,
   Bengali, etc.) and never bake text into images. Reserve space; never truncate meaning.

---

## 2. Color

Colors are defined as CSS variables and consumed through the shadcn semantic contract
(`--primary`, `--background`, …) plus a kidlearn brand palette. **Both themes implement
the same variable names**, so any component built against the contract works in both.

### 2.1 Brand palette (raw)

The expressive primitives. Use these via semantic tokens (§2.2), not directly, except
for decorative/game art.

| Token | Name | Light value (oklch / hex) | Use |
| --- | --- | --- | --- |
| `--brand-sky` | Sky blue | `oklch(0.72 0.15 235)` · `#36B3F5` | Kid primary, links, focus |
| `--brand-grape` | Grape | `oklch(0.62 0.20 295)` · `#8B5CF6` | Secondary, accents |
| `--brand-sunshine` | Sunshine | `oklch(0.86 0.16 90)` · `#FFC93C` | Highlights, rewards, stars |
| `--brand-coral` | Coral | `oklch(0.70 0.18 25)` · `#FF6B6B` | Playful alerts, "pop" feedback |
| `--brand-mint` | Mint | `oklch(0.78 0.14 165)` · `#34D399` | Success, "correct!", growth |
| `--brand-blossom` | Blossom | `oklch(0.68 0.17 330)` · `#D16CC9` | Game art only — sits between grape and coral so six pair highlights stay distinguishable |
| `--brand-ink` | Ink | `oklch(0.27 0.05 280)` · `#2B2A4A` | Friendly near-black text |
| `--brand-cream` | Cream | `oklch(0.99 0.01 95)` · `#FFFDF7` | Warm kid background |

Brand scales (`-50` … `-900`) are generated for each hue and live in `globals.css`.

### 2.2 Semantic tokens (the contract every component uses)

| Variable | `kid` theme | `parent` theme | Meaning |
| --- | --- | --- | --- |
| `--background` | cream `#FFFDF7` | slate-50 `#F8FAFC` | App canvas |
| `--foreground` | ink `#2B2A4A` | slate-900 `#0F172A` | Primary text |
| `--card` | white | white | Surfaces / panels |
| `--card-foreground` | ink | slate-900 | Text on cards |
| `--popover` / `--popover-foreground` | white / ink | white / slate-900 | Menus, tooltips |
| `--primary` | sky `#36B3F5` | indigo-600 `#4F46E5` | Primary actions |
| `--primary-foreground` | white | white | Text on primary |
| `--secondary` | grape `#8B5CF6` | slate-100 | Secondary actions |
| `--secondary-foreground` | white | slate-900 | Text on secondary |
| `--accent` | sunshine `#FFC93C` | slate-100 | Highlights / hover |
| `--accent-foreground` | ink | slate-900 | Text on accent |
| `--muted` | sky-50 | slate-100 | Subdued surfaces |
| `--muted-foreground` | slate-500 | slate-500 | Captions, hints |
| `--success` | mint `#34D399` | emerald-600 | Correct / done |
| `--warning` | sunshine `#FFC93C` | amber-500 | Caution |
| `--destructive` | coral `#FF6B6B` | red-600 | Errors, delete |
| `--border` | sky-100 | slate-200 | Hairlines |
| `--input` | sky-100 | slate-200 | Field borders |
| `--ring` | sky `#36B3F5` | indigo-500 | Focus ring |

> **Rule:** components reference semantic tokens (`bg-primary`, `text-foreground`,
> `border-border`). They must never reference brand or raw hues directly. Decorative
> game art is the only exception.

### 2.3 Contrast & color rules

- Body text vs. background ≥ **4.5:1**; large text (≥24px or 18.66px bold) ≥ **3:1**.
- Never encode meaning in color alone — pair with icon, shape, label, or motion
  (color-blind safety; matters for "correct/incorrect" quiz feedback).
- Dark mode: **parent theme only** for MVP. The kid theme stays light (predictable,
  print-bright). Keep the dark token block scaffolded but ship parent-only.

---

## 3. Typography

### 3.1 Font pairing

| Role | Family | Token | Notes |
| --- | --- | --- | --- |
| **Kid display / headings** | **Fredoka** (variable) | `--font-display` | Rounded, friendly, high personality. Headings & big numbers in the Student Portal. |
| **Body (shared)** | **Nunito** (variable) | `--font-body` | Rounded humanist sans, excellent legibility, wide language coverage. Default for all reading text. |
| **UI / dense data (parent & admin)** | **Inter** (variable) | `--font-ui` | Tight, neutral, great at small sizes and in tables/forms. |
| **Mono** | **JetBrains Mono** | `--font-mono` | Code, IDs, debug surfaces. |

Load via `next/font` (self-hosted, no layout shift). Always declare a system fallback
stack. Latin + extended ranges now; subset per-locale as i18n grows.

### 3.2 Type scale

Modular scale, ratio ~1.25 (major third). Sizes in `rem` (root = 16px).

| Token | Size | Line height | Weight | Typical use |
| --- | --- | --- | --- | --- |
| `text-display` | 3.5rem / 56px | 1.05 | 700 | Kid hero, reward screens |
| `text-h1` | 2.5rem / 40px | 1.1 | 700 | Page title |
| `text-h2` | 2rem / 32px | 1.15 | 600 | Section |
| `text-h3` | 1.5rem / 24px | 1.2 | 600 | Subsection / card title |
| `text-lg` | 1.25rem / 20px | 1.4 | 500 | Lead, kid body |
| `text-base` | 1rem / 16px | 1.5 | 400 | Default body |
| `text-sm` | 0.875rem / 14px | 1.5 | 400 | Parent UI, captions |
| `text-xs` | 0.75rem / 12px | 1.4 | 500 | Labels, meta (parent only) |

> **Kid surfaces never go below `text-lg` (20px) for any text a child reads.** `text-sm`
> / `text-xs` are parent/admin only.

### 3.3 Typography rules

- Max line length **~66 characters** for paragraphs.
- Headings use `--font-display` on kid surfaces, `--font-ui` (Inter) on parent surfaces.
- Letter-spacing: slightly tight on display (`-0.01em`), default on body.
- Never justify; left-align (or start-align for RTL locales).
- All-caps only for tiny parent labels, with `letter-spacing: 0.05em`.

---

## 4. Spacing, radius, elevation

### 4.1 Spacing — 4px base grid

Use Tailwind's spacing scale (`1` = 4px). Canonical steps: **4, 8, 12, 16, 24, 32, 48, 64, 96**.
Kid layouts breathe: prefer `gap-6`/`p-8`+ between interactive elements so mis-taps don't
hit the wrong target.

### 4.2 Radius

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | 8px | Parent inputs, chips |
| `--radius-md` | 12px | Parent cards, buttons (base shadcn `--radius`) |
| `--radius-lg` | 20px | Kid cards |
| `--radius-xl` | 28px | Kid panels, modals |
| `--radius-pill` | 9999px | Kid buttons (always fully rounded) |

Kid theme sets base `--radius` to `--radius-lg`; parent theme to `--radius-md`.

### 4.3 Elevation (shadows)

Soft, colored shadows on kid surfaces (tinted with the element's hue at low alpha);
neutral gray shadows on parent surfaces.

| Token | Use |
| --- | --- |
| `--shadow-sm` | Resting cards |
| `--shadow-md` | Buttons, raised cards |
| `--shadow-lg` | Modals, popovers |
| `--shadow-pop` | Kid press/celebrate (larger, softer, hue-tinted) |

---

## 5. Motion

Powered by **Motion**. Motion always communicates state; it is never idle decoration.

### 5.1 Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Most transitions |
| `--ease-bounce` | spring `{ stiffness: 400, damping: 15 }` | Kid press, reward pops |
| `--dur-fast` | 120ms | Hover, focus, taps |
| `--dur-base` | 220ms | Enter/exit, page chrome |
| `--dur-slow` | 400ms | Celebrations, scene transitions |

### 5.2 Rules

- **Always honor `prefers-reduced-motion`.** Provide a non-animated equivalent; replace
  large movement with a fade/opacity change. Motion's `useReducedMotion()` is the hook.
- Kid feedback uses `--ease-bounce` (springy, alive). Parent UI uses `--ease-standard`
  (crisp, professional).
- Reward/celebration animations cap at `--dur-slow` and must be skippable (a tap dismisses).
- Never animate `width`/`height`/`top`/`left` — animate `transform` and `opacity` only.

---

## 6. Layout & responsiveness

> **Primary devices are phones and tablets.** Children use kidlearn mostly on small
> touch screens. Build **mobile-first** and treat phone/tablet as the default case —
> desktop is the enhancement, not the baseline. Full responsive procedure lives in the
> [`responsive-design`](../.claude/skills/responsive-design/SKILL.md) skill.

- **Mobile-first.** Author base styles for the smallest phone (~360px portrait), then scale
  up with `sm:`/`md:`/`lg:`. Breakpoints follow Tailwind defaults (`sm` 640, `md` 768,
  `lg` 1024, `xl` 1280). Kid Student Portal targets **base → lg**; parent dashboard **base → xl**
  (parents must fully manage their account on a phone).
- **Both orientations.** Phones are usually portrait, tablets often landscape. Every kid screen
  works in both — adapt the layout (stack in portrait, side-by-side in landscape) rather than
  locking. If a game truly needs landscape, show a friendly animated "rotate" prompt, never a dead end.
- **Real device chrome.** Use `min-h-dvh` (not `100vh`) and `env(safe-area-inset-*)` padding so
  controls clear notches and home indicators. Set the viewport meta with `viewport-fit=cover`.
- **Fluid sizing.** Prefer `clamp()` for display type and large spacing so they scale smoothly
  across phone→tablet. Kid text stays **≥20px** and touch targets **≥64px** at every width.
- Kid screens are **full-bleed and immersive** — no traditional nav chrome; navigation is
  large illustrated waypoints, placed in the thumb zone (lower/center), not top corners.
- Parent dashboard uses a **responsive app shell**: drawer nav on phones, sidebar + content from
  `lg`; data tables collapse to stacked cards on small screens.
- No horizontal scroll except intentional carousels.

---

## 7. Accessibility (non-negotiable)

- **Touch targets:** kid ≥ **64×64px**; parent ≥ **44×44px** (WCAG 2.5.5).
- Visible focus ring (`--ring`, 2px offset) on every interactive element. Never remove outlines.
- Full keyboard operability on parent/admin surfaces; logical tab order; trapped focus in modals.
- Semantic HTML + ARIA only where semantics fall short. Radix (via shadcn) gives correct roles —
  don't override them.
- Decorative images `alt=""`; meaningful images get real localized alt text.
- The **parental gate** (PIN) must be genuinely hard for a pre-reader: require reading/typing
  digits, never a simple "tap to continue".
- Respect `prefers-reduced-motion` and `prefers-color-scheme` (parent theme).

---

## 8. Component architecture

```
packages/ui/                 # shared, theme-agnostic component library (shadcn lives here)
├── src/
│   ├── primitives/          # shadcn/ui components (button, dialog, input, …) — you own these
│   ├── kid/                 # kid-surface components & game widgets (balloon-pop, tracing, …)
│   ├── parent/              # dashboard components (stat-card, data-table, …)
│   ├── lib/                 # cn() + shared helpers
│   └── styles/              # tokens.css (the variables in this doc), themes
└── package.json             # name: "@kidlearn/ui"
```

- **`primitives/`** — unstyled-but-tokenized shadcn components. Both themes, no surface
  assumptions. This is the foundation; everything composes from here.
- **`kid/`** and **`parent/`** — compose primitives into surface-specific components.
- Theme is applied by setting `data-theme="kid"` / `data-theme="parent"` (or a class) on a
  layout boundary; token values cascade. Components never branch on theme in JS — they read tokens.
- `apps/web` consumes `@kidlearn/ui`; quiz/game renderers map JSON payloads (see brief §B) to
  `kid/` components.

> `packages/ui` currently has no `package.json` — see the create-component skill for the
> one-time setup (name it `@kidlearn/ui`, add `dev`/`build`/`typecheck` scripts) before first use.

### Variants & styling

- Use **`class-variance-authority` (cva)** for variant APIs (`variant`, `size`, `tone`),
  the shadcn-standard pattern. Merge classes with `cn()` (clsx + tailwind-merge).
- A component's public API is **props**, not class overrides. Expose `variant`/`size`/`tone`;
  don't make callers pass long `className` strings to restyle.

---

## 9. Iconography & illustration

- **Icons:** [Lucide](https://lucide.dev) (ships with shadcn) for parent/UI. Consistent
  stroke width, sized via `size` prop, colored via `currentColor`.
- **Kid illustrations & mascot:** AI-generated per the content pipeline (brief §B). Keep a
  consistent character sheet; export as SVG/optimized WebP via Cloudinary.
- Never mix icon families on one surface.

---

## 10. Content & voice

- **Kid copy:** 1–4 words, present tense, encouraging ("Let's go!", "You did it!"). Always
  pairs with voice-over (ElevenLabs) and an icon.
- **Parent copy:** clear, calm, professional. No jargon, no dark patterns around the child's data.
- All user-facing strings flow through i18next — **no hard-coded text in components.**

---

## 11. Quick checklist (paste into PRs)

- [ ] Uses semantic tokens, no raw hex / brand hues in component code
- [ ] Works in both `kid` and `parent` themes (or is correctly scoped to one)
- [ ] Type sizes legal for surface (kid ≥ 20px)
- [ ] Touch targets met (kid 64px / parent 44px)
- [ ] Visible focus ring; keyboard operable (parent)
- [ ] Contrast ≥ AA; meaning not color-only
- [ ] Motion respects `prefers-reduced-motion`; transforms/opacity only
- [ ] Responsive: verified at 360 / 768 / 1024 in both orientations, no horizontal scroll, `dvh` + safe-area insets (mobile-first)
- [ ] All strings via i18next; layout survives +40% text length
- [ ] Composes shadcn primitives + `cn()` + `cva`; no ad-hoc one-offs

---

_Design system v1 — anchored to the kidlearn product brief. Update this file first, code second._
