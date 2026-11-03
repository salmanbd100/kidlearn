"use client";

import { Button } from "@kidlearn/ui";
import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { fetchAiJobCount } from "@/features/admin/api/ai-api";
import { AdminSidebar } from "@/features/admin/shell/AdminSidebar";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";
import { SignOutDialog } from "@/features/admin/shell/SignOutDialog";
import { useAdminSession } from "./context/admin-session";

const BADGE_POLL_MS = 60_000;
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, signOut } = useAdminSession();
  const [awaitingReview, setAwaitingReview] = useState(0);
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
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

  function handleSignOutOpenChange(open: boolean) {
    if (isSigningOut) return;
    setIsSignOutOpen(open);
    if (!open) setHasSignOutFailed(false);
  }

  async function handleSignOut() {
    setHasSignOutFailed(false);
    setIsSigningOut(true);
    const isSignedOut = await signOut();
    setIsSigningOut(false);
    // The cookie is still live on failure, so the sign-in dialog would bounce straight back in.
    if (!isSignedOut) {
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
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground text-xs"
            >
              {initials(admin?.name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate font-medium text-foreground text-sm">
                {admin?.name ?? "—"}
              </span>
              {admin === undefined ? null : (
                <span className="truncate text-muted-foreground text-xs">
                  {admin.email}
                </span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-11 shrink-0 px-0 text-muted-foreground hover:text-foreground"
              title="Sign out"
              onClick={() => setIsSignOutOpen(true)}
            >
              <LogOut aria-hidden="true" className="size-4!" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        }
      />
      <main className="min-w-0 flex-1 md:min-h-0 md:overflow-y-auto">
        <div className="mx-auto w-full max-w-[1440px] p-4 md:px-8 md:py-7">
          {children}
        </div>
      </main>
      <SignOutDialog
        isOpen={isSignOutOpen}
        onOpenChange={handleSignOutOpenChange}
        isBusy={isSigningOut}
        hasFailed={hasSignOutFailed}
        onConfirm={handleSignOut}
      />
    </div>
  );
}

function initials(name: string | undefined): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return "?";
  const first = words[0].slice(0, 1);
  const last = words.length > 1 ? words[words.length - 1].slice(0, 1) : "";
  return `${first}${last}`.toUpperCase();
}
