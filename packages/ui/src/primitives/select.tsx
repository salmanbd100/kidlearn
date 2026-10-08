import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";

const selectVariants = cva(
  // No `appearance-none`: it strips the arrow and leaves a field that reads as text input;
  // the native arrow follows the platform and needs no theme-blind data-URI image.
  "w-full rounded-[var(--radius)] border-2 border-input bg-card text-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
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
  // `size` is an intrinsic <select> attribute; the variant prop replaces it, matching Input.
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {}

export function Select({ className, size, ...props }: SelectProps) {
  return (
    <select className={cn(selectVariants({ size, className }))} {...props} />
  );
}

export { selectVariants };
