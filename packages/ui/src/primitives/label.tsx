import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";

/**
 * Label — a plain `<label>`, tokenized.
 *
 * No Radix wrapper: `@radix-ui/react-label` exists to stop label clicks selecting
 * text, which is not worth a dependency, and a native label already gives the
 * `htmlFor` association every field here needs.
 *
 * `text-sm` is legal on parent surfaces only (design.md §3.2) — the `kid` variant
 * is what a Student-Portal caller uses, and it never goes below 20px.
 */
const labelVariants = cva("font-medium leading-tight text-foreground", {
  variants: {
    size: {
      default: "text-sm",
      kid: "text-lg",
    },
  },
  defaultVariants: { size: "default" },
});

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>,
    VariantProps<typeof labelVariants> {}

export function Label({ className, size, ...props }: LabelProps) {
  return (
    // A reusable primitive cannot contain its own control; the association is
    // `htmlFor`, which every caller passes through `...props`. The rule fires on
    // the definition, where there is nothing to associate with.
    // biome-ignore lint/a11y/noLabelWithoutControl: see above
    <label className={cn(labelVariants({ size, className }))} {...props} />
  );
}

export { labelVariants };
