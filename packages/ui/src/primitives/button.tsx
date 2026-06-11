import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";

/**
 * Button — the foundational shadcn-style primitive, tokenized for both themes.
 * Colors come from semantic tokens, so it follows the active [data-theme]
 * (kid / parent). Radius follows the surface's --radius. See document/design.md.
 *
 * Touch targets (design.md §7): `default` meets the 44px parent minimum; use
 * `size="kid"` (64px, pill) on Student-Portal surfaces.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] font-body font-semibold transition-[color,background-color,opacity,box-shadow] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-md hover:opacity-90 active:opacity-100",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:opacity-90",
        success:
          "bg-success text-success-foreground shadow-md hover:opacity-90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md hover:opacity-90",
        outline:
          "border-2 border-input bg-background text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        default: "h-11 px-6 text-base",
        lg: "h-12 px-7 text-lg",
        xl: "h-14 px-8 text-lg",
        kid: "h-16 min-w-16 rounded-pill px-8 text-lg shadow-pop",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. an <a>/<Link>) instead of a <button>. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
