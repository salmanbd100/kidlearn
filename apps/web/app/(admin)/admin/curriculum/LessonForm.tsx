"use client";

import type {
  AdminLesson,
  AdminWorld,
  GradeLevelValue,
  Locale,
} from "@kidlearn/types";
import { LOCALES } from "@kidlearn/types";
import { Button, Input, Label, Select, Textarea } from "@kidlearn/ui";
import { type FormEvent, useState } from "react";
import type { ContentDraft } from "@/lib/admin-api";
import { GradeLevelPicker } from "./GradeLevelPicker";
import { LOCALE_LABELS, LocaleTabs } from "./LocaleTabs";

/**
 * The lesson editor (FR-CMS-01) — title and intro script per locale, a world, one
 * or more grade levels, and the ordered step config.
 *
 * **The step selects are ids typed by hand, and say so.** Activities, quizzes and
 * the media library arrive with file 33; until they do there is nothing to
 * populate a picker from, and a picker with no options is worse than a field
 * that admits what it wants. Each is optional, because a lesson has to be
 * draftable before its parts exist — the server agrees, and nullable columns are
 * what make that true rather than a client-side kindness.
 *
 * `videoAssetId` is per locale: a video with a word burnt into it belongs to the
 * language it was produced in (`LessonTranslation.videoAssetId`, file 17).
 *
 * No status field and no sortOrder field, for the reasons `ContentForm` gives —
 * as is the per-locale validation, which cannot be `required` while the inactive
 * panel is `hidden`.
 */

type LocaleFields = {
  title: string;
  introScript: string;
  videoAssetId: string;
};

const EMPTY_LOCALE: LocaleFields = {
  title: "",
  introScript: "",
  videoAssetId: "",
};

/** What a child must be able to read or hear before a lesson can be saved. */
const REQUIRED_LOCALE_FIELDS = [
  { key: "title", label: "title" },
  { key: "introScript", label: "intro script" },
] as const satisfies ReadonlyArray<{ key: keyof LocaleFields; label: string }>;

export interface LessonFormProps {
  existing?: AdminLesson;
  /** Required when creating — the topic the lesson belongs to. */
  topicId?: string;
  worlds: AdminWorld[];
  isBusy: boolean;
  error?: string;
  onSubmit: (draft: ContentDraft) => void;
  onCancel: () => void;
}

export function LessonForm({
  existing,
  topicId,
  worlds,
  isBusy,
  error,
  onSubmit,
  onCancel,
}: LessonFormProps) {
  const isEditing = existing !== undefined;

  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [worldId, setWorldId] = useState(
    existing?.worldId ?? worlds[0]?.id ?? "",
  );
  const [gradeLevels, setGradeLevels] = useState<GradeLevelValue[]>(
    existing?.gradeLevels ?? [],
  );
  const [concepts, setConcepts] = useState(
    (existing?.conceptsIntroduced ?? []).join(", "),
  );
  const [activityId, setActivityId] = useState(existing?.activityId ?? "");
  const [quizId, setQuizId] = useState(existing?.quizId ?? "");
  const [locales, setLocales] = useState<Record<Locale, LocaleFields>>({
    en: toLocaleFields(existing, "en"),
    bn: toLocaleFields(existing, "bn"),
  });
  const [activeLocale, setActiveLocale] = useState<Locale>("en");
  const [fieldError, setFieldError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const gap = findMissingLocaleField(locales);
    if (gap !== undefined) {
      setActiveLocale(gap.locale);
      setFieldError(
        `Add the ${LOCALE_LABELS[gap.locale]} ${gap.label} before saving.`,
      );
      return;
    }

    setFieldError(undefined);

    const draft: ContentDraft = {
      title,
      worldId,
      gradeLevels,
      // Trimmed and emptied out, so a trailing comma does not become a token no
      // weekly report will ever match (file 30).
      conceptsIntroduced: concepts
        .split(",")
        .map((one) => one.trim())
        .filter(Boolean),
      // `null` clears the link on the server; `""` would be an invalid uuid.
      activityId: activityId.trim() === "" ? null : activityId.trim(),
      quizId: quizId.trim() === "" ? null : quizId.trim(),
      translations: {
        en: toPayload(locales.en),
        bn: toPayload(locales.bn),
      },
      ...(isEditing ? {} : { slug, topicId }),
    };

    onSubmit(draft);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lesson-slug">Slug</Label>
          <Input
            id="lesson-slug"
            value={slug}
            required={!isEditing}
            disabled={isEditing || isBusy}
            placeholder="letter-a"
            onChange={(event) => setSlug(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lesson-title">Internal title</Label>
          <Input
            id="lesson-title"
            value={title}
            required
            disabled={isBusy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lesson-world">World</Label>
        <Select
          id="lesson-world"
          value={worldId}
          required
          disabled={isBusy || worlds.length === 0}
          aria-describedby="lesson-world-hint"
          onChange={(event) => setWorldId(event.target.value)}
        >
          {worlds.length === 0 ? <option value="">No worlds yet</option> : null}
          {worlds.map((world) => (
            <option key={world.id} value={world.id}>
              {world.name}
            </option>
          ))}
        </Select>
        <p id="lesson-world-hint" className="text-muted-foreground text-xs">
          A lesson in an unpublished world stays invisible to children even once
          published — the world carries its own status.
        </p>
      </div>

      <GradeLevelPicker
        value={gradeLevels}
        onChange={setGradeLevels}
        isBusy={isBusy}
      />

      <LocaleTabs
        active={activeLocale}
        onActiveChange={setActiveLocale}
        render={(locale) => (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`lesson-title-${locale}`}>
                Title a child sees ({LOCALE_LABELS[locale]})
              </Label>
              <Input
                id={`lesson-title-${locale}`}
                value={locales[locale].title}
                disabled={isBusy}
                aria-invalid={
                  fieldError !== undefined &&
                  locales[locale].title.trim() === ""
                }
                onChange={(event) =>
                  setLocales(setField(locale, "title", event.target.value))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`lesson-script-${locale}`}>
                Intro script ({LOCALE_LABELS[locale]})
              </Label>
              <Textarea
                id={`lesson-script-${locale}`}
                value={locales[locale].introScript}
                rows={3}
                disabled={isBusy}
                aria-describedby={`lesson-script-hint-${locale}`}
                aria-invalid={
                  fieldError !== undefined &&
                  locales[locale].introScript.trim() === ""
                }
                onChange={(event) =>
                  setLocales(
                    setField(locale, "introScript", event.target.value),
                  )
                }
              />
              <p
                id={`lesson-script-hint-${locale}`}
                className="text-muted-foreground text-xs"
              >
                What the mascot says before the video.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`lesson-video-${locale}`}>
                Video asset id ({LOCALE_LABELS[locale]})
              </Label>
              <Input
                id={`lesson-video-${locale}`}
                value={locales[locale].videoAssetId}
                disabled={isBusy}
                placeholder="Leave empty until the media library lands"
                onChange={(event) =>
                  setLocales(
                    setField(locale, "videoAssetId", event.target.value),
                  )
                }
              />
            </div>
          </div>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lesson-activity">Activity id</Label>
          <Input
            id="lesson-activity"
            value={activityId}
            disabled={isBusy}
            placeholder="Optional"
            onChange={(event) => setActivityId(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lesson-quiz">Quiz id</Label>
          <Input
            id="lesson-quiz"
            value={quizId}
            disabled={isBusy}
            placeholder="Optional"
            onChange={(event) => setQuizId(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lesson-concepts">Concepts introduced</Label>
        <Input
          id="lesson-concepts"
          value={concepts}
          disabled={isBusy}
          placeholder="letter:A, word:apple, number:7"
          aria-describedby="lesson-concepts-hint"
          onChange={(event) => setConcepts(event.target.value)}
        />
        <p id="lesson-concepts-hint" className="text-muted-foreground text-xs">
          Comma separated, each prefixed <code>letter:</code>,{" "}
          <code>word:</code> or <code>number:</code>. These are what a weekly
          report counts as new this week.
        </p>
      </div>

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
          disabled={isBusy || gradeLevels.length === 0 || worldId === ""}
        >
          {isEditing ? "Save" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}

/** The first locale missing a field a child needs, in tab order. */
function findMissingLocaleField(
  locales: Record<Locale, LocaleFields>,
): { locale: Locale; label: string } | undefined {
  for (const locale of LOCALES) {
    for (const field of REQUIRED_LOCALE_FIELDS) {
      if (locales[locale][field.key].trim() === "") {
        return { locale, label: field.label };
      }
    }
  }
  return undefined;
}

function toLocaleFields(
  lesson: AdminLesson | undefined,
  locale: Locale,
): LocaleFields {
  const translation = lesson?.translations[locale];
  if (!translation) return EMPTY_LOCALE;
  return {
    title: translation.title,
    introScript: translation.introScript,
    videoAssetId: translation.videoAssetId ?? "",
  };
}

function toPayload(fields: LocaleFields) {
  return {
    title: fields.title,
    introScript: fields.introScript,
    videoAssetId:
      fields.videoAssetId.trim() === "" ? null : fields.videoAssetId.trim(),
  };
}

/** Curried so each `onChange` stays a one-liner rather than a nested spread. */
function setField(locale: Locale, field: keyof LocaleFields, value: string) {
  return (current: Record<Locale, LocaleFields>) => ({
    ...current,
    [locale]: { ...current[locale], [field]: value },
  });
}
