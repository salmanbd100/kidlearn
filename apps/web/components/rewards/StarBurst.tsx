"use client";

import { Star } from "lucide-react";
import { motion } from "motion/react";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";

/**
 * The stars a lesson just earned, popping in one at a time (FR-GAM-01,
 * FR-LSN-05).
 *
 * One big star per star, and nothing that could read as a mark out of anything:
 * there is no empty slot, no "2 of 3", and no total to compare against. The
 * count is small by construction — two or three — so the stagger is generous
 * enough for a child to watch each one land rather than a shower they cannot
 * follow.
 *
 * A completion that granted nothing (a replay) renders no stars, and the
 * celebration around it says the warm thing instead. Zero is *already done*, not
 * a failure, and the child is owed the fireworks either way.
 */

/** Long enough that each star is its own event, per `design.md §5.1`. */
export const STAR_STAGGER_MS = 400;

export function StarBurst({ count }: { count: number }) {
  const isMotionReduced = useIsMotionReduced();

  return (
    <ol
      aria-hidden="true"
      data-testid="star-burst"
      className="flex flex-wrap items-center justify-center gap-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <motion.li
          // The stars are identical and ordered; there is nothing else to key on.
          // biome-ignore lint/suspicious/noArrayIndexKey: a star has no identity
          key={index}
          data-testid="star-burst-star"
          className="flex"
          // Reduced motion gets the finished screen rather than a slower
          // version: Motion writes transforms as inline styles that no
          // stylesheet can neutralise (design.md §5.2).
          initial={isMotionReduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 14,
            delay: isMotionReduced ? 0 : (index * STAR_STAGGER_MS) / 1000,
          }}
        >
          <Star className="size-20 fill-accent text-accent sm:size-24" />
        </motion.li>
      ))}
    </ol>
  );
}
