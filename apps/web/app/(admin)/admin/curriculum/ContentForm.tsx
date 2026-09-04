"use client";

import type {
  AdminSubject,
  AdminTopic,
  AdminWorld,
  GradeLevelValue,
  Locale,
} from "@kidlearn/types";
import { LOCALES } from "@kidlearn/types";
import { Button, Input, Label } from "@kidlearn/ui";
import { type FormEvent, useState } from "react";
import type { ContentDraft } from "@/lib/admin-api";
import { LOCALE_LABELS } from "@/lib/admin-labels";
import { GradeLevelPicker } from "./GradeLevelPicker";
import { LocaleTabs } from "./LocaleTabs";

/**
 * Create and edit for the three name-only resources — world, subject, topic
 * (FR-CMS-01). The lesson has its own form; it carries per-locale scripts and
 * step ids that nothing else does.
 */

export type NameOnlyResource = "worlds" | "subjects" | "topics";

type Existing = AdminWorld | AdminSubject | AdminTopic;

export interface ContentFormProps {
  resource: NameOnlyResource;
  /** Absent when creating. */
  existing?: Existing;
  /** Required when creating a topic — the subject it belongs to. */
  subjectId?: string;
  isBusy: boolean;
  error?: string;
  onSubmit: (draft: ContentDraft) => void;
  onCancel: () => void;
}

/** Worlds are a theming surface shared by every grade, so they carry no tags. */
const HAS_GRADES: Record<NameOnlyResource, boolean> = {
  worlds: false,
  subjects: true,
  topics: true,
};

/** Only a subject or topic carries grades, and only those two have the field. */
function initialGradeLevels(existing: Existing | undefined): GradeLevelValue[] {
  if (existing === undefined || !("gradeLevels" in existing)) return [];
  return existing.gradeLevels;
}

export function ContentForm({
  resource,
  existing,
  subjectId,
  isBusy,
  error,
  onSubmit,
  onCancel,
}: ContentFormProps) {
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [translations, setTranslations] = useState({
    en: existing?.translations.en ?? "",
    bn: existing?.translations.bn ?? "",
  });
  const [gradeLevels, setGradeLevels] = useState<GradeLevelValue[]>(() =>
    initialGradeLevels(existing),
  );
  const [activeLocale, setActiveLocale] = useState<Locale>("en");
  const [fieldError, setFieldError] = useState<string>();

  const isEditing = existing !== undefined;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const missing = LOCALES.find(
      (locale) => translations[locale].trim() === "",
    );
    if (missing !== undefined) {
      setActiveLocale(missing);
      setFieldError(
        `Add the ${LOCALE_LABELS[missing]} name a child sees before saving.`,
      );
      return;
    }

    setFieldError(undefined);

    const draft: ContentDraft = {
      name,
      translations,
      ...(isEditing ? {} : { slug }),
      ...(HAS_GRADES[resource] ? { gradeLevels } : {}),
      ...(resource === "topics" && !isEditing ? { subjectId } : {}),
      // A world needs a palette and the media library (file 33) is what will
      // fill in a mascot, so a create sends the empty map the column requires.
      ...(resource === "worlds" && !isEditing ? { palette: {} } : {}),
    };

    onSubmit(draft);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="content-slug">Slug</Label>
        <Input
          id="content-slug"
          value={slug}
          disabled={isEditing || isBusy}
          required={!isEditing}
          placeholder="letters-and-sounds"
          aria-describedby="content-slug-hint"
          onChange={(event) => setSlug(event.target.value)}
        />
        <p id="content-slug-hint" className="text-muted-foreground text-xs">
          {isEditing
            ? "Fixed once created — it is part of the URL of anything published."
            : "Lowercase words separated by hyphens."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="content-name">Internal name</Label>
        <Input
          id="content-name"
          value={name}
          required
          disabled={isBusy}
          aria-describedby="content-name-hint"
          onChange={(event) => setName(event.target.value)}
        />
        <p id="content-name-hint" className="text-muted-foreground text-xs">
          What this list and the audit trail show. Children see the translations
          below.
        </p>
      </div>

      <LocaleTabs
        active={activeLocale}
        onActiveChange={setActiveLocale}
        render={(locale) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`content-name-${locale}`}>
              Name a child sees ({LOCALE_LABELS[locale]})
            </Label>
            <Input
              id={`content-name-${locale}`}
              value={translations[locale]}
              disabled={isBusy}
              aria-invalid={
                fieldError !== undefined && translations[locale].trim() === ""
              }
              onChange={(event) =>
                setTranslations((current) => ({
                  ...current,
                  [locale]: event.target.value,
                }))
              }
            />
          </div>
        )}
      />

      {HAS_GRADES[resource] ? (
        <GradeLevelPicker
          value={gradeLevels}
          onChange={setGradeLevels}
          isBusy={isBusy}
        />
      ) : null}

      {(fieldError ?? error) ? (
        <p role="alert" className="text-destructive text-sm">
          {fieldError ?? error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            isBusy || (HAS_GRADES[resource] && gradeLevels.length === 0)
          }
        >
          {isEditing ? "Save" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
