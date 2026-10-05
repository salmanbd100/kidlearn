import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, RotateCcw } from "lucide-react";

/**
 * The corner badge on a kid card that says "done" or "have another go" without
 * motion or colour. The glyph is ink on a filled disc, so the shape is what
 * carries the meaning: mint and sunshine alone sit under 3:1 against a
 * white card (design.md §2.3). Sits inside the card's corner rather than over
 * its edge, because every board it appears on scrolls and would clip it. Place
 * inside a `relative` parent.
 */

const statusMarkVariants = cva(
  "pointer-events-none absolute top-1 right-1 flex size-8 items-center justify-center rounded-pill shadow-sm",
  {
    variants: {
      tone: {
        done: "bg-success text-success-foreground",
        // Not a cross: a wrong attempt is never an error (FR-ACT-05), so the
        // mark is the "go round again" arrow, in the warm highlight hue.
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
