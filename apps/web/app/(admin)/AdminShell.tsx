"use client";

import { Button } from "@kidlearn/ui";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { fetchAiJobCount } from "@/lib/admin-api";
import { ADMIN_ROUTES, isPublicAdminPath } from "@/lib/admin-routes";
import { useAdminSession } from "./context/admin-session";

// The sidebar-and-content frame around every CMS page (FR-CMS-01 shell).

const BADGE_POLL_MS = 60_000;
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, signOut } = useAdminSession();
  const [awaitingReview, setAwaitingReview] = useState(0);

  const isPublic = isPublicAdminPath(pathname);

  useEffect(() => {
    // Not on the login screen: an unauthenticated poll is a 401 a minute, and
    // there is no rail to render the badge on.
    if (isPublic) return;

    let isCurrent = true;
    const read = async () => {
      const result = await fetchAiJobCount();
      // A failure leaves the last count standing rather than blanking the badge:
      // a sleeping API is not the same as an empty queue.
      if (isCurrent && result.ok) setAwaitingReview(result.data.awaitingReview);
    };

    void read();
    const timer = window.setInterval(() => void read(), BADGE_POLL_MS);
    return () => {
      isCurrent = false;
      window.clearInterval(timer);
    };
  }, [isPublic]);

  if (isPublic) return <>{children}</>;

  async function handleSignOut() {
    await signOut();
    router.replace(ADMIN_ROUTES.login);
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AdminSidebar
        pathname={pathname}
        badges={{ [ADMIN_ROUTES.aiQueue]: awaitingReview }}
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
