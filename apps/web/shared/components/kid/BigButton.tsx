"use client";

import { Button, type ButtonProps, useIsMotionReduced } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useAudio } from "@/shared/components/AudioProvider";

const bigButtonVariants = cva("gap-3", {
  variants: {
    size: {
      md: "min-h-16 min-w-16",
      lg: "min-h-20 w-full",
      /** 96px: the sole action on a screen with no way back, sized to be found without looking. */
      xl: "min-h-24 w-full text-2xl",
    },
    /** "Your turn now" cue. `motion-safe:` only: the CSS keyframe is already neutralised under reduced motion. */
    isPulsing: {
      true: "motion-safe:animate-pulse",
      false: "",
    },
  },
  defaultVariants: { size: "md", isPulsing: false },
});

const BUTTON_VARIANT_BY_TONE = {
  primary: "default",
  secondary: "secondary",
  success: "success",
  danger: "destructive",
} as const satisfies Record<string, NonNullable<ButtonProps["variant"]>>;

export type BigButtonVariant = keyof typeof BUTTON_VARIANT_BY_TONE;

export interface BigButtonProps extends VariantProps<typeof bigButtonVariants> {
  children: ReactNode;
  variant?: BigButtonVariant;
  icon?: ReactNode;
  audioSrc?: string;
  onPress?: () => void;
  isDisabled?: boolean;
}

export function BigButton({
  children,
  variant = "primary",
  size,
  isPulsing,
  icon,
  audioSrc,
  onPress,
  isDisabled = false,
}: BigButtonProps) {
  const { play } = useAudio();
  const isMotionReduced = useIsMotionReduced();

  return (
    <Button
      asChild
      variant={BUTTON_VARIANT_BY_TONE[variant]}
      size="kid"
      className={bigButtonVariants({ size, isPulsing })}
    >
      <motion.button
        type="button"
        disabled={isDisabled}
        // Transform and opacity only (design.md §5.2): a spring press.
        whileTap={isMotionReduced ? undefined : { scale: 0.94 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        onClick={() => {
          if (audioSrc !== undefined) void play(audioSrc);
          onPress?.();
        }}
      >
        {icon}
        <span>{children}</span>
      </motion.button>
    </Button>
  );
}
