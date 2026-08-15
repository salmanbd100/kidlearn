"use client";

import {
  type Announcements,
  DndContext,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type {
  DragAnswerQuestion as DragAnswerDefinition,
  ImageAssetRef,
  Locale,
  QuizOption,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import Image from "next/image";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useActivitySensors } from "@/components/activities/use-activity-sensors";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import type { QuestionProps } from "./types";
import {
  BLANK_DROPPABLE_ID,
  splitAtBlank,
  useDragAnswer,
} from "./use-drag-answer";

/**
 * Drag the missing word into the gap (FR-QUIZ-03).
 *
 * **The sentence stays one sentence.** The blank is rendered inline between its
 * two halves rather than under them, so what a child is looking at is the thing
 * they are completing — a slot floating below the words is a form field, and a
 * pre-reader has no idea what it belongs to.
 *
 * **Wrong is quiet.** A card dropped on the blank that does not belong there
 * snaps back on its own (dnd-kit discards the transform; nothing here persists
 * one), fades to 40% and stops answering, while an encouraging voice plays.
 * There is no cross, no counter, and no ceiling on attempts (§5.7).
 *
 * **Nothing reads the finished sentence aloud.** `promptAudio` speaks the
 * question, not the sentence with the gap filled, and the schema carries no clip
 * of the completed line — so replaying it after the answer would repeat the
 * instruction over the cheer rather than confirm anything. The cheer is what
 * says "that's it", the same one every other format uses.
 *
 * How a drag starts — and why mouse and touch are tuned apart — lives in
 * `activities/use-activity-sensors.ts`, shared with every dnd-kit surface so the
 * gesture a child learns in the activity is the gesture here.
 */

const optionCardVariants = cva(
  // `touch-action: manipulation` and not `none`: the touch sensor activates on a
  // 100ms hold, so the browser can keep owning scroll gestures that start here.
  "flex min-h-24 min-w-24 cursor-grab flex-col items-center justify-center gap-1 rounded-lg border-4 bg-card p-3 text-card-foreground transition-opacity [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      state: {
        idle: "border-border shadow-md",
        dragging: "z-30 cursor-grabbing border-primary shadow-pop",
        // Still readable, still there — a card a child can see they have tried
        // tells them more than one that vanished under their finger.
        dimmed: "border-border opacity-40",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

const blankVariants = cva(
  // 96px of drop target inside a line of 30px text: the gap is the only thing on
  // this screen a child has to hit, so it is sized like a button, not like a
  // word (design.md §7).
  "mx-2 inline-flex min-h-24 min-w-24 items-center justify-center rounded-2xl border-4 border-dashed p-2 align-middle transition-colors",
  {
    variants: {
      state: {
        empty: "border-border bg-muted/40",
        over: "border-primary bg-primary/10",
        filled: "border-success border-solid bg-success/10",
      },
    },
    defaultVariants: { state: "empty" },
  },
);

const IMAGE_PX = 96;

export function DragAnswerQuestion({
  definition,
  locale,
  feedback,
  onAttempt,
  onCommit,
}: QuestionProps<DragAnswerDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const sensors = useActivitySensors();
  const { lockedId, dimmedIds, handleDragEnd } = useDragAnswer({
    definition,
    feedback,
    onAttempt,
    onCommit,
  });

  const { before, after } = splitAtBlank(definition.sentence[locale]);
  const lockedOption = definition.options.find(
    (option) => option.id === lockedId,
  );

  const announcements = useMemo<Announcements>(() => {
    const optionLabel = (id: string) =>
      definition.options.find((option) => option.id === id)?.text?.[locale] ??
      id;
    const blank = t("quiz.drag.blank");

    return {
      onDragStart: ({ active }) =>
        t("quiz.drag.pickedUp", { item: optionLabel(String(active.id)) }),
      onDragOver: ({ active, over }) =>
        over === null
          ? undefined
          : t("quiz.drag.over", {
              item: optionLabel(String(active.id)),
              target: blank,
            }),
      onDragEnd: ({ active, over }) => {
        const item = optionLabel(String(active.id));
        if (
          over !== null &&
          String(over.id) === BLANK_DROPPABLE_ID &&
          String(active.id) === definition.correctOptionId
        ) {
          return t("quiz.drag.dropped", { item, target: blank });
        }
        return t("quiz.drag.cancelled", { item });
      },
      onDragCancel: ({ active }) =>
        t("quiz.drag.cancelled", { item: optionLabel(String(active.id)) }),
    };
  }, [t, locale, definition]);

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      // dnd-kit's own live-region copy is English; every string a child's device
      // reads out has to come through i18next like any other (FR-I18N-01).
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("quiz.drag.instructions") },
      }}
    >
      <div
        data-testid="quiz-drag-answer"
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-8 overflow-auto"
      >
        {/*
          The sentence is not a heading and not a label — it is the question
          itself, with a hole in it, so it is one paragraph whose middle happens
          to be a drop target. `text-3xl` because a child who *is* starting to
          read is reading this one.
        */}
        <p className="max-w-2xl text-center font-display text-3xl leading-relaxed text-foreground">
          {before}
          <BlankSlot
            option={lockedOption}
            locale={locale}
            emptyLabel={t("quiz.drag.blank")}
          />
          {after}
        </p>

        {/*
          A labelled list rather than a labelled `div`: it is what the tray
          actually is, and how many are left in it is the sighted child's "two to
          try" made audible.
        */}
        <ul
          aria-label={t("quiz.drag.tray")}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          {definition.options.map((option, index) => (
            <li key={option.id} className="flex">
              <DraggableOption
                option={option}
                locale={locale}
                isDimmed={dimmedIds.has(option.id)}
                isPlaced={option.id === lockedId}
                roleDescription={t("quiz.drag.roleDescription")}
                triedLabel={t("quiz.optionTried")}
                fallbackLabel={t("quiz.optionPicture", { number: index + 1 })}
              />
            </li>
          ))}
        </ul>
      </div>
    </DndContext>
  );
}

function BlankSlot({
  option,
  locale,
  emptyLabel,
}: {
  option: QuizOption | undefined;
  locale: Locale;
  emptyLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BLANK_DROPPABLE_ID });
  const state = option !== undefined ? "filled" : isOver ? "over" : "empty";

  return (
    <span
      ref={setNodeRef}
      data-testid="quiz-drag-blank"
      data-state={state}
      className={cn(blankVariants({ state }))}
    >
      {option === undefined ? (
        // The gap has to be readable as a gap by a screen reader too, or the
        // sentence is announced as two fragments with nothing between them.
        <span className="sr-only">{emptyLabel}</span>
      ) : (
        <span className="font-display text-3xl leading-none">
          {option.text?.[locale]}
        </span>
      )}
    </span>
  );
}

function DraggableOption({
  option,
  locale,
  isDimmed,
  isPlaced,
  roleDescription,
  triedLabel,
  fallbackLabel,
}: {
  option: QuizOption;
  locale: Locale;
  isDimmed: boolean;
  /** Answered correctly and now sitting in the blank — nothing left to drag. */
  isPlaced: boolean;
  roleDescription: string;
  triedLabel: string;
  fallbackLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: option.id,
      disabled: isDimmed || isPlaced,
      attributes: { roleDescription },
    });

  const label = option.text?.[locale];
  const state = isDragging ? "dragging" : isDimmed ? "dimmed" : "idle";

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`quiz-drag-option-${option.id}`}
      data-state={state}
      // No `disabled` attribute, and no `aria-disabled` of its own: dnd-kit sets
      // the latter from the `disabled` it was passed above, and the former would
      // drop a tried card out of the tab order half-way through answering — it
      // is still part of the question a screen-reader user is reading back.
      className={cn(
        optionCardVariants({ state }),
        // The answer is in the blank now; leaving a ghost of it in the tray
        // would give a child two of the same card to choose between.
        isPlaced && "invisible",
      )}
      // Written out rather than pulled from `@dnd-kit/utilities`: a translate is
      // the only transform this ever applies, and `transform` is the one
      // property a drag may animate (design.md §5.2).
      style={{
        transform:
          transform === null
            ? undefined
            : `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }}
      {...listeners}
      {...attributes}
    >
      <OptionArt
        image={option.image}
        locale={locale}
        hasLabel={label !== undefined}
        fallbackLabel={fallbackLabel}
      />
      {label === undefined ? null : (
        // 20px floor on a kid surface (design.md §3.2); the word on this card is
        // the answer itself, so it gets the larger end of the scale.
        <span className="font-display text-2xl leading-tight">{label}</span>
      )}
      {isDimmed ? <span className="sr-only">{triedLabel}</span> : null}
      {/*
        A card with neither words nor a picture has nothing else to be called.
        The schema does not allow one, but this is a drag target with no
        accessible name if it ever ships — cheaper to name than to debug.
      */}
      {label === undefined && option.image === undefined ? (
        <span className="sr-only">{fallbackLabel}</span>
      ) : null}
    </button>
  );
}

/**
 * `alt=""` where the card also carries words, because the picture then repeats
 * what is already announced. A wordless card is the opposite case: `alt` is
 * optional on the schema, so an author may publish one with nothing describing
 * it, and an empty `alt` there would leave the button with no accessible name at
 * all (design.md §7).
 */
function OptionArt({
  image,
  locale,
  hasLabel,
  fallbackLabel,
}: {
  image: ImageAssetRef | undefined;
  locale: Locale;
  hasLabel: boolean;
  fallbackLabel: string;
}) {
  if (image === undefined) return null;

  return (
    <Image
      src={image.url}
      alt={hasLabel ? "" : (image.alt?.[locale] ?? fallbackLabel)}
      title={hasLabel ? image.alt?.[locale] : undefined}
      width={IMAGE_PX}
      height={IMAGE_PX}
      className="size-12 w-auto object-contain"
    />
  );
}
