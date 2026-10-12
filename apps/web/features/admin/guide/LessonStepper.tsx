"use client";

import { Button, cn, useIsMotionReduced } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useFocusWhenDropped } from "@/shared/hooks/use-focus-when-dropped";
import { swapTransition } from "./guide-sections";

interface Field {
  name: string;
  isRequired: boolean;
  hint: string;
}

interface Step {
  title: string;
  where: string;
  summary: string;
  fields: Field[];
  tip?: string;
}

const STEPS: Step[] = [
  {
    title: "World",
    where: "Worlds column → New",
    summary:
      "Once per theme. A lesson cannot be saved without a world to play in.",
    fields: [
      {
        name: "Slug",
        isRequired: true,
        hint: "jungle — permanent once created",
      },
      {
        name: "Internal name",
        isRequired: true,
        hint: "What admins see: Jungle",
      },
      {
        name: "Name a child sees (English / Bangla)",
        isRequired: true,
        hint: "Jungle / জঙ্গল",
      },
    ],
    tip: "Publish it straight away — a lesson in a draft world is invisible even once the lesson is published. Attach a mascot later from Media → Attach…",
  },
  {
    title: "Subject and topic",
    where: "Subjects → New, then select it and Topics → New",
    summary: "The shelf the lesson sits on.",
    fields: [
      { name: "Slug", isRequired: true, hint: "letters-and-sounds" },
      { name: "Internal name", isRequired: true, hint: "Letters and sounds" },
      {
        name: "Name a child sees (English / Bangla)",
        isRequired: true,
        hint: "Both languages, or the form will not save",
      },
      {
        name: "Grade levels",
        isRequired: true,
        hint: "Nursery, KG-1, KG-2 — tick every grade that should see anything inside",
      },
    ],
    tip: "Publish both. A topic's grades should be a subset of its subject's.",
  },
  {
    title: "Lesson",
    where: "Select the topic → Lessons → New",
    summary:
      "The thing a child plays. Every child-facing field comes in both languages.",
    fields: [
      { name: "Slug", isRequired: true, hint: "letter-a" },
      { name: "Internal title", isRequired: true, hint: "The letter A" },
      { name: "World", isRequired: true, hint: "The theme it plays in" },
      {
        name: "Grade levels",
        isRequired: true,
        hint: "Usually one — writing is pitched at a reading age",
      },
      {
        name: "Title a child sees (EN / BN)",
        isRequired: true,
        hint: "Short: A for Apple / অ-তে অজগর",
      },
      {
        name: "Intro script (EN / BN)",
        isRequired: true,
        hint: "What the mascot says before the video — 2–4 short sentences",
      },
      {
        name: "Video asset id (EN / BN)",
        isRequired: false,
        hint: "Leave empty — attach the video from Media instead",
      },
      {
        name: "Activity id / Quiz id",
        isRequired: false,
        hint: "Filled for you by the next steps",
      },
      {
        name: "Concepts introduced",
        isRequired: false,
        hint: "letter:A, word:apple — what weekly parent reports count as new",
      },
    ],
  },
  {
    title: "Media",
    where: "Media → Upload, then Attach…",
    summary:
      "Pictures, audio and video live in the media library. The server refuses to publish a link to anything outside it.",
    fields: [
      {
        name: "Image",
        isRequired: false,
        hint: "png, jpg, webp, gif — no SVG",
      },
      {
        name: "Audio",
        isRequired: false,
        hint: "mp3, m4a, aac, wav, ogg — picked from inside the activity or quiz editor",
      },
      {
        name: "Video",
        isRequired: false,
        hint: "mp4, webm, mov — under a minute and silent; attach per language",
      },
    ],
    tip: "Files go straight from your browser to Cloudinary. The Media page explains the video workflow.",
  },
  {
    title: "Activity and quiz",
    where: "Selected lesson → New activity · Create quiz",
    summary:
      "Optional, but most lessons have both. Each editor validates as you type and previews with the exact component a child sees.",
    fields: [
      {
        name: "Activity",
        isRequired: false,
        hint: "Save it, copy the id from the address bar, paste it into the lesson's Activity id",
      },
      {
        name: "Quiz",
        isRequired: false,
        hint: "Create quiz makes one and links it — then Add question, 3–5 of them",
      },
      {
        name: "Instruction / prompt audio",
        isRequired: true,
        hint: "Both languages, on every activity and question",
      },
    ],
    tip: "Publish each from its own page — they have their own status.",
  },
  {
    title: "Preview and publish",
    where: "Selected lesson → Preview, then the status buttons",
    summary: "Check every part, then send it live.",
    fields: [
      {
        name: "Preview",
        isRequired: true,
        hint: "Opens the lesson with every part, whatever its status — it skips the visibility checks",
      },
      {
        name: "Submit for review",
        isRequired: true,
        hint: "Freezes the content",
      },
      {
        name: "Approve & publish",
        isRequired: true,
        hint: "Live for every child in the ticked grades",
      },
    ],
    tip: "Not showing up? Run through the four conditions in “What a child can see”.",
  },
];

const stepTabVariants = cva(
  cn(
    "flex min-h-11 w-full items-center gap-2.5 rounded-(--radius) px-3 text-left text-sm transition-colors",
    "focus-ring",
  ),
  {
    variants: {
      state: {
        current: "bg-primary/10 font-medium text-primary",
        done: "text-foreground hover:bg-accent",
        upcoming: "text-muted-foreground hover:bg-accent",
      },
    },
  },
);

const stepDotVariants = cva(
  "flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
  {
    variants: {
      state: {
        current: "bg-primary text-primary-foreground",
        done: "bg-success text-primary-foreground",
        upcoming: "border border-border bg-card text-muted-foreground",
      },
    },
  },
);

export function LessonStepper() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const isMotionReduced = useIsMotionReduced();
  const step = STEPS[current];
  const offset = isMotionReduced ? 0 : 16;
  const positionRef = useFocusWhenDropped<HTMLParagraphElement>(current);

  function goTo(index: number) {
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
  }

  return (
    <div className="grid gap-4 rounded-(--radius) border border-border bg-card p-4 md:grid-cols-[13rem_minmax(0,1fr)] md:p-6">
      <ol aria-label="Steps" className="flex flex-col gap-1">
        {STEPS.map((one, index) => {
          const state =
            index === current
              ? "current"
              : index < current
                ? "done"
                : "upcoming";
          return (
            <li key={one.title}>
              <button
                type="button"
                aria-current={index === current ? "step" : undefined}
                onClick={() => goTo(index)}
                className={stepTabVariants({ state })}
              >
                <span className={stepDotVariants({ state })}>
                  {state === "done" ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                {one.title}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex min-w-0 flex-col gap-4">
        <p
          ref={positionRef}
          aria-live="polite"
          // Where focus lands when Previous or Next becomes disabled under it.
          tabIndex={-1}
          className="text-muted-foreground text-xs outline-none"
        >
          Step {current + 1} of {STEPS.length} · {step.title}
        </p>
        <div className="min-h-72">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current}
              initial={{ opacity: 0, x: direction * offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -offset }}
              transition={swapTransition(isMotionReduced)}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs">{step.where}</p>
                <h3 className="font-semibold text-base text-foreground">
                  {step.title}
                </h3>
                <p className="max-w-prose text-muted-foreground text-sm">
                  {step.summary}
                </p>
              </div>

              <dl className="divide-y divide-border rounded-(--radius) border border-border">
                {step.fields.map((field) => (
                  <div
                    key={field.name}
                    className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-4"
                  >
                    <dt className="flex items-start gap-2 font-medium text-foreground text-sm">
                      {field.name}
                      {field.isRequired ? (
                        <span className="rounded-full bg-primary/10 px-1.5 text-[11px] text-primary">
                          required
                        </span>
                      ) : null}
                    </dt>
                    <dd className="text-muted-foreground text-sm">
                      {field.hint}
                    </dd>
                  </div>
                ))}
              </dl>

              {step.tip ? (
                <p className="rounded-(--radius) bg-muted px-3 py-2 text-foreground text-sm">
                  {step.tip}
                </p>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-2 border-border border-t pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
          >
            <ChevronLeft aria-hidden="true" className="size-4!" />
            Previous
          </Button>
          <Button
            type="button"
            disabled={current === STEPS.length - 1}
            onClick={() => goTo(current + 1)}
          >
            Next
            <ChevronRight aria-hidden="true" className="size-4!" />
          </Button>
        </div>
      </div>
    </div>
  );
}
