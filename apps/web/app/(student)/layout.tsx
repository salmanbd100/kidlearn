import type { ReactNode } from "react";
import { ActiveChildProvider } from "@/features/children/active-child";
import { ParentCorner } from "@/features/student/ParentCorner";

/** Student Portal shell — ages 3–5. */
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
