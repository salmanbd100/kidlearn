"use client";

import type { ContentStatusValue } from "@kidlearn/types";
import { cn, useIsMotionReduced } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { GripVertical } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { StatusChip } from "@/features/admin/StatusChip";
import { swapTransition } from "./guide-sections";

type RegionId = "header" | "cascade" | "worlds" | "detail" | "parts";

const REGIONS: { id: RegionId; title: string; body: string }[] = [
  {
    id: "header",
    title: "Header actions",
    body: "How this works opens this guide. Show archived reveals retired rows. Refresh reloads the tree when someone else is editing. Generate lesson asks Gemini for a draft.",
  },
  {
    id: "cascade",
    title: "Subjects → Topics → Lessons",
    body: "Pick a subject and its topics appear; pick a topic and its lessons appear. New in a column is greyed out until the column to its left has a selection. Drag the grip to reorder — that order is what a child sees.",
  },
  {
    id: "worlds",
    title: "Worlds",
    body: "Themes, independent of the tree. Every lesson picks one. Worlds have no order.",
  },
  {
    id: "detail",
    title: "Detail panel",
    body: "Appears under the columns for whatever you selected: its status, Edit (locked while in review, approved or published) and the status buttons that are legal right now.",
  },
  {
    id: "parts",
    title: "Lesson parts",
    body: "Only for a lesson: Preview it as a child, create or edit its quiz and activity, and the AI shortcuts for questions and narration.",
  },
];

const regionVariants = cva(
  "relative rounded-(--radius) border transition-colors",
  {
    variants: {
      isActive: {
        true: "border-primary bg-primary/5 ring-2 ring-primary/30",
        false: "border-border bg-card",
      },
    },
    defaultVariants: { isActive: false },
  },
);

const legendVariants = cva(
  "flex flex-col gap-1 rounded-(--radius) px-3 py-1 transition-colors",
  {
    variants: {
      isActive: {
        true: "bg-primary/5",
        false: "hover:bg-accent",
      },
    },
    defaultVariants: { isActive: false },
  },
);

/** A wireframe of `/admin/curriculum`, hidden from assistive tech; the numbered list is the accessible half. */
export function ScreenMap() {
  const [active, setActive] = useState<RegionId>("cascade");
  const isMotionReduced = useIsMotionReduced();

  function region(id: RegionId) {
    return {
      number: REGIONS.findIndex((one) => one.id === id) + 1,
      isActive: active === id,
    };
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div
        aria-hidden="true"
        className="flex flex-col gap-3 rounded-(--radius) border border-border bg-background p-3 md:p-4"
      >
        <Region
          {...region("header")}
          className="flex flex-wrap items-center justify-between gap-2 p-3"
        >
          <span className="font-semibold text-foreground text-sm">
            Curriculum
          </span>
          <span className="flex flex-wrap gap-1.5">
            <FakeButton>How this works</FakeButton>
            <FakeButton>Show archived</FakeButton>
            <FakeButton>Refresh</FakeButton>
            <FakeButton isPrimary>Generate lesson</FakeButton>
          </span>
        </Region>

        <div className="grid gap-3 sm:grid-cols-[3fr_1fr]">
          <Region
            {...region("cascade")}
            className="grid gap-2 p-3 sm:grid-cols-3"
          >
            <FakeColumn
              title="Subjects"
              rows={[
                ["Letters", "published"],
                ["Numbers", "draft"],
              ]}
            />
            <FakeColumn title="Topics" rows={[["Vowels", "published"]]} />
            <FakeColumn
              title="Lessons"
              rows={[
                ["Letter A", "in_review"],
                ["Letter E", "draft"],
              ]}
            />
          </Region>
          <Region {...region("worlds")} className="p-3">
            <FakeColumn
              title="Worlds"
              rows={[["Jungle", "published"]]}
              isReorderable={false}
            />
          </Region>
        </div>

        <Region {...region("detail")} className="flex flex-col gap-2 p-3">
          <span className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-xs">
              Letter A
            </span>
            <StatusChip status="in_review" />
          </span>
          <span className="flex flex-wrap gap-1.5">
            <FakeButton isPrimary>Approve</FakeButton>
            <FakeButton>Reject</FakeButton>
            <FakeButton>Back to draft</FakeButton>
            <FakeButton isPrimary>Approve &amp; publish</FakeButton>
          </span>
          <Region {...region("parts")} className="flex flex-wrap gap-1.5 p-2">
            <FakeButton>Preview</FakeButton>
            <FakeButton>Edit quiz</FakeButton>
            <FakeButton>Generate questions with AI</FakeButton>
            <FakeButton>New activity</FakeButton>
          </Region>
        </Region>
      </div>

      <ol className="flex flex-col gap-1">
        {REGIONS.map((one, index) => (
          <li
            key={one.id}
            className={legendVariants({ isActive: active === one.id })}
          >
            <button
              type="button"
              aria-current={active === one.id ? "true" : undefined}
              onClick={() => setActive(one.id)}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-(--radius) text-left",
                "focus-ring",
              )}
            >
              <Badge number={index + 1} isActive={active === one.id} />
              <span className="font-medium text-foreground text-sm">
                {one.title}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {active === one.id ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={swapTransition(isMotionReduced)}
                  className="pb-2 pl-9 text-muted-foreground text-sm"
                >
                  {one.body}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Region({
  number,
  isActive,
  className,
  children,
}: {
  number: number;
  isActive: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(regionVariants({ isActive }), className)}>
      <span className="absolute -top-2.5 -left-2.5">
        <Badge number={number} isActive={isActive} />
      </span>
      {children}
    </div>
  );
}

function Badge({ number, isActive }: { number: number; isActive: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {number}
    </span>
  );
}

function FakeButton({
  isPrimary = false,
  children,
}: {
  isPrimary?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-(--radius) border px-2 py-1 text-[11px]",
        isPrimary
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function FakeColumn({
  title,
  rows,
  isReorderable = true,
}: {
  title: string;
  rows: [string, ContentStatusValue][];
  isReorderable?: boolean;
}) {
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className="font-semibold text-foreground text-xs">{title}</span>
        <FakeButton>New</FakeButton>
      </span>
      {rows.map(([label, status]) => (
        <span
          key={label}
          className="flex items-center gap-1 rounded-(--radius) border border-border bg-card px-1.5 py-1"
        >
          <span className="min-w-0 flex-1 truncate text-foreground text-xs">
            {label}
          </span>
          <StatusChip status={status} />
          {isReorderable ? (
            <GripVertical className="size-3.5 text-muted-foreground" />
          ) : null}
        </span>
      ))}
    </span>
  );
}
