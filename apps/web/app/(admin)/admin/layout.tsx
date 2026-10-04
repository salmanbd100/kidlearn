import type { ReactNode } from "react";
import { AdminGuard } from "@/app/(admin)/AdminGuard";
import { AdminShell } from "@/app/(admin)/AdminShell";
import { AdminSessionProvider } from "@/app/(admin)/context/admin-session";

/** The CMS shell (FR-CMS-01), inside file 13's `(admin)` group. */
export default function AdminCmsLayout({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <AdminGuard>
        <AdminShell>{children}</AdminShell>
      </AdminGuard>
    </AdminSessionProvider>
  );
}
