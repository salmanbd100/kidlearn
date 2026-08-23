import type { ReactNode } from "react";
import { AdminGuard } from "../AdminGuard";
import { AdminShell } from "../AdminShell";
import { AdminSessionProvider } from "../context/admin-session";

/**
 * The CMS shell (FR-CMS-01), inside file 13's `(admin)` group.
 *
 * `(admin)/layout.tsx` already owns the theme boundary, the `font-ui` choice and
 * the wide container; this layout adds only what the six sections need — the
 * session, the guard, and the sidebar frame. Splitting them that way keeps a future
 * `(admin)` page outside `/admin` (there is none yet) from inheriting a sidebar it
 * has no items in.
 *
 * Stays a Server Component. The three things below it that need browser state are
 * client components in their own files, and `children` passes through as a slot, so
 * no page is forced client by sitting here.
 */
export default function AdminCmsLayout({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <AdminGuard>
        <AdminShell>{children}</AdminShell>
      </AdminGuard>
    </AdminSessionProvider>
  );
}
