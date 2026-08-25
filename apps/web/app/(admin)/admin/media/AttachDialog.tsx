"use client";

import type {
  AdminBadge,
  AdminLesson,
  AdminWorld,
  Locale,
  MediaAsset,
} from "@kidlearn/types";
import { isContentEditable, LOCALES } from "@kidlearn/types";
import { Button, Label, Select } from "@kidlearn/ui";
import { useEffect, useState } from "react";
import {
  fetchBadges,
  fetchLessons,
  fetchWorlds,
  updateBadge,
  updateContent,
} from "@/lib/admin-api";

/**
 * Points an owning row's foreign key at one asset (FR-CMS-02, requirement 3).
 *
 * **Three targets, because three columns take a `MediaAsset.id`** and each is a
 * different shape of write: a world's `mascotAssetId` is a scalar, a badge's
 * `iconAssetId` is a scalar on a different resource, and a lesson's video is
 * per-locale and lives inside a `translations` object the server requires
 * *complete*. The last one is why this dialog holds the whole lesson rather than
 * an id: setting `en.videoAssetId` means resending `bn` untouched, and a partial
 * translation write is what produces content that falls back to English part-way
 * through a Bangla learner's session (FR-I18N-01).
 *
 * **Published rows are not offered.** The server refuses an edit to one, so a row
 * that would earn a `409` is filtered out of the list with the reason stated,
 * rather than left there to fail on click. `isContentEditable` is the same
 * predicate the server applies.
 *
 * The asset's `kind` decides which targets make sense: a mascot and a badge icon
 * are images, a lesson video is a video. Offering an audio clip as a mascot would
 * be a `400` an author could not have predicted.
 */

type Target = "world-mascot" | "lesson-video" | "badge-icon";

const TARGET_LABELS: Record<Target, string> = {
  "world-mascot": "World mascot",
  "lesson-video": "Lesson video",
  "badge-icon": "Badge icon",
};

/** Which targets an asset of each kind can legally fill. */
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attach-target">Attach as</Label>
        <Select
          id="attach-target"
          value={target ?? ""}
          disabled={isBusy}
          onChange={(event) => {
            setTarget(event.target.value as Target);
            setRowId("");
          }}
        >
          {available.map((one) => (
            <option key={one} value={one}>
              {TARGET_LABELS[one]}
            </option>
          ))}
        </Select>
      </div>

      {target === "lesson-video" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attach-locale">Locale</Label>
          <Select
            id="attach-locale"
            value={locale}
            disabled={isBusy}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            {LOCALES.map((one) => (
              <option key={one} value={one}>
                {LANGUAGE_LABELS[one]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attach-row">Row</Label>
        <Select
          id="attach-row"
          value={rowId}
          disabled={isBusy}
          aria-describedby="attach-row-hint"
          onChange={(event) => setRowId(event.target.value)}
        >
          <option value="">Choose…</option>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </Select>
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

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={isBusy || rowId === ""}
          onClick={() => void handleAttach()}
        >
          Attach
        </Button>
      </div>
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

/**
 * The actual write, per target.
 *
 * The lesson case resends **both** locales because the server requires the pair
 * whenever `translations` is present — see this file's header for why that rule
 * exists rather than being an inconvenience.
 */
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
