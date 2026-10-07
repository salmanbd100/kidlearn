"use client";

import type { AdminWorld, GradeLevelValue, Locale } from "@kidlearn/types";
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
  SelectMenuTrigger,
} from "@kidlearn/ui";
import { Check, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AdminFilterChip } from "@/features/admin/AdminFilterChip";
import { GRADE_LABELS, LOCALE_LABELS } from "@/features/admin/admin-labels";
import { generateStory } from "@/features/admin/ai-api";

/** The bounds the server enforces, and the length a 3–6 year old sits through. */
const PAGE_COUNTS = [6, 7, 8] as const;
const DEFAULT_PAGE_COUNT = 7;

export interface GenerateStoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  worlds: AdminWorld[];
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
        : // Kept in `GRADE_LEVELS` order, not click order, so equal sets give equal requests.
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
      // Not an error response: the job exists with both attempts; naming it makes it findable.
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

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="story-theme">What should the story teach?</Label>
            <Input
              id="story-theme"
              size="sm"
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
              <SelectMenu
                value={worldId}
                required
                disabled={isBusy}
                onValueChange={setWorldId}
              >
                <SelectMenuTrigger
                  id="story-world"
                  size="sm"
                  placeholder="Pick a world"
                  aria-describedby="story-world-hint"
                />
                <SelectMenuContent>
                  {worlds.map((one) => (
                    <SelectMenuItem key={one.id} value={one.id}>
                      {one.name}
                    </SelectMenuItem>
                  ))}
                </SelectMenuContent>
              </SelectMenu>
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
              <SelectMenu
                value={String(pageCount)}
                disabled={isBusy}
                onValueChange={(value) => setPageCount(Number(value))}
              >
                <SelectMenuTrigger id="story-pages" size="sm" />
                <SelectMenuContent>
                  {PAGE_COUNTS.map((count) => (
                    <SelectMenuItem key={count} value={String(count)}>
                      {count} pages
                    </SelectMenuItem>
                  ))}
                </SelectMenuContent>
              </SelectMenu>
              <p className="text-muted-foreground text-xs">
                About as long as a 3–6 year old sits through in one go.
              </p>
            </div>
          </div>

          <fieldset
            className="flex flex-col gap-2"
            aria-describedby="story-grades-hint"
          >
            <legend className="mb-2 font-medium text-foreground text-sm">
              Grade levels
            </legend>
            <div className="flex flex-wrap gap-2">
              {GRADE_LEVELS.map((grade) => {
                const isOn = gradeLevels.includes(grade);
                return (
                  <AdminFilterChip
                    key={grade}
                    isSelected={isOn}
                    isDisabled={isBusy}
                    onClick={() => toggleGrade(grade)}
                  >
                    {isOn ? (
                      <Check aria-hidden="true" className="-ml-0.5 size-3.5" />
                    ) : null}
                    {GRADE_LABELS[grade]}
                  </AdminFilterChip>
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
            className="flex flex-col gap-2"
            aria-describedby="story-languages-hint"
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
                      <Check aria-hidden="true" className="-ml-0.5 size-3.5" />
                    ) : null}
                    {LOCALE_LABELS[locale]}
                  </AdminFilterChip>
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
