// The design tokens as values (design.md §2–§5) — the machine-readable source.
// `design.md` stays the prose source of truth and `design.test.ts` holds the two
// together. The web app reads these through `packages/ui/src/styles/tokens.css`,
// whose marked regions are generated from this file
// (`pnpm --filter @kidlearn/ui tokens:generate`); `apps/mobile` reads them
// directly, since React Native has no CSS variables (`mobile-app-plan.md §4.1`).

/** design.md §2.1 — decorative and game art only; UI uses a theme's colours. */
export const brand = {
  sky: "#36b3f5",
  grape: "#8b5cf6",
  sunshine: "#ffc93c",
  coral: "#ff6b6b",
  mint: "#34d399",
  blossom: "#d16cc9",
  ink: "#2b2a4a",
  cream: "#fffdf7",
} as const;

/** design.md §4.2, in px. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 9999,
} as const;

/** design.md §4.3 — soft and ink-tinted. CSS `box-shadow` values. */
export const shadow = {
  sm: "0 1px 2px 0 rgb(43 42 74 / 0.06)",
  md: "0 4px 12px -2px rgb(43 42 74 / 0.12)",
  lg: "0 12px 32px -8px rgb(43 42 74 / 0.18)",
  pop: "0 8px 0 0 rgb(54 179 245 / 0.16), 0 12px 24px -6px rgb(43 42 74 / 0.18)",
} as const;

/** design.md §5.1. */
export const motion = {
  /** `cubic-bezier(0.2, 0, 0, 1)` — most transitions. */
  easeStandard: [0.2, 0, 0, 1],
  durationMs: { fast: 120, base: 220, slow: 400 },
} as const;

/**
 * design.md §3.2 — only the step that differs from Tailwind's default: its own
 * `lg` is 1.125rem, and kid surfaces may never go below 20px.
 */
export const typeScale = {
  lg: { sizeRem: 1.25, lineHeight: 1.4 },
} as const;

/** The semantic contract both themes implement (design.md §2.2). */
export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  /** Decorative sweep across a surface — the puzzle tile's shine. */
  shine: string;
};

export type Theme = {
  colors: ThemeColors;
  /** The surface's base radius, a step of `radius`. */
  radius: keyof typeof radius;
};

export const themes = {
  /** Bright, playful, rounded — the default. */
  kid: {
    colors: {
      background: brand.cream,
      foreground: brand.ink,
      card: "#ffffff",
      cardForeground: brand.ink,
      popover: "#ffffff",
      popoverForeground: brand.ink,
      primary: brand.sky,
      // Ink, not white: white on sky is 2.35:1.
      primaryForeground: brand.ink,
      secondary: brand.grape,
      secondaryForeground: "#ffffff",
      accent: brand.sunshine,
      accentForeground: brand.ink,
      muted: "#eaf7fe",
      mutedForeground: "#475569",
      success: brand.mint,
      successForeground: brand.ink,
      warning: brand.sunshine,
      warningForeground: brand.ink,
      destructive: brand.coral,
      destructiveForeground: brand.ink,
      border: "#d6eefc",
      input: "#d6eefc",
      ring: brand.sky,
      // Light on the kid theme's cream ground.
      shine: "rgb(255 255 255 / 0.65)",
    },
    radius: "lg",
  },
  /** Calm, neutral, professional — parent dashboard and CMS. */
  parent: {
    colors: {
      background: "#f8fafc",
      foreground: "#0f172a",
      card: "#ffffff",
      cardForeground: "#0f172a",
      popover: "#ffffff",
      popoverForeground: "#0f172a",
      primary: "#4f46e5",
      primaryForeground: "#ffffff",
      secondary: "#f1f5f9",
      secondaryForeground: "#0f172a",
      accent: "#f1f5f9",
      accentForeground: "#0f172a",
      muted: "#f1f5f9",
      mutedForeground: "#475569",
      success: "#047857",
      successForeground: "#ffffff",
      warning: "#f59e0b",
      warningForeground: "#0f172a",
      destructive: "#dc2626",
      destructiveForeground: "#ffffff",
      border: "#e2e8f0",
      input: "#e2e8f0",
      ring: "#6366f1",
      shine: "rgb(255 255 255 / 0.55)",
    },
    radius: "md",
  },
} as const satisfies Record<"kid" | "parent", Theme>;

export type ThemeName = keyof typeof themes;

/**
 * What every theme defines. Both themes are checked against `Theme` above, so a
 * colour added to one and not the other is a type error, not an `undefined`.
 */
export type ThemeTokens = Theme;
