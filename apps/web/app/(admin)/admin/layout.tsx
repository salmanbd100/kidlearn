import type { ReactNode } from "react";
import { AdminGuard } from "@/app/(admin)/AdminGuard";
import { AdminShell } from "@/app/(admin)/AdminShell";
import { AdminSessionProvider } from "@/app/(admin)/context/admin-session";
import { AiCapabilitiesProvider } from "@/app/(admin)/context/ai-capabilities";

export default function AdminCmsLayout({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <AdminGuard>
        {/* Inside the guard: the read needs the admin session the guard waits for. */}
        <AiCapabilitiesProvider>
          <AdminShell>{children}</AdminShell>
        </AiCapabilitiesProvider>
      </AdminGuard>
    </AdminSessionProvider>
  );
}
