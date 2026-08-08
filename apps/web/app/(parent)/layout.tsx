import type { ReactNode } from "react";

/**
 * Parent Dashboard shell — PIN-gated, calm, dense (design.md §2.2, §6).
 *
 * A centred app-shell container rather than the kid surface's full bleed:
 * parents must be able to manage the whole account from a phone, so the content
 * column is fluid up to a readable maximum.
 */
export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="parent"
      className="flex min-h-dvh flex-1 flex-col bg-background font-ui text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
        {children}
      </div>
    </div>
  );
}
