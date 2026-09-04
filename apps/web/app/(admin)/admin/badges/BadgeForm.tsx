"use client";

import type { AdminBadge, BadgeRuleType } from "@kidlearn/types";
import { BADGE_RULE_PARAMETERS, BADGE_RULE_TYPES } from "@kidlearn/types";
import { Button, Input, Label, Select, Textarea } from "@kidlearn/ui";
import { type FormEvent, useState } from "react";
import { MediaPicker } from "@/components/admin/MediaPicker";
import type { ContentDraft } from "@/lib/admin-api";
import { optionValue } from "@/lib/select-option";

// The guided badge form (FR-GAM-04).

const RULE_LABELS: Record<BadgeRuleType, string> = {
  lessons_completed_in_topic: "Finish lessons in a topic",
  stories_completed: "Finish stories",
  streak_days: "Keep a learning streak",
  quiz_correct_in_topic: "Answer quiz questions correctly in a topic",
};

const PARAMETER_LABELS = {
  topicSlug: "Topic slug",
  count: "How many",
  days: "How many days",
} as const;

/** The whole rule payload the form can build, before the type narrows it. */
type RuleDraft = {
  topicSlug: string;
  /** `"all"` is a literal the lessons rule accepts; everything else is a number. */
  count: string;
  days: string;
};

export interface BadgeFormProps {
  existing?: AdminBadge;
  isBusy: boolean;
  error?: string;
  onSubmit: (draft: ContentDraft) => void;
  onCancel: () => void;
}

export function BadgeForm({
  existing,
  isBusy,
  error,
  onSubmit,
  onCancel,
}: BadgeFormProps) {
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  // Seeded from the url the API resolves, not from the id: `MediaPicker`
  // identifies an asset by url, so an unseeded field would report a badge that
  // has an icon as "Not set".
  const [iconUrl, setIconUrl] = useState(existing?.iconUrl ?? "");
  const [iconAssetId, setIconAssetId] = useState(existing?.iconAssetId ?? "");
  const [ruleType, setRuleType] = useState<BadgeRuleType>(
    existing?.ruleType ?? "lessons_completed_in_topic",
  );
  const [rule, setRule] = useState<RuleDraft>(() => ruleDraftFrom(existing));

  const isEditing = existing !== undefined;
  const parameters = BADGE_RULE_PARAMETERS[ruleType];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    onSubmit({
      name,
      ...(isEditing ? {} : { slug }),
      description: description.trim() === "" ? null : description,
      iconAssetId: iconAssetId === "" ? null : iconAssetId,
      ruleType,
      rule: compileRule(ruleType, rule),
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="badge-slug">Slug</Label>
        <Input
          id="badge-slug"
          value={slug}
          required={!isEditing}
          disabled={isEditing || isBusy}
          placeholder="alphabet-champion"
          aria-describedby="badge-slug-hint"
          onChange={(event) => setSlug(event.target.value)}
        />
        <p id="badge-slug-hint" className="text-muted-foreground text-xs">
          {isEditing
            ? "Fixed once created — the reward ledger refers to a badge by it."
            : "Lowercase words separated by hyphens."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="badge-name">Name</Label>
        <Input
          id="badge-name"
          value={name}
          required
          disabled={isBusy}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="badge-description">Description</Label>
        <Textarea
          id="badge-description"
          value={description}
          rows={2}
          disabled={isBusy}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <MediaPicker
        id="badge-icon"
        label="Icon"
        kind="image"
        value={iconUrl}
        isDisabled={isBusy}
        onChange={(asset) => {
          setIconUrl(asset?.url ?? "");
          setIconAssetId(asset?.id ?? "");
        }}
      />

      <fieldset className="flex flex-col gap-3 rounded-[var(--radius)] border border-border p-3">
        <legend className="px-1 font-semibold text-foreground text-sm">
          Rule
        </legend>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="badge-rule-type">When is it earned?</Label>
          <Select
            id="badge-rule-type"
            value={ruleType}
            disabled={isBusy}
            onChange={(event) =>
              setRuleType(
                optionValue(BADGE_RULE_TYPES, event.target.value, ruleType),
              )
            }
          >
            {BADGE_RULE_TYPES.map((type) => (
              <option key={type} value={type}>
                {RULE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>

        {parameters.map((parameter) => (
          <div key={parameter} className="flex flex-col gap-1.5">
            <Label htmlFor={`badge-rule-${parameter}`}>
              {PARAMETER_LABELS[parameter]}
            </Label>
            <Input
              id={`badge-rule-${parameter}`}
              value={rule[parameter]}
              required
              disabled={isBusy}
              inputMode={parameter === "topicSlug" ? "text" : "numeric"}
              aria-describedby={
                parameter === "count" &&
                ruleType === "lessons_completed_in_topic"
                  ? "badge-rule-count-hint"
                  : undefined
              }
              onChange={(event) =>
                setRule((current) => ({
                  ...current,
                  [parameter]: event.target.value,
                }))
              }
            />
            {parameter === "count" &&
            ruleType === "lessons_completed_in_topic" ? (
              <p
                id="badge-rule-count-hint"
                className="text-muted-foreground text-xs"
              >
                A number, or <code>all</code> for every published lesson in the
                topic.
              </p>
            ) : null}
          </div>
        ))}
      </fieldset>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isBusy}>
          {isEditing ? "Save" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}

/** The stored rule back into form state. */
function ruleDraftFrom(existing: AdminBadge | undefined): RuleDraft {
  const blank: RuleDraft = { topicSlug: "", count: "", days: "" };
  if (existing === undefined) return blank;

  const rule = existing.rule;
  return {
    topicSlug: "topicSlug" in rule ? rule.topicSlug : "",
    count: "count" in rule ? String(rule.count) : "",
    days: "days" in rule ? String(rule.days) : "",
  };
}

/**
 * The form state as the payload the engine consumes — only the parameters the
 * chosen type allows, because the server's schemas are `.strict()` and a stray key
 * is a `400` rather than a silently dropped one.
 */
function compileRule(ruleType: BadgeRuleType, rule: RuleDraft): unknown {
  const count = rule.count.trim() === "all" ? "all" : toNumber(rule.count);

  if (ruleType === "streak_days") return { days: toNumber(rule.days) };
  if (ruleType === "stories_completed") return { count };
  return { topicSlug: rule.topicSlug, count };
}

function toNumber(value: string): number | string {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : value;
}
