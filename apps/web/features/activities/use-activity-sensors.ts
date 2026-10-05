"use client";

import {
  MouseSensor,
  type SensorDescriptor,
  type SensorOptions,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

/**
 * How a drag starts on a kid surface. Shared by every dnd-kit activity so the
 * gesture a child learns in one game is the gesture in the next.
 *
 * Pointer and touch only. The keyboard and screen-reader path is tap-to-place
 * (`useTapToPlace`): dnd-kit's `KeyboardSensor` claims Enter and Space on the
 * same card, and its arrow keys move 25px at a time across a board that is
 * hundreds wide.
 */
export function useActivitySensors(): SensorDescriptor<SensorOptions>[] {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 8 },
    }),
  );
}
