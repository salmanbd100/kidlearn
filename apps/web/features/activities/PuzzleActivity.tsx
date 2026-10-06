"use client";

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import type {
  PuzzleActivity as PuzzleDefinition,
  PuzzleSlot,
} from "@kidlearn/types";
import { cn, useIsMotionReduced } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusMark } from "@/shared/components/kid/StatusMark";
import { useActivitySensors } from "@/shared/hooks/use-activity-sensors";
import {
  centreOfElement,
  useTapToPlace,
} from "@/shared/hooks/use-tap-to-place";
import { isWiggling, type WiggleRequest } from "@/shared/hooks/use-wiggle";
import {
  evaluatePiecePlacement,
  puzzleIndexOfId,
  puzzlePieceId,
  puzzleSlotId,
} from "./evaluate";
import type { ActivityRendererProps } from "./registry";
import { usePuzzleState } from "./use-puzzle-state";

const pieceVariants = cva(
  // `touch-action: manipulation`, not `none`: the touch sensor activates on a 100ms hold, so scroll
  // gestures stay with the browser (the tray scrolls).
  "relative size-20 shrink-0 cursor-grab rounded-md touch-manipulation focus-ring",
  {
    variants: {
      state: {
        // The gap left behind, so a mid-drag child sees where the piece came from; the moving copy
        // is the `DragOverlay`.
        dragging: "cursor-grabbing opacity-30",
        selected: "shadow-pop ring-4 ring-primary motion-safe:scale-105",
        idle: "shadow-md",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

const slotVariants = cva("relative", {
  variants: {
    state: {
      empty: "rounded-md border-2 border-dashed border-border/80",
      over: "rounded-md border-2 border-primary bg-primary/10",
      filled: "",
    },
  },
  defaultVariants: { state: "empty" },
});

function cropStyle(
  imageUrl: string,
  grid: PuzzleDefinition["grid"],
  slot: PuzzleSlot,
): CSSProperties {
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundSize: `${grid.cols * 100}% ${grid.rows * 100}%`,
    backgroundPosition: `${(slot.col / (grid.cols - 1)) * 100}% ${
      (slot.row / (grid.rows - 1)) * 100
    }%`,
  };
}

export function PuzzleActivity({
  definition,
  locale,
  feedback,
  onActivityComplete,
}: ActivityRendererProps<PuzzleDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const sensors = useActivitySensors();
  const isMotionReduced = useIsMotionReduced();
  const { filled, isComplete, wiggle, handleDragEnd, place, skipShine } =
    usePuzzleState(definition, feedback, onActivityComplete);
  const { selectedId, toggle, placeOn, dragHandlers } = useTapToPlace(place);

  // Counted from one wherever a number is spoken: "piece 0" is not something a child can find.
  const pieceLabel = useCallback(
    (slotIndex: number) =>
      t("activity.puzzle.piece", { number: slotIndex + 1 }),
    [t],
  );
  const slotLabel = useCallback(
    (slotIndex: number) => t("activity.puzzle.slot", { number: slotIndex + 1 }),
    [t],
  );

  const announcements = useMemo<Announcements>(() => {
    const pieceOf = (id: string) => pieceLabel(puzzleIndexOfId(id) ?? 0);
    const slotOf = (id: string) => slotLabel(puzzleIndexOfId(id) ?? 0);

    return {
      onDragStart: ({ active }) =>
        t("activity.dnd.pickedUp", { item: pieceOf(String(active.id)) }),
      onDragOver: ({ active, over }) =>
        over === null
          ? undefined
          : t("activity.dnd.over", {
              item: pieceOf(String(active.id)),
              target: slotOf(String(over.id)),
            }),
      onDragEnd: ({ active, over }) => {
        const item = pieceOf(String(active.id));
        if (
          over !== null &&
          evaluatePiecePlacement(definition, String(active.id), String(over.id))
        ) {
          return t("activity.dnd.dropped", {
            item,
            target: slotOf(String(over.id)),
          });
        }
        return t("activity.dnd.cancelled", { item });
      },
      onDragCancel: ({ active }) =>
        t("activity.dnd.cancelled", { item: pieceOf(String(active.id)) }),
    };
  }, [t, definition, pieceLabel, slotLabel]);

  const trayPieces = definition.slots.filter((slot) => !filled.has(slot.index));

  const [draggingIndex, setDraggingIndex] = useState<number | undefined>(
    undefined,
  );
  const draggingSlot = definition.slots.find(
    (slot) => slot.index === draggingIndex,
  );

  const handleDragFinished = useCallback(
    (event: DragEndEvent) => {
      setDraggingIndex(undefined);
      dragHandlers.onDragEnd();
      handleDragEnd(event);
    },
    [handleDragEnd, dragHandlers],
  );

  const selectedIndex =
    selectedId === undefined ? undefined : puzzleIndexOfId(selectedId);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => {
        dragHandlers.onDragStart();
        setDraggingIndex(puzzleIndexOfId(String(active.id)));
      }}
      onDragEnd={handleDragFinished}
      onDragCancel={() => setDraggingIndex(undefined)}
      // dnd-kit's live-region copy is English; route it through i18next (FR-I18N-01).
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("activity.dnd.instructions") },
      }}
    >
      <div
        data-testid="activity-puzzle"
        // Portrait stacks the picture above the tray; landscape goes side by side to save vertical
        // space (design.md §6).
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto landscape:flex-row landscape:gap-6"
      >
        <span role="status" className="sr-only">
          {isComplete
            ? t("activity.puzzle.done")
            : t("activity.puzzle.progress", {
                placed: filled.size,
                total: definition.slots.length,
              })}
        </span>
        <span role="status" className="sr-only">
          {selectedIndex === undefined
            ? ""
            : t("activity.dnd.picked", { item: pieceLabel(selectedIndex) })}
        </span>

        <div
          data-complete={isComplete}
          // Capped on both axes: a tall grid would otherwise overflow, and the board must be
          // visible whole (design.md §6).
          className="relative max-h-[60dvh] w-full max-w-sm shrink-0 overflow-hidden rounded-lg landscape:max-w-[min(24rem,50vw)]"
          // Shaped by the grid, not the artwork: square cells make a square crop, and the payload
          // has no intrinsic dimensions.
          style={{
            aspectRatio: `${definition.grid.cols} / ${definition.grid.rows}`,
          }}
        >
          {/* Faint answer as a hint; decorative, the board above carries the accessible name. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url(${definition.image.url})`,
              backgroundSize: "100% 100%",
            }}
          />

          {/*
            A labelled list so screen readers announce how many spaces remain; the picture's alt
            text names it.
          */}
          <ul
            data-testid="puzzle-board"
            aria-label={
              definition.image.alt?.[locale] ?? t("activity.puzzle.board")
            }
            className="relative grid size-full gap-0.5 p-0.5"
            style={{
              gridTemplateColumns: `repeat(${definition.grid.cols}, 1fr)`,
              gridTemplateRows: `repeat(${definition.grid.rows}, 1fr)`,
            }}
          >
            {definition.slots.map((slot) => (
              <PuzzleSlotCell
                key={slot.index}
                slot={slot}
                definition={definition}
                isFilled={filled.has(slot.index)}
                isInviting={selectedId !== undefined}
                label={slotLabel(slot.index)}
                onTap={(anchor) => placeOn(puzzleSlotId(slot.index), anchor)}
              />
            ))}
          </ul>

          {/*
            The one raw colour: white at low alpha over the child's picture, allowed as decorative
            game art (design.md §2.2). Transform and opacity only.
          */}
          {/*
            A button, like the engine's celebration, because §5.2 requires a celebration be
            dismissible.
          */}
          {isComplete ? (
            <button
              type="button"
              data-testid="puzzle-shine"
              aria-label={t("activity.skip")}
              className="absolute inset-0 bg-[linear-gradient(105deg,transparent_35%,var(--shine)_50%,transparent_65%)] touch-manipulation focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-inset motion-safe:animate-shine"
              onClick={skipShine}
            />
          ) : null}
        </div>

        <ul
          aria-label={t("activity.puzzle.tray")}
          // Scrolls on its own axis: nine 80px pieces are 720px, longer than any phone.
          className="flex max-w-full shrink-0 gap-3 overflow-x-auto p-2 landscape:max-h-full landscape:max-w-24 landscape:flex-col landscape:flex-wrap landscape:overflow-y-auto"
        >
          {trayPieces.map((slot) => (
            <li key={slot.index} className="flex">
              <PuzzlePiece
                slot={slot}
                definition={definition}
                label={pieceLabel(slot.index)}
                roleDescription={t("activity.dnd.roleDescription")}
                wiggle={
                  isWiggling(wiggle, puzzlePieceId(slot.index))
                    ? wiggle
                    : undefined
                }
                isSelected={selectedId === puzzlePieceId(slot.index)}
                onTap={() => toggle(puzzlePieceId(slot.index))}
              />
            </li>
          ))}
        </ul>
      </div>

      {/*
        Drawn in a portal on `body`: the tray and step scroll and would clip a piece dragged out of
        the tray.
      */}
      {/*
        Also gives dnd-kit's snap-back for a wrong drop (FR-ACT-05), stilled under reduced motion
        (design.md §5.2).
      */}
      <DragOverlay dropAnimation={isMotionReduced ? null : undefined}>
        {draggingSlot === undefined ? null : (
          <div
            aria-hidden="true"
            className="size-20 rounded-md shadow-pop ring-4 ring-primary"
            style={cropStyle(
              definition.image.url,
              definition.grid,
              draggingSlot,
            )}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function PuzzlePiece({
  slot,
  definition,
  label,
  roleDescription,
  wiggle,
  isSelected,
  onTap,
}: {
  slot: PuzzleSlot;
  definition: PuzzleDefinition;
  label: string;
  roleDescription: string;
  wiggle: WiggleRequest | undefined;
  isSelected: boolean;
  onTap: () => void;
}) {
  // No `transform` read here: the overlay copy moves, and translating this one too would move two.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: puzzlePieceId(slot.index),
    attributes: { roleDescription },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`puzzle-piece-${slot.index}`}
      aria-label={label}
      className={cn(
        pieceVariants({
          state: isDragging ? "dragging" : isSelected ? "selected" : "idle",
        }),
      )}
      {...listeners}
      {...attributes}
      // After the spread: dnd-kit's attributes set `aria-pressed` and would clear the tap
      // selection's.
      aria-pressed={isSelected || isDragging}
      onClick={onTap}
    >
      {/*
        Crop on the inner span so keying on the wiggle count restarts the keyframes without
        remounting the node dnd-kit holds a ref to.
      */}
      <span
        key={wiggle?.count ?? 0}
        className={cn(
          "block size-full rounded-md",
          wiggle !== undefined && "motion-safe:animate-wiggle",
        )}
        style={cropStyle(definition.image.url, definition.grid, slot)}
      />
      {wiggle === undefined ? null : <StatusMark tone="retry" />}
    </button>
  );
}

function PuzzleSlotCell({
  slot,
  definition,
  isFilled,
  isInviting,
  label,
  onTap,
}: {
  slot: PuzzleSlot;
  definition: PuzzleDefinition;
  isFilled: boolean;
  isInviting: boolean;
  label: string;
  onTap: (anchor: { x: number; y: number }) => void;
}) {
  // A filled slot stops being a target: the piece is locked in.
  const { setNodeRef, isOver } = useDroppable({
    id: puzzleSlotId(slot.index),
    disabled: isFilled,
  });

  const state = isFilled ? "filled" : isOver || isInviting ? "over" : "empty";

  return (
    <li
      ref={setNodeRef}
      data-testid={`puzzle-slot-${slot.index}`}
      data-state={state}
      className={cn(slotVariants({ state }))}
      style={{
        gridRow: slot.row + 1,
        gridColumn: slot.col + 1,
        ...(isFilled
          ? cropStyle(definition.image.url, definition.grid, slot)
          : undefined),
      }}
    >
      {/*
        A filled space is the picture again: no button and no "space 4", which would imply a gap. An
        empty one is a button for tap, Enter or VoiceOver.
      */}
      {isFilled ? null : (
        <button
          type="button"
          aria-label={label}
          className="size-full rounded-md touch-manipulation focus-ring"
          onClick={(event) => onTap(centreOfElement(event.currentTarget))}
        />
      )}
    </li>
  );
}
