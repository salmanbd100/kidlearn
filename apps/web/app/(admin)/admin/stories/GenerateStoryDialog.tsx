"use client";

import type { AdminWorld, GradeLevelValue, Locale } from "@kidlearn/types";
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
import { generateStory } from "@/lib/admin-api";
import { GRADE_LABELS, LOCALE_LABELS } from "@/lib/admin-labels";

/**
 * "Write this story for me" — the admin end of the AI Story Generator
 * (file 35, FR-AI-02).
 */

/** The bounds the server enforces, and the length a 3–6 year old sits through. */
const PAGE_COUNTS = [6, 7, 8] as const;
const DEFAULT_PAGE_COUNT = 7;

export interface GenerateStoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  worlds: AdminWorld[];
  /** Shows the "sent to review" notice on the screen behind the dialog. */
  onGenerated: (message: string) => void;
}

export function GenerateStoryDialog({
  isOpen,
  onOpenChange,
  worlds,
  onGenerated,
}: GenerateStoryDialogProps) {
  const [theme, setTheme] = useState("");
  const [worldId, setWorldId] = useState("");
  const [gradeLevels, setGradeLevels] = useState<GradeLevelValue[]>(["KG1"]);
  const [languages, setLanguages] = useState<Locale[]>([...LOCALES]);
  const [pageCount, setPageCount] = useState<number>(DEFAULT_PAGE_COUNT);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();

  const canSubmit =
    theme.trim().length >= 3 &&
    worldId !== "" &&
    gradeLevels.length > 0 &&
    languages.length > 0;

  function toggleGrade(grade: GradeLevelValue) {
    setGradeLevels((current) =>
      current.includes(grade)
        ? current.filter((one) => one !== grade)
        : // Kept in `GRADE_LEVELS` order rather than click order, so the request
          // is the same whichever way an admin got to the same set.
          GRADE_LEVELS.filter((one) => one === grade || current.includes(one)),
    );
  }

  function toggleLanguage(locale: Locale) {
    setLanguages((current) =>
      current.includes(locale)
        ? current.filter((one) => one !== locale)
        : LOCALES.filter((one) => one === locale || current.includes(one)),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsBusy(true);
    setError(undefined);

    const result = await generateStory({
      gradeLevels,
      theme: theme.trim(),
      worldId,
      languages,
      pageCount,
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
        `The model could not produce a usable story. Job ${result.data.jobId} kept what it tried, so it can be read in the AI Queue.`,
      );
      return;
    }

    setTheme("");
    onOpenChange(false);
    onGenerated(
      "Sent to the review queue as a draft. Nothing is visible to children until it is published.",
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="lg" closeLabel="Close">
        <DialogHeader gutter="inset">
          <DialogTitle>Generate a story</DialogTitle>
          <DialogDescription>
            Claude writes the title, the moral, the page text and a picture
            brief for every page. Everything it produces is saved as a draft and
            goes to the review queue — nothing reaches a child until an admin
            publishes it.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="story-theme">What should the story teach?</Label>
            <Input
              id="story-theme"
              value={theme}
              required
              minLength={3}
              maxLength={200}
              disabled={isBusy}
              placeholder="Sharing toys makes playing more fun"
              aria-describedby="story-theme-hint"
              onChange={(event) => setTheme(event.target.value)}
            />
            <p id="story-theme-hint" className="text-muted-foreground text-xs">
              One line. It names the story in this CMS and becomes its slug —
              the title a child sees is written per language.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="story-world">World</Label>
              <Select
                id="story-world"
                value={worldId}
                required
                disabled={isBusy}
                aria-describedby="story-world-hint"
                onChange={(event) => setWorldId(event.target.value)}
              >
                <option value="">Pick a world</option>
                {worlds.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </Select>
              <p
                id="story-world-hint"
                className="text-muted-foreground text-xs"
              >
                The setting and the characters come from it — jungle animals for
                the jungle, sea creatures for the ocean.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="story-pages">Pages</Label>
              <Select
                id="story-pages"
                value={String(pageCount)}
                disabled={isBusy}
                onChange={(event) => setPageCount(Number(event.target.value))}
              >
                {PAGE_COUNTS.map((count) => (
                  <option key={count} value={count}>
                    {count} pages
                  </option>
                ))}
              </Select>
              <p className="text-muted-foreground text-xs">
                About as long as a 3–6 year old sits through in one go.
              </p>
            </div>
          </div>

          <fieldset
            className="flex flex-col gap-1.5"
            aria-describedby="story-grades-hint"
          >
            <legend className="font-medium text-foreground text-sm">
              Grade levels
            </legend>
            <div className="flex flex-wrap gap-2">
              {GRADE_LEVELS.map((grade) => {
                const isOn = gradeLevels.includes(grade);
                return (
                  <Button
                    key={grade}
                    type="button"
                    variant={isOn ? "default" : "outline"}
                    aria-pressed={isOn}
                    disabled={isBusy}
                    onClick={() => toggleGrade(grade)}
                  >
                    {GRADE_LABELS[grade]}
                  </Button>
                );
              })}
            </div>
            <p
              id="story-grades-hint"
              className={cn(
                "text-xs",
                gradeLevels.length === 0
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {gradeLevels.length === 0
                ? "Pick at least one — a story shown to no grade is a story nobody opens."
                : "More than one is fine: a story is read aloud, so the grade sets the sentence length rather than the plot."}
            </p>
          </fieldset>

          <fieldset
            className="flex flex-col gap-1.5"
            aria-describedby="story-languages-hint"
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
              id="story-languages-hint"
              className={cn(
                "text-xs",
                languages.length === 0
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {languages.length === 0
                ? "Pick at least one — a story in no language is a story nobody can read."
                : "Both are written in one pass, so the pages tell the same story in each."}
            </p>
          </fieldset>

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
