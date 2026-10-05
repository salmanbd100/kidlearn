import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, RotateCcw } from "lucide-react";

/**
 * The shape carries the meaning, not colour: mint and sunshine alone sit under 3:1 on white (design.md §2.3).
 * Inside the card's corner, not over its edge, since boards scroll and would clip it. Needs a `relative` parent.
 */

const statusMarkVariants = cva(
  "pointer-events-none absolute top-1 right-1 flex size-8 items-center justify-center rounded-pill shadow-sm",
  {
    variants: {
      tone: {
        done: "bg-success text-success-foreground",
        // Not a cross: a wrong attempt is never an error (FR-ACT-05).
        retry: "bg-warning text-warning-foreground",
      },
    },
  },
);

export interface StatusMarkProps {
  tone: NonNullable<VariantProps<typeof statusMarkVariants>["tone"]>;
}

export function StatusMark({ tone }: StatusMarkProps) {
  const Glyph = tone === "done" ? Check : RotateCcw;
  return (
    <span
      aria-hidden="true"
      data-testid={`status-mark-${tone}`}
      className={cn(statusMarkVariants({ tone }))}
    >
      <Glyph className="size-5" strokeWidth={3} />
    </span>
  );
}
