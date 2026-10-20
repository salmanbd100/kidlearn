import type { ReactNode } from "react";
import { GUIDE_SECTIONS, type GuideSectionId } from "./guide-sections";

export interface GuideSectionProps {
  id: GuideSectionId;
  lead: ReactNode;
  children: ReactNode;
}

export function GuideSection({ id, lead, children }: GuideSectionProps) {
  const index = GUIDE_SECTIONS.findIndex((section) => section.id === id);
  const title = GUIDE_SECTIONS[index].title;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-6 flex-col gap-5 border-border border-t pt-10 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-primary text-xs">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2
          id={`${id}-title`}
          className="font-semibold text-foreground text-xl tracking-tight"
        >
          {title}
        </h2>
        <p className="max-w-prose text-muted-foreground text-sm">{lead}</p>
      </div>
      {children}
    </section>
  );
}
