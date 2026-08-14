"use client";

import {
  KeyboardSensor,
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
 * **Mouse and touch are separate sensors on purpose.** A single pointer sensor
 * would apply one activation rule to both, and the two need opposite ones: a
 * mouse should start dragging almost immediately (4px), while a finger resting on
 * a card must not — hence the 100ms hold with an 8px tolerance, which is what lets
 * a three-year-old tap, scroll and mis-touch without launching a drag.
 *
 * The keyboard sensor is not optional: a drag is the only way to answer these
 * activities, so without it they are unanswerable without a pointer (NFR-A11Y-06).
 */
export function useActivitySensors(): SensorDescriptor<SensorOptions>[] {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
}
