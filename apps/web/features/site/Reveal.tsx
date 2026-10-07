"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useIsMotionReducedAfterHydration } from "./use-is-motion-reduced-after-hydration";

const HIDDEN = { opacity: 0, y: 24 } as const;
const SHOWN = { opacity: 1, y: 0 } as const;

/** Fades its children up the first time they scroll into view; under reduced motion, renders them still. */
export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const isMotionReduced = useIsMotionReducedAfterHydration();

  // Always a `motion.div`: only Motion writing `SHOWN` clears the server's hidden start.
  return (
    <motion.div
      key={isMotionReduced ? "still" : "moving"}
      className={className}
      initial={isMotionReduced ? false : HIDDEN}
      animate={isMotionReduced ? SHOWN : undefined}
      whileInView={isMotionReduced ? undefined : SHOWN}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.4, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
