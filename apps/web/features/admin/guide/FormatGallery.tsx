"use client";

import { cn, useIsMotionReduced } from "@kidlearn/ui";
import {
  Grid3x3,
  Hand,
  Image,
  ListChecks,
  type LucideIcon,
  MousePointerClick,
  Shuffle,
  Spline,
  Type,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { AdminFilterChip } from "@/features/admin/AdminFilterChip";
import { swapTransition } from "./guide-sections";

interface Format {
  id: string;
  icon: LucideIcon;
  child: string;
  provide: string;
  bestFor: string;
}

const ACTIVITIES: Format[] = [
  {
    id: "drag_drop",
    icon: Hand,
    child: "Drags 2–6 items onto 2–6 picture targets.",
    provide:
      "Items (label, optional picture and audio), targets (label and picture), and which item goes where — every item maps to exactly one target.",
    bestFor: "Sorting: big and small, A-words, fruit and vegetables.",
  },
  {
    id: "trace",
    icon: Spline,
    child: "Traces a letter or digit with a finger.",
    provide:
      "The glyph (A, ৩), its SVG path, at least two guide dots, and optionally stroke order and tolerance.",
    bestFor: "Letter and number formation.",
  },
  {
    id: "match",
    icon: Shuffle,
    child: "Pairs 2–6 left items with 2–6 right items.",
    provide: "Both sets and the correct pairs.",
    bestFor: "Upper and lower case, word and picture, number and quantity.",
  },
  {
    id: "puzzle",
    icon: Grid3x3,
    child: "Rebuilds a picture from 2×2 up to 4×4 pieces.",
    provide:
      "The picture, the grid size, and optionally pieces that start in place.",
    bestFor: "Nursery warm-ups — use a 2×2 or pre-place pieces.",
  },
];

const QUESTIONS: Format[] = [
  {
    id: "picture_select",
    icon: Image,
    child: "Taps the right picture out of 3–4.",
    provide: "A prompt and 3–4 options, every one with a picture.",
    bestFor: "Pre-readers. The safest default for Nursery and KG-1.",
  },
  {
    id: "mcq",
    icon: ListChecks,
    child: "Taps the right answer out of 3–4.",
    provide: "A prompt and 3–4 options with text and/or a picture.",
    bestFor: "KG-2, where some words can be read.",
  },
  {
    id: "match_pair",
    icon: MousePointerClick,
    child: "Joins two columns of 2–6.",
    provide: "Both columns and the correct pairs.",
    bestFor: "Checking several facts in one question.",
  },
  {
    id: "drag_answer",
    icon: Type,
    child: "Drags a word into a sentence's gap.",
    provide:
      "A sentence with exactly one {blank} per language, and 2–4 options.",
    bestFor: "Early sentence work in KG-2.",
  },
];

type Group = "activities" | "questions";

export function FormatGallery() {
  const [group, setGroup] = useState<Group>("activities");
  const isMotionReduced = useIsMotionReduced();
  const formats = group === "activities" ? ACTIVITIES : QUESTIONS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <AdminFilterChip
          isSelected={group === "activities"}
          onClick={() => setGroup("activities")}
        >
          Activity types
        </AdminFilterChip>
        <AdminFilterChip
          isSelected={group === "questions"}
          onClick={() => setGroup("questions")}
        >
          Quiz question formats
        </AdminFilterChip>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.ul
          key={group}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={swapTransition(isMotionReduced)}
          className="grid gap-3 sm:grid-cols-2"
        >
          {formats.map((format, index) => (
            <motion.li
              key={format.id}
              initial={{ opacity: 0, y: isMotionReduced ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...swapTransition(isMotionReduced),
                delay: isMotionReduced ? 0 : index * 0.05,
              }}
              className="flex flex-col gap-3 rounded-(--radius) border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-(--radius) bg-primary/10 text-primary">
                  <format.icon aria-hidden="true" className="size-4" />
                </span>
                <code className="font-mono font-semibold text-foreground text-sm">
                  {format.id}
                </code>
              </div>
              <dl className="flex flex-col gap-2 text-sm">
                <Row term="The child">{format.child}</Row>
                <Row term="You provide">{format.provide}</Row>
                <Row term="Best for" isQuiet>
                  {format.bestFor}
                </Row>
              </dl>
            </motion.li>
          ))}
        </motion.ul>
      </AnimatePresence>
    </div>
  );
}

function Row({
  term,
  isQuiet = false,
  children,
}: {
  term: string;
  isQuiet?: boolean;
  children: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{term}</dt>
      <dd className={cn(isQuiet ? "text-muted-foreground" : "text-foreground")}>
        {children}
      </dd>
    </div>
  );
}
