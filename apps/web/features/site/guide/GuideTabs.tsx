"use client";

import { cn } from "@kidlearn/ui";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { useSiteTranslation } from "../use-site-translation";

export interface GuideTab {
  id: string;
  labelKey: string;
  content: ReactNode;
}

const STEP: Partial<Record<string, (index: number, count: number) => number>> =
  {
    ArrowRight: (index, count) => (index + 1) % count,
    ArrowLeft: (index, count) => (index - 1 + count) % count,
    Home: () => 0,
    End: (_, count) => count - 1,
  };

/**
 * Related topics within one guide section, one shown at a time. Every panel stays in the DOM
 * (`hidden`, not unmounted) so the whole guide is in the page for search engines and find-in-page.
 */
export function GuideTabs({
  id,
  labelledBy,
  tabs,
}: {
  id: string;
  labelledBy: string;
  tabs: readonly GuideTab[];
}) {
  const { t } = useSiteTranslation();
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = step(index, tabs.length);
    setSelected(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-labelledby={labelledBy}
        // Wraps rather than scrolls, so a phone never gets a sideways-scrolling strip of hidden tabs.
        className="flex flex-wrap gap-1.5 rounded-(--radius) bg-muted p-1.5"
      >
        {tabs.map((tab, index) => {
          const isSelected = index === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`${id}-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "focus-ring min-h-11 rounded-(--radius) px-4 text-base transition-colors",
                isSelected
                  ? "bg-card font-bold text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${id}-panel-${tab.id}`}
          aria-labelledby={`${id}-tab-${tab.id}`}
          hidden={index !== selected}
          className="flex flex-col gap-5"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
