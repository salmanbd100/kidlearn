import type { ReactNode } from "react";
import { AdminGuard } from "@/app/(admin)/AdminGuard";
import { AdminShell } from "@/app/(admin)/AdminShell";
import { AdminSessionProvider } from "@/app/(admin)/context/admin-session";

export default function AdminCmsLayout({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <AdminGuard>
        <AdminShell>{children}</AdminShell>
      </AdminGuard>
    </AdminSessionProvider>
  );
}
