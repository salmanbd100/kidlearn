---
name: create-component
description: Use when building ANY UI component for kidlearn — kid-surface widgets, parent/admin dashboard pieces, or shared primitives. Enforces the design system in document/design.md, the shadcn/ui + Motion foundation, the dual-theme token contract, and accessibility rules. Trigger on "create a component", "build a button/card/modal/quiz widget", "add UI", or any frontend component work in this repo.
---

# Create a kidlearn Component

You are building a component for **kidlearn**, a visual-first educational SaaS for ages 3–5
(immersive Student Portal) plus a professional Parent/Admin Dashboard.

**Read [`document/design.md`](../../../document/design.md) first.** It is the source of truth
for tokens, type, spacing, motion, and a11y. This skill tells you *how to build*; design.md
tells you *what values to use*. Never invent values that already exist as tokens.

## Non-negotiable foundation

| Concern | Rule |
| --- | --- |
| Base | **shadcn/ui** (Radix primitives), owned in `packages/ui/src/primitives/`. Compose these — don't reinvent dialogs, popovers, selects. |
| Animation | **Motion** (`motion`). Always honor `useReducedMotion()`. Animate `transform`/`opacity` only. |
| Styling | Tailwind v4 + **semantic tokens only** (`bg-primary`, `text-foreground`, `border-border`). No raw hex, no brand hues in component code. |
| Class syntax | Write the **canonical** Tailwind v4 form — see [Canonical classes](#canonical-classes). Biome does not catch these; the Tailwind IntelliSense `suggestCanonicalClasses` warning does. |
| Variants | **`cva`** for `variant`/`size`/`tone`; merge with **`cn()`**. Public API = props, not className overrides. |
| Theme | One contract, two themes (`kid` / `parent`). Never branch on theme in JS — read tokens. |
| i18n | No hard-coded user-facing strings. Text comes through i18next. |

## Canonical classes

Tailwind v4 has a shorter canonical spelling for many arbitrary values, and the editor
flags the long one with `tailwindcss(suggestCanonicalClasses)`. Write the short form the
first time; never leave the warning for someone else to clear.

| Don't write | Write |
| --- | --- |
| `rounded-[var(--radius)]` · `accent-[var(--primary)]` (any `-[var(--x)]` utility) | `rounded-(--radius)` · `accent-(--primary)` — the `(--x)` shorthand |
| `[touch-action:manipulation]` | `touch-manipulation` |
| `[transform-box:fill-box]` | `transform-fill` |
| `aria-[pressed=true]:…` (also `busy`, `checked`, `disabled`, `expanded`, `hidden`, `readonly`, `required`, `selected`) | `aria-pressed:…` |

Not every arbitrary value has a shorthand (`aria-[invalid=true]:` does not), so a warning
is the source of truth, not this table. The pattern is: if Tailwind ships a named utility or
variant for it, use that instead of `[property:value]`. When you do a repo-wide rewrite,
scope the search to source (`apps`, `packages`) and exclude `.next`, `coverage`,
`node_modules` — a build output rewritten by accident is hard to notice.

## Decision flow

```
What surface is this for?
├── Kid (Student Portal)  → packages/ui/src/kid/      → rounded, big, springy, ≥20px text, ≥64px targets
├── Parent / Admin        → packages/ui/src/parent/   → dense, calm, Inter, ≥44px targets
└── Shared primitive      → packages/ui/src/primitives/ → theme-agnostic, both surfaces
```

## Procedure

Create a TodoWrite item per step and work through them in order.

1. **Confirm scope.** Identify the surface (kid / parent / shared) and the single job of the
   component. If it spans both surfaces, build it as a shared primitive that reads tokens.
2. **Check for reuse.** Does a shadcn primitive or existing `kid/`/`parent/` component already
   cover this? Compose it rather than duplicating. Don't add a one-off.
3. **One-time package setup (only if `packages/ui` has no `package.json` yet):**
   - Create `packages/ui/package.json` with `"name": "@kidlearn/ui"`, `"type": "module"`, and
     `dev` / `build` / `typecheck` scripts (mirror `apps/server`'s tsc-based scripts) so Turbo
     reaches it.
   - Add `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `motion` as deps;
     `react`/`react-dom` as peers.
   - Create `src/lib/cn.ts` (clsx + tailwind-merge), `src/styles/tokens.css` (the variables from
     design.md §2–§5), and theme blocks for `[data-theme="kid"]` / `[data-theme="parent"]`.
   - Wire `apps/web` to import `@kidlearn/ui` and the tokens CSS.
   - If shadcn isn't initialized, init it targeting `packages/ui` and add the primitive you need.
4. **Build the component.**
   - File: `packages/ui/src/<surface>/<kebab-name>.tsx`. Named export, PascalCase.
   - Compose primitives; style with token-based Tailwind classes; define variants with `cva`.
   - Accept `className` and forward refs where a DOM element is exposed (shadcn convention).
   - Add Motion only to express state (press, enter/exit, celebrate) — guarded by reduced-motion.
5. **Verify against design.md §11 checklist** (paste it into the PR):
   - Semantic tokens only · works in target theme(s) · legal type size · touch targets ·
     visible focus + keyboard (parent) · AA contrast + meaning not color-only · reduced-motion ·
     i18n strings · composes primitives.
6. **Typecheck & lint:** `pnpm typecheck` and `pnpm lint` (Biome, repo-wide) from the root.
   Fix before claiming done. If you assert it works, show the passing output.
7. **Clear the editor warnings.** Biome and `tsc` do not report Tailwind's
   `suggestCanonicalClasses`. Read the IDE diagnostics for every file you edited
   (`mcp__ide__getDiagnostics`, passing each file's URI) and fix each one, using the table
   above. VS Code reports only files it has loaded, so an empty result for a file it has not
   opened is weak evidence. If the IDE is not connected, say so rather than claiming the
   files are clean.

## Reference skeleton

```tsx
// packages/ui/src/kid/reward-badge.tsx
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

const badge = cva(
  "inline-flex items-center justify-center rounded-pill font-display shadow-pop select-none",
  {
    variants: {
      tone: {
        success: "bg-success text-primary-foreground",
        star: "bg-accent text-accent-foreground",
      },
      size: { md: "size-16 text-lg", lg: "size-24 text-display" },
    },
    defaultVariants: { tone: "star", size: "lg" },
  },
);

type RewardBadgeProps = React.ComponentProps<typeof motion.div> &
  VariantProps<typeof badge>;

export function RewardBadge({ tone, size, className, ...props }: RewardBadgeProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      role="img"
      className={cn(badge({ tone, size }), className)}
      initial={reduced ? false : { scale: 0, rotate: -12 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      {...props}
    />
  );
}
```

## Red flags — stop and fix

| Thought | Reality |
| --- | --- |
| "I'll just hard-code this blue / 14px / 8px." | Use the token. If it's missing, add it to design.md first. |
| "I'll build my own dropdown/modal." | Compose the shadcn primitive — a11y is already handled there. |
| "Kid text at 14px is fine." | Kid surfaces are ≥20px, ≥64px targets. Non-negotiable. |
| "Animation looks cool here." | Motion must communicate state and respect reduced-motion. |
| "I'll let callers restyle via className." | Expose `variant`/`size`/`tone` props instead. |
| "I'll add the English string inline." | All user-facing text goes through i18next. |
| "`rounded-[var(--radius)]` works, so it's fine." | It works and it's flagged. Use `rounded-(--radius)`; check IDE diagnostics before you finish. |
| "design.md probably says X." | Open it and check. Don't guess token values. |
