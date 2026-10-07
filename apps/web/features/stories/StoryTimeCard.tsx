"use client";

import { useIsMotionReduced } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { ArrowRight, BookOpen } from "lucide-react";
import { motion } from "motion/react";

// Full width rather than a lone square tile: it lines up with the world grid beneath it, and is
// shorter, which keeps the worlds above the fold on a landscape tablet.
const storyTimeCardVariants = cva(
  "group flex min-h-24 w-full items-center gap-4 rounded-xl border-2 border-border bg-primary/10 p-4 text-left text-card-foreground shadow-md transition-[border-color,box-shadow] touch-manipulation focus-ring",
);

export interface StoryTimeCardProps {
  label: string;
  onPress: () => void;
}

export function StoryTimeCard({ label, onPress }: StoryTimeCardProps) {
  const isMotionReduced = useIsMotionReduced();

  return (
    <motion.button
      type="button"
      className={storyTimeCardVariants()}
      whileTap={isMotionReduced ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      onClick={onPress}
    >
      <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-card">
        <BookOpen aria-hidden="true" className="size-9" />
      </span>
      <span className="flex-1 font-display text-2xl leading-tight">
        {label}
      </span>
      <ArrowRight aria-hidden="true" className="size-8 shrink-0" />
    </motion.button>
  );
}
