import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";

/**
 * Input — the shadcn text-field primitive, tokenized for both themes.
 *
 * `default` is 44px tall so the parent surface's minimum touch target holds
 * without a caller thinking about it; `kid` is 64px (design.md §7). Both keep the
 * visible focus ring — never remove it.
 *
 * `aria-invalid` drives the error styling rather than a prop, so the visual state
 * and the state a screen reader announces cannot disagree. Colour is not the only
 * signal (design.md §2.3): callers pair it with a text message via
 * `aria-describedby`.
 */
const inputVariants = cva(
  "w-full rounded-[var(--radius)] border-2 border-input bg-card text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
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

export interface InputProps
  // `size` is an intrinsic <input> attribute (character width); the variant prop
  // replaces it, which is why it is omitted rather than merged.
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

export function Input({ className, size, ...props }: InputProps) {
  return (
    <input className={cn(inputVariants({ size, className }))} {...props} />
  );
}

export { inputVariants };
