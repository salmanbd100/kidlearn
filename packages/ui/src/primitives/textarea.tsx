import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";

const textareaVariants = cva(
  "w-full rounded-[var(--radius)] border-2 border-input bg-card text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
  {
    variants: {
      size: {
        default: "min-h-11 px-3 py-2 text-base",
        // Dense forms (the CMS): lighter border and type, as `Input`'s `sm`.
        sm: "min-h-11 border px-3 py-2 text-sm",
        kid: "min-h-16 rounded-[var(--radius-lg)] px-5 py-3 text-lg",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

export function Textarea({ className, size, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(textareaVariants({ size, className }))}
      {...props}
    />
  );
}

export { textareaVariants };
