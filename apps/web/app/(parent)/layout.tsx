import type { ReactNode } from "react";
import { ParentTopBar } from "@/components/parent/ParentTopBar";
import { ParentSessionProvider } from "./context/parent-session";
import { ParentGuard } from "./ParentGuard";

/** Parent Dashboard shell — PIN-gated, calm, dense (design.md §2.2, §6). */
export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="parent"
      className="flex min-h-dvh flex-1 flex-col bg-background font-ui text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
        <ParentSessionProvider>
          <ParentTopBar />
          <ParentGuard>{children}</ParentGuard>
        </ParentSessionProvider>
      </div>
    </div>
  );
}
