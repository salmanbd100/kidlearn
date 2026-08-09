import type { ReactNode } from "react";
import { ParentCorner } from "@/components/student/ParentCorner";
import { ActiveChildProvider } from "@/lib/active-child";

/**
 * Student Portal shell — ages 3–5.
 *
 * Full-bleed and immersive: no nav chrome, no header, nothing between the child
 * and the one thing on screen (design.md §6). `data-theme="kid"` here is the
 * only place the kid palette is selected; components read tokens and never
 * branch on theme.
 *
 * Two things are hoisted to this boundary rather than repeated per screen.
 * `ActiveChildProvider` loads who is playing once, so no two screens can disagree
 * about it. `ParentCorner` is the single way out of the portal (Pillar C) —
 * present on every student screen by construction, absolutely positioned in a top
 * corner, well clear of the thumb zone the rest of the surface uses.
 */
export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="kid"
      className="relative flex min-h-dvh flex-1 flex-col bg-background text-foreground pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <ActiveChildProvider>
        <ParentCorner />
        {children}
      </ActiveChildProvider>
    </div>
  );
}
