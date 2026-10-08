"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import { useIsMotionReduced } from "@kidlearn/ui";
import { Award } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useTranslation } from "react-i18next";

const ART_PX = 160;

export interface BadgeRevealProps {
  name: string;
  imageUrl: string | null;
  kind: "badge" | "character";
}

export function BadgeReveal({ name, imageUrl, kind }: BadgeRevealProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();

  return (
    <motion.div
      data-testid={kind === "badge" ? "badge-reveal" : "character-reveal"}
      className="flex flex-col items-center gap-3"
      // Reduced motion gets the finished card: Motion writes inline transforms no stylesheet can neutralise (design.md §5.2).
      initial={isMotionReduced ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
    >
      <span className="flex size-40 items-center justify-center rounded-3xl bg-card text-7xl shadow-md">
        {imageUrl === null ? (
          // Decorative: the name below identifies it, and the celebration's live region announces it.
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
        <span className="font-body text-lg text-muted-foreground">
          {kind === "badge"
            ? t("reward.badgeCaption")
            : t("reward.characterCaption")}
        </span>
        <span className="font-display text-2xl text-foreground">{name}</span>
      </p>
    </motion.div>
  );
}
