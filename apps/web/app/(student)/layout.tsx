import { ThemeScope } from "@kidlearn/ui";
import type { ReactNode } from "react";
import { ActiveChildProvider } from "@/features/children/active-child";
import { ParentCorner } from "@/features/student/ParentCorner";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeScope
      theme="kid"
      className="relative flex min-h-dvh flex-1 flex-col bg-background text-foreground pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <ActiveChildProvider>
        <ParentCorner />
        {children}
      </ActiveChildProvider>
    </ThemeScope>
  );
}
