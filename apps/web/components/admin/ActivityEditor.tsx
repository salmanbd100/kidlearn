"use client";

import type { ActivityType, Locale } from "@kidlearn/types";
import { ACTIVITY_SCHEMAS, ACTIVITY_TYPES, LOCALES } from "@kidlearn/types";
import { Button, Input, Label, Select } from "@kidlearn/ui";
import { useMemo, useState } from "react";
import { ActivityEngine } from "@/components/activities/ActivityEngine";
import { LOCALE_LABELS } from "@/lib/admin-labels";
import { optionValue } from "@/lib/select-option";
import {
  type ActivityDraft,
  compileActivity,
  emptyItem,
  type ItemDraft,
  knownActivityPaths,
  MAXIMUM_ITEMS,
  MINIMUM_ITEMS,
} from "./activity-draft";
import { MediaPicker } from "./MediaPicker";
import { type IssueMap, toIssueMap } from "./payload-issues";

/**
 * The guided activity form (FR-ACT-06, FR-CMS-03's sibling).
 *
 * Everything `QuizQuestionEditor` says applies here unchanged: the shared schema
 * for the chosen type validates on every keystroke, each issue lands under the
 * input that produced it, Save is disabled until the payload parses, and the
 * preview is the **real** `ActivityEngine` — the component a child plays — under
 * `data-theme="kid"`.
 *
 * The one thing worth stating separately is the drop-zone image. `drag_drop`
 * requires one on every target and not on the draggable items, because a
 * pre-reader cannot rely on a label to know where a thing goes. The form marks it
 * required rather than letting the schema be the first to mention it.
 */

const TYPE_LABELS: Record<ActivityType, string> = {
  drag_drop: "Drag and drop",
  trace: "Trace a glyph",
  match: "Match the pairs",
  puzzle: "Picture puzzle",
};

const GRID_SIZES = [2, 3, 4] as const;

export interface ActivityEditorProps {
  initial: ActivityDraft;
  isBusy: boolean;
  error?: string;
  onSubmit: (payload: { type: ActivityType; definition: unknown }) => void;
  onCancel: () => void;
}

export function ActivityEditor({
  initial,
  isBusy,
  error,
  onSubmit,
  onCancel,
}: ActivityEditorProps) {
  const [draft, setDraft] = useState<ActivityDraft>(initial);
  const [previewLocale, setPreviewLocale] = useState<Locale>("en");

  const definition = useMemo(() => compileActivity(draft), [draft]);
  // The member schema the chosen type names, never the union — see
  // `QuizQuestionEditor` and `ACTIVITY_SCHEMAS` for why a union's single
  // root-level issue leaves every message with nowhere to land.
  const parsed = useMemo(
    () => ACTIVITY_SCHEMAS[draft.type].safeParse(definition),
    [definition, draft.type],
  );
  const issues = useMemo(
    () =>
      parsed.success
        ? toIssueMap([])
        : toIssueMap(parsed.error.issues, knownActivityPaths(draft)),
    [parsed, draft],
  );

  function update(change: Partial<ActivityDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  const isSetBased = draft.type === "drag_drop" || draft.type === "match";

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <form
        className="flex min-w-0 flex-1 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!parsed.success) return;
          onSubmit({ type: draft.type, definition: parsed.data });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="activity-type">Activity type</Label>
          <Select
            id="activity-type"
            value={draft.type}
            disabled={isBusy}
            onChange={(event) =>
              update({
                type: optionValue(
                  ACTIVITY_TYPES,
                  event.target.value,
                  draft.type,
                ),
              })
            }
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>

        <Fieldset
          legend="Instruction audio"
          hint="Required in both locales — it is how the child is told what to do."
          error={issues.under(["instructionAudio"])}
        >
          {LOCALES.map((locale) => (
            <MediaPicker
              key={locale}
              id={`instruction-audio-${locale}`}
              label={`Instruction (${LOCALE_LABELS[locale]})`}
              kind="audio"
              language={locale}
              value={draft.instructionAudio[locale]}
              isDisabled={isBusy}
              onChange={(asset) =>
                update({
                  instructionAudio: {
                    ...draft.instructionAudio,
                    [locale]: asset?.url ?? "",
                  },
                })
              }
            />
          ))}
        </Fieldset>

        {draft.type === "trace" ? (
          <Fieldset legend="Glyph">
            <Field
              id="activity-glyph"
              label="Character being traced"
              value={draft.glyph}
              error={issues.at(["glyph"])}
              isDisabled={isBusy}
              onChange={(glyph) => update({ glyph })}
            />
            <Field
              id="activity-path"
              label="SVG path data"
              value={draft.pathData}
              error={issues.at(["pathData"])}
              isDisabled={isBusy}
              hint="The path the finger follows, in a 0–100 coordinate space."
              onChange={(pathData) => update({ pathData })}
            />
            <GuideDots
              dots={draft.guideDots}
              error={issues.under(["guideDots"])}
              isBusy={isBusy}
              onChange={(guideDots) => update({ guideDots })}
            />
            <Field
              id="activity-stroke-order"
              label="Stroke order"
              value={draft.strokeOrder}
              error={issues.under(["strokeOrder"])}
              isDisabled={isBusy}
              hint="Subpath indexes, comma separated. Leave empty for a single-stroke glyph."
              onChange={(strokeOrder) => update({ strokeOrder })}
            />
            <Field
              id="activity-tolerance"
              label="Tolerance"
              value={draft.tolerance}
              error={issues.at(["tolerance"])}
              isDisabled={isBusy}
              hint="How far a finger may stray, in the 0–100 glyph space. Empty leaves the renderer's default."
              onChange={(tolerance) => update({ tolerance })}
            />
          </Fieldset>
        ) : null}

        {draft.type === "puzzle" ? (
          <Fieldset legend="Picture and grid">
            <MediaPicker
              id="activity-puzzle-image"
              label="Picture (required)"
              kind="image"
              value={draft.imageUrl}
              isDisabled={isBusy}
              error={issues.under(["image", "url"])}
              onChange={(asset) => update({ imageUrl: asset?.url ?? "" })}
            />

            {draft.imageUrl !== ""
              ? LOCALES.map((locale) => (
                  <Field
                    key={locale}
                    id={`activity-puzzle-alt-${locale}`}
                    label={`Picture description (${LOCALE_LABELS[locale]})`}
                    value={draft.imageAlt[locale]}
                    error={issues.at(["image", "alt", locale])}
                    isDisabled={isBusy}
                    onChange={(value) =>
                      update({
                        imageAlt: { ...draft.imageAlt, [locale]: value },
                      })
                    }
                  />
                ))
              : null}

            <div className="flex gap-3">
              {(["rows", "cols"] as const).map((axis) => (
                <div key={axis} className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={`activity-${axis}`}>
                    {axis === "rows" ? "Rows" : "Columns"}
                  </Label>
                  <Select
                    id={`activity-${axis}`}
                    value={String(draft[axis])}
                    disabled={isBusy}
                    onChange={(event) =>
                      update({ [axis]: Number(event.target.value) })
                    }
                  >
                    {GRID_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            <p className="text-muted-foreground text-xs">
              {draft.rows * draft.cols} pieces. The slots are generated from the
              grid — there is nothing to author about which cell is which.
            </p>

            <Field
              id="activity-pre-placed"
              label="Pre-placed pieces"
              value={draft.prePlaced}
              error={issues.under(["prePlaced"])}
              isDisabled={isBusy}
              hint="Slot indexes that start already filled, comma separated — how a 3×3 is made gentle enough for Nursery. At least one must be left for the child."
              onChange={(prePlaced) => update({ prePlaced })}
            />
          </Fieldset>
        ) : null}

        {isSetBased ? (
          <>
            <ItemList
              field={draft.type === "match" ? "leftSet" : "items"}
              legend={draft.type === "match" ? "Left set" : "Draggable items"}
              items={draft.items}
              isImageRequired={false}
              issues={issues}
              isBusy={isBusy}
              onChange={(items) => update({ items })}
            />
            <ItemList
              field={draft.type === "match" ? "rightSet" : "targets"}
              legend={draft.type === "match" ? "Right set" : "Drop zones"}
              items={draft.targets}
              // A drop zone always shows a picture; a `match` right-hand item does
              // not have to (FR-ACT-03).
              isImageRequired={draft.type === "drag_drop"}
              issues={issues}
              isBusy={isBusy}
              onChange={(targets) => update({ targets })}
            />

            <Fieldset
              legend={
                draft.type === "match"
                  ? "Correct pairs"
                  : "Where each item goes"
              }
              hint={
                draft.type === "match"
                  ? "Every left item needs a match."
                  : "Every draggable item needs a drop zone, or the child can never finish."
              }
              error={issues.under([
                draft.type === "match" ? "pairs" : "correctMappings",
              ])}
            >
              {draft.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-1.5">
                  <Label htmlFor={`mapping-${item.id}`}>
                    {item.label.en || item.id} goes to
                  </Label>
                  <Select
                    id={`mapping-${item.id}`}
                    value={draft.mapping[item.id] ?? ""}
                    disabled={isBusy}
                    onChange={(event) =>
                      update({
                        mapping: withMapping(
                          draft.mapping,
                          item.id,
                          event.target.value,
                        ),
                      })
                    }
                  >
                    <option value="">Choose…</option>
                    {draft.targets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.label.en || target.id}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </Fieldset>
          </>
        ) : null}

        {issues.unplaced.length > 0 ? (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-[var(--radius)] border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-xs"
          >
            {issues.unplaced.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isBusy || !parsed.success}>
            Save activity
          </Button>
        </div>

        {!parsed.success ? (
          <p className="text-right text-muted-foreground text-xs">
            Save is disabled until the activity is valid.
          </p>
        ) : null}
      </form>

      <aside className="flex w-full shrink-0 flex-col gap-2 lg:w-[380px]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground text-sm">Preview</h3>
          <div className="flex gap-1.5">
            {LOCALES.map((locale) => (
              <Button
                key={locale}
                type="button"
                size="sm"
                aria-pressed={previewLocale === locale}
                variant={previewLocale === locale ? "default" : "outline"}
                onClick={() => setPreviewLocale(locale)}
              >
                {LOCALE_LABELS[locale]}
              </Button>
            ))}
          </div>
        </div>

        <div
          data-theme="kid"
          className="min-h-[420px] overflow-hidden rounded-[var(--radius)] border border-border bg-background"
        >
          {parsed.success ? (
            <ActivityEngine
              // Keyed on the payload so a change restarts the activity rather
              // than mutating one already in progress.
              key={`${JSON.stringify(parsed.data)}-${previewLocale}`}
              definition={parsed.data}
              locale={previewLocale}
              onComplete={() => {
                // A preview records nothing. In a lesson it is `ActivityStep`
                // that reports the step, not the engine.
              }}
            />
          ) : (
            <p className="p-4 text-muted-foreground text-sm">
              The preview appears once the activity is valid.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Assigning `""` clears the mapping rather than storing an empty target id. */
function withMapping(
  mapping: Record<string, string>,
  itemId: string,
  targetId: string,
): Record<string, string> {
  const next = { ...mapping };
  if (targetId === "") delete next[itemId];
  else next[itemId] = targetId;
  return next;
}

function Fieldset({
  legend,
  hint,
  error,
  children,
}: {
  legend: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-[var(--radius)] border border-border p-3">
      <legend className="px-1 font-semibold text-foreground text-sm">
        {legend}
      </legend>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {children}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function Field({
  id,
  label,
  value,
  error,
  hint,
  isDisabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  isDisabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={isDisabled}
        aria-invalid={error !== undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The waypoints a finger is snapped to, in trace order.
 *
 * Number inputs rather than a canvas: drawing a path by hand is a tool, not a
 * form, and the coordinates come from whoever produced the SVG path in the first
 * place. Two is the floor — one point describes no direction.
 */
function GuideDots({
  dots,
  error,
  isBusy,
  onChange,
}: {
  dots: Array<{ x: number; y: number }>;
  error?: string;
  isBusy: boolean;
  onChange: (dots: Array<{ x: number; y: number }>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-foreground text-sm">Guide dots</span>
      {dots.map((dot, index) => (
        <div
          // Position *is* the identity here: the dots are an ordered path, and two
          // waypoints may legitimately share coordinates.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          key={index}
          className="flex items-end gap-2"
        >
          {(["x", "y"] as const).map((axis) => (
            <div key={axis} className="flex flex-1 flex-col gap-1">
              <Label htmlFor={`dot-${index}-${axis}`}>
                {`${index + 1}. ${axis}`}
              </Label>
              <Input
                id={`dot-${index}-${axis}`}
                type="number"
                value={String(dot[axis])}
                disabled={isBusy}
                onChange={(event) =>
                  onChange(
                    dots.map((one, position) =>
                      position === index
                        ? { ...one, [axis]: Number(event.target.value) }
                        : one,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      ))}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => onChange([...dots, { x: 50, y: 50 }])}
        >
          Add dot
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isBusy || dots.length <= 2}
          onClick={() => onChange(dots.slice(0, -1))}
        >
          Remove last
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ItemList({
  field,
  legend,
  items,
  isImageRequired,
  issues,
  isBusy,
  onChange,
}: {
  field: "items" | "targets" | "leftSet" | "rightSet";
  legend: string;
  items: ItemDraft[];
  isImageRequired: boolean;
  issues: IssueMap;
  isBusy: boolean;
  onChange: (items: ItemDraft[]) => void;
}) {
  function replace(index: number, change: Partial<ItemDraft>) {
    onChange(
      items.map((item, position) =>
        position === index ? { ...item, ...change } : item,
      ),
    );
  }

  const prefix = field === "items" || field === "leftSet" ? "item" : "target";

  return (
    <Fieldset legend={legend} error={issues.under([field])}>
      {items.map((item, index) => (
        <div
          key={item.id}
          className="flex flex-col gap-3 rounded-[var(--radius)] bg-muted/40 p-3"
        >
          <Field
            id={`${field}-${index}-id`}
            label="Id"
            value={item.id}
            error={issues.at([field, index, "id"])}
            isDisabled={isBusy}
            onChange={(id) => replace(index, { id })}
          />

          {LOCALES.map((locale) => (
            <Field
              key={locale}
              id={`${field}-${index}-label-${locale}`}
              label={`Label (${LOCALE_LABELS[locale]})`}
              value={item.label[locale]}
              error={issues.at([field, index, "label", locale])}
              isDisabled={isBusy}
              onChange={(value) =>
                replace(index, { label: { ...item.label, [locale]: value } })
              }
            />
          ))}

          <MediaPicker
            id={`${field}-${index}-image`}
            label={isImageRequired ? "Picture (required)" : "Picture"}
            kind="image"
            value={item.imageUrl}
            isDisabled={isBusy}
            error={issues.under([field, index, "image", "url"])}
            onChange={(asset) => replace(index, { imageUrl: asset?.url ?? "" })}
          />

          {item.imageUrl !== ""
            ? LOCALES.map((locale) => (
                <Field
                  key={locale}
                  id={`${field}-${index}-alt-${locale}`}
                  label={`Picture description (${LOCALE_LABELS[locale]})`}
                  value={item.imageAlt[locale]}
                  error={issues.at([field, index, "image", "alt", locale])}
                  isDisabled={isBusy}
                  onChange={(value) =>
                    replace(index, {
                      imageAlt: { ...item.imageAlt, [locale]: value },
                    })
                  }
                />
              ))
            : null}

          {/* Optional, and only meaningful as a pair: the schema requires both
              locales or neither, because a label a child hears in one language and
              not the other is worse than one they hear in neither. */}
          {LOCALES.map((locale) => (
            <MediaPicker
              key={locale}
              id={`${field}-${index}-audio-${locale}`}
              label={`Label audio (${LOCALE_LABELS[locale]})`}
              kind="audio"
              language={locale}
              value={item.audio[locale]}
              isDisabled={isBusy}
              error={issues.under([field, index, "audio", locale])}
              onChange={(asset) =>
                replace(index, {
                  audio: { ...item.audio, [locale]: asset?.url ?? "" },
                })
              }
            />
          ))}
        </div>
      ))}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy || items.length >= MAXIMUM_ITEMS}
          onClick={() => onChange([...items, emptyItem(items.length, prefix)])}
        >
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isBusy || items.length <= MINIMUM_ITEMS}
          onClick={() => onChange(items.slice(0, -1))}
        >
          Remove last
        </Button>
      </div>
    </Fieldset>
  );
}
