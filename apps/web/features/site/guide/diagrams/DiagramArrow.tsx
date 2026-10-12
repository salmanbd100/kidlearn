import { useContext } from "react";
import { ArrowMarkerContext } from "./arrow-marker-context";

export function DiagramArrow({
  d,
  isPlanned = false,
}: {
  /** SVG path data; the arrowhead sits on its last point. */
  d: string;
  isPlanned?: boolean;
}) {
  const markerId = useContext(ArrowMarkerContext);

  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeDasharray={isPlanned ? "5 4" : undefined}
      markerEnd={`url(#${markerId})`}
    />
  );
}
