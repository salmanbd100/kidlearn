import type { ContentStatusValue } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

export const chipVariants = cva(
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

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>["tone"]>;

export function Chip({
  tone,
  children,
}: {
  tone?: ChipTone;
  children: ReactNode;
}) {
  return <span className={cn(chipVariants({ tone }))}>{children}</span>;
}

const TONE_BY_STATUS: Record<ContentStatusValue, ChipTone> = {
  published: "live",
  in_review: "review",
  approved: "review",
  draft: "quiet",
  rejected: "quiet",
  archived: "quiet",
};

const LABELS: Record<ContentStatusValue, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  archived: "Archived",
};

export function StatusChip({ status }: { status: ContentStatusValue }) {
  return <Chip tone={TONE_BY_STATUS[status]}>{LABELS[status]}</Chip>;
}

export { LABELS as CONTENT_STATUS_LABELS };
