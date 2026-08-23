import type { ContentStatusValue } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * What status a row is in, at a glance (file 32, FR-CMS-06).
 *
 * The three tones answer one question — *can a child see this?* `live` is
 * `published` and only `published`; `review` is the two states waiting on a
 * person; `quiet` is everything a child cannot reach and nobody is waiting on.
 * Six colours would ask an admin scanning a tree to remember a legend; three ask
 * them to remember one distinction, and it is the distinction that matters.
 *
 * Semantic tokens only, per `design.md §2`.
 */
const statusChipVariants = cva(
  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-medium text-[11px] uppercase tracking-[0.04em]",
  {
    variants: {
      tone: {
        live: "bg-success/15 text-success",
        review: "bg-warning/15 text-warning",
        quiet: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { tone: "quiet" },
  },
);

const TONE_BY_STATUS: Record<
  ContentStatusValue,
  NonNullable<VariantProps<typeof statusChipVariants>["tone"]>
> = {
  published: "live",
  in_review: "review",
  approved: "review",
  draft: "quiet",
  rejected: "quiet",
  archived: "quiet",
};

/** `in_review` reads as two words; the rest are already one. */
const LABELS: Record<ContentStatusValue, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  archived: "Archived",
};

export function StatusChip({ status }: { status: ContentStatusValue }) {
  return (
    <span className={cn(statusChipVariants({ tone: TONE_BY_STATUS[status] }))}>
      {LABELS[status]}
    </span>
  );
}

export { LABELS as CONTENT_STATUS_LABELS };
