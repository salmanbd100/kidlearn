"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { useAdminSession } from "./context/admin-session";

export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useAdminSession();

  // Sign-in is a dialog on the homepage, outside this group, so no `/admin/*` path is reachable signed out.
  const shouldRedirect = status === "signedOut";

  useEffect(() => {
    // `replace`: a bounce the admin did not ask for must not become a back-button trap.
    if (shouldRedirect) router.replace(ADMIN_ROUTES.login);
  }, [shouldRedirect, router]);

  if (status === "loading") {
    return (
      <p role="status" className="p-6 text-muted-foreground text-sm">
        Loading…
      </p>
    );
  }

  if (status === "error") {
    return (
      <p role="alert" className="p-6 text-destructive text-sm">
        Could not reach the kidlearn API. Check that the server is running.
      </p>
    );
  }

  // A redirect is queued; showing the CMS for a frame would show the wrong thing.
  if (shouldRedirect) return null;

  return <>{children}</>;
}
