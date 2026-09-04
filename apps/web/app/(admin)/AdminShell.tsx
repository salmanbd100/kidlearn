"use client";

import { Button } from "@kidlearn/ui";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { fetchAiJobCount } from "@/lib/admin-api";
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
 *
 * **The AI Queue badge is polled here rather than on the queue screen** (file 37,
 * requirement 8). Its point is to be seen from the *other* five sections — an
 * admin editing curriculum has no reason to open the queue unless something told
 * them to — so it has to live in the frame, above every page. Sixty seconds: a
 * generation takes tens of seconds to write and nobody is waiting on the number,
 * and a tighter interval would be a request a minute per open tab for a count
 * that changes a few times a day.
 */

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
