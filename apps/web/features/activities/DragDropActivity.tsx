"use client";

import {
  type Announcements,
  DndContext,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import type {
  ActivityItem,
  DragDropActivity as DragDropDefinition,
  DropTarget as DropTargetDefinition,
  ImageAssetRef,
  Locale,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import Image from "next/image";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusMark } from "@/shared/components/kid/StatusMark";
import { evaluateDrop, groupItemsByTarget } from "./evaluate";
import type { ActivityRendererProps } from "./registry";
import { useActivitySensors } from "./use-activity-sensors";
import { usePlacementState } from "./use-placement-state";
import { centreOfElement, useTapToPlace } from "./use-tap-to-place";
import { isWiggling, type WiggleRequest } from "./use-wiggle";

const itemCardVariants = cva(
  // `touch-action: manipulation`, not `none`: the touch sensor activates on a 100ms hold, so scroll
  // gestures stay with the browser.
  "relative flex size-24 shrink-0 cursor-grab flex-col items-center justify-center gap-1 rounded-lg border-2 bg-card p-2 text-card-foreground touch-manipulation focus-ring",
  {
    variants: {
      state: {
        dragging: "z-30 cursor-grabbing border-primary shadow-pop",
        selected: "border-primary shadow-pop motion-safe:scale-105",
        idle: "border-border shadow-md",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

const dropTargetVariants = cva(
  "flex min-h-28 min-w-28 flex-col items-center justify-center gap-2 rounded-xl border-4 p-3 text-center transition-colors touch-manipulation focus-ring",
  {
    variants: {
      state: {
        empty: "border-dashed border-border bg-muted/40",
        over: "border-dashed border-primary bg-primary/10",
        filled: "border-success bg-success/10",
      },
    },
    defaultVariants: { state: "empty" },
  },
);

const IMAGE_PX = 96;

const EMPTY_ITEMS: readonly ActivityItem[] = [];

export function DragDropActivity({
  definition,
  locale,
  feedback,
  onActivityComplete,
}: ActivityRendererProps<DragDropDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { placed, wiggle, handleDragEnd, place } = usePlacementState(
    definition,
    feedback,
    onActivityComplete,
  );
  const { selectedId, toggle, placeOn, dragHandlers } = useTapToPlace(place);

  const sensors = useActivitySensors();

  const itemById = useMemo(
    () => new Map(definition.items.map((item) => [item.id, item])),
    [definition],
  );
  const targetById = useMemo(
    () => new Map(definition.targets.map((target) => [target.id, target])),
    [definition],
  );

  const itemsByTargetId = useMemo(
    () => groupItemsByTarget(definition, placed),
    [definition, placed],
  );

  const announcements = useMemo<Announcements>(() => {
    const itemLabel = (id: string) => itemById.get(id)?.label[locale] ?? id;
    const targetLabel = (id: string) => targetById.get(id)?.label[locale] ?? id;

    return {
      onDragStart: ({ active }) =>
        t("activity.dnd.pickedUp", { item: itemLabel(String(active.id)) }),
      onDragOver: ({ active, over }) =>
        over === null
          ? undefined
          : t("activity.dnd.over", {
              item: itemLabel(String(active.id)),
              target: targetLabel(String(over.id)),
            }),
      onDragEnd: ({ active, over }) => {
        const item = itemLabel(String(active.id));
        if (
          over !== null &&
          evaluateDrop(definition, String(active.id), String(over.id))
        ) {
          return t("activity.dnd.dropped", {
            item,
            target: targetLabel(String(over.id)),
          });
        }
        return t("activity.dnd.cancelled", { item });
      },
      onDragCancel: ({ active }) =>
        t("activity.dnd.cancelled", { item: itemLabel(String(active.id)) }),
    };
  }, [t, locale, definition, itemById, targetById]);

  const trayItems = definition.items.filter((item) => !(item.id in placed));
  const selectedLabel =
    selectedId === undefined
      ? undefined
      : itemById.get(selectedId)?.label[locale];

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
        screenReaderInstructions: { draggable: t("activity.dnd.instructions") },
      }}
    >
      <div
        data-testid="activity-drag-drop"
        // Portrait stacks targets above the tray; landscape goes side by side to save vertical
        // space (design.md §6).
        className="flex flex-1 flex-col items-center justify-center gap-6 landscape:flex-row landscape:items-center"
      >
        <span role="status" className="sr-only">
          {selectedLabel === undefined
            ? ""
            : t("activity.dnd.picked", { item: selectedLabel })}
        </span>

        {/* Labelled lists so screen readers announce how many of each remain. */}
        <ul
          aria-label={t("activity.targets")}
          className="flex flex-wrap items-center justify-center gap-4 landscape:flex-1"
        >
          {definition.targets.map((target) => (
            <li key={target.id} className="flex">
              <DropZone
                target={target}
                locale={locale}
                placedItems={itemsByTargetId.get(target.id) ?? EMPTY_ITEMS}
                isInviting={selectedId !== undefined}
                onTap={(anchor) => placeOn(target.id, anchor)}
              />
            </li>
          ))}
        </ul>

        {/*
          Two cards wide in landscape: six items in one column is taller than a sideways phone.
        */}
        <ul
          aria-label={t("activity.tray")}
          className="flex flex-wrap items-center justify-center gap-4 landscape:max-w-56"
        >
          {trayItems.map((item) => (
            <li key={item.id} className="flex">
              <DraggableItem
                item={item}
                locale={locale}
                roleDescription={t("activity.dnd.roleDescription")}
                wiggle={isWiggling(wiggle, item.id) ? wiggle : undefined}
                isSelected={selectedId === item.id}
                onTap={() => toggle(item.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </DndContext>
  );
}

function DraggableItem({
  item,
  locale,
  roleDescription,
  wiggle,
  isSelected,
  onTap,
}: {
  item: ActivityItem;
  locale: Locale;
  roleDescription: string;
  wiggle: WiggleRequest | undefined;
  isSelected: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id, attributes: { roleDescription } });
  const state = isDragging ? "dragging" : isSelected ? "selected" : "idle";

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`activity-item-${item.id}`}
      data-state={state}
      className={cn(itemCardVariants({ state }))}
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
      {/*
        Keyed on the wiggle count: re-applying an already-applied animation class restarts nothing.
      */}
      <span
        key={wiggle?.count ?? 0}
        className={cn(
          "flex flex-col items-center justify-center gap-1",
          wiggle !== undefined && "motion-safe:animate-wiggle",
        )}
      >
        <ItemArt image={item.image} locale={locale} className="size-10" />
        <span className="font-display text-lg leading-tight">
          {item.label[locale]}
        </span>
      </span>
      {wiggle === undefined ? null : <StatusMark tone="retry" />}
    </button>
  );
}

function DropZone({
  target,
  locale,
  placedItems,
  isInviting,
  onTap,
}: {
  target: DropTargetDefinition;
  locale: Locale;
  placedItems: readonly ActivityItem[];
  isInviting: boolean;
  onTap: (anchor: { x: number; y: number }) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: target.id });
  const state =
    placedItems.length > 0 ? "filled" : isOver || isInviting ? "over" : "empty";

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`activity-target-${target.id}`}
      data-state={state}
      className={cn(dropTargetVariants({ state }))}
      onClick={(event) => onTap(centreOfElement(event.currentTarget))}
    >
      <ItemArt image={target.image} locale={locale} className="size-12" />
      <span className="font-display text-lg leading-tight text-foreground">
        {target.label[locale]}
      </span>

      {placedItems.length === 0 ? null : (
        // Locked-in answers: not buttons, not draggable. Wraps because a target may hold several.
        <span className="flex flex-wrap items-center justify-center gap-1">
          {placedItems.map((placedItem) => (
            <span
              key={placedItem.id}
              data-testid={`activity-placed-${placedItem.id}`}
              className="flex flex-col items-center gap-1 rounded-lg bg-card px-2 py-1 shadow-sm"
            >
              <ItemArt
                image={placedItem.image}
                locale={locale}
                className="size-8"
              />
              <span className="font-display text-lg leading-tight text-card-foreground">
                {placedItem.label[locale]}
              </span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/** `alt=""`: the label is shown as text too, so the picture would only repeat it (design.md §7). */
function ItemArt({
  image,
  locale,
  className,
}: {
  image: ImageAssetRef | undefined;
  locale: Locale;
  className: string;
}) {
  if (image === undefined) return null;

  return (
    <Image
      src={image.url}
      alt=""
      title={image.alt?.[locale]}
      width={IMAGE_PX}
      height={IMAGE_PX}
      className={cn("w-auto object-contain", className)}
    />
  );
}
