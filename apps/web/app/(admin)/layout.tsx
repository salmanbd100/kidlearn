import { ThemeScope } from "@kidlearn/ui";
import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

// Here, not the root layout: nothing outside the CMS sets monospace.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeScope
      theme="parent"
      // From `md` up the shell is one viewport tall and the content pane scrolls; below `md` the page scrolls normally.
      // `--family-mono` is redeclared because `:root` resolved it while `--font-jetbrains-mono` was undefined.
      className={`${jetbrainsMono.variable} [--family-mono:var(--font-jetbrains-mono)] flex min-h-dvh flex-col bg-background font-ui text-foreground md:h-dvh md:overflow-hidden`}
    >
      {/* Safety net for shell-less pages (login) that own their height and must scroll on a short window. */}
      <div className="flex w-full flex-1 flex-col md:min-h-0 md:overflow-y-auto">
        {children}
      </div>
    </ThemeScope>
  );
}
