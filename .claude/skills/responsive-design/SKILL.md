---
name: responsive-design
description: Use when building or reviewing ANY layout, page, screen, or component for kidlearn so it works well on the PRIMARY devices — phones and tablets — for small children. Trigger on "make it responsive", "mobile", "tablet", "small screen", "breakpoints", "it looks broken on phone", "portrait/landscape", "touch targets", or any layout/sizing work. Enforces mobile-first, kid-friendly touch ergonomics, fluid type/spacing, orientation + safe-area handling, and the breakpoints in document/design.md.
---

# Responsive Design for kidlearn

kidlearn is used **mostly on phones and tablets by children aged 3–5**. Small screens and
small hands are the *default* case, not an edge case. A layout that only looks right on a
laptop is broken. Build **mobile-first**, scale up.

**Read [`document/design.md`](../../../document/design.md)** for tokens, breakpoints,
type scale, and touch-target rules. This skill is how you apply them responsively. Pair it
with [`create-component`](../create-component/SKILL.md) when building a component.

## The core stance

| Principle | What it means here |
| --- | --- |
| **Mobile-first** | Author base styles for the smallest phone; add `sm:`/`md:`/`lg:` to enhance upward. Never desktop-down. |
| **Touch-first** | Design for a 3-year-old's finger, not a mouse. No hover-only affordances; no tiny tap zones. |
| **Both orientations** | Phones are often **portrait**, tablets often **landscape**. Every kid screen must work in both — never lock or break. |
| **Real device chrome** | Address bars, notches, home indicators eat space. Use `dvh`/safe-area insets, not `vh`. |
| **Low-end reality** | Cheap Android tablets are common. Keep it light; animate transform/opacity only. |

## Breakpoints (from design.md, Tailwind defaults)

```
base   < 640px   phones (PRIMARY — portrait)
sm     ≥ 640px   large phones / small tablets portrait
md     ≥ 768px   tablets (PRIMARY — portrait & landscape)
lg     ≥ 1024px  tablets landscape / small laptops
xl     ≥ 1280px  desktop (parent dashboard mostly)
```

Kid Student Portal is tuned for **base → lg**. Parent dashboard spans **base → xl** (mobile
parents must fully manage their account on a phone).

## Procedure

Create a TodoWrite item per step.

1. **Start at the smallest screen.** Write the base layout for a ~360px-wide portrait phone.
   Make it correct and usable there *first*. Only then add `sm:`/`md:`/`lg:` enhancements.
2. **Layout primitives, not fixed sizes.** Use flex/grid with `gap-*`, `min-w-0`, `flex-wrap`,
   `grid-cols-1 md:grid-cols-2`. Avoid fixed `px` widths/heights on containers. Let content reflow.
3. **Fluid type & spacing.** Prefer `clamp()` for hero/display sizes so text scales smoothly
   between phone and tablet instead of jumping at breakpoints. Keep kid text **≥ 20px at every
   width** (design.md §3.2). Tap targets **≥ 64px (kid) / 44px (parent)** even on the smallest screen.
4. **Handle orientation.** Test portrait AND landscape. For kid game screens, prefer layouts
   that adapt (stack in portrait, side-by-side in landscape) rather than locking orientation.
   If a game truly needs landscape, show a friendly animated "rotate your device" prompt — never
   a dead end.
5. **Respect device chrome.** Use `min-h-dvh` (not `min-h-screen`/`100vh`) for full-height kid
   scenes; apply `env(safe-area-inset-*)` padding so controls clear notches/home indicators.
   Set `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
6. **Touch ergonomics for small hands.** Primary actions sit in the lower/center thumb zone, not
   top corners. Space interactive elements ≥ `gap-4` apart so mis-taps don't trigger the wrong
   thing. No `:hover`-only reveals; provide tap equivalents. Disable accidental double-tap zoom
   on controls (`touch-action: manipulation`).
7. **Responsive media.** Serve sized images via Cloudinary (`w_auto`, `dpr_auto`, WebP/AVIF);
   use `<Image>` with `sizes`. Cap art so it never forces horizontal scroll. Audio/video controls
   stay finger-sized.
8. **No horizontal scroll, ever** (except intentional carousels). Watch for fixed widths, long
   unbreakable strings, and overflowing flex children (`min-w-0` fixes most).
9. **Verify on real widths.** Run the app and check **320, 360, 414 (phones), 768, 820, 1024
   (tablets), 1280 (desktop)**, in both orientations. Use the `run` skill / browser devtools.
   If you claim it's responsive, show what you checked.

## Reference patterns

**Full-height kid scene that respects mobile chrome + safe areas:**
```tsx
<main
  className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5"
  style={{
    paddingTop: "max(1.25rem, env(safe-area-inset-top))",
    paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
  }}
>
  {/* single primary action, thumb-reachable */}
</main>
```

**Fluid kid heading (scales 32→56px, never below legible):**
```tsx
<h1 className="font-display [font-size:clamp(2rem,6vw,3.5rem)] leading-tight">
  {t("lesson.title")}
</h1>
```

**Adapts to orientation without locking:**
```tsx
{/* stacked on phones/portrait, side-by-side from tablet/landscape */}
<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{/* video / quiz */}</div>
```

**Kid-sized, mis-tap-safe button:**
```tsx
<button className="min-h-16 min-w-16 rounded-pill px-8 [touch-action:manipulation]">
```

## Red flags — stop and fix

| Thought | Reality |
| --- | --- |
| "Looks fine on my laptop." | The primary device is a phone/tablet. Start at 360px. |
| "I'll use `h-screen` / `100vh`." | Mobile browser chrome breaks it. Use `dvh` + safe-area insets. |
| "It reveals on hover." | Kids on touch have no hover. Provide a tap path. |
| "Fixed width 1024 looks cleanest." | Causes horizontal scroll on phones. Use fluid grid/flex. |
| "14px is fine on mobile." | Kid text is ≥20px and targets ≥64px at *every* width. |
| "I'll lock it to landscape." | Phones are portrait. Adapt, or show a friendly rotate prompt — never a dead end. |
| "I'll test desktop only." | Verify 320–1280 in both orientations before claiming done. |

After changes, run `pnpm typecheck` and `pnpm lint` from the root.
