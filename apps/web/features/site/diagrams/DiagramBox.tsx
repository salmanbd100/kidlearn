"use client";

import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { useSiteTranslation } from "../use-site-translation";

const boxVariants = cva("stroke-current", {
  variants: {
    tone: {
      plain: "fill-background",
      sky: "fill-sky/25",
      sunshine: "fill-sunshine/60",
      mint: "fill-mint/45",
      coral: "fill-coral/30",
    },
  },
  defaultVariants: { tone: "plain" },
});

export function DiagramBox({
  x,
  y,
  width,
  height = 54,
  labelKey,
  captionKey,
  tone,
  isPlanned = false,
}: VariantProps<typeof boxVariants> & {
  x: number;
  y: number;
  width: number;
  height?: number;
  labelKey: string;
  captionKey?: string;
  /** Not built yet — drawn dashed. */
  isPlanned?: boolean;
}) {
  const { t } = useSiteTranslation();
  const centre = x + width / 2;
  const hasCaption = captionKey !== undefined;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        strokeWidth={1.5}
        strokeDasharray={isPlanned ? "5 4" : undefined}
        className={cn(boxVariants({ tone }))}
      />
      <text
        x={centre}
        y={hasCaption ? y + height / 2 - 4 : y + height / 2 + 5}
        textAnchor="middle"
        fill="currentColor"
        fontSize={15}
        fontWeight={700}
      >
        {t(labelKey)}
      </text>
      {hasCaption ? (
        <text
          x={centre}
          y={y + height / 2 + 15}
          textAnchor="middle"
          fill="currentColor"
          fontSize={12.5}
        >
          {t(captionKey)}
        </text>
      ) : null}
    </g>
  );
}
