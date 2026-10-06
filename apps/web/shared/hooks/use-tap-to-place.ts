"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Also the keyboard and VoiceOver path (both produce a click), so dnd-kit's arrow-key sensor is not
 * mounted: two keyboard models on one card would collide on Enter.
 */

export interface TapToPlace {
  selectedId: string | undefined;
  toggle: (id: string) => void;
  placeOn: (targetId: string, anchor?: { x: number; y: number }) => void;
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

  // A mouse drag ends with a click on the moved card, which would pick it up on release. That click
  // shares a task with the mouseup, so a flag cleared next task swallows it.
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

export function centreOfElement(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
