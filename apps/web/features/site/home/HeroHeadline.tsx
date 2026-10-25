"use client";

import { cn } from "@kidlearn/ui";
import { motion, useAnimate } from "motion/react";
import { useIsMotionReducedAfterHydration } from "../use-is-motion-reduced-after-hydration";
import { useSiteTranslation } from "../use-site-translation";

const SPRING = { type: "spring", stiffness: 400, damping: 15 } as const;

// Brand tints are allowed here: the stickers are decorative art behind ink text (design.md §2.2).
const WORDS = [
  { key: "learn", tint: "bg-sky/25", tilt: -4 },
  { key: "play", tint: "bg-coral/25", tilt: 3 },
  { key: "grow", tint: "bg-mint/30", tilt: -2 },
] as const;

/**
 * The homepage headline as three word stickers that pop on one after another and wobble when tapped.
 * Whole words, never letters: splitting Bangla by character would break its conjuncts apart.
 */
export function HeroHeadline({ id }: { id: string }) {
  const { t } = useSiteTranslation();
  const isMotionReduced = useIsMotionReducedAfterHydration();

  return (
    <h1 id={id}>
      <span className="sr-only">{t("home.headline")}</span>
      <span
        aria-hidden="true"
        key={isMotionReduced ? "still" : "moving"}
        className="flex flex-wrap items-center gap-x-2 gap-y-2 font-display text-[clamp(2.5rem,min(10vw,11dvh),3.75rem)] font-semibold leading-none"
      >
        {WORDS.map(({ key, tint, tilt }, index) => (
          <motion.span
            key={key}
            className="inline-block"
            initial={isMotionReduced ? false : { scale: 0, rotate: tilt - 20 }}
            animate={{ scale: 1, rotate: tilt }}
            transition={{ ...SPRING, delay: 0.15 + 0.18 * index }}
            style={isMotionReduced ? { rotate: tilt } : undefined}
          >
            <Sticker tint={tint} isMotionReduced={isMotionReduced}>
              {t(`home.headlineWords.${key}`)}
            </Sticker>
          </motion.span>
        ))}
      </span>
    </h1>
  );
}

function Sticker({
  tint,
  isMotionReduced,
  children,
}: {
  tint: string;
  isMotionReduced: boolean;
  children: string;
}) {
  const [scope, animate] = useAnimate<HTMLSpanElement>();

  function wobble() {
    if (isMotionReduced) return;
    void animate(
      scope.current,
      { y: [0, -14, 0], rotate: [0, -8, 6, 0] },
      { duration: 0.5, ease: [0.2, 0, 0, 1] },
    );
  }

  return (
    <span
      ref={scope}
      onPointerDown={wobble}
      className={cn(
        "inline-block cursor-pointer touch-manipulation select-none rounded-2xl px-3 pt-1 pb-2.5",
        tint,
      )}
    >
      {children}
    </span>
  );
}
