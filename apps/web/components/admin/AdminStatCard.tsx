import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * One platform counter on the admin analytics page (FR-CMS-07, basic tier).
 *
 * **Not `components/parent/StatCard`, on purpose.** That card belongs to a
 * parent's dashboard: it takes a `hint` for the encouraging zero state and has a
 * `featured` tone for the window a parent checks first. Neither idea applies to an
 * internal counter — nobody needs consoling about a quiet Tuesday — and bending it
 * to fit would put dashboard vocabulary in the CMS.
 *
 * Takes an already-formatted `value` for the same reason the parent card does, so
 * a later file can put a percentage or a duration in one without this component
 * learning what either is.
 */
const adminStatCardVariants = cva(
  "flex flex-1 flex-col gap-1 rounded-[var(--radius)] border border-border bg-card p-4",
  {
    variants: {
      // Reserved for files 32+ — a counter that needs attention (a review queue
      // backing up) reads differently from one that is merely a total.
      tone: {
        default: "",
        attention: "border-warning/40",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export interface AdminStatCardProps
  extends VariantProps<typeof adminStatCardVariants> {
  label: string;
  value: string;
}

export function AdminStatCard({ label, value, tone }: AdminStatCardProps) {
  return (
    <div className={cn(adminStatCardVariants({ tone }))}>
      <p className="text-muted-foreground text-xs uppercase tracking-[0.05em]">
        {label}
      </p>
      <p className="font-semibold text-2xl text-card-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}
