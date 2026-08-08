import type { ReactNode } from "react";

/**
 * Student Portal shell — ages 3–5.
 *
 * Full-bleed and immersive: no nav chrome, no header, nothing between the child
 * and the one thing on screen (design.md §6). `data-theme="kid"` here is the
 * only place the kid palette is selected; components read tokens and never
 * branch on theme.
 */
export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="kid"
      className="flex min-h-dvh flex-1 flex-col bg-background text-foreground pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      {children}
    </div>
  );
}
