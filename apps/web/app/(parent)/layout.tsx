import type { ReactNode } from "react";
import { ParentSessionProvider } from "./context/parent-session";
import { ParentGuard } from "./ParentGuard";

/**
 * Parent Dashboard shell — PIN-gated, calm, dense (design.md §2.2, §6).
 *
 * A centred app-shell container rather than the kid surface's full bleed:
 * parents must be able to manage the whole account from a phone, so the content
 * column is fluid up to a readable maximum.
 *
 * This stays a Server Component. The session it wraps everything in cannot be —
 * see the note in `context/parent-session.tsx` — but the theme boundary, the
 * layout, and the font choice are static, so only the two components that need
 * browser state are client ones. `children` passes straight through as a slot, so
 * a page is not forced client by sitting inside them.
 */
export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="parent"
      className="flex min-h-dvh flex-1 flex-col bg-background font-ui text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
        <ParentSessionProvider>
          <ParentGuard>{children}</ParentGuard>
        </ParentSessionProvider>
      </div>
    </div>
  );
}
