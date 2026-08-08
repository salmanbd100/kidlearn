"use client";

import type { WorldSummaryResponse } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { motion } from "motion/react";
import Image from "next/image";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { STUDENT_NAMESPACE } from "@/lib/i18n";

/**
 * A themed world, drawn entirely from the row that describes it (FR-WORLD-05).
 *
 * Jungle and Ocean appear because `GET /api/content/worlds` returned them — this
 * component has never heard of either, and adding Space World is a `World` row
 * plus a mascot asset, with no code change anywhere. That is the whole point of
 * the feature, so the one thing this file must never grow is a branch on
 * `world.slug`.
 *
 * `palette` therefore reaches the DOM as an inline style with raw colour values.
 * That is the sanctioned exception to the semantic-token rule (design.md §2.2,
 * decorative art) and it is confined to the gradient behind the mascot: the name
 * sits on a `bg-card` plate, so its contrast is guaranteed by the theme rather
 * than by whatever colours an author happened to save.
 */

const worldCardVariants = cva(
  "group relative flex min-h-56 flex-col items-center justify-end gap-4 overflow-hidden rounded-xl border-2 border-border p-6 shadow-md transition-[border-color,box-shadow] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

const MASCOT_PX = 160;

/**
 * The gradient a world paints itself with, or `undefined` when the row carries no
 * usable colours — in which case the card keeps the theme's own card surface
 * rather than rendering a broken `linear-gradient(...)` string.
 *
 * `palette` is free-form JSONB (`{ primary, secondary, bg }` in the seed), so the
 * two keys are read defensively: a world saved with only `primary` still renders.
 */
export function worldGradientStyle(
  palette: WorldSummaryResponse["palette"],
): CSSProperties | undefined {
  const from = palette.primary;
  if (typeof from !== "string" || from.length === 0) return undefined;

  const to = typeof palette.secondary === "string" ? palette.secondary : from;
  return { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` };
}

export interface WorldCardProps {
  world: WorldSummaryResponse;
  onPress: () => void;
}

export function WorldCard({ world, onPress }: WorldCardProps) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();
  const style = worldGradientStyle(world.palette);

  return (
    <motion.button
      type="button"
      aria-label={t("home.open", { name: world.name })}
      className={cn(worldCardVariants(), style === undefined && "bg-card")}
      style={style}
      whileTap={isMotionReduced ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      onClick={onPress}
    >
      <span className="flex flex-1 items-center justify-center">
        {world.mascot === null ? null : (
          <Image
            src={world.mascot.url}
            alt=""
            width={MASCOT_PX}
            height={MASCOT_PX}
            className="h-32 w-auto object-contain drop-shadow-lg sm:h-40"
          />
        )}
      </span>

      {/* On its own plate: the gradient is content data and cannot be trusted to
          contrast with any text laid directly over it (design.md §2.3). */}
      <span className="rounded-pill bg-card px-5 py-2 text-center font-display text-card-foreground text-xl leading-tight">
        {world.name}
      </span>
    </motion.button>
  );
}
