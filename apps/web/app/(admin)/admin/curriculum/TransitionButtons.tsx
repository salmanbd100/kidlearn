"use client";

import { type ContentStatusValue, nextContentStatuses } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";

/**
 * The status changes legal from where a row currently is (file 32, FR-CMS-06).
 *
 * **The list comes from `@kidlearn/types`, which is the same table the server
 * applies** — not a copy of it. A mirrored matrix drifts, and what drift produces
 * here is a button an admin clicks and a `409` they can do nothing about. The
 * server stays the authority regardless: it judges the hop against the row's
 * *actual* status, which this component cannot know is still current, so a
 * rejection is surfaced rather than assumed away.
 *
 * **Publish on an `in_review` row is two requests, not a special one.** There is
 * no `in_review → published` hop, and adding one would be adding a way to publish
 * without an approval on the record. The button sends `approved` and then
 * `published`, each validated in its own right; if the first is refused the
 * second is never sent.
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
