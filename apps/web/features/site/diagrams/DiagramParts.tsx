"use client";

import { SITE_NAMESPACE } from "@kidlearn/i18n";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import { createContext, type ReactNode, useContext, useId } from "react";
import { useTranslation } from "react-i18next";

// Text and strokes are `currentColor`, so the high-contrast preference reaches them; brand hues only fill accents.
const ArrowMarkerContext = createContext("");

export function DiagramFrame({
  titleKey,
  captionKey,
  viewBox,
  children,
}: {
  titleKey: string;
  captionKey: string;
  viewBox: string;
  children: ReactNode;
}) {
  const { t } = useTranslation(SITE_NAMESPACE);
  const id = useId();
  const titleId = `${id}-title`;
  const markerId = `${id}-arrow`;

  return (
    <figure className="flex flex-col gap-3">
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={viewBox}
        className="h-auto w-full max-w-xl text-foreground"
      >
        <title id={titleId}>{t(titleKey)}</title>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 Z" fill="currentColor" />
          </marker>
        </defs>
        <ArrowMarkerContext.Provider value={markerId}>
          {children}
        </ArrowMarkerContext.Provider>
      </svg>
      <figcaption className="text-lg text-muted-foreground">
        {t(captionKey)}
      </figcaption>
    </figure>
  );
}

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
  const { t } = useTranslation(SITE_NAMESPACE);
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
  const { t } = useTranslation(SITE_NAMESPACE);

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
