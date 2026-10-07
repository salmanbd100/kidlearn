import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

/** 44px on a parent-theme surface (design.md §7). */
const adminFilterChipVariants = cva(
  cn(
    "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm transition-colors",
    "focus-ring",
  ),
  {
    variants: {
      isSelected: {
        true: "border-primary bg-primary/10 font-medium text-primary",
        false:
          "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: { isSelected: false },
  },
);

export function AdminFilterChip({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // `aria-pressed`: meaning is never carried by colour alone.
      aria-pressed={isSelected}
      onClick={onClick}
      className={adminFilterChipVariants({ isSelected })}
    >
      {children}
    </button>
  );
}
