"use client";

import type { AvatarCharacterResponse } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { Lock } from "lucide-react";
import Image from "next/image";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { avatarArtFor } from "@/lib/avatars";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { toLocale } from "@/lib/locale";

/**
 * Pick the character a child wears (FR-PROF-02, FR-GAM-05).
 *
 * A radio group, built from native inputs rather than buttons, because that is
 * what "choose exactly one of these" means to a screen reader and to a keyboard:
 * arrow keys move within the group and the group is one tab stop. The inputs are
 * visually hidden but not removed — `sr-only` keeps them focusable, and the tile
 * styling hangs off `peer-checked` / `peer-focus-visible`, so the focus ring is
 * real rather than simulated.
 *
 * `options` comes from the API, never from a list in this app: the ids are
 * `Character` row ids and the published set is content (file 31).
 *
 * ## Locked characters
 *
 * An option carrying `isUnlocked: false` is one this child has not earned yet,
 * and it is **shown rather than hidden** — a picker listing only what a child
 * already has cannot show them what there is to earn.
 *
 * They sit *below* the radio group rather than inside it, in a section of their
 * own. A radio group is "choose one of these", and something that cannot be
 * chosen does not belong in it: inside, a keyboard user would arrow onto a
 * choice that refuses to take, and a screen reader would count it among the
 * options. Each one is a `button` rather than a disabled radio for the same
 * reason — a disabled control is skipped and announced as unavailable, which
 * tells nobody *why*. Pressing it plays the gentle "keep learning to unlock"
 * line and changes nothing: never an error, and never a dead tap.
 *
 * `isUnlocked` is optional so `GET /api/characters` — the starter list the
 * create form uses, where every option is by definition available — needs no
 * flag of its own.
 */
export interface AvatarPickerOption extends AvatarCharacterResponse {
  /** Absent means unlocked; only the per-child lists send `false`. */
  isUnlocked?: boolean;
}

export interface AvatarPickerProps {
  options: readonly AvatarPickerOption[];
  /** The selected character's id, or `""` when nothing is chosen yet. */
  value: string;
  onChange: (avatarCharacterId: string) => void;
  /** Wired to the group's `aria-describedby` by the form. */
  describedById?: string;
  isInvalid?: boolean;
}

/** Shared by both tiles, so a lock cannot drift out of the grid's rhythm. */
const TILE_CLASS =
  "flex size-16 items-center justify-center rounded-lg border-2 border-transparent text-3xl";

const GRID_CLASS = "grid grid-cols-3 gap-3 sm:grid-cols-4";

export function AvatarPicker({
  options,
  value,
  onChange,
  describedById,
  isInvalid = false,
}: AvatarPickerProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const lockedHeadingId = useId();

  const unlocked = options.filter((option) => option.isUnlocked !== false);
  const locked = options.filter((option) => option.isUnlocked === false);

  if (options.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("form.avatarEmpty")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="radiogroup"
        aria-label={t("form.avatar")}
        aria-describedby={describedById}
        aria-invalid={isInvalid}
        className={GRID_CLASS}
      >
        {unlocked.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer flex-col items-center gap-1.5"
          >
            <input
              type="radio"
              name="avatarCharacterId"
              value={option.id}
              checked={value === option.id}
              aria-label={t("form.avatarChoose", { name: option.name })}
              onChange={() => onChange(option.id)}
              className="peer sr-only"
            />
            <span
              className={cn(
                // 64px+ and square: this is the one control on the parent surface
                // a child also reaches for, so it gets the kid target size.
                TILE_CLASS,
                "transition-[border-color,transform] peer-checked:border-primary peer-checked:scale-105 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 motion-reduce:peer-checked:scale-100",
                option.imageUrl === null
                  ? avatarArtFor(option.slug).tileClassName
                  : "bg-muted",
              )}
            >
              <AvatarArtwork option={option} />
            </span>
            <span className="text-center text-muted-foreground text-xs peer-checked:text-foreground peer-checked:font-medium">
              {option.name}
            </span>
          </label>
        ))}
      </div>

      {locked.length === 0 ? null : (
        <section
          aria-labelledby={lockedHeadingId}
          data-testid="avatar-picker-locked"
          className="flex flex-col gap-2"
        >
          <h3
            id={lockedHeadingId}
            className="font-medium text-muted-foreground text-sm"
          >
            {t("form.avatarLockedHeading")}
          </h3>
          <div className={GRID_CLASS}>
            {locked.map((option) => (
              <LockedAvatar key={option.id} option={option} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** The glyph or the illustration, whichever the character has. */
function AvatarArtwork({ option }: { option: AvatarPickerOption }) {
  if (option.imageUrl === null) {
    // Placeholder art until the character sheet ships — decorative, because the
    // name below is what identifies the character.
    return <span aria-hidden="true">{avatarArtFor(option.slug).glyph}</span>;
  }

  return (
    <Image
      src={option.imageUrl}
      alt=""
      width={64}
      height={64}
      className="size-14 rounded-lg object-cover"
    />
  );
}

/**
 * A character still to be earned.
 *
 * `grayscale` plus a reduced opacity rather than a different glyph: the
 * silhouette is recognisably *that* character, so the day it unlocks the child
 * sees the one they had been looking at.
 */
function LockedAvatar({ option }: { option: AvatarPickerOption }) {
  const { t, i18n } = useTranslation(PARENT_NAMESPACE);
  const { play } = useAudio();
  const locale = toLocale(i18n.resolvedLanguage);

  return (
    <button
      type="button"
      aria-label={t("form.avatarLocked", { name: option.name })}
      onClick={() =>
        void play(`/audio/feedback/locked-${locale}.mp3`, { interrupt: true })
      }
      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <span
        className={cn(TILE_CLASS, "relative bg-muted opacity-60 grayscale")}
      >
        <AvatarArtwork option={option} />
        <span className="absolute right-0 bottom-0 flex size-6 items-center justify-center rounded-full bg-card shadow-sm">
          <Lock aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </span>
      </span>
      <span className="text-center text-muted-foreground text-xs">
        {option.name}
      </span>
    </button>
  );
}
