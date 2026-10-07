"use client";

import { Button } from "@kidlearn/ui";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AdminSidebar } from "@/features/admin/AdminSidebar";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { fetchAiJobCount } from "@/features/admin/ai-api";
import { useAdminSession } from "./context/admin-session";

const BADGE_POLL_MS = 60_000;
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, signOut } = useAdminSession();
  const [awaitingReview, setAwaitingReview] = useState(0);
  const [hasSignOutFailed, setHasSignOutFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    const read = async () => {
      const result = await fetchAiJobCount();
      // A failure keeps the last count: a sleeping API is not an empty queue.
      if (isCurrent && result.ok) setAwaitingReview(result.data.awaitingReview);
    };

    void read();
    const timer = window.setInterval(() => void read(), BADGE_POLL_MS);
    return () => {
      isCurrent = false;
      window.clearInterval(timer);
    };
  }, []);

  async function handleSignOut() {
    setHasSignOutFailed(false);
    // The cookie is still live on failure, so the sign-in dialog would bounce straight back in.
    if (!(await signOut())) {
      setHasSignOutFailed(true);
      return;
    }
    // The sign-in dialog, not the bare homepage: `signOut` has already marked the session signed out,
    // so `AdminGuard` is redirecting there too, and two different targets would race.
    router.replace(ADMIN_ROUTES.login);
  }

  return (
    // `md:min-h-0` lets the content pane scroll; a flex child won't shrink under its content otherwise.
    <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
      <AdminSidebar
        pathname={pathname}
        badges={{ [ADMIN_ROUTES.aiQueue]: awaitingReview }}
        footer={
          <div className="flex flex-col gap-2">
            {hasSignOutFailed ? (
              <p role="alert" className="text-destructive text-xs">
                Could not sign out. Check your connection and try again.
              </p>
            ) : null}
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
          </div>
        }
      />
      <main className="min-w-0 flex-1 p-4 md:min-h-0 md:overflow-y-auto md:p-6">
        {children}
      </main>
    </div>
  );
}
