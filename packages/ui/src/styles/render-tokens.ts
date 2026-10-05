import {
  brand,
  motion,
  radius,
  shadow,
  type Theme,
  themes,
  typeScale,
} from "@kidlearn/tokens";

// `@kidlearn/tokens` as the CSS declarations each marked region of
// `tokens.css` holds. `tokens.generated.test.ts` fails when the two disagree;
// `pnpm --filter @kidlearn/ui tokens:generate` rewrites the regions.

export const TOKEN_REGIONS = [
  "brand",
  "type",
  "radius",
  "shadow",
  "kid",
  "parent",
  "motion",
] as const;

export type TokenRegion = (typeof TOKEN_REGIONS)[number];

const kebab = (name: string): string =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function themeDeclarations(theme: Theme): string[] {
  return [
    ...Object.entries(theme.colors).map(
      ([name, value]) => `--${kebab(name)}: ${value};`,
    ),
    `--radius: var(--radius-${theme.radius});`,
  ];
}

export function renderTokenRegions(): Record<TokenRegion, string[]> {
  return {
    brand: Object.entries(brand).map(
      ([name, value]) => `--color-${name}: ${value};`,
    ),
    type: Object.entries(typeScale).flatMap(
      ([step, { sizeRem, lineHeight }]) => [
        `--text-${step}: ${sizeRem}rem;`,
        `--text-${step}--line-height: ${lineHeight};`,
      ],
    ),
    radius: Object.entries(radius).map(
      ([step, px]) => `--radius-${step}: ${px}px;`,
    ),
    shadow: Object.entries(shadow).map(
      ([step, value]) => `--shadow-${step}: ${value};`,
    ),
    kid: themeDeclarations(themes.kid),
    parent: themeDeclarations(themes.parent),
    motion: [
      `--ease-standard: cubic-bezier(${motion.easeStandard.join(", ")});`,
      ...Object.entries(motion.durationMs).map(
        ([speed, ms]) => `--dur-${speed}: ${ms}ms;`,
      ),
    ],
  };
}

const START = (region: string) => `/* @generated:${region} */`;
const END = (region: string) => `/* @end:${region} */`;

/** The declarations between a region's markers, whitespace collapsed. */
export function readTokenRegion(css: string, region: TokenRegion): string[] {
  const start = css.indexOf(START(region));
  const end = css.indexOf(END(region));
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`tokens.css has no well-formed "${region}" region`);
  }
  return splitDeclarations(css.slice(start + START(region).length, end));
}

export function splitDeclarations(text: string): string[] {
  return text
    .split(";")
    .map((declaration) => declaration.replace(/\s+/g, " ").trim())
    .filter((declaration) => declaration.length > 0)
    .map((declaration) => `${declaration.replace(/:\s*/, ": ")};`);
}

/** `css` with every region's body replaced by the rendered declarations. */
export function writeTokenRegions(css: string): string {
  const rendered = renderTokenRegions();
  let out = css;
  for (const region of TOKEN_REGIONS) {
    const start = out.indexOf(START(region));
    const end = out.indexOf(END(region));
    if (start === -1 || end === -1 || end < start) {
      throw new Error(`tokens.css has no well-formed "${region}" region`);
    }
    const body = rendered[region].map((line) => `  ${line}`).join("\n");
    out = `${out.slice(0, start + START(region).length)}\n${body}\n  ${out.slice(end)}`;
  }
  return out;
}
