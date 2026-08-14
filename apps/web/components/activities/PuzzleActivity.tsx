"use client";

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type {
  PuzzleActivity as PuzzleDefinition,
  PuzzleSlot,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import {
  evaluatePiecePlacement,
  puzzleIndexOfId,
  puzzlePieceId,
  puzzleSlotId,
} from "./evaluate";
import type { ActivityRendererProps } from "./registry";
import { useActivitySensors } from "./use-activity-sensors";
import { usePuzzleState } from "./use-puzzle-state";
import { isWiggling, type WiggleRequest } from "./use-wiggle";

/**
 * Build the picture (FR-ACT-04).
 *
 * **The board shows the answer, faintly.** A ghost of the whole image sits under
 * the empty cells, because a three-year-old holding a piece of an elephant's ear
 * has no way to work out where an ear goes from an empty grid. The puzzle is the
 * placing, not the guessing.
 *
 * **Nothing is cut up.** Each piece is the same image with `background-size` and
 * `background-position` shifted, so a payload needs one asset rather than nine and
 * the server never slices anything. It is also why the art is a CSS background
 * rather than `next/image`: cropping is the whole technique, and the ghost uses
 * the same background so the browser fetches the file once.
 *
 * **Wrong is quiet.** A piece pushed into the wrong space glides back to the tray
 * on its own (the drag overlay's drop animation; nothing here persists a
 * transform) and wiggles for 400ms while an encouraging voice plays — no counter,
 * no cross, no ceiling on attempts (FR-ACT-05).
 */

const pieceVariants = cva(
  // `touch-action: manipulation` and not `none`: the touch sensor activates on a
  // 100ms hold, so the browser can keep owning scroll gestures that start on a
  // piece — which matters most here, where the tray is the thing that scrolls.
  "size-20 shrink-0 cursor-grab rounded-md [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      isDragging: {
        // The gap the piece left behind, so a child who is mid-drag can still see
        // where it came from — the moving copy is the `DragOverlay` below.
        true: "cursor-grabbing opacity-30",
        false: "shadow-md",
      },
    },
    defaultVariants: { isDragging: false },
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

/**
 * The crop of `image` that belongs at this cell, as background properties.
 *
 * `cols - 1` and `rows - 1` are safe divisors: the schema floors both at 2. The
 * percentages are positions in the *scaled* background, which is why the first
 * column is 0% and the last is 100% rather than the intuitive `col / cols`.
 */
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
  const { filled, isComplete, wiggle, handleDragEnd, skipShine } =
    usePuzzleState(definition, feedback, onActivityComplete);

  // Counted from one wherever a number is spoken or read out: slot indexes are
  // an implementation detail of the payload, and "piece 0" is not a thing a child
  // can be asked to find.
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

  // Which piece is in the child's hand, so the overlay can draw a copy of it.
  const [draggingIndex, setDraggingIndex] = useState<number | undefined>(
    undefined,
  );
  const draggingSlot = definition.slots.find(
    (slot) => slot.index === draggingIndex,
  );

  const handleDragFinished = useCallback(
    (event: DragEndEvent) => {
      setDraggingIndex(undefined);
      handleDragEnd(event);
    },
    [handleDragEnd],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) =>
        setDraggingIndex(puzzleIndexOfId(String(active.id)))
      }
      onDragEnd={handleDragFinished}
      onDragCancel={() => setDraggingIndex(undefined)}
      // dnd-kit's own live-region copy is English; every string a child's device
      // reads out has to come through i18next like any other (FR-I18N-01).
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("activity.dnd.instructions") },
      }}
    >
      <div
        data-testid="activity-puzzle"
        // Portrait stacks — picture above, tray under the thumb. Landscape puts
        // them side by side, where vertical space is the scarce thing (design.md §6).
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

        <div
          data-complete={isComplete}
          // Capped on both axes, not just width. A 2×4 grid in portrait or any
          // square grid in landscape is taller than the space it has, and the
          // board is the one thing a child must be able to see whole — scrolling
          // to find the rest of the puzzle is not a working screen (design.md §6).
          // When the height cap binds the ratio gives: the cells are `1fr` and the
          // crops are percentages, so the picture stretches but still tiles exactly.
          className="relative max-h-[60dvh] w-full max-w-sm shrink-0 overflow-hidden rounded-lg landscape:max-w-[min(24rem,50vw)]"
          // The board's shape is the grid's, not the artwork's: square cells are
          // what make a piece a square crop, and the payload carries no intrinsic
          // dimensions to fit instead.
          style={{
            aspectRatio: `${definition.grid.cols} / ${definition.grid.rows}`,
          }}
        >
          {/*
            The answer, faint enough to be a hint rather than the picture. Purely
            decorative — the board above carries the accessible name.
          */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url(${definition.image.url})`,
              backgroundSize: "100% 100%",
            }}
          />

          {/*
            A labelled list of spaces, not a labelled `div`: it is what the board
            actually is, and it is what tells a screen-reader user how many spaces
            there are — the sighted child's "three left to go" made audible. The
            picture's own alt text names it, because "where the pieces go" says
            nothing about which picture is being built.
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
                label={slotLabel(slot.index)}
              />
            ))}
          </ul>

          {/*
            The "look what you made" pass of light. A gradient sweep is the one
            place a raw colour is unavoidable — `foreground`/`background` tokens
            are opaque, and what this needs is white light at low alpha over the
            child's own picture; design.md §2.2 allows it as decorative game art.
            Transform and opacity only (design.md §5.2).

            A button rather than a decorated `div`, for the same reason the
            engine's own celebration is one: §5.2 requires a celebration be
            dismissible, and a child already reaching for the next thing should
            not be held by a picture they have finished looking at.
          */}
          {isComplete ? (
            <button
              type="button"
              data-testid="puzzle-shine"
              aria-label={t("activity.skip")}
              className="absolute inset-0 bg-[linear-gradient(105deg,transparent_35%,rgb(255_255_255/0.65)_50%,transparent_65%)] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-inset motion-safe:animate-shine"
              onClick={skipShine}
            />
          ) : null}
        </div>

        <ul
          aria-label={t("activity.puzzle.tray")}
          // Scrolls along its own axis rather than pushing the board off-screen:
          // nine pieces at 80px is 720px, longer than any phone either way.
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
              />
            </li>
          ))}
        </ul>
      </div>

      {/*
        The piece the child is actually moving, drawn in a portal on `body`.

        This is not a nicety: both the tray and the step around it scroll, and a
        scroll container clips its own children — so a piece dragged out of the
        tray towards the board would be sliced off at the tray's edge. The overlay
        is outside both. It also brings dnd-kit's own snap-back for a wrong drop,
        which is exactly the movement FR-ACT-05 asks for, stilled for a child who
        asked for stillness (design.md §5.2).
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
}: {
  slot: PuzzleSlot;
  definition: PuzzleDefinition;
  label: string;
  roleDescription: string;
  wiggle: WiggleRequest | undefined;
}) {
  // No `transform` read off this hook: the piece the child is moving is the
  // overlay copy, and translating this one as well would move two.
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
      className={cn(pieceVariants({ isDragging }))}
      {...listeners}
      {...attributes}
    >
      {/*
        The crop lives on this inner span, not on the button, so that keying it on
        the wiggle count restarts the keyframes without remounting the node dnd-kit
        holds a ref to. Re-applying an animation class that is already applied
        restarts nothing, and the second wrong drop of the same piece is the
        attempt that most needs the answer.
      */}
      <span
        key={wiggle?.count ?? 0}
        className={cn(
          "block size-full rounded-md",
          wiggle !== undefined && "motion-safe:animate-wiggle",
        )}
        style={cropStyle(definition.image.url, definition.grid, slot)}
      />
    </button>
  );
}

function PuzzleSlotCell({
  slot,
  definition,
  isFilled,
  label,
}: {
  slot: PuzzleSlot;
  definition: PuzzleDefinition;
  isFilled: boolean;
  label: string;
}) {
  // A filled slot stops being a target: the piece is locked in, and leaving it
  // droppable would let a second piece claim a cell that is already answered.
  const { setNodeRef, isOver } = useDroppable({
    id: puzzleSlotId(slot.index),
    disabled: isFilled,
  });

  const state = isFilled ? "filled" : isOver ? "over" : "empty";

  return (
    <li
      ref={setNodeRef}
      data-testid={`puzzle-slot-${slot.index}`}
      data-state={state}
      // A filled space is the picture again, not somewhere to put something: the
      // crop it shows is announced by the board's own name, so labelling it
      // "space 4" would tell a screen-reader user there is still a gap there.
      aria-label={isFilled ? undefined : label}
      className={cn(slotVariants({ state }))}
      style={{
        gridRow: slot.row + 1,
        gridColumn: slot.col + 1,
        ...(isFilled
          ? cropStyle(definition.image.url, definition.grid, slot)
          : undefined),
      }}
    />
  );
}
