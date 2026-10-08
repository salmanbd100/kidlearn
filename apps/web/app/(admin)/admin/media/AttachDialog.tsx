"use client";

import type {
  AdminBadge,
  AdminLesson,
  AdminWorld,
  Locale,
  MediaAsset,
} from "@kidlearn/types";
import { isContentEditable, LOCALES } from "@kidlearn/types";
import {
  Button,
  DialogFooter,
  Label,
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
} from "@kidlearn/ui";
import { useEffect, useState } from "react";
import {
  fetchLessons,
  fetchWorlds,
  updateContent,
} from "@/features/admin/content-api";
import { fetchBadges, updateBadge } from "@/features/admin/editors-api";
import { optionValue } from "@/features/admin/select-option";

type Target = "world-mascot" | "lesson-video" | "badge-icon";

const TARGET_LABELS: Record<Target, string> = {
  "world-mascot": "World mascot",
  "lesson-video": "Lesson video",
  "badge-icon": "Badge icon",
};

const TARGETS_BY_KIND: Record<MediaAsset["kind"], Target[]> = {
  image: ["world-mascot", "badge-icon"],
  video: ["lesson-video"],
  audio: [],
};

const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  bn: "Bangla",
};

export function AttachDialog({
  asset,
  onAttached,
}: {
  asset: MediaAsset;
  onAttached: (message: string) => void;
}) {
  const available = TARGETS_BY_KIND[asset.kind];
  const [target, setTarget] = useState<Target | undefined>(available[0]);
  const [rowId, setRowId] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [worlds, setWorlds] = useState<AdminWorld[]>([]);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [badges, setBadges] = useState<AdminBadge[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([fetchWorlds(), fetchLessons(), fetchBadges()]).then(
      ([worldResult, lessonResult, badgeResult]) => {
        if (!isCurrent) return;
        if (worldResult.ok) setWorlds(worldResult.data);
        if (lessonResult.ok) setLessons(lessonResult.data);
        if (badgeResult.ok) setBadges(badgeResult.data);
      },
    );

    return () => {
      isCurrent = false;
    };
  }, []);

  if (available.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Audio is attached from inside a quiz or activity editor, where it
        belongs to one prompt in one locale — there is no single column on a
        lesson or a world to point at it.
      </p>
    );
  }

  const rows = editableRows({ target, worlds, lessons, badges });

  async function handleAttach() {
    if (target === undefined || rowId === "") return;
    setIsBusy(true);
    setError(undefined);

    const result = await attach({ target, rowId, locale, asset, lessons });
    setIsBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onAttached(`Attached to ${TARGET_LABELS[target].toLowerCase()}.`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attach-target">Attach as</Label>
        <SelectMenu
          value={target ?? ""}
          disabled={isBusy}
          onValueChange={(value) => {
            setTarget(optionValue(available, value, undefined));
            setRowId("");
          }}
        >
          <SelectMenuTrigger id="attach-target" size="sm" />
          <SelectMenuContent>
            {available.map((one) => (
              <SelectMenuItem key={one} value={one}>
                {TARGET_LABELS[one]}
              </SelectMenuItem>
            ))}
          </SelectMenuContent>
        </SelectMenu>
      </div>

      {target === "lesson-video" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attach-locale">Locale</Label>
          <SelectMenu
            value={locale}
            disabled={isBusy}
            onValueChange={(value) =>
              setLocale(optionValue(LOCALES, value, locale))
            }
          >
            <SelectMenuTrigger id="attach-locale" size="sm" />
            <SelectMenuContent>
              {LOCALES.map((one) => (
                <SelectMenuItem key={one} value={one}>
                  {LANGUAGE_LABELS[one]}
                </SelectMenuItem>
              ))}
            </SelectMenuContent>
          </SelectMenu>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attach-row">Row</Label>
        <SelectMenu value={rowId} disabled={isBusy} onValueChange={setRowId}>
          <SelectMenuTrigger
            id="attach-row"
            size="sm"
            placeholder="Choose…"
            aria-describedby="attach-row-hint"
          />
          <SelectMenuContent>
            {rows.map((row) => (
              <SelectMenuItem key={row.id} value={row.id}>
                {row.label}
              </SelectMenuItem>
            ))}
          </SelectMenuContent>
        </SelectMenu>
        <p id="attach-row-hint" className="text-muted-foreground text-xs">
          Published rows are not listed — withdraw one to draft before changing
          what it plays.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <DialogFooter className="border-border border-t pt-4">
        <Button
          type="button"
          disabled={isBusy || rowId === ""}
          onClick={() => void handleAttach()}
        >
          Attach
        </Button>
      </DialogFooter>
    </div>
  );
}

function editableRows(input: {
  target: Target | undefined;
  worlds: AdminWorld[];
  lessons: AdminLesson[];
  badges: AdminBadge[];
}): Array<{ id: string; label: string }> {
  const editable = <TRow extends { status: AdminWorld["status"] }>(
    rows: TRow[],
  ) => rows.filter((row) => isContentEditable(row.status));

  if (input.target === "world-mascot") {
    return editable(input.worlds).map((row) => ({
      id: row.id,
      label: row.name,
    }));
  }
  if (input.target === "lesson-video") {
    return editable(input.lessons).map((row) => ({
      id: row.id,
      label: row.title,
    }));
  }
  if (input.target === "badge-icon") {
    return editable(input.badges).map((row) => ({
      id: row.id,
      label: row.name,
    }));
  }
  return [];
}

function attach(input: {
  target: Target;
  rowId: string;
  locale: Locale;
  asset: MediaAsset;
  lessons: AdminLesson[];
}) {
  if (input.target === "world-mascot") {
    return updateContent("worlds", input.rowId, {
      mascotAssetId: input.asset.id,
    });
  }

  if (input.target === "badge-icon") {
    return updateBadge(input.rowId, { iconAssetId: input.asset.id });
  }

  const lesson = input.lessons.find((one) => one.id === input.rowId);
  if (lesson === undefined) {
    return Promise.resolve({
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "That lesson has moved." },
    });
  }

  return updateContent("lessons", input.rowId, {
    translations: {
      en: {
        ...lesson.translations.en,
        ...(input.locale === "en" ? { videoAssetId: input.asset.id } : {}),
      },
      bn: {
        ...lesson.translations.bn,
        ...(input.locale === "bn" ? { videoAssetId: input.asset.id } : {}),
      },
    },
  });
}
