"use client";

import { Button, type ButtonProps } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useAudio } from "@/components/AudioProvider";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";

/**
 * The one thing a child taps.
 *
 * Every kid screen has a single primary action (design.md §1.3), and this is
 * it: chunky, pill-shaped, impossible to miss at 360px, and able to say its own
 * label out loud for a pre-reader who cannot read it (`audioSrc`).
 *
 * Geometry is the accessibility contract, not decoration — `md` is a 64×64px
 * hit area, `lg` an 80px-tall full-width bar, and `xl` a 96px one
 * (NFR-A11Y-02, design.md §7).
 */

const bigButtonVariants = cva("gap-3", {
  variants: {
    size: {
      md: "min-h-16 min-w-16",
      lg: "min-h-20 w-full",
      /**
       * 96px — the one button on a screen that has no other action and no way
       * back, so it is sized to be found without looking (file 23's "Done!").
       */
      xl: "min-h-24 w-full text-2xl",
    },
    /**
     * "Your turn now" — the cue that a step has finished saying its piece
     * (design.md §5.1). `motion-safe:` and nothing else: the pulse is the CSS
     * keyframe `globals.css` already neutralises under reduced motion, so it
     * needs no JS guard the way a Motion transform would.
     */
    isPulsing: {
      true: "motion-safe:animate-pulse",
      false: "",
    },
  },
  defaultVariants: { size: "md", isPulsing: false },
});

/**
 * Kid-facing variant names mapped onto the shared primitive's. A caller on the
 * Student Portal asks for "primary", not for shadcn's "default".
 */
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
  /** Rendered before the label. Decorative — the label carries the meaning. */
  icon?: ReactNode;
  /** Voice-over played on tap, e.g. "/audio/ui/lets-go.en.mp3". */
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
        // Transform and opacity only (design.md §5.2) — a spring press, so the
        // button feels like it gives way under a finger.
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
