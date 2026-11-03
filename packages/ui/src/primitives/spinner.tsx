import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "../lib/cn";

// The global reduced-motion reset caps `animate-spin` at one turn, so the icon stays as a still mark.
const spinnerVariants = cva("shrink-0 animate-spin", {
  variants: {
    size: {
      sm: "size-4",
      default: "size-5",
      lg: "size-8",
      xl: "size-12",
    },
    tone: {
      current: "text-current",
      primary: "text-primary",
      muted: "text-muted-foreground",
    },
  },
  defaultVariants: { size: "default", tone: "current" },
});

export interface SpinnerProps
  extends Omit<React.SVGProps<SVGSVGElement>, "ref">,
    VariantProps<typeof spinnerVariants> {
  /** Announced as a status. Leave it out when the spinner sits beside text that already says what is happening. */
  label?: string;
}

export function Spinner({
  label,
  size,
  tone,
  className,
  ...props
}: SpinnerProps) {
  const icon = (
    <LoaderCircle
      aria-hidden="true"
      className={cn(spinnerVariants({ size, tone, className }))}
      {...props}
    />
  );
  if (label === undefined) return icon;

  return (
    <span role="status" className="inline-flex">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { spinnerVariants };
