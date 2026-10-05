"use client";

import { STUDENT_NAMESPACE } from "@kidlearn/i18n";
import type { StorySummaryResponse } from "@kidlearn/types";
import { cn, useIsMotionReduced } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { BookOpen, Star } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { worldGradientStyle } from "@/features/content/worlds";

const storyCardVariants = cva(
  "group relative flex w-full flex-col items-stretch gap-3 overflow-hidden rounded-xl border-4 bg-card p-3 text-card-foreground shadow-md transition-[border-color,box-shadow] touch-manipulation focus-ring",
  {
    variants: {
      isSelected: {
        true: "border-primary shadow-pop",
        false: "border-border",
      },
    },
    defaultVariants: { isSelected: false },
  },
);

const COVER_PX = 320;

export interface StoryCardProps {
  story: StorySummaryResponse;
  isSelected: boolean;
  onPress: () => void;
}

export function StoryCard({ story, isSelected, onPress }: StoryCardProps) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();
  const accent = worldGradientStyle(story.world.palette);

  // The completion has to live in the button's own label: an explicit
  // `aria-label` replaces the subtree in the accessible-name computation, so the
  // badge below is announced by nothing it carries itself.
  const label = t(story.completed ? "stories.openCompleted" : "stories.open", {
    title: story.title,
  });

  return (
    <motion.button
      type="button"
      aria-pressed={isSelected}
      aria-label={label}
      className={cn(storyCardVariants({ isSelected }))}
      whileTap={isMotionReduced ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      onClick={onPress}
    >
      {/* min-h-24 keeps the cover above 96px before an illustration exists; the whole card is the hit target. */}
      <span
        className={cn(
          "relative flex min-h-24 flex-1 items-center justify-center overflow-hidden rounded-lg",
          accent === undefined && "bg-muted",
        )}
        style={accent}
      >
        {story.coverImageUrl === null ? (
          <BookOpen
            aria-hidden="true"
            className={cn(
              "size-12",
              // On the world's own gradient the card surface reads as a cut-out;
              // on the fallback `bg-muted` band it would be invisible.
              accent === undefined ? "text-muted-foreground" : "text-card",
            )}
          />
        ) : (
          <Image
            src={story.coverImageUrl}
            alt=""
            width={COVER_PX}
            height={COVER_PX}
            className="h-28 w-full object-cover sm:h-36"
          />
        )}

        {story.world.mascot === null ? null : (
          <Image
            src={story.world.mascot.url}
            alt=""
            width={64}
            height={64}
            className="absolute bottom-1 left-1 size-10 object-contain drop-shadow-md"
          />
        )}

        {/* A shape, not colour alone (design.md §2.3); the words are in the button's label. Completed stories stay openable. */}
        {story.completed ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-pill bg-card shadow-md"
          >
            <Star className="size-5 fill-accent text-accent" />
          </span>
        ) : null}
      </span>

      {/* text-lg is the 20px floor for anything a child reads (design.md §3.2). */}
      <span className="text-center font-display text-lg leading-tight">
        {story.title}
      </span>
    </motion.button>
  );
}
