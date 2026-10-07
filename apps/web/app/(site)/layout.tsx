import { ThemeScope } from "@kidlearn/ui";
import type { ReactNode } from "react";
import { SiteFooter } from "@/features/site/SiteFooter";
import { SiteHeader } from "@/features/site/SiteHeader";

// Public and unauthenticated. Kid-themed, but not the Student Portal: it carries external links (NFR-SAFE-07).
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeScope
      theme="kid"
      className="flex min-h-dvh flex-1 flex-col bg-background text-foreground pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-8 sm:px-8 md:pt-16">
        {children}
      </main>
      <SiteFooter />
    </ThemeScope>
  );
}
