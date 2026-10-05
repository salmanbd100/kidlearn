import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

/**
 * A round 64px control — the kid touch-target floor (design.md §7, NFR-A11Y-02).
 * The same shape for "hear it again", "leave" and the reader's page turns, so a
 * child who learned one has learned them all.
 */

const iconControlVariants = cva(
  "inline-flex size-16 shrink-0 items-center justify-center rounded-pill transition-colors touch-manipulation focus-ring",
  {
    variants: {
      tone: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // For a way out rather than a way on: present, but not inviting.
        quiet: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { tone: "secondary" },
  },
);

export interface IconControlProps
  extends VariantProps<typeof iconControlVariants> {
  label: string;
  /** Sets `aria-pressed`; omitted for controls that are not toggles. */
  isPressed?: boolean;
  onPress: () => void;
  /** The icon, `aria-hidden` — `label` is the control's name. */
  children: ReactNode;
}

export function IconControl({
  label,
  tone,
  isPressed,
  onPress,
  children,
}: IconControlProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isPressed}
      className={cn(iconControlVariants({ tone }))}
      onClick={onPress}
    >
      {children}
    </button>
  );
}
