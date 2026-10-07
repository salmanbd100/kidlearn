"use client";

import { type ReactNode, useId } from "react";
import { useSiteTranslation } from "../use-site-translation";
import { ArrowMarkerContext } from "./arrow-marker-context";

// Text and strokes are `currentColor`, so the high-contrast preference reaches them; brand hues only fill accents.
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
  const { t } = useSiteTranslation();
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
