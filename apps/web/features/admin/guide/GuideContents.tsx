"use client";

import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { useEffect, useState } from "react";
import { GUIDE_SECTIONS, type GuideSectionId } from "./guide-sections";

const contentsLinkVariants = cva(
  cn(
    "flex min-h-11 items-center gap-2 rounded-(--radius) border-l-2 px-3 text-sm transition-colors",
    "focus-ring",
  ),
  {
    variants: {
      isActive: {
        true: "border-primary bg-primary/5 font-medium text-primary",
        false:
          "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: { isActive: false },
  },
);

/** The contents list; on wide screens it follows the reader and marks the section in view. */
export function GuideContents({ className }: { className?: string }) {
  const activeId = useSectionInView();

  return (
    <nav aria-label="On this page" className={className}>
      <p className="mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.05em]">
        On this page
      </p>
      <ol className="flex flex-col gap-0.5">
        {GUIDE_SECTIONS.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={activeId === section.id ? "location" : undefined}
              className={contentsLinkVariants({
                isActive: activeId === section.id,
              })}
            >
              <span className="font-mono text-xs opacity-70">
                {String(index + 1).padStart(2, "0")}
              </span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function useSectionInView(): GuideSectionId {
  const [activeId, setActiveId] = useState<GuideSectionId>(
    GUIDE_SECTIONS[0].id,
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        // Only elements found by a `GUIDE_SECTIONS` id are observed, so the id is one of them.
        if (visible) setActiveId(visible.target.id as GuideSectionId);
      },
      // A band near the top of the window: the section being read, not the next one peeking in.
      { rootMargin: "-15% 0px -70% 0px" },
    );

    for (const section of GUIDE_SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    // The admin guard renders the page only after the session check, so the
    // browser's own jump to `#section` found nothing to scroll to.
    const target = window.location.hash.slice(1);
    if (target) document.getElementById(target)?.scrollIntoView();

    return () => observer.disconnect();
  }, []);

  return activeId;
}
