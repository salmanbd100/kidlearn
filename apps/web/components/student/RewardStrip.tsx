"use client";

import type { ChildProfileResponse } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Coins, Flame, Star } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { STUDENT_NAMESPACE } from "@/lib/i18n";

/**
 * What the child has earned, at the top of every world screen (FR-GAM-06).
 *
 * **Read-only, and structurally so.** There is no setter, no local counter and no
 * optimistic increment anywhere in this component — every number comes from
 * `stats` on the profile the server sent. Rewards, coins and streaks are computed
 * server-side (spec §7, files 23–24); a client that could add a star is a client
 * that could be asked to.
 *
 * The streak chip is never hidden. A brand-new child sees a dimmed flame reading
 * "Start a streak!" rather than a gap where a chip will appear tomorrow —
 * predictability matters more to a five-year-old than tidiness, and a strip that
 * changes shape is a strip they have to re-learn.
 */

const chipVariants = cva(
  "inline-flex min-h-11 items-center gap-2 rounded-pill px-4 py-2 font-display text-lg leading-none",
  {
    variants: {
      isEarned: {
        true: "bg-card text-card-foreground shadow-sm",
        // Dimmed rather than absent — still legible, visibly not yet won.
        false: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { isEarned: true },
  },
);

/**
 * Reward icons are the sanctioned brand-hue exception (design.md §2.1–2.2,
 * decorative art): a star is yellow and a streak flame is orange because that is
 * what those objects *are*, not because a surface is being themed. Routing them
 * through `--warning` or `--destructive` would say something untrue about them —
 * a reward is neither a caution nor an error — and would flip their colour with
 * the parent theme, which never renders this strip.
 */
const REWARD_ICON_CLASS = {
  star: "fill-accent text-accent",
  coin: "fill-accent text-accent",
  flame: "fill-coral text-coral",
} as const;

interface RewardChipProps extends VariantProps<typeof chipVariants> {
  icon: ReactNode;
  /** What a screen reader announces — "3 stars", not "3". */
  label: string;
  /**
   * The bare number on screen, when there is one. Omitted when `label` is itself
   * what the chip shows ("Start a streak!"), so the string is not both read out
   * and printed — one chip, one announcement.
   */
  value?: number;
}

function RewardChip({ icon, label, value, isEarned }: RewardChipProps) {
  return (
    <span className={cn(chipVariants({ isEarned }))}>
      <span aria-hidden="true" className="[&_svg]:size-6">
        {icon}
      </span>
      {value === undefined ? (
        <span>{label}</span>
      ) : (
        <>
          <span className="sr-only">{label}</span>
          <span aria-hidden="true">{value}</span>
        </>
      )}
    </span>
  );
}

export interface RewardStripProps {
  stats: ChildProfileResponse["stats"];
}

export function RewardStrip({ stats }: RewardStripProps) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const hasStreak = stats.currentStreak > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <RewardChip
        icon={<Star className={REWARD_ICON_CLASS.star} />}
        label={t("rewards.stars", { count: stats.stars })}
        value={stats.stars}
        isEarned={stats.stars > 0}
      />

      <RewardChip
        icon={<Coins className={REWARD_ICON_CLASS.coin} />}
        label={t("rewards.coins", { count: stats.coins })}
        value={stats.coins}
        isEarned={stats.coins > 0}
      />

      <RewardChip
        icon={<Flame className={REWARD_ICON_CLASS.flame} />}
        label={
          hasStreak
            ? t("rewards.streak", { count: stats.currentStreak })
            : t("rewards.streakNone")
        }
        // No number to show yet, so the invitation is the chip's whole content.
        value={hasStreak ? stats.currentStreak : undefined}
        isEarned={hasStreak}
      />
    </div>
  );
}
