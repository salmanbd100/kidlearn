"use client";

import { Button } from "@kidlearn/ui";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AdminSidebar } from "@/features/admin/AdminSidebar";
import { fetchAiJobCount } from "@/features/admin/admin-api";
import { ADMIN_ROUTES, isPublicAdminPath } from "@/features/admin/admin-routes";
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
    // Fills the frame the group layout sizes rather than claiming a viewport of
    // its own. `md:min-h-0` is what lets the content pane below actually scroll:
    // without it a flex child refuses to shrink under its content.
    <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
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
      {/* The one scroll container in the CMS from `md` up. */}
      <main className="min-w-0 flex-1 p-4 md:min-h-0 md:overflow-y-auto md:p-6">
        {children}
      </main>
    </div>
  );
}
