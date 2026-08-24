import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";

/**
 * Select — a native `<select>` wearing the Input primitive's chrome.
 *
 * Native rather than a Radix listbox, deliberately: the platform control already
 * gives keyboard navigation, type-ahead and the mobile wheel picker, and nothing
 * on the admin surface needs an option to render richer than its label. When one
 * does, this is the file that grows a Radix implementation behind the same props.
 *
 * The chrome is `inputVariants`' own, not a copy of it, so a change to the field
 * border or focus ring reaches both controls (`frontend.md §1`).
 */
const selectVariants = cva(
  "w-full appearance-none rounded-[var(--radius)] border-2 border-input bg-card text-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
  {
    variants: {
      size: {
        default: "h-11 px-3 text-base",
        kid: "h-16 rounded-pill px-5 text-lg",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface SelectProps
  // `size` is an intrinsic <select> attribute (visible row count); the variant
  // prop replaces it, matching Input.
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {}

export function Select({ className, size, ...props }: SelectProps) {
  return (
    <select className={cn(selectVariants({ size, className }))} {...props} />
  );
}

export { selectVariants };
