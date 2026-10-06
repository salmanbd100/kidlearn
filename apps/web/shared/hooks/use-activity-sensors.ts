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
 * Pointer and touch only. The keyboard path is tap-to-place (`useTapToPlace`): dnd-kit's
 * `KeyboardSensor` claims Enter/Space on the same card and moves 25px per arrow press.
 */
export function useActivitySensors(): SensorDescriptor<SensorOptions>[] {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 8 },
    }),
  );
}
