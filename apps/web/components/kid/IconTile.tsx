"use client";

import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useAudio } from "@/components/AudioProvider";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";

/**
 * A big illustrated square: how a pre-reader chooses anything — a world, a
 * lesson, a character, an answer.
 *
 * Built on the token contract directly rather than on the `Button` primitive:
 * a tile is a square media surface with the label *under* the art, which no
 * `Button` variant expresses. What it does copy from the primitive is the part
 * that matters — the same focus ring, the same disabled treatment.
 *
 * The picture is decorative (`alt=""`); the visible label is what a screen
 * reader announces, so meaning is never carried by the image alone.
 */

const iconTileVariants = cva(
  "group inline-flex aspect-square flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border-2 bg-card p-4 text-card-foreground shadow-md transition-[border-color,box-shadow] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      size: {
        md: "min-h-24 min-w-24",
        lg: "min-h-32 min-w-32",
      },
      isSelected: {
        true: "border-primary shadow-pop",
        false: "border-border",
      },
    },
    defaultVariants: { size: "md", isSelected: false },
  },
);

export interface IconTileProps extends VariantProps<typeof iconTileVariants> {
  /** Always visible — kid surfaces never rely on an icon alone (design.md §1). */
  label: string;
  /** A Lucide icon or any node. Ignored when `imageSrc` is given. */
  icon?: ReactNode;
  /** Illustration URL; rendered through `next/image`. */
  imageSrc?: string;
  audioSrc?: string;
  onPress?: () => void;
  isDisabled?: boolean;
}

const IMAGE_PX = 96;

export function IconTile({
  label,
  icon,
  imageSrc,
  audioSrc,
  onPress,
  size,
  isSelected,
  isDisabled = false,
}: IconTileProps) {
  const { play } = useAudio();
  const isMotionReduced = useIsMotionReduced();

  return (
    <motion.button
      type="button"
      disabled={isDisabled}
      aria-pressed={isSelected ?? false}
      className={cn(iconTileVariants({ size, isSelected }))}
      whileTap={isMotionReduced ? undefined : { scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      onClick={() => {
        if (audioSrc !== undefined) void play(audioSrc);
        onPress?.();
      }}
    >
      <span className="flex flex-1 items-center justify-center [&_svg]:size-12">
        {imageSrc === undefined ? (
          icon
        ) : (
          <Image
            src={imageSrc}
            alt=""
            width={IMAGE_PX}
            height={IMAGE_PX}
            className="h-full w-auto object-contain"
          />
        )}
      </span>
      {/* text-lg is the 20px floor for anything a child reads (design.md §3.2). */}
      <span className="text-center font-display text-lg leading-tight">
        {label}
      </span>
    </motion.button>
  );
}
