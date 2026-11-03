"use client";

import { cn } from "@kidlearn/ui";
import {
  BookOpen,
  CircleHelp,
  Hand,
  Link,
  PencilLine,
  Puzzle,
} from "lucide-react";
import { motion } from "motion/react";
import { useIsMotionReducedAfterHydration } from "../use-is-motion-reduced-after-hydration";
import { useSiteTranslation } from "../use-site-translation";
import { Reveal } from "./Reveal";

// One tile per activity engine (`packages/types` activity + quiz payloads) and the story reader.
// Brand tints on the discs are decorative; the title names each one.
const WAYS = [
  { key: "trace", Icon: PencilLine, tint: "bg-grape/15", tilt: -10 },
  { key: "match", Icon: Link, tint: "bg-sky/20", tilt: 10 },
  { key: "drag", Icon: Hand, tint: "bg-coral/20", tilt: -12 },
  { key: "puzzle", Icon: Puzzle, tint: "bg-mint/25", tilt: 12 },
  { key: "quiz", Icon: CircleHelp, tint: "bg-sunshine/30", tilt: -8 },
  { key: "story", Icon: BookOpen, tint: "bg-blossom/15", tilt: 8 },
] as const;

export function PlayGallery() {
  const { t } = useSiteTranslation();
  const isMotionReduced = useIsMotionReducedAfterHydration();

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {WAYS.map(({ key, Icon, tint, tilt }, index) => (
        <li key={key}>
          <Reveal
            delay={0.06 * index}
            className="flex h-full items-start gap-4 rounded-(--radius) border-2 border-border bg-card p-5"
          >
            {/* A tap or hover tilts the disc: a small "hello" for a child poking at the page. */}
            <motion.span
              aria-hidden="true"
              whileHover={
                isMotionReduced ? undefined : { rotate: tilt, scale: 1.08 }
              }
              whileTap={
                isMotionReduced ? undefined : { rotate: -tilt, scale: 0.92 }
              }
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className={cn(
                "flex size-16 shrink-0 touch-manipulation items-center justify-center rounded-2xl text-foreground",
                tint,
              )}
            >
              <Icon className="size-8" strokeWidth={2.25} />
            </motion.span>
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-2xl font-semibold">
                {t(`home.play.${key}.title`)}
              </h3>
              <p className="text-lg leading-snug text-muted-foreground">
                {t(`home.play.${key}.detail`)}
              </p>
            </div>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
