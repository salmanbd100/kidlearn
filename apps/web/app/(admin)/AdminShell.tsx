"use client";

import { Button } from "@kidlearn/ui";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ADMIN_ROUTES, isPublicAdminPath } from "@/lib/admin-routes";
import { useAdminSession } from "./context/admin-session";

/**
 * The sidebar-and-content frame around every CMS page (FR-CMS-01 shell).
 *
 * A Client Component only because the sidebar needs the current path and the
 * sign-out button needs a handler. `children` passes straight through as a slot, so
 * a page is not forced client by sitting inside it — the same arrangement
 * `ParentLayout` uses.
 *
 * The login screen gets no chrome: a sidebar full of links that all bounce back
 * here would be worse than no sidebar at all.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, signOut } = useAdminSession();

  if (isPublicAdminPath(pathname)) return <>{children}</>;

  async function handleSignOut() {
    await signOut();
    router.replace(ADMIN_ROUTES.login);
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AdminSidebar
        pathname={pathname}
        footer={
          <div className="flex items-center justify-between gap-2">
            <span
              className="min-w-0 truncate text-muted-foreground text-xs"
              title={admin?.email}
            >
              {admin?.name ?? "—"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </div>
        }
      />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
