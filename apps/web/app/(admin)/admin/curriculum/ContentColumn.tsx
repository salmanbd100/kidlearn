"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { ContentStatusValue } from "@kidlearn/types";
import { Button, cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { StatusChip } from "./StatusChip";

/**
 * One pane of the curriculum tree: a reorderable list of siblings (file 32).
 *
 * **Built on `@dnd-kit/core` alone, not `@dnd-kit/sortable`.** The sortable
 * package is not a dependency of this app and a list of at most a few dozen rows
 * does not need its layout animation machinery — `general.md §3` says reuse what
 * exists before adding. Each row is both a draggable and a droppable, and a drop
 * splices the dragged id in at the target's index.
 *
 * **Reordering is optimistic and then settled by the server.** The parent applies
 * the new order immediately so the list does not jump under the cursor, sends the
 * whole sibling set, and reverts if the write is refused — which it will be if
 * this tab's list is stale.
 *
 * **The drag lives on a handle, not on the row.** `KeyboardSensor` activates on
 * Space and Enter and calls `preventDefault()` before it does, so listeners on
 * the row button swallowed that button's own activation: pressing Enter on a
 * subject started a drag and never selected it, leaving the tree unusable
 * without a pointer (NFR-A11Y-06). A separate handle registered through
 * `setActivatorNodeRef` gives each gesture its own target — Enter on the row
 * selects, Enter on the handle picks up, arrows move, Enter drops.
 *
 * `onReorder` is absent for worlds, which carry no `sortOrder` column.
 */

export interface ColumnItem {
  id: string;
  label: string;
  status: ContentStatusValue;
}

export interface ContentColumnProps {
  title: string;
  items: ColumnItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onReorder?: (orderedIds: string[]) => void;
  /** Disabled with a reason, e.g. a lesson column with no topic chosen yet. */
  emptyHint: string;
  isDisabled?: boolean;
}

const contentRowVariants = cva(
  // 44px, the parent-surface minimum target (design.md §7).
  "flex min-h-11 w-full items-center gap-2 rounded-[var(--radius)] border px-2 py-1.5 transition-colors",
  {
    variants: {
      isSelected: {
        true: "border-primary bg-primary/10",
        false: "border-border hover:bg-muted",
      },
      state: {
        idle: "",
        dragging: "opacity-60",
        over: "border-primary",
      },
    },
    defaultVariants: { isSelected: false, state: "idle" },
  },
);

export function ContentColumn({
  title,
  items,
  selectedId,
  onSelect,
  onCreate,
  onReorder,
  emptyHint,
  isDisabled = false,
}: ContentColumnProps) {
  const sensors = useSensors(
    // Tighter than the kid surface's: this is a desktop CMS driven by a mouse,
    // and a hold-to-drag delay on a list an admin reorders repeatedly reads as
    // lag. The keyboard sensor is not optional — reordering must be reachable
    // without a pointer (NFR-A11Y-06).
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !onReorder || active.id === over.id) return;

    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from === -1 || to === -1) return;

    const next = items.map((item) => item.id);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-card-foreground text-sm">{title}</h2>
        <Button
          type="button"
          variant="outline"
          disabled={isDisabled}
          onClick={onCreate}
        >
          New
        </Button>
      </header>

      {items.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-xs">
          {emptyHint}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <ContentRow
                key={item.id}
                item={item}
                isSelected={item.id === selectedId}
                isDraggable={onReorder !== undefined}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </DndContext>
      )}
    </section>
  );
}

function ContentRow({
  item,
  isSelected,
  isDraggable,
  onSelect,
}: {
  item: ColumnItem;
  isSelected: boolean;
  isDraggable: boolean;
  onSelect: (id: string) => void;
}) {
  const draggable = useDraggable({ id: item.id, disabled: !isDraggable });
  const droppable = useDroppable({ id: item.id, disabled: !isDraggable });

  return (
    <li ref={droppable.setNodeRef}>
      <div
        ref={draggable.setNodeRef}
        // Only `transform` moves — no layout property is animated (design.md §5).
        style={
          draggable.transform
            ? {
                transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`,
              }
            : undefined
        }
        className={cn(
          contentRowVariants({
            isSelected,
            state: draggable.isDragging
              ? "dragging"
              : droppable.isOver
                ? "over"
                : "idle",
          }),
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          aria-current={isSelected ? "true" : undefined}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-[var(--radius)] px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <span className="min-w-0 truncate text-foreground text-sm">
            {item.label}
          </span>
          <StatusChip status={item.status} />
        </button>

        {/* Rendered only when the column reorders — dnd-kit's `attributes`
            always carry `aria-disabled`, so spreading them on a non-draggable
            row announced every world as dimmed while it stayed clickable. */}
        {isDraggable ? (
          <button
            type="button"
            ref={draggable.setActivatorNodeRef}
            aria-label={`Reorder ${item.label}`}
            className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            {...draggable.attributes}
            {...draggable.listeners}
          >
            <GripIcon />
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** Six dots — the conventional drag affordance. Decorative; the button names it. */
function GripIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="currentColor"
    >
      <circle cx="6" cy="3" r="1.4" />
      <circle cx="10" cy="3" r="1.4" />
      <circle cx="6" cy="8" r="1.4" />
      <circle cx="10" cy="8" r="1.4" />
      <circle cx="6" cy="13" r="1.4" />
      <circle cx="10" cy="13" r="1.4" />
    </svg>
  );
}
