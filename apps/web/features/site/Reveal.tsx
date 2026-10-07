"use client";

import { useIsMotionReduced } from "@kidlearn/ui";
import { motion } from "motion/react";
import type { ReactNode } from "react";

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
  const isMotionReduced = useIsMotionReduced();

  if (isMotionReduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.4, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
