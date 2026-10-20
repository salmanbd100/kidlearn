import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const adminEmptyStateVariants = cva(
  "flex flex-col items-center gap-3 rounded-(--radius) border border-dashed px-6 py-10 text-center",
  {
    variants: {
      tone: {
        default: "border-border bg-card",
        error: "border-destructive/40 bg-destructive/5",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

const iconVariants = cva(
  "flex size-11 items-center justify-center rounded-full",
  {
    variants: {
      tone: {
        default: "bg-muted text-muted-foreground",
        error: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export interface AdminEmptyStateProps
  extends VariantProps<typeof adminEmptyStateVariants> {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone,
}: AdminEmptyStateProps) {
  return (
    <div
      // An error must reach a screen reader that is not looking at this part of the page.
      role={tone === "error" ? "alert" : undefined}
      className={cn(adminEmptyStateVariants({ tone }))}
    >
      <span className={iconVariants({ tone })}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="font-medium text-foreground text-sm">{title}</p>
        {description === undefined ? null : (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
