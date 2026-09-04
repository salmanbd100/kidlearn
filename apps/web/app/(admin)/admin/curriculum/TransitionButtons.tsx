"use client";

import { type ContentStatusValue, nextContentStatuses } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";

/**
 * The status changes legal from where a row currently is (file 32, FR-CMS-06).
 */

/** The verb an admin thinks in, for each hop. `to` is what goes over the wire. */
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

/**
 * `approved → published` is offered on an `in_review` row as a single button,
 * because approving and then publishing is one intention and two clicks with a
 * list re-render between them is not a review step.
 */
const CHAINED_PUBLISH: ContentStatusValue[] = ["approved", "published"];

export interface TransitionButtonsProps {
  status: ContentStatusValue;
  isBusy: boolean;
  /** Runs the hops in order, stopping at the first the server refuses. */
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
