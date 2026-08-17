"use client";

import { Award } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { LESSON_NAMESPACE } from "@/lib/i18n";

/**
 * A badge or a character, revealed one at a time (FR-GAM-04, FR-GAM-05).
 *
 * **One card, two meanings, because to a four-year-old they are the same
 * moment:** something new appeared, it has a picture and a name, and it is
 * theirs now. Splitting them into two components would have produced two files
 * differing by a noun.
 *
 * The reveal is a scale-and-fade rather than a card flip. A flip animates
 * `rotateY`, which forces a repaint of the face coming round on every frame —
 * `design.md §5.2` allows `transform` and `opacity`, and a 3-D rotation on a
 * cheap tablet is exactly where that rule comes from.
 *
 * **The name is spoken by the celebration around it, not by this card.** The
 * whole reward screen has one live region (see `RewardStep`); a card that
 * announced itself would talk over it.
 */

const ART_PX = 160;

export interface BadgeRevealProps {
  name: string;
  /** `null` until the badge or character artwork ships — a glyph stands in. */
  imageUrl: string | null;
  /** Chooses the placeholder glyph and the caption above the name. */
  kind: "badge" | "character";
}

export function BadgeReveal({ name, imageUrl, kind }: BadgeRevealProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();

  return (
    <motion.div
      data-testid={kind === "badge" ? "badge-reveal" : "character-reveal"}
      className="flex flex-col items-center gap-3"
      // Reduced motion gets the finished card, not a slower one: Motion writes
      // inline transforms that no stylesheet can neutralise (design.md §5.2).
      initial={isMotionReduced ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
    >
      <span className="flex size-40 items-center justify-center rounded-3xl bg-card text-7xl shadow-md">
        {imageUrl === null ? (
          // Decorative: the name below is what identifies it, and the sentence
          // in the celebration's live region is what announces it.
          <Award
            aria-hidden="true"
            className="size-24 fill-accent text-accent"
          />
        ) : (
          <Image
            src={imageUrl}
            alt=""
            width={ART_PX}
            height={ART_PX}
            className="size-36 rounded-3xl object-contain"
          />
        )}
      </span>

      <p aria-hidden="true" className="flex flex-col items-center gap-1">
        <span className="font-body text-base text-muted-foreground">
          {kind === "badge"
            ? t("reward.badgeCaption")
            : t("reward.characterCaption")}
        </span>
        <span className="font-display text-2xl text-foreground">{name}</span>
      </p>
    </motion.div>
  );
}
