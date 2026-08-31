"use client";

import type { Locale, QuizQuestionType } from "@kidlearn/types";
import {
  LOCALES,
  QUIZ_QUESTION_SCHEMAS,
  QUIZ_QUESTION_TYPES,
} from "@kidlearn/types";
import { Button, Input, Label, Select } from "@kidlearn/ui";
import { useMemo, useState } from "react";
import { QuizEngine } from "@/components/quiz/QuizEngine";
import { LOCALE_LABELS } from "@/lib/admin-labels";
import { optionValue } from "@/lib/select-option";
import { MediaPicker } from "./MediaPicker";
import { type IssueMap, toIssueMap } from "./payload-issues";
import {
  compileQuestion,
  emptyQuestionDraft,
  knownQuestionPaths,
  MAXIMUM_OPTIONS,
  MINIMUM_OPTIONS,
  nextOption,
  type OptionDraft,
  type QuestionDraft,
} from "./quiz-draft";

/**
 * The guided quiz-question form (FR-CMS-03).
 *
 * **Validation is the shared schema, on every keystroke.** The form compiles its
 * state to a payload with `compileQuestion`, parses it with the member of
 * `QUIZ_QUESTION_SCHEMAS` the chosen format names, and puts each issue under the
 * input that produced it. So the rule an author is shown is *the* rule — the same
 * table the server picks its validator from, and the same union the renderer parses
 * before a child sees it — rather than a client-side approximation that can be laxer
 * or stricter than the thing that decides.
 *
 * **Save is disabled until it parses.** Not as a courtesy: an invalid payload is a
 * `400` the author cannot read from a toast, and the editor already knows exactly
 * what is wrong.
 *
 * **The preview is the real renderer.** `QuizEngine` — the component a child gets
 * — is mounted on the parsed payload, in a phone-sized frame under
 * `data-theme="kid"`. A bespoke preview would be a second implementation of the
 * question, and the whole point of previewing is to see the one that ships.
 *
 * **Media is picked, never typed.** Every audio and image field is a `MediaPicker`
 * over the library, filtered by kind and locale — see that component for why a
 * typed URL is unverifiable.
 */

const FORMAT_LABELS: Record<QuizQuestionType, string> = {
  mcq: "Multiple choice",
  picture_select: "Pick the picture",
  match_pair: "Match the pairs",
  drag_answer: "Drag into the sentence",
};

export interface QuizQuestionEditorProps {
  /** The draft to start from — blank for a new question, loaded for an edit. */
  initial: QuestionDraft;
  isBusy: boolean;
  /** The server's refusal, if the save was attempted and rejected. */
  error?: string;
  onSubmit: (payload: {
    format: QuizQuestionType;
    definition: unknown;
  }) => void;
  onCancel: () => void;
}

export function QuizQuestionEditor({
  initial,
  isBusy,
  error,
  onSubmit,
  onCancel,
}: QuizQuestionEditorProps) {
  const [draft, setDraft] = useState<QuestionDraft>(initial);
  const [previewLocale, setPreviewLocale] = useState<Locale>("en");

  const definition = useMemo(() => compileQuestion(draft), [draft]);
  // Parsed with the *member* schema the chosen format names, not the union: Zod
  // reports a failed union as one root-level issue, which would leave every message
  // with nowhere to land. See `QUIZ_QUESTION_SCHEMAS` for the full reasoning — the
  // server picks its schema the same way, from the same table.
  const parsed = useMemo(
    () => QUIZ_QUESTION_SCHEMAS[draft.format].safeParse(definition),
    [definition, draft.format],
  );
  const issues = useMemo(
    () =>
      parsed.success
        ? toIssueMap([])
        : toIssueMap(parsed.error.issues, knownQuestionPaths(draft)),
    [parsed, draft],
  );

  function update(change: Partial<QuestionDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  /**
   * Switching format keeps the prompt, the audio and the options already typed —
   * an author deciding a question reads better as pictures should not lose the
   * work. The options are re-blanked only when the new format's bounds cannot hold
   * them, which is the one case carrying them over would produce a payload that
   * can never validate.
   */
  function changeFormat(format: QuizQuestionType) {
    setDraft((current) => {
      const fits =
        current.options.length >= MINIMUM_OPTIONS[format] &&
        current.options.length <= MAXIMUM_OPTIONS[format];
      return {
        ...current,
        format,
        options: fits ? current.options : emptyQuestionDraft(format).options,
      };
    });
  }

  const isMatchPair = draft.format === "match_pair";

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <form
        className="flex min-w-0 flex-1 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!parsed.success) return;
          onSubmit({ format: draft.format, definition: parsed.data });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="question-format">Format</Label>
          <Select
            id="question-format"
            value={draft.format}
            disabled={isBusy}
            onChange={(event) =>
              changeFormat(
                optionValue(
                  QUIZ_QUESTION_TYPES,
                  event.target.value,
                  draft.format,
                ),
              )
            }
          >
            {QUIZ_QUESTION_TYPES.map((format) => (
              <option key={format} value={format}>
                {FORMAT_LABELS[format]}
              </option>
            ))}
          </Select>
        </div>

        <Fieldset legend="Question prompt" error={issues.under(["prompt"])}>
          {LOCALES.map((locale) => (
            <Field
              key={locale}
              id={`prompt-${locale}`}
              label={`Prompt (${LOCALE_LABELS[locale]})`}
              value={draft.prompt[locale]}
              error={issues.at(["prompt", locale])}
              isDisabled={isBusy}
              onChange={(value) =>
                update({ prompt: { ...draft.prompt, [locale]: value } })
              }
            />
          ))}
        </Fieldset>

        <Fieldset
          legend="Prompt audio"
          hint="Required in both locales — a three-year-old cannot read the question (FR-QUIZ-05)."
          error={issues.under(["promptAudio"])}
        >
          {LOCALES.map((locale) => (
            <MediaPicker
              key={locale}
              id={`prompt-audio-${locale}`}
              label={`Prompt audio (${LOCALE_LABELS[locale]})`}
              kind="audio"
              language={locale}
              value={draft.promptAudio[locale]}
              isDisabled={isBusy}
              onChange={(asset) =>
                update({
                  promptAudio: {
                    ...draft.promptAudio,
                    [locale]: asset?.url ?? "",
                  },
                })
              }
            />
          ))}
        </Fieldset>

        {draft.format === "drag_answer" ? (
          <Fieldset
            legend="Sentence"
            hint="Put {blank} where the answer goes — exactly once, in each locale."
            error={issues.under(["sentence"])}
          >
            {LOCALES.map((locale) => (
              <Field
                key={locale}
                id={`sentence-${locale}`}
                label={`Sentence (${LOCALE_LABELS[locale]})`}
                value={draft.sentence[locale]}
                error={issues.at(["sentence", locale])}
                isDisabled={isBusy}
                onChange={(value) =>
                  update({ sentence: { ...draft.sentence, [locale]: value } })
                }
              />
            ))}
          </Fieldset>
        ) : null}

        {isMatchPair ? (
          <>
            <OptionList
              field="leftColumn"
              legend="Left column"
              options={draft.leftColumn}
              format={draft.format}
              issues={issues}
              isBusy={isBusy}
              onChange={(leftColumn) => update({ leftColumn })}
            />
            <OptionList
              field="rightColumn"
              legend="Right column"
              options={draft.rightColumn}
              format={draft.format}
              issues={issues}
              isBusy={isBusy}
              idOffset={draft.leftColumn.length}
              onChange={(rightColumn) => update({ rightColumn })}
            />
            <Fieldset
              legend="Correct pairs"
              hint="Every left option needs a match, or the question cannot be finished."
            >
              {draft.leftColumn.map((option) => (
                <div key={option.id} className="flex flex-col gap-1.5">
                  <Label htmlFor={`pair-${option.id}`}>
                    {option.text.en || option.id} matches
                  </Label>
                  <Select
                    id={`pair-${option.id}`}
                    value={draft.pairing[option.id] ?? ""}
                    disabled={isBusy}
                    onChange={(event) =>
                      update({
                        pairing: withPair(
                          draft.pairing,
                          option.id,
                          event.target.value,
                        ),
                      })
                    }
                  >
                    <option value="">Choose…</option>
                    {draft.rightColumn.map((right) => (
                      <option key={right.id} value={right.id}>
                        {right.text.en || right.id}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </Fieldset>
          </>
        ) : (
          <>
            <OptionList
              field="options"
              legend="Options"
              options={draft.options}
              format={draft.format}
              issues={issues}
              isBusy={isBusy}
              onChange={(options) => update({ options })}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="correct-option">Correct answer</Label>
              <Select
                id="correct-option"
                value={draft.correctOptionId}
                disabled={isBusy}
                aria-invalid={issues.at(["correctOptionId"]) !== undefined}
                onChange={(event) =>
                  update({ correctOptionId: event.target.value })
                }
              >
                <option value="">Choose…</option>
                {draft.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.text.en || option.id}
                  </option>
                ))}
              </Select>
              {issues.at(["correctOptionId"]) ? (
                <p role="alert" className="text-destructive text-xs">
                  {issues.at(["correctOptionId"])}
                </p>
              ) : null}
            </div>
          </>
        )}

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
            Save question
          </Button>
        </div>

        {!parsed.success ? (
          <p className="text-right text-muted-foreground text-xs">
            Save is disabled until the question is valid.
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

        {/* `data-theme="kid"` so the preview wears the palette a child sees —
            components read tokens and never branch on theme (`frontend.md §1`). */}
        <div
          data-theme="kid"
          className="min-h-[420px] overflow-hidden rounded-[var(--radius)] border border-border bg-background"
        >
          {parsed.success ? (
            <QuizEngine
              // Keyed on the payload so switching format or locale remounts the
              // engine rather than feeding a new question into a session that has
              // already started.
              key={`${JSON.stringify(parsed.data)}-${previewLocale}`}
              quizId="preview"
              questions={[{ id: "preview", definition: parsed.data }]}
              locale={previewLocale}
              onFinish={() => {
                // A preview has nothing to record. The engine posts nothing
                // itself — `QuizStep` is what submits responses in a real lesson.
              }}
            />
          ) : (
            <p className="p-4 text-muted-foreground text-sm">
              The preview appears once the question is valid.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Assigning `""` clears the pair rather than storing an empty right id. */
function withPair(
  pairing: Record<string, string>,
  leftId: string,
  rightId: string,
): Record<string, string> {
  const next = { ...pairing };
  if (rightId === "") delete next[leftId];
  else next[leftId] = rightId;
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
  isDisabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
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
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One column of options.
 *
 * The image picker is required for `picture_select` and offered for every other
 * format, matching the schema: that format is picture-first, so an image stops
 * being optional (FR-QUIZ-04).
 */
function OptionList({
  field,
  legend,
  options,
  format,
  issues,
  isBusy,
  idOffset = 0,
  onChange,
}: {
  field: "options" | "leftColumn" | "rightColumn";
  legend: string;
  options: OptionDraft[];
  format: QuizQuestionType;
  issues: IssueMap;
  isBusy: boolean;
  /** Where this column's option numbering starts. See `nextOption`. */
  idOffset?: number;
  onChange: (options: OptionDraft[]) => void;
}) {
  function replace(index: number, change: Partial<OptionDraft>) {
    onChange(
      options.map((option, position) =>
        position === index ? { ...option, ...change } : option,
      ),
    );
  }

  return (
    <Fieldset legend={legend} error={issues.under([field])}>
      {options.map((option, index) => (
        <div
          key={option.id}
          className="flex flex-col gap-3 rounded-[var(--radius)] bg-muted/40 p-3"
        >
          <Field
            id={`${field}-${index}-id`}
            label="Option id"
            value={option.id}
            error={issues.at([field, index, "id"])}
            isDisabled={isBusy}
            onChange={(value) => replace(index, { id: value })}
          />

          {LOCALES.map((locale) => (
            <Field
              key={locale}
              id={`${field}-${index}-text-${locale}`}
              label={`Label (${LOCALE_LABELS[locale]})`}
              value={option.text[locale]}
              error={issues.at([field, index, "text", locale])}
              isDisabled={isBusy}
              onChange={(value) =>
                replace(index, { text: { ...option.text, [locale]: value } })
              }
            />
          ))}

          <MediaPicker
            id={`${field}-${index}-image`}
            label={
              format === "picture_select" ? "Picture (required)" : "Picture"
            }
            kind="image"
            value={option.imageUrl}
            isDisabled={isBusy}
            error={issues.under([field, index, "image", "url"])}
            onChange={(asset) => replace(index, { imageUrl: asset?.url ?? "" })}
          />

          {/* Only once there is a picture to describe. Offered rather than
              required because the schema makes it optional — but never dropped on
              an edit, which is what `imageAlt` on the draft is for. */}
          {option.imageUrl !== ""
            ? LOCALES.map((locale) => (
                <Field
                  key={locale}
                  id={`${field}-${index}-alt-${locale}`}
                  label={`Picture description (${LOCALE_LABELS[locale]})`}
                  value={option.imageAlt[locale]}
                  error={issues.at([field, index, "image", "alt", locale])}
                  isDisabled={isBusy}
                  onChange={(value) =>
                    replace(index, {
                      imageAlt: { ...option.imageAlt, [locale]: value },
                    })
                  }
                />
              ))
            : null}
        </div>
      ))}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy || options.length >= MAXIMUM_OPTIONS[format]}
          onClick={() => onChange([...options, nextOption(options, idOffset)])}
        >
          Add option
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isBusy || options.length <= MINIMUM_OPTIONS[format]}
          onClick={() => onChange(options.slice(0, -1))}
        >
          Remove last
        </Button>
      </div>
    </Fieldset>
  );
}
