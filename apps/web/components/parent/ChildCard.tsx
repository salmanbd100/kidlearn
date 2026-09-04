"use client";

import type {
  AvatarCharacterResponse,
  ChildProfileResponse,
  GradeLevelValue,
} from "@kidlearn/types";
import { Button, cn } from "@kidlearn/ui";
import { Clock, Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { avatarArtFor, FALLBACK_AVATAR_ART } from "@/lib/avatars";
import { PARENT_NAMESPACE } from "@/lib/i18n";

// One learner profile in the list (FR-PROF-05).

/** Every grade the API can return, not every grade this app's form offers. */
const GRADE_LABEL_KEYS: Record<GradeLevelValue, string> = {
  NURSERY: "form.gradeNursery",
  KG1: "form.gradeKg1",
  KG2: "form.gradeKg2",
};
export interface ChildCardProps {
  child: ChildProfileResponse;
  avatars: readonly AvatarCharacterResponse[];
  editHref: string;
  /** FR-TIME-05 — the daily limit and access window for this child. */
  screenTimeHref: string;
  onDeleteRequest: () => void;
}

export function ChildCard({
  child,
  avatars,
  editHref,
  screenTimeHref,
  onDeleteRequest,
}: ChildCardProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);

  const character = avatars.find(
    (avatar) => avatar.id === child.avatarCharacterId,
  );
  // A retired character leaves the profile pointing at nothing renderable — the
  // column is nullable precisely so that can happen — so fall back rather than
  // render a hole.
  const art = character ? avatarArtFor(character.slug) : FALLBACK_AVATAR_ART;

  const grade = t(GRADE_LABEL_KEYS[child.gradeLevel]);
  const language =
    child.preferredLanguage === "bn"
      ? t("form.languageBn")
      : t("form.languageEn");

  return (
    <li className="flex items-center gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
      <span
        className={cn(
          "flex size-14 shrink-0 items-center justify-center rounded-lg text-3xl",
          character?.imageUrl == null ? art.tileClassName : "bg-muted",
        )}
      >
        {character?.imageUrl == null ? (
          <span aria-hidden="true">{art.glyph}</span>
        ) : (
          <Image
            src={character.imageUrl}
            alt=""
            width={56}
            height={56}
            className="size-12 rounded-lg object-cover"
          />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-semibold text-card-foreground">
          {child.firstName}
        </p>
        <p className="text-muted-foreground text-sm">
          {t("children.meta", { age: child.age, grade, language })}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label={t("screenTime.open", { name: child.firstName })}
        >
          <Link href={screenTimeHref}>
            <Clock aria-hidden="true" />
          </Link>
        </Button>
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label={t("children.edit", { name: child.firstName })}
        >
          <Link href={editHref}>
            <Pencil aria-hidden="true" />
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("children.delete", { name: child.firstName })}
          onClick={onDeleteRequest}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
