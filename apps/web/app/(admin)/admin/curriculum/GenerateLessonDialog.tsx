"use client";

import type {
  AdminSubject,
  AdminTopic,
  AdminWorld,
  GradeLevelValue,
  Locale,
} from "@kidlearn/types";
import { GRADE_LEVELS, LOCALES } from "@kidlearn/types";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@kidlearn/ui";
import { type FormEvent, useState } from "react";
import { generateLesson } from "@/lib/admin-api";
import { GRADE_LABELS, LOCALE_LABELS } from "@/lib/admin-labels";

/**
 * "Write this lesson for me" — the admin end of the AI Lesson Generator
 * (file 34, FR-AI-01).
 *
 * **The dialog promises a draft, not a lesson, and says so before the button is
 * pressed.** What comes back is a job in the review queue; the objectives, the
 * scripts and the quiz are all invisible to children until somebody reads them
 * and publishes (FR-AI-07). Wording that implied otherwise would be the one place
 * in this CMS where a click could look like it had put words in front of a child.
 *
 * **One grade, not the multi-select the hand-authored lesson form carries.** The
 * prompt writes for a reading age, so "Nursery and KG-2" is a request for two
 * lessons rather than one lesson for two audiences.
 *
 * **The world select is optional and labelled as inherited.** A topic that
 * already has lessons settles it, which is the normal case; a topic with none
 * earns a `409` the admin can act on rather than a silent guess that themes the
 * lesson wrongly on a child's home screen.
 *
 * The request is deliberately un-retried and can take the better part of a
 * minute — see `lib/admin-api.ts` — so the submit button carries the wait rather
 * than a spinner that could be mistaken for a hung page.
 */

export interface GenerateLessonDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: AdminSubject[];
  topics: AdminTopic[];
  worlds: AdminWorld[];
  /** Preselected from the tree, so the dialog opens on what is already in view. */
  subjectId?: string;
  topicId?: string;
  /** Reloads the tree and shows the "sent to review" notice. */
  onGenerated: (message: string) => void;
}

export function GenerateLessonDialog({
  isOpen,
  onOpenChange,
  subjects,
  topics,
  worlds,
  subjectId,
  topicId,
  onGenerated,
}: GenerateLessonDialogProps) {
  const [subject, setSubject] = useState(subjectId ?? "");
  const [topic, setTopic] = useState(topicId ?? "");
  const [world, setWorld] = useState("");
  const [gradeLevel, setGradeLevel] = useState<GradeLevelValue>("KG1");
  const [lessonFocus, setLessonFocus] = useState("");
  const [languages, setLanguages] = useState<Locale[]>([...LOCALES]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();

  const availableTopics = topics.filter((one) => one.subjectId === subject);
  const canSubmit =
    subject !== "" &&
    topic !== "" &&
    lessonFocus.trim().length >= 3 &&
    languages.length > 0;

  function toggleLanguage(locale: Locale) {
    setLanguages((current) =>
      current.includes(locale)
        ? current.filter((one) => one !== locale)
        : // Kept in `LOCALES` order rather than click order, so the request is
          // the same whichever way an admin got to the same pair.
          LOCALES.filter((one) => one === locale || current.includes(one)),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsBusy(true);
    setError(undefined);

    const result = await generateLesson({
      gradeLevel,
      subjectId: subject,
      topicId: topic,
      ...(world === "" ? {} : { worldId: world }),
      lessonFocus: lessonFocus.trim(),
      languages,
    });

    setIsBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    if (result.data.status === "failed") {
      // Not an error response — the job exists and holds both attempts. Saying
      // which job it was is what makes it findable in the queue.
      setError(
        `The model could not produce a usable lesson. Job ${result.data.jobId} kept what it tried, so it can be read in the AI Queue.`,
      );
      return;
    }

    setLessonFocus("");
    onOpenChange(false);
    onGenerated(
      "Sent to the review queue as a draft. Nothing is visible to children until it is published.",
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="lg" closeLabel="Close">
        <DialogHeader gutter="inset">
          <DialogTitle>Generate a lesson</DialogTitle>
          <DialogDescription>
            Claude writes the title, the objectives, the scripts and the quiz.
            Everything it produces is saved as a draft and goes to the review
            queue — nothing reaches a child until an admin publishes it.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generate-subject">Subject</Label>
              <Select
                id="generate-subject"
                value={subject}
                required
                disabled={isBusy}
                onChange={(event) => {
                  setSubject(event.target.value);
                  setTopic("");
                }}
              >
                <option value="">Pick a subject</option>
                {subjects.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generate-topic">Topic</Label>
              <Select
                id="generate-topic"
                value={topic}
                required
                disabled={isBusy || subject === ""}
                onChange={(event) => setTopic(event.target.value)}
              >
                <option value="">
                  {subject === "" ? "Pick a subject first" : "Pick a topic"}
                </option>
                {availableTopics.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="font-medium text-foreground text-sm">
              Grade level
            </legend>
            <div className="flex flex-wrap gap-2">
              {GRADE_LEVELS.map((grade) => (
                <Button
                  key={grade}
                  type="button"
                  variant={gradeLevel === grade ? "default" : "outline"}
                  aria-pressed={gradeLevel === grade}
                  disabled={isBusy}
                  onClick={() => setGradeLevel(grade)}
                >
                  {GRADE_LABELS[grade]}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              One grade — the writing is pitched at a reading age, so two grades
              means two lessons.
            </p>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="generate-focus">
              What should the lesson teach?
            </Label>
            <Input
              id="generate-focus"
              value={lessonFocus}
              required
              minLength={3}
              maxLength={200}
              disabled={isBusy}
              placeholder="The letter A and the /a/ sound"
              aria-describedby="generate-focus-hint"
              onChange={(event) => setLessonFocus(event.target.value)}
            />
            <p
              id="generate-focus-hint"
              className="text-muted-foreground text-xs"
            >
              One line. It names the lesson in this CMS and becomes its slug, so
              keep it concrete — the title a child sees is written per language.
            </p>
          </div>

          <fieldset
            className="flex flex-col gap-1.5"
            aria-describedby="generate-languages-hint"
          >
            <legend className="font-medium text-foreground text-sm">
              Languages
            </legend>
            <div className="flex flex-wrap gap-2">
              {LOCALES.map((locale) => {
                const isOn = languages.includes(locale);
                return (
                  <Button
                    key={locale}
                    type="button"
                    variant={isOn ? "default" : "outline"}
                    aria-pressed={isOn}
                    disabled={isBusy}
                    onClick={() => toggleLanguage(locale)}
                  >
                    {LOCALE_LABELS[locale]}
                  </Button>
                );
              })}
            </div>
            <p
              id="generate-languages-hint"
              className={cn(
                "text-xs",
                languages.length === 0
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {languages.length === 0
                ? "Pick at least one — a lesson in no language is a lesson nobody can read."
                : "A script is written per language. Quiz prompts always come in both."}
            </p>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="generate-world">World</Label>
            <Select
              id="generate-world"
              value={world}
              disabled={isBusy}
              aria-describedby="generate-world-hint"
              onChange={(event) => setWorld(event.target.value)}
            >
              <option value="">Inherit from this topic&rsquo;s lessons</option>
              {worlds.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </Select>
            <p
              id="generate-world-hint"
              className="text-muted-foreground text-xs"
            >
              Leave it inherited unless this topic has no lessons yet — then a
              world has to be chosen, because there is nothing to inherit from.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-[var(--radius)] border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-sm"
            >
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy || !canSubmit}>
              {isBusy ? "Writing — this takes a moment…" : "Generate draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
