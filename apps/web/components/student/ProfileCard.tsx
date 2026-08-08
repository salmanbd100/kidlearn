"use client";

import type {
  AvatarCharacterResponse,
  ChildProfileResponse,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { motion } from "motion/react";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { avatarArtFor, FALLBACK_AVATAR_ART } from "@/lib/avatars";
import { STUDENT_NAMESPACE } from "@/lib/i18n";

/**
 * How a child says "that one is me" (FR-AUTH-06).
 *
 * The whole card is the button, not a button inside it: a three-year-old aims at
 * the picture, and a hit area that stops short of what they aimed at reads as the
 * app ignoring them. At the smallest phone width two of these sit side by side and
 * each is still far past the 64px kid minimum (design.md §7).
 *
 * Deliberately no PIN and no lock: listing first names and avatars so a child can
 * pick one is the designed behaviour, and a gate here would make handing the
 * tablet to a sibling a parent's job. The PIN guards `/parent/*`.
 */

const profileCardVariants = cva(
  "flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-border bg-card p-4 text-card-foreground shadow-md transition-[border-color,box-shadow] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
);

/** Big enough to recognise across a room; the tap target is the card around it. */
const AVATAR_PX = 120;

export interface ProfileCardProps {
  child: ChildProfileResponse;
  avatars: readonly AvatarCharacterResponse[];
  onSelect: () => void;
  isDisabled?: boolean;
}

export function ProfileCard({
  child,
  avatars,
  onSelect,
  isDisabled = false,
}: ProfileCardProps) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();

  const character = avatars.find(
    (avatar) => avatar.id === child.avatarCharacterId,
  );
  // A retired character leaves the profile pointing at nothing renderable — the
  // column is nullable precisely so that can happen — so fall back rather than
  // render a hole where a child expects their face.
  const art = character ? avatarArtFor(character.slug) : FALLBACK_AVATAR_ART;
  const hasImage = character?.imageUrl != null;

  return (
    <motion.button
      type="button"
      disabled={isDisabled}
      aria-label={t("selectProfile.choose", { name: child.firstName })}
      className={cn(profileCardVariants())}
      whileTap={isMotionReduced ? undefined : { scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      onClick={onSelect}
    >
      <span
        className={cn(
          "flex size-28 items-center justify-center rounded-xl text-6xl sm:size-32",
          hasImage ? "bg-muted" : art.tileClassName,
        )}
      >
        {hasImage && character?.imageUrl != null ? (
          <Image
            src={character.imageUrl}
            alt=""
            width={AVATAR_PX}
            height={AVATAR_PX}
            className="size-full rounded-xl object-cover"
          />
        ) : (
          <span aria-hidden="true">{art.glyph}</span>
        )}
      </span>

      {/* text-xl clears the 20px floor for anything a child reads (design.md §3.2). */}
      <span className="text-center font-display text-xl leading-tight">
        {child.firstName}
      </span>
    </motion.button>
  );
}
