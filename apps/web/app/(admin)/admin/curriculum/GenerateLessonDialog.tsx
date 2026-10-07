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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
  SelectMenuTrigger,
} from "@kidlearn/ui";
import { Check, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AdminFilterChip } from "@/features/admin/AdminFilterChip";
import { GRADE_LABELS, LOCALE_LABELS } from "@/features/admin/admin-labels";
import { generateLesson } from "@/features/admin/ai-api";

/** Radix reserves `""` for "no value", so the inherited world needs a value of its own. */
const INHERIT_WORLD = "inherit";

export interface GenerateLessonDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: AdminSubject[];
  topics: AdminTopic[];
  worlds: AdminWorld[];
  subjectId?: string;
  topicId?: string;
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
        : // Kept in `LOCALES` order, not click order, so equal pairs give equal requests.
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
      // Not an error response: the job exists with both attempts; naming it makes it findable.
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

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generate-subject">Subject</Label>
              <SelectMenu
                value={subject}
                required
                disabled={isBusy}
                onValueChange={(value) => {
                  setSubject(value);
                  setTopic("");
                }}
              >
                <SelectMenuTrigger
                  id="generate-subject"
                  size="sm"
                  placeholder="Pick a subject"
                />
                <SelectMenuContent>
                  {subjects.map((one) => (
                    <SelectMenuItem key={one.id} value={one.id}>
                      {one.name}
                    </SelectMenuItem>
                  ))}
                </SelectMenuContent>
              </SelectMenu>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generate-topic">Topic</Label>
              <SelectMenu
                value={topic}
                required
                disabled={isBusy || subject === ""}
                onValueChange={setTopic}
              >
                <SelectMenuTrigger
                  id="generate-topic"
                  size="sm"
                  placeholder={
                    subject === "" ? "Pick a subject first" : "Pick a topic"
                  }
                />
                <SelectMenuContent>
                  {availableTopics.map((one) => (
                    <SelectMenuItem key={one.id} value={one.id}>
                      {one.name}
                    </SelectMenuItem>
                  ))}
                </SelectMenuContent>
              </SelectMenu>
            </div>
          </div>

          <fieldset
            className="flex flex-col gap-2"
            aria-describedby="generate-grade-hint"
          >
            <legend className="mb-2 font-medium text-foreground text-sm">
              Grade level
            </legend>
            <div className="flex flex-wrap gap-2">
              {GRADE_LEVELS.map((grade) => (
                <AdminFilterChip
                  key={grade}
                  isSelected={gradeLevel === grade}
                  isDisabled={isBusy}
                  onClick={() => setGradeLevel(grade)}
                >
                  {GRADE_LABELS[grade]}
                </AdminFilterChip>
              ))}
            </div>
            <p
              id="generate-grade-hint"
              className="text-muted-foreground text-xs"
            >
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
              size="sm"
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

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset
              className="flex flex-col gap-2"
              aria-describedby="generate-languages-hint"
            >
              <legend className="mb-2 font-medium text-foreground text-sm">
                Languages
              </legend>
              <div className="flex flex-wrap gap-2">
                {LOCALES.map((locale) => {
                  const isOn = languages.includes(locale);
                  return (
                    <AdminFilterChip
                      key={locale}
                      isSelected={isOn}
                      isDisabled={isBusy}
                      onClick={() => toggleLanguage(locale)}
                    >
                      {isOn ? (
                        <Check
                          aria-hidden="true"
                          className="-ml-0.5 size-3.5"
                        />
                      ) : null}
                      {LOCALE_LABELS[locale]}
                    </AdminFilterChip>
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
              <SelectMenu
                value={world === "" ? INHERIT_WORLD : world}
                disabled={isBusy}
                onValueChange={(value) =>
                  setWorld(value === INHERIT_WORLD ? "" : value)
                }
              >
                <SelectMenuTrigger
                  id="generate-world"
                  size="sm"
                  aria-describedby="generate-world-hint"
                />
                <SelectMenuContent>
                  <SelectMenuItem value={INHERIT_WORLD}>
                    Inherit from this topic&rsquo;s lessons
                  </SelectMenuItem>
                  {worlds.length === 0 ? null : <SelectMenuSeparator />}
                  {worlds.map((one) => (
                    <SelectMenuItem key={one.id} value={one.id}>
                      {one.name}
                    </SelectMenuItem>
                  ))}
                </SelectMenuContent>
              </SelectMenu>
              <p
                id="generate-world-hint"
                className="text-muted-foreground text-xs"
              >
                Leave it inherited unless this topic has no lessons yet — then a
                world has to be chosen, because there is nothing to inherit
                from.
              </p>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-(--radius) border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-sm"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter className="border-border border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy || !canSubmit}>
              <Sparkles aria-hidden="true" className="size-4!" />
              {isBusy ? "Writing — this takes a moment…" : "Generate draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
