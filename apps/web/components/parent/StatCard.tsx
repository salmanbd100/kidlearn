import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

/**
 * One figure on the dashboard, with its label (FR-DASH-02).
 *
 * Deliberately not minute-aware: it takes an already-formatted `value` so file
 * 30's report card can reuse it for a score or a lesson count without this
 * component learning what a duration is. `formatMinutes` in `lib/duration.ts` is
 * what turns 95 into "1h 35m".
 *
 * `hint` is where the zero state goes. A card reading "0m" is accurate and
 * discouraging; the same card with "Nothing yet" underneath tells a parent the app
 * is working and their child simply has not started.
 */
const statCardVariants = cva(
  "flex flex-1 flex-col gap-1 rounded-[var(--radius)] border p-4",
  {
    variants: {
      tone: {
        default: "border-border bg-card",
        /** The window a parent checks first, lifted out of the row. */
        featured: "border-primary/30 bg-primary/5",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export interface StatCardProps extends VariantProps<typeof statCardVariants> {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
}

export function StatCard({ label, value, hint, icon, tone }: StatCardProps) {
  return (
    <div className={cn(statCardVariants({ tone }))}>
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-[0.05em]">
        {icon}
        {label}
      </p>
      <p className="font-semibold text-2xl text-card-foreground tabular-nums">
        {value}
      </p>
      {hint === undefined ? null : (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}
