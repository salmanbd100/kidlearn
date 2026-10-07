import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

// On wide screens the numeral and title hang in a margin column; on phones they stack above the text.
const hangingSectionVariants = cva(
  "grid scroll-mt-8 gap-4 border-foreground/15 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-12",
  {
    variants: {
      rule: {
        true: "border-t pt-10 md:pt-14",
        false: "",
      },
    },
    defaultVariants: { rule: true },
  },
);

export function HangingSection({
  id,
  numeral,
  title,
  marginMark,
  rule,
  children,
}: VariantProps<typeof hangingSectionVariants> & {
  id: string;
  numeral?: string;
  title: ReactNode;
  /** A decorative mark set beside the numeral. */
  marginMark?: ReactNode;
  children: ReactNode;
}) {
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn(hangingSectionVariants({ rule }))}
    >
      <div className="flex flex-col gap-2">
        {numeral !== undefined || marginMark !== undefined ? (
          <span className="flex items-center gap-3 text-lg font-bold tabular-nums text-muted-foreground">
            {numeral}
            {marginMark}
          </span>
        ) : null}
        <h2
          id={titleId}
          className="text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-2xl"
        >
          {title}
        </h2>
      </div>
      <div className="flex max-w-[65ch] flex-col gap-5 text-lg leading-relaxed">
        {children}
      </div>
    </section>
  );
}

/** Two-digit section numerals, as a printed booklet sets them. */
export function toNumeral(index: number): string {
  return String(index + 1).padStart(2, "0");
}
