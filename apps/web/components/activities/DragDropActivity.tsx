"use client";

import {
  type Announcements,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { evaluateDrop } from "./evaluate";
import type { ActivityRendererProps } from "./registry";
import { usePlacementState, type WiggleRequest } from "./use-placement-state";

/**
 * Put each thing where it belongs (FR-ACT-01).
 *
 * **The tray empties into the targets.** A card the child gets right is removed
 * from the tray and redrawn inside the target it belongs to, which is why there
 * is no "disabled draggable" state anywhere below: a placed item is no longer a
 * thing that can be picked up, so it stops being one. What is left in the tray is
 * exactly what is left to do — the progress indicator a pre-reader can read.
 *
 * **Wrong is quiet.** A card dropped on the wrong target snaps back on its own
 * (dnd-kit discards the transform; nothing here persists one) and wiggles for
 * 400ms while an encouraging voice plays. There is no counter, no cross, and no
 * ceiling on attempts (FR-ACT-05).
 *
 * **Mouse and touch are separate sensors on purpose.** A single pointer sensor
 * would apply one activation rule to both, and the two need opposite ones: a
 * mouse should start dragging almost immediately (4px), while a finger resting
 * on a card must not — hence the 100ms hold with an 8px tolerance, which is what
 * lets a three-year-old tap, scroll and mis-touch without launching a drag.
 */

const itemCardVariants = cva(
  // `touch-action: manipulation` and not `none`: the touch sensor activates on a
  // 100ms hold, so the browser can keep owning scroll gestures that start here.
  "flex size-24 shrink-0 cursor-grab flex-col items-center justify-center gap-1 rounded-lg border-2 bg-card p-2 text-card-foreground [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      isDragging: {
        true: "z-30 cursor-grabbing border-primary shadow-pop",
        false: "border-border shadow-md",
      },
    },
    defaultVariants: { isDragging: false },
  },
);

const dropTargetVariants = cva(
  "flex min-h-28 min-w-28 flex-col items-center justify-center gap-2 rounded-xl border-4 p-3 text-center transition-colors",
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

export function DragDropActivity({
  definition,
  locale,
  feedback,
  onActivityComplete,
}: ActivityRendererProps<DragDropDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { placed, wiggle, handleDragEnd } = usePlacementState(
    definition,
    feedback,
    onActivityComplete,
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const itemById = useMemo(
    () => new Map(definition.items.map((item) => [item.id, item])),
    [definition],
  );
  const targetById = useMemo(
    () => new Map(definition.targets.map((target) => [target.id, target])),
    [definition],
  );

  /** Which item is sitting in each target, so a target can draw its own answer. */
  const itemByTargetId = useMemo(() => {
    const byTarget = new Map<string, ActivityItem>();
    for (const [itemId, targetId] of Object.entries(placed)) {
      const item = itemById.get(itemId);
      if (item !== undefined) byTarget.set(targetId, item);
    }
    return byTarget;
  }, [placed, itemById]);

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

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      // dnd-kit's own live-region copy is English; every string a child's device
      // reads out has to come through i18next like any other (FR-I18N-01).
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("activity.dnd.instructions") },
      }}
    >
      <div
        data-testid="activity-drag-drop"
        // Portrait stacks — targets above, tray under the thumb. Landscape puts
        // them side by side, where vertical space is the scarce thing (design.md §6).
        className="flex flex-1 flex-col items-center justify-center gap-6 landscape:flex-row landscape:items-center"
      >
        {/*
          Two labelled lists rather than two labelled `div`s. It is what the
          board actually is — a set of places and a set of things left to move —
          and it is what tells a screen-reader user how many of each there are,
          which is the sighted child's "three cards left" made audible.
        */}
        <ul
          aria-label={t("activity.targets")}
          className="flex flex-wrap items-center justify-center gap-4 landscape:flex-1"
        >
          {definition.targets.map((target) => (
            <li key={target.id} className="flex">
              <DropZone
                target={target}
                locale={locale}
                placedItem={itemByTargetId.get(target.id)}
              />
            </li>
          ))}
        </ul>

        {/*
          Capped at two cards wide in landscape rather than forced into a single
          column: six items down one side is taller than a phone held sideways,
          and a wrapping block beside the targets is the same shape at two items
          as at six.
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
                wiggle={wiggle?.itemId === item.id ? wiggle : undefined}
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
}: {
  item: ActivityItem;
  locale: Locale;
  roleDescription: string;
  wiggle: WiggleRequest | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id, attributes: { roleDescription } });

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`activity-item-${item.id}`}
      className={cn(itemCardVariants({ isDragging }))}
      // Written out rather than pulled from `@dnd-kit/utilities`: a translate is
      // the only transform this component ever applies, and `transform` is the
      // one property a drag may animate (design.md §5.2).
      style={{
        transform:
          transform === null
            ? undefined
            : `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }}
      {...listeners}
      {...attributes}
    >
      {/*
        Keyed on the wiggle count, not on whether one is running: re-applying an
        animation class that is already applied restarts nothing, and the second
        wrong drop of the same card is the attempt that most needs the answer.
        Remounting a plain span is free — the draggable node above is untouched,
        so dnd-kit never sees it happen.
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
    </button>
  );
}

function DropZone({
  target,
  locale,
  placedItem,
}: {
  target: DropTargetDefinition;
  locale: Locale;
  placedItem: ActivityItem | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: target.id });
  const state = placedItem !== undefined ? "filled" : isOver ? "over" : "empty";

  return (
    <div
      ref={setNodeRef}
      data-testid={`activity-target-${target.id}`}
      data-state={state}
      className={cn(dropTargetVariants({ state }))}
    >
      <ItemArt image={target.image} locale={locale} className="size-12" />
      <span className="font-display text-lg leading-tight text-foreground">
        {target.label[locale]}
      </span>

      {placedItem === undefined ? null : (
        // The answer, locked in. Not a button and not draggable: the child got it
        // right, and taking it back out again is not a move this activity has.
        <span
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
      )}
    </div>
  );
}

/**
 * `alt=""` throughout: every card shows its label as text as well, so the picture
 * repeats what is already announced rather than adding to it (design.md §7).
 * `locale` is still read, because a payload authored without art is normal and
 * the alt text is what the CMS reviewer sees when one is missing.
 */
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
