"use client";

import { useSiteTranslation } from "../use-site-translation";

export function DiagramLabel({
  x,
  y,
  labelKey,
  anchor = "start",
}: {
  x: number;
  y: number;
  labelKey: string;
  anchor?: "start" | "middle" | "end";
}) {
  const { t } = useSiteTranslation();

  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill="currentColor"
      fontSize={12.5}
      fontStyle="italic"
    >
      {t(labelKey)}
    </text>
  );
}
