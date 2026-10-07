import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

const adminStatCardVariants = cva(
  "flex flex-1 flex-col gap-3 rounded-(--radius) border bg-card p-5 shadow-xs",
  {
    variants: {
      // A counter needing attention (e.g. a backed-up queue) reads differently from a total.
      tone: {
        default: "border-border",
        attention: "border-warning/50 bg-warning/5",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

const iconVariants = cva(
  "flex size-9 items-center justify-center rounded-(--radius)",
  {
    variants: {
      tone: {
        default: "bg-primary/10 text-primary",
        attention: "bg-warning/15 text-warning",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export interface AdminStatCardProps
  extends VariantProps<typeof adminStatCardVariants> {
  label: string;
  value: string;
  icon?: LucideIcon;
  /** Turns the card into a link to where the number can be acted on. */
  href?: string;
  linkLabel?: string;
}

export function AdminStatCard({
  label,
  value,
  tone,
  icon: Icon,
  href,
  linkLabel,
}: AdminStatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">{label}</p>
        {Icon === undefined ? null : (
          <span className={iconVariants({ tone })}>
            <Icon aria-hidden="true" className="size-4" />
          </span>
        )}
      </div>
      <p className="font-semibold text-3xl text-card-foreground tabular-nums tracking-tight">
        {value}
      </p>
      {href === undefined || linkLabel === undefined ? null : (
        <span className="inline-flex items-center gap-1 font-medium text-primary text-xs">
          {linkLabel}
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      )}
    </>
  );

  if (href === undefined) {
    return <div className={cn(adminStatCardVariants({ tone }))}>{body}</div>;
  }

  return (
    <Link
      href={href}
      className={cn(
        adminStatCardVariants({ tone }),
        "group transition-colors hover:border-primary/40",
        "focus-ring",
      )}
    >
      {body}
    </Link>
  );
}
