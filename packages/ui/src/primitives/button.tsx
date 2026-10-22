import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";
import { Spinner } from "./spinner";

/** Button — shadcn-style primitive; colours and radius come from semantic tokens, so it follows `[data-theme]`. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] font-body font-semibold transition-[color,background-color,opacity,box-shadow] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-5",
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
  asChild?: boolean;
  /** Disables the button and shows a spinner in front of its label, which stays put so the width does not jump. */
  isLoading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {/* A Slot takes exactly one child, so a link styled as a button cannot carry the spinner. */}
      {isLoading && !asChild ? (
        <>
          <Spinner />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { buttonVariants };
