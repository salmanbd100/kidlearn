"use client";

import type { AvatarCharacterResponse } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { avatarArtFor } from "@/lib/avatars";
import { PARENT_NAMESPACE } from "@/lib/i18n";

/**
 * Pick the character a child wears (FR-PROF-02).
 *
 * A radio group, built from native inputs rather than buttons, because that is
 * what "choose exactly one of these" means to a screen reader and to a keyboard:
 * arrow keys move within the group and the group is one tab stop. The inputs are
 * visually hidden but not removed — `sr-only` keeps them focusable, and the tile
 * styling hangs off `peer-checked` / `peer-focus-visible`, so the focus ring is
 * real rather than simulated.
 *
 * `options` comes from `GET /api/characters`, never from a list in this app: the
 * ids are `Character` row ids and the published set is content (file 31).
 */
export interface AvatarPickerProps {
  options: readonly AvatarCharacterResponse[];
  /** The selected character's id, or `""` when nothing is chosen yet. */
  value: string;
  onChange: (avatarCharacterId: string) => void;
  /** Wired to the group's `aria-describedby` by the form. */
  describedById?: string;
  isInvalid?: boolean;
}

export function AvatarPicker({
  options,
  value,
  onChange,
  describedById,
  isInvalid = false,
}: AvatarPickerProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);

  if (options.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("form.avatarEmpty")}</p>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("form.avatar")}
      aria-describedby={describedById}
      aria-invalid={isInvalid}
      className="grid grid-cols-3 gap-3 sm:grid-cols-4"
    >
      {options.map((option) => {
        const art = avatarArtFor(option.slug);
        const label = t("form.avatarChoose", { name: option.name });

        return (
          <label
            key={option.id}
            className="flex cursor-pointer flex-col items-center gap-1.5"
          >
            <input
              type="radio"
              name="avatarCharacterId"
              value={option.id}
              checked={value === option.id}
              aria-label={label}
              onChange={() => onChange(option.id)}
              className="peer sr-only"
            />
            <span
              className={cn(
                // 64px+ and square: this is the one control on the parent surface
                // a child also reaches for, so it gets the kid target size.
                "flex size-16 items-center justify-center rounded-lg border-2 border-transparent text-3xl transition-[border-color,transform] peer-checked:border-primary peer-checked:scale-105 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 motion-reduce:peer-checked:scale-100",
                option.imageUrl === null ? art.tileClassName : "bg-muted",
              )}
            >
              {option.imageUrl === null ? (
                // Placeholder art until the character sheet ships — decorative,
                // because the name below is what identifies the character.
                <span aria-hidden="true">{art.glyph}</span>
              ) : (
                <Image
                  src={option.imageUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="size-14 rounded-lg object-cover"
                />
              )}
            </span>
            <span className="text-center text-muted-foreground text-xs peer-checked:text-foreground peer-checked:font-medium">
              {option.name}
            </span>
          </label>
        );
      })}
    </div>
  );
}
