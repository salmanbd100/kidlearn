import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";

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
    // A reusable primitive cannot contain its own control; callers associate via `htmlFor`.
    // biome-ignore lint/a11y/noLabelWithoutControl: see above
    <label className={cn(labelVariants({ size, className }))} {...props} />
  );
}

export { labelVariants };
