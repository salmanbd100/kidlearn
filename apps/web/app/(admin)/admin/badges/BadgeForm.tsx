"use client";

import type { AdminBadge, BadgeRuleType } from "@kidlearn/types";
import { BADGE_RULE_PARAMETERS, BADGE_RULE_TYPES } from "@kidlearn/types";
import {
  Button,
  DialogFooter,
  Input,
  Label,
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  Textarea,
} from "@kidlearn/ui";
import { type FormEvent, useState } from "react";
import type { ContentDraft } from "@/features/admin/content-api";
import { MediaPicker } from "@/features/admin/MediaPicker";
import { optionValue } from "@/features/admin/select-option";

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

type RuleDraft = {
  topicSlug: string;
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
  // Seeded from the API's resolved url: `MediaPicker` identifies assets by url, so an unseeded field reads "Not set".
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
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="badge-slug">Slug</Label>
        <Input
          size="sm"
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
          size="sm"
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
          size="sm"
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

      <fieldset className="flex flex-col gap-3 rounded-(--radius) border border-border p-3">
        <legend className="px-1 font-medium text-foreground text-sm">
          Rule
        </legend>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="badge-rule-type">When is it earned?</Label>
          <SelectMenu
            value={ruleType}
            disabled={isBusy}
            onValueChange={(value) =>
              setRuleType(optionValue(BADGE_RULE_TYPES, value, ruleType))
            }
          >
            <SelectMenuTrigger id="badge-rule-type" size="sm" />
            <SelectMenuContent>
              {BADGE_RULE_TYPES.map((type) => (
                <SelectMenuItem key={type} value={type}>
                  {RULE_LABELS[type]}
                </SelectMenuItem>
              ))}
            </SelectMenuContent>
          </SelectMenu>
        </div>

        {parameters.map((parameter) => (
          <div key={parameter} className="flex flex-col gap-1.5">
            <Label htmlFor={`badge-rule-${parameter}`}>
              {PARAMETER_LABELS[parameter]}
            </Label>
            <Input
              size="sm"
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

      <DialogFooter className="border-border border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isBusy}>
          {isEditing ? "Save" : "Create draft"}
        </Button>
      </DialogFooter>
    </form>
  );
}

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

/** Only the parameters the chosen type allows: the server's schemas are `.strict()`, so a stray key is a 400. */
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
