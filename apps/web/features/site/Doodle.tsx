import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";

// Brand hues are allowed here: these are decorative art, not UI (design.md §2.2).
const doodleVariants = cva("pointer-events-none shrink-0 fill-none", {
  variants: {
    kind: {
      underline: "h-auto w-full",
      squiggle: "h-4 w-12",
    },
    tone: {
      sunshine: "text-sunshine",
      coral: "text-coral",
      grape: "text-grape",
      mint: "text-mint",
      sky: "text-sky",
    },
  },
  defaultVariants: { tone: "sunshine" },
});

// Two passes per mark, slightly off each other, so the stroke reads as drawn by hand rather than plotted.
const PATHS = {
  underline: {
    viewBox: "0 0 300 24",
    strokeWidth: 5,
    d: [
      "M4 15 C 52 7, 104 19, 158 12 S 252 7, 296 13",
      "M22 19 C 86 13, 166 18, 276 15",
    ],
  },
  squiggle: {
    viewBox: "0 0 60 20",
    strokeWidth: 3,
    d: ["M3 12 C 9 3, 14 3, 18 11 S 27 19, 32 10 S 42 2, 47 10 S 55 16, 58 7"],
  },
} as const;

export type DoodleProps = VariantProps<typeof doodleVariants> & {
  kind: NonNullable<VariantProps<typeof doodleVariants>["kind"]>;
  className?: string;
};

export function Doodle({ kind, tone, className }: DoodleProps) {
  const { viewBox, strokeWidth, d } = PATHS[kind];

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid={`doodle-${kind}`}
      viewBox={viewBox}
      className={cn(doodleVariants({ kind, tone }), className)}
    >
      {d.map((path) => (
        <path
          key={path}
          d={path}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
