"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The way to answer a drag activity without dragging: tap a card, then tap where
 * it goes. It is also the keyboard path — Enter on a button is a click — and the
 * VoiceOver path, whose double-tap is a click too, so dnd-kit's arrow-key sensor
 * is not mounted at all: two keyboard models on one card would collide on Enter.
 */

export interface TapToPlace {
  selectedId: string | undefined;
  /** Picks a card up, or puts it back down when it is already in hand. */
  toggle: (id: string) => void;
  /** Places whatever is in hand here. A no-op with nothing in hand. */
  placeOn: (targetId: string, anchor?: { x: number; y: number }) => void;
  /** Spread onto `DndContext`, so a real drag and a tap cannot cross. */
  dragHandlers: { onDragStart: () => void; onDragEnd: () => void };
}

export function useTapToPlace(
  place: (
    itemId: string,
    targetId: string,
    anchor?: { x: number; y: number },
  ) => void,
): TapToPlace {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // A mouse drag ends with a click on the card that moved — it travels under
  // the pointer — which would pick the card up the moment it was let go. That
  // click is dispatched in the same task as the mouseup that ends the drag, so a
  // flag cleared on the next task swallows exactly it.
  const isSwallowingClick = useRef(false);
  const swallowTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(swallowTimer.current), []);

  const toggle = useCallback((id: string) => {
    if (isSwallowingClick.current) return;
    setSelectedId((current) => (current === id ? undefined : id));
  }, []);

  const placeOn = useCallback(
    (targetId: string, anchor?: { x: number; y: number }) => {
      if (selectedId === undefined) return;
      setSelectedId(undefined);
      place(selectedId, targetId, anchor);
    },
    [selectedId, place],
  );

  const dragHandlers = useMemo(
    () => ({
      // Whatever was in hand is not what is moving now.
      onDragStart: () => setSelectedId(undefined),
      onDragEnd: () => {
        isSwallowingClick.current = true;
        window.clearTimeout(swallowTimer.current);
        swallowTimer.current = window.setTimeout(() => {
          isSwallowingClick.current = false;
        }, 0);
      },
    }),
    [],
  );

  return { selectedId, toggle, placeOn, dragHandlers };
}

/** The centre of an element, for the confetti to burst from. */
export function centreOfElement(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
