"use client";

import { cn, useIsMotionReduced } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useAudio } from "@/shared/components/AudioProvider";

const iconTileVariants = cva(
  "group inline-flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 bg-card p-4 text-card-foreground shadow-md transition-[border-color,box-shadow] touch-manipulation focus-ring disabled:pointer-events-none disabled:opacity-50",
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

// A large tile sits in a grid of titles that may wrap; two reserved lines keep every icon at the same height.
const iconTileLabelVariants = cva(
  "text-center font-display text-lg leading-tight",
  {
    variants: {
      size: { md: "", lg: "min-h-[2lh]" },
    },
    defaultVariants: { size: "md" },
  },
);

export interface IconTileProps extends VariantProps<typeof iconTileVariants> {
  label: string;
  icon?: ReactNode;
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
      <span className={cn(iconTileLabelVariants({ size }))}>{label}</span>
    </motion.button>
  );
}
