"use client";

import { type ContentStatusValue, nextContentStatuses } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";

const ACTIONS: Record<
  ContentStatusValue,
  { label: string; variant: "default" | "outline" | "ghost" }
> = {
  in_review: { label: "Submit for review", variant: "default" },
  approved: { label: "Approve", variant: "default" },
  rejected: { label: "Reject", variant: "outline" },
  published: { label: "Publish", variant: "default" },
  draft: { label: "Back to draft", variant: "outline" },
  archived: { label: "Archive", variant: "ghost" },
};

/** `approved → published` on an `in_review` row is one button: approving then publishing is one intention. */
const CHAINED_PUBLISH: ContentStatusValue[] = ["approved", "published"];

export interface TransitionButtonsProps {
  status: ContentStatusValue;
  isBusy: boolean;
  onTransition: (hops: ContentStatusValue[]) => void;
}

export function TransitionButtons({
  status,
  isBusy,
  onTransition,
}: TransitionButtonsProps) {
  const legal = nextContentStatuses(status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {legal.map((to) => (
        <Button
          key={to}
          type="button"
          variant={ACTIONS[to].variant}
          disabled={isBusy}
          onClick={() => onTransition([to])}
        >
          {ACTIONS[to].label}
        </Button>
      ))}

      {status === "in_review" ? (
        <Button
          type="button"
          variant="default"
          disabled={isBusy}
          onClick={() => onTransition(CHAINED_PUBLISH)}
        >
          Approve &amp; publish
        </Button>
      ) : null}
    </div>
  );
}
