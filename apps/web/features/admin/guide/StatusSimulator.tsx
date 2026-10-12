"use client";

import {
  CONTENT_STATUSES,
  type ContentStatusValue,
  isContentEditable,
} from "@kidlearn/types";
import { Button, cn, useIsMotionReduced } from "@kidlearn/ui";
import { Eye, EyeOff, Lock, LockOpen, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
  CONTENT_STATUS_LABELS as STATUS_LABELS,
  StatusChip,
} from "@/features/admin/StatusChip";
import { TransitionButtons } from "@/features/admin/TransitionButtons";
import { useFocusWhenDropped } from "@/shared/hooks/use-focus-when-dropped";
import { swapTransition } from "./guide-sections";

const MEANING: Record<ContentStatusValue, string> = {
  draft:
    "Work in progress. Edit freely — nothing here reaches a child. When it reads right, submit it for review.",
  in_review:
    "Frozen for the reviewer. Approve it, reject it with a reason, or pull it back to draft to keep editing. Approve & publish does both hops at once.",
  approved:
    "Signed off but not live yet. Publish when you are ready; editing needs a trip back to draft, so nobody ships words that were not approved.",
  rejected:
    "Not good enough as it stands. Move it back to draft, fix it, and send it through review again — there is no shortcut to published.",
  published:
    "Live: every child in the ticked grades can see it now. To change it, move it back to draft — it leaves children immediately until republished.",
  archived:
    "Retired without being deleted. Hidden from children and from the CMS unless Show archived is on.",
};

/** A sandbox row driven by the CMS's own transition buttons and rules — nothing is saved. */
export function StatusSimulator() {
  const [history, setHistory] = useState<ContentStatusValue[]>(["draft"]);
  const isMotionReduced = useIsMotionReduced();
  const status = history[history.length - 1];
  const isEditable = isContentEditable(status);
  const isLive = status === "published";
  const rowRef = useFocusWhenDropped<HTMLDivElement>(history.length);

  return (
    <div className="flex flex-col gap-5 rounded-(--radius) border border-border bg-card p-4 md:p-6">
      <ol
        aria-label="Statuses"
        className="flex flex-wrap gap-1.5 rounded-(--radius) bg-muted p-1.5"
      >
        {CONTENT_STATUSES.map((one) => (
          <li
            key={one}
            aria-current={one === status ? "step" : undefined}
            className="relative flex min-h-9 items-center px-3 text-xs"
          >
            {one === status ? (
              <motion.span
                layoutId="guide-status-marker"
                transition={swapTransition(isMotionReduced)}
                className="absolute inset-0 rounded-(--radius) bg-card shadow-sm"
              />
            ) : null}
            <span
              className={cn(
                "relative",
                one === status
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {STATUS_LABELS[one]}
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div className="flex flex-col gap-3">
          <div
            ref={rowRef}
            // Where focus lands when the pressed transition button is replaced or disabled.
            tabIndex={-1}
            className="flex flex-wrap items-center gap-2 outline-none"
          >
            <span className="font-semibold text-foreground text-sm">
              The letter A
            </span>
            <StatusChip status={status} />
          </div>

          <div aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={status}
                initial={{ opacity: 0, x: isMotionReduced ? 0 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isMotionReduced ? 0 : -8 }}
                transition={swapTransition(isMotionReduced)}
                className="max-w-prose text-muted-foreground text-sm"
              >
                {MEANING[status]}
              </motion.p>
            </AnimatePresence>
          </div>

          <TransitionButtons
            status={status}
            isBusy={false}
            onTransition={(hops) =>
              setHistory((current) => [...current, ...hops])
            }
          />
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          <Fact
            icon={isEditable ? LockOpen : Lock}
            term="Edit"
            value={isEditable ? "Allowed" : "Locked — back to draft first"}
            isPositive={isEditable}
          />
          <Fact
            icon={isLive ? Eye : EyeOff}
            term="Children"
            value={isLive ? "Can see it" : "Cannot see it"}
            isPositive={isLive}
          />
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-4">
        <p className="text-muted-foreground text-xs">
          <span className="font-medium text-foreground">Path so far: </span>
          {history.map((one) => STATUS_LABELS[one]).join(" → ")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={history.length === 1}
          onClick={() => setHistory(["draft"])}
        >
          <RotateCcw aria-hidden="true" className="size-4!" />
          Start again
        </Button>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  term,
  value,
  isPositive,
}: {
  icon: typeof Lock;
  term: string;
  value: string;
  isPositive: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-(--radius) border border-border px-3 py-2">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0",
          isPositive ? "text-success" : "text-muted-foreground",
        )}
      />
      <dt className="text-muted-foreground text-xs">{term}</dt>
      <dd className="ml-auto text-right font-medium text-foreground text-xs">
        {value}
      </dd>
    </div>
  );
}
