"use client";

import {
  type Announcements,
  DndContext,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { LESSON_NAMESPACE } from "@kidlearn/i18n";
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
import { useActivitySensors } from "@/features/activities/use-activity-sensors";
import { useTapToPlace } from "@/features/activities/use-tap-to-place";
import type { QuestionProps } from "./types";
import {
  BLANK_DROPPABLE_ID,
  splitAtBlank,
  useDragAnswer,
} from "./use-drag-answer";

const optionCardVariants = cva(
  // `touch-action: manipulation`, not `none`: the touch sensor activates on a 100ms hold, so scroll
  // gestures stay with the browser.
  "flex min-h-24 min-w-24 cursor-grab flex-col items-center justify-center gap-1 rounded-lg border-4 bg-card p-3 text-card-foreground transition-opacity touch-manipulation focus-ring",
  {
    variants: {
      state: {
        idle: "border-border shadow-md",
        dragging: "z-30 cursor-grabbing border-primary shadow-pop",
        selected: "border-primary shadow-pop motion-safe:scale-105",
        // Still readable: a tried card a child can see tells them more than one that vanished.
        dimmed: "border-border opacity-40",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

const blankVariants = cva(
  // 96px drop target in a line of 30px text: the gap is all a child must hit, so it is sized like a
  // button (design.md §7).
  "mx-2 inline-flex min-h-24 min-w-24 items-center justify-center rounded-2xl border-4 border-dashed p-2 align-middle transition-colors touch-manipulation focus-ring",
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
  const { lockedId, dimmedIds, handleDragEnd, place } = useDragAnswer({
    definition,
    feedback,
    onAttempt,
    onCommit,
  });
  const { selectedId, toggle, placeOn, dragHandlers } = useTapToPlace(place);

  const { before, after } = splitAtBlank(definition.sentence[locale]);
  const lockedOption = definition.options.find(
    (option) => option.id === lockedId,
  );
  const selectedOption = definition.options.find(
    (option) => option.id === selectedId,
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
      onDragStart={dragHandlers.onDragStart}
      onDragEnd={(event) => {
        dragHandlers.onDragEnd();
        handleDragEnd(event);
      }}
      // dnd-kit's live-region copy is English; route it through i18next (FR-I18N-01).
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("quiz.drag.instructions") },
      }}
    >
      <div
        data-testid="quiz-drag-answer"
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-8 overflow-auto"
      >
        <span role="status" className="sr-only">
          {selectedOption === undefined
            ? ""
            : t("quiz.drag.picked", {
                item: selectedOption.text?.[locale] ?? selectedOption.id,
              })}
        </span>

        {/*
          The sentence is the question itself with a drop target in it, so one paragraph; `text-3xl`
          for children starting to read.
        */}
        <p className="max-w-2xl text-center font-display text-3xl leading-relaxed text-foreground">
          {before}
          <BlankSlot
            option={lockedOption}
            locale={locale}
            emptyLabel={t("quiz.drag.blank")}
            isInviting={selectedId !== undefined}
            onTap={() => placeOn(BLANK_DROPPABLE_ID)}
          />
          {after}
        </p>

        {/* A labelled list so screen readers announce how many cards are left. */}
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
                isSelected={option.id === selectedId}
                onTap={() => {
                  if (dimmedIds.has(option.id) || option.id === lockedId)
                    return;
                  toggle(option.id);
                }}
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
  isInviting,
  onTap,
}: {
  option: QuizOption | undefined;
  locale: Locale;
  emptyLabel: string;
  isInviting: boolean;
  onTap: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BLANK_DROPPABLE_ID });
  const state =
    option !== undefined ? "filled" : isOver || isInviting ? "over" : "empty";

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid="quiz-drag-blank"
      data-state={state}
      className={cn(blankVariants({ state }))}
      onClick={onTap}
    >
      {option === undefined ? (
        // The gap must read as a gap to a screen reader, or the sentence is announced as two
        // fragments.
        <span className="sr-only">{emptyLabel}</span>
      ) : (
        <span className="font-display text-3xl leading-none">
          {option.text?.[locale]}
        </span>
      )}
    </button>
  );
}

function DraggableOption({
  option,
  locale,
  isDimmed,
  isPlaced,
  isSelected,
  onTap,
  roleDescription,
  triedLabel,
  fallbackLabel,
}: {
  option: QuizOption;
  locale: Locale;
  isDimmed: boolean;
  isPlaced: boolean;
  isSelected: boolean;
  onTap: () => void;
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
  const state = isDragging
    ? "dragging"
    : isDimmed
      ? "dimmed"
      : isSelected
        ? "selected"
        : "idle";

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`quiz-drag-option-${option.id}`}
      data-state={state}
      // No `disabled` or own `aria-disabled`: dnd-kit sets the latter, and `disabled` would drop a
      // tried card out of the tab order mid-answer.
      className={cn(
        optionCardVariants({ state }),
        // The answer is in the blank; a ghost in the tray would offer two of the same card.
        isPlaced && "invisible",
      )}
      // Hand-written translate: the only transform used, and the one property a drag may animate
      // (design.md §5.2).
      style={{
        transform:
          transform === null
            ? undefined
            : `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }}
      {...listeners}
      {...attributes}
      // After the spread: dnd-kit's attributes set `aria-pressed` and would clear the tap
      // selection's.
      aria-pressed={isSelected || isDragging}
      onClick={onTap}
    >
      <OptionArt
        image={option.image}
        locale={locale}
        hasLabel={label !== undefined}
        fallbackLabel={fallbackLabel}
      />
      {label === undefined ? null : (
        // 20px floor on a kid surface (design.md §3.2); the word is the answer, so the larger end
        // of the scale.
        <span className="font-display text-2xl leading-tight">{label}</span>
      )}
      {isDimmed ? <span className="sr-only">{triedLabel}</span> : null}
      {/*
        A card with neither words nor a picture would be a drag target with no accessible name; the
        schema forbids one, but naming is cheaper than debugging.
      */}
      {label === undefined && option.image === undefined ? (
        <span className="sr-only">{fallbackLabel}</span>
      ) : null}
    </button>
  );
}

/**
 * `alt=""` where words are also shown. A wordless card needs a real `alt` (optional on the schema),
 * or the button has no accessible name (design.md §7).
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
